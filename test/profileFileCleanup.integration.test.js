import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { memoryStore } from './helpers/memoryStore.js';
import { hasNewProfileFiles, profileDriveFileIds, replacedProfileFileIds } from '../src/utils/profileDocumentFiles.js';

const url = id => `https://drive.google.com/file/d/${id}/view`;
test('cleanup identifies Drive aliases and never treats an appended page as replaced', () => {
  assert.deepEqual(profileDriveFileIds(`${url('old-photo-id')}\nhttps://drive.google.com/open?id=old-photo-id`), ['old-photo-id']);
  assert.deepEqual(replacedProfileFileIds(url('old-photo-id'), `${url('old-photo-id')}\n${url('new-photo-id')}`), []);
  assert.equal(hasNewProfileFiles(url('old-photo-id'), url('new-photo-id')), true);
  assert.equal(hasNewProfileFiles(url('old-photo-id'), ''), false);
  assert.equal(hasNewProfileFiles(url('old-photo-id'), 'https://example.com/new.jpg'), false);
  assert.deepEqual(profileDriveFileIds('https://drive.google.com.attacker.example/file/d/old-photo-id/view\njavascript:alert(1)\nhttps://example.com/photo.jpg'), []);
});

test('approval saves a durable cleanup job and deletion follows successful synchronization and fresh reference checks', async t => {
  const directory = await mkdtemp(resolve('node_modules/.profile-cleanup-test-'));
  const base = 'artifacts/fixture/public/data';
  let store, calls, syncCalls, sendFailure, syncFailure, sendFailureField;
  const studentPath = `${base}/students/an`;
  const fixture = {
    collection: (_db, ...parts) => store.collection(parts.join('/')),
    doc: (target, id) => target.doc(id),
    getDocFromServer: ref => ref.get(), getDocsFromServer: ref => ref.get(),
    where: (...args) => args, limit: value => ['__limit', value],
    query: (target, ...filters) => filters.reduce((result, filter) => filter[0] === '__limit' ? result.limit(filter[1]) : result.where(...filter), target),
    runTransaction: (_db, callback) => store.runTransaction(callback),
    send: async payload => {
      calls.push(payload);
      assert.equal(store.get(studentPath).sheetSync.status, 'success', 'Drive cannot be called before Sheet sync is confirmed');
      if (sendFailure || payload.params.fieldKey === sendFailureField) throw new Error('Drive unavailable');
      return { status: 'success', result: { success: true, results: payload.params.fileIds.map(fileId => ({ fileId, status: 'trashed' })) } };
    }
  };
  globalThis.__profileCleanup = fixture;
  const reset = () => {
    store = memoryStore(); calls = []; syncCalls = 0; sendFailure = false; syncFailure = false; sendFailureField = '';
    store.put(`${base}/settings/global`, {});
    store.put(studentPath, { fullName: 'An', className: '8A', grade: '8', schoolYear: '2026-2027', schoolCode: 'NAN', studentKey: 'stable-an', accessCode: 'HS001', portraitUrl: url('old-photo-id') });
    store.put(`${base}/student_profile_requests/request`, { studentId: 'an', changes: { portraitUrl: url('new-photo-id'), phone: '123' }, status: 'pending' });
  };
  const sync = async () => {
    syncCalls++;
    if (syncFailure) throw new Error('Sheet unavailable');
    const saved = store.get(studentPath);
    assert.equal(saved.portraitUrl, url('new-photo-id'));
    assert.ok(store.get(`${base}/student_file_cleanup_jobs/${saved.sheetSync.jobId}`));
    store.put(studentPath, { ...saved, sheetSync: { ...saved.sheetSync, status: 'success' } });
  };
  try {
    const outfile = join(directory, 'service.mjs');
    await build({ stdin: { contents: "export * from './src/services/studentMutations.js'; export * from './src/services/profileFileCleanup.js';", loader: 'js', resolveDir: resolve('.') }, absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'offline-cleanup', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const {collection,doc,getDocFromServer,getDocsFromServer,where,limit,query,runTransaction}=globalThis.__profileCleanup;'
          : args.path.endsWith('config/firebase') ? 'export const db={},appId="fixture";' : 'export const postAppsScript=(...args)=>globalThis.__profileCleanup.send(...args);', loader: 'js' }));
      } }] });
    const service = await import(pathToFileURL(outfile));
    const approve = () => service.saveStudentRecord({ ...store.get(studentPath), id: 'an', portraitUrl: url('new-photo-id') }, {
      profileDecision: { requestId: 'request', expectedChanges: { portraitUrl: url('new-photo-id'), phone: '123' }, remainingChanges: { phone: '123' } }
    });
    await t.test('approval and job commit together; unrelated requested fields remain pending', async () => {
      reset();
      const student = await approve();
      const jobId = student.sheetSync.jobId;
      assert.equal(student.sheetSync.cleanupJobId, jobId, 'every approved replacement automatically schedules cleanup');
      assert.deepEqual(store.get(`${base}/student_profile_requests/request`).changes, { phone: '123' });
      assert.deepEqual(store.get(`${base}/student_file_cleanup_jobs/${jobId}`).fileIds, ['old-photo-id']);
      assert.equal(calls.length, 0);
      const result = await service.retryProfileFileCleanup(jobId, sync);
      assert.equal(syncCalls, 1); assert.equal(calls.length, 1);
      assert.equal(result.results[0].status, 'trashed');
      assert.equal(store.get(`${base}/student_file_cleanup_jobs/${jobId}`).status, 'done');
      await service.retryProfileFileCleanup(jobId, sync);
      assert.equal(calls.length, 1, 'completed jobs never call Drive again');
    });
    await t.test('failed approval creates neither a saved image nor a cleanup job', async () => {
      reset(); store.failCommit = true;
      await assert.rejects(approve(), /commit failure/);
      assert.equal(store.get(studentPath).portraitUrl, url('old-photo-id'));
      assert.equal((await store.collection(`${base}/student_file_cleanup_jobs`).get()).size, 0);
      assert.equal(calls.length, 0);
    });
    await t.test('text-only approvals and manual profile edits do not schedule file cleanup', async () => {
      reset();
      await service.saveStudentRecord({ ...store.get(studentPath), id: 'an', phone: '123' }, {
        profileDecision: { requestId: 'request', expectedChanges: { portraitUrl: url('new-photo-id'), phone: '123' }, remainingChanges: { portraitUrl: url('new-photo-id') } }
      });
      assert.equal((await store.collection(`${base}/student_file_cleanup_jobs`).get()).size, 0);
      reset();
      await service.saveStudentRecord({ ...store.get(studentPath), id: 'an', portraitUrl: url('new-photo-id') });
      assert.equal((await store.collection(`${base}/student_file_cleanup_jobs`).get()).size, 0);
    });
    await t.test('appending pages, removing links and non-Drive replacements do not trash old files', async () => {
      for (const value of [`${url('old-photo-id')}\n${url('new-photo-id')}`, '', 'https://example.com/new.jpg']) {
        reset();
        const changes = { portraitUrl: value };
        store.put(`${base}/student_profile_requests/request`, { studentId: 'an', changes, status: 'pending' });
        const student = await service.saveStudentRecord({ ...store.get(studentPath), id: 'an', ...changes }, {
          profileDecision: { requestId: 'request', expectedChanges: changes, remainingChanges: {} }
        });
        assert.equal(student.sheetSync.cleanupJobId, undefined);
        assert.equal((await store.collection(`${base}/student_file_cleanup_jobs`).get()).size, 0);
      }
    });
    const approveDocuments = async (before, changes, bulk = false) => {
      store.put(studentPath, { ...store.get(studentPath), ...before });
      store.put(`${base}/student_profile_requests/request`, { studentId: 'an', changes, status: 'pending' });
      const decision = { requestId: 'request', expectedChanges: changes, remainingChanges: {} };
      return service.saveStudentRecord({ ...store.get(studentPath), id: 'an', ...changes }, bulk ? { profileDecisions: [decision] } : { profileDecision: decision });
    };
    await t.test('whole-request and bulk approvals schedule every replaced document together', async () => {
      for (const bulk of [false, true]) {
        reset();
        const student = await approveDocuments({ transcriptUrl: url('old-transcript-id') }, { portraitUrl: url('new-photo-id'), transcriptUrl: url('new-transcript-id') }, bulk);
        const job = store.get(`${base}/student_file_cleanup_jobs/${student.sheetSync.jobId}`);
        assert.equal(job.fields.length, 2);
        assert.deepEqual(job.fileIds, ['old-photo-id', 'old-transcript-id']);
        assert.equal(store.get(`${base}/student_profile_requests/request`), undefined);
        const result = await service.retryProfileFileCleanup(student.sheetSync.jobId, sync);
        assert.equal(syncCalls, 1);
        assert.deepEqual(calls.map(call => [call.params.fieldKey, call.params.expectedValue]), [['portraitUrl', url('new-photo-id')], ['transcriptUrl', url('new-transcript-id')]]);
        assert.equal(result.results.length, 2);
      }
    });
    await t.test('duplicate old files are handled once and long documents use bounded Drive requests', async () => {
      reset();
      const oldIds = Array.from({ length: 25 }, (_, i) => 'old-page-' + i);
      const student = await approveDocuments({ portraitUrl: oldIds.map(url).join('\n'), transcriptUrl: url(oldIds[0]) }, { portraitUrl: url('new-photo-id'), transcriptUrl: url('new-transcript-id') });
      const result = await service.retryProfileFileCleanup(student.sheetSync.jobId, sync);
      assert.deepEqual(calls.map(call => call.params.fileIds.length), [20, 5]);
      assert.deepEqual(result.results.map(item => item.fileId), oldIds);
    });
    await t.test('partial multi-document failure keeps results and retries without another Sheet write', async () => {
      reset();
      const student = await approveDocuments({ transcriptUrl: url('old-transcript-id') }, { portraitUrl: url('new-photo-id'), transcriptUrl: url('new-transcript-id') });
      sendFailureField = 'transcriptUrl';
      await assert.rejects(service.retryProfileFileCleanup(student.sheetSync.jobId, sync), /Drive unavailable/);
      const job = store.get(`${base}/student_file_cleanup_jobs/${student.sheetSync.jobId}`);
      assert.equal(job.status, 'failed');
      assert.deepEqual(job.results.map(item => item.fileId), ['old-photo-id']);
      sendFailureField = '';
      await service.retryProfileFileCleanup(student.sheetSync.jobId, sync);
      assert.equal(syncCalls, 1);
      assert.equal(store.get(`${base}/student_file_cleanup_jobs/${student.sheetSync.jobId}`).status, 'done');
    });
    await t.test('a later change to any approved document stops the entire job before sync or Drive', async () => {
      reset();
      const student = await approveDocuments({ transcriptUrl: url('old-transcript-id') }, { portraitUrl: url('new-photo-id'), transcriptUrl: url('new-transcript-id') });
      store.put(studentPath, { ...store.get(studentPath), transcriptUrl: url('different-transcript-id') });
      await assert.rejects(service.retryProfileFileCleanup(student.sheetSync.jobId, sync), /đã thay đổi/);
      assert.equal(syncCalls, 0); assert.equal(calls.length, 0);
    });
    await t.test('jobs from the previous single-document flow remain retryable', async () => {
      reset(); const student = await approve();
      const path = `${base}/student_file_cleanup_jobs/${student.sheetSync.jobId}`;
      const { fields, ...legacy } = store.get(path);
      store.put(path, { ...legacy, ...fields[0] });
      await service.retryProfileFileCleanup(student.sheetSync.jobId, sync);
      assert.equal(calls.length, 1);
      assert.equal(store.get(path).status, 'done');
    });
    await t.test('failed Sheet sync keeps old files and a durable retry job while retaining the approved image', async () => {
      reset(); const student = await approve(); syncFailure = true;
      await assert.rejects(service.retryProfileFileCleanup(student.sheetSync.jobId, sync), /Sheet unavailable/);
      assert.equal(calls.length, 0);
      assert.equal(store.get(studentPath).portraitUrl, url('new-photo-id'));
      assert.equal(store.get(`${base}/student_file_cleanup_jobs/${student.sheetSync.jobId}`).status, 'failed');
      syncFailure = false;
      await service.retryProfileFileCleanup(student.sheetSync.jobId, sync);
      assert.equal(calls.length, 1);
    });
    await t.test('references in historical students, archives and pending requests retain old files', async () => {
      for (const collection of ['students', 'student_archives', 'student_profile_requests']) {
        reset(); const student = await approve();
        const reference = { transcriptUrl: `https://drive.google.com/open?id=old-photo-id` };
        store.put(`${base}/${collection}/other`, collection === 'student_profile_requests' ? { changes: reference } : reference);
        const result = await service.retryProfileFileCleanup(student.sheetSync.jobId, sync);
        assert.equal(result.results[0].status, 'retained'); assert.equal(calls.length, 0);
      }
    });
    await t.test('Drive failure can be retried without approving the profile twice', async () => {
      reset(); const student = await approve(); sendFailure = true;
      await assert.rejects(service.retryProfileFileCleanup(student.sheetSync.jobId, sync), /Drive unavailable/);
      assert.equal(store.get(studentPath).portraitUrl, url('new-photo-id'));
      sendFailure = false;
      await service.retryProfileFileCleanup(student.sheetSync.jobId, sync);
      assert.equal(calls.length, 2);
      assert.equal(store.get(`${base}/student_file_cleanup_jobs/${student.sheetSync.jobId}`).status, 'done');
    });
    await t.test('a later image change stops cleanup before calling Sheet or Drive', async () => {
      reset(); const student = await approve();
      store.put(studentPath, { ...store.get(studentPath), portraitUrl: url('another-photo-id') });
      await assert.rejects(service.retryProfileFileCleanup(student.sheetSync.jobId, sync), /đã thay đổi/);
      assert.equal(calls.length, 0); assert.equal(syncCalls, 0);
    });
    await t.test('concurrent retries allow only one worker to call Drive', async () => {
      reset(); const student = await approve();
      const outcomes = await Promise.allSettled([service.retryProfileFileCleanup(student.sheetSync.jobId, sync), service.retryProfileFileCleanup(student.sheetSync.jobId, sync)]);
      assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
      assert.match(outcomes.find(result => result.status === 'rejected').reason.message, /phiên khác/);
      assert.equal(calls.length, 1);
    });
  } finally { delete globalThis.__profileCleanup; await rm(directory, { recursive: true, force: true }); }
});
