import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { studentEditKey } from '../src/utils/studentScoreKeys.js';
import { processRecords } from '../src/utils/bulkOperations.js';
import { SCOREBOOK_SOURCE_FILE, QUICK_SCORE_SUBJECTS } from '../src/config/scorebookDomain.js';

test('student allocation, immutable identity, durable sync and partial operations', async t => {
  const directory = await mkdtemp(resolve('node_modules/.student-mutations-test-'));
  const root = 'artifacts/fixture/public/data';
  let data = new Map(), queue = Promise.resolve(), serial = 0;
  const clone = value => value == null ? value : structuredClone(value);
  const snapshot = ref => ({ id: ref.id, exists: () => data.has(ref.path), data: () => clone(data.get(ref.path)) });
  const mock = {
    collection: (_db, ...parts) => ({ path: parts.join('/') }),
    doc: (base, key) => { const id = key || `doc-${++serial}`; return { path: `${base.path}/${id}`, id }; },
    getDocFromServer: async ref => snapshot(ref), limit: count => ({ limit: count }),
    where: (field, _op, value) => ({ field, value }), query: (base, ...filters) => ({ ...base, filters }),
    getDocsFromServer: async ref => ({ docs: [...data].filter(([path, value]) => path.startsWith(ref.path + '/') && !path.slice(ref.path.length + 1).includes('/') && ref.filters.every(filter => !filter.field || value[filter.field] === filter.value))
      .map(([path]) => snapshot({ path, id: path.split('/').at(-1) })) }),
    runTransaction: (_db, callback) => {
      const pending = queue.then(async () => {
        const writes = [];
        const result = await callback({
          get: async ref => { assert.equal(writes.length, 0, 'all reads must precede writes'); return snapshot(ref); },
          set: (ref, value, options) => writes.push({ ref, value, options }), delete: ref => writes.push({ ref, remove: true })
        });
        const next = new Map(data);
        for (const { ref, value, options, remove } of writes) {
          if (remove) next.delete(ref.path);
          else next.set(ref.path, options?.merge ? { ...clone(next.get(ref.path)), ...clone(value) } : clone(value));
        }
        data = next; return result;
      });
      queue = pending.catch(() => undefined); return pending;
    }
  };
  globalThis.__studentMutations = mock;
  const reset = () => { data = new Map([[`${root}/settings/global`, {}]]); };
  const record = name => ({ fullName: name, className: '6A', grade: '6', schoolYear: '2026-2027', schoolCode: 'NAN' });
  try {
    const outfile = join(directory, 'service.mjs');
    await build({ entryPoints: [resolve('src/services/studentMutations.js')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', plugins: [{ name: 'fixture', setup(builder) {
      builder.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: 'firestore', namespace: 'fixture' }));
      builder.onResolve({ filter: /config\/firebase$/ }, () => ({ path: 'config', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'config' ? 'export const db={}, appId="fixture";' : `const mock=globalThis.__studentMutations; export const {${Object.keys(mock).join(',')}}=mock;`, loader: 'js' }));
    } }] });
    const service = await import(pathToFileURL(outfile));
    await t.test('a source before admission is rejected, but correcting the original record keeps its ID and code', async () => {
      reset();
      const misplaced = { ...record('Vinh'), id: 'wrong-year', className: '9A', grade: '9', entryGrade: '9',
        accessCode: 'HS26909', studentKey: 'stable-vinh', enrollmentYear: '2026-2027', schoolYear: '2025-2026' };
      const { id, ...stored } = misplaced;
      data.set(`${root}/students/${id}`, stored);
      const before = clone([...data]);
      await assert.rejects(service.saveStudentRecord({ ...misplaced, id: undefined, previousStudentId: id, schoolYear: '2026-2027' }), /trước năm nhập học/);
      assert.deepEqual([...data], before, 'no new student, registry or sync job may be written');
      const repaired = await service.saveStudentRecord({ ...misplaced, previousStudentId: '', schoolYear: '2026-2027', classHistory: { '2026-2027': '9A' } }, { expected: misplaced });
      assert.equal(repaired.id, id); assert.equal(repaired.accessCode, misplaced.accessCode); assert.equal(repaired.studentKey, misplaced.studentKey);
      assert.equal(repaired.schoolYear, '2026-2027'); assert.equal(repaired.enrollmentYear, '2026-2027'); assert.equal(repaired.previousStudentId, '');
      assert.deepEqual(repaired.classHistory, { '2026-2027': '9A' });
      assert.equal([...data.keys()].filter(key => key.startsWith(`${root}/students/`)).length, 1);
    });
    await t.test('dropout stays blank during profile saves and only an explicit return can reactivate it', async () => {
      reset();
      const student = await service.saveStudentRecord({ ...record('An'), accessCode: 'HS001', entryGrade: '6',
        classHistory: { '2025-2026': '6A', '2026-2027': '7A' }, className: '7A', grade: '7' });
      const dropped = await service.saveStudentRecord({ ...student, status: 'dropped' });
      assert.equal(dropped.className, ''); assert.equal(dropped.grade, '');
      assert.equal(dropped.dropoutPreviousClassName, '7A'); assert.equal(dropped.dropoutYear, '2026-2027');
      assert.equal(dropped.entryGrade, '6');
      assert.deepEqual(dropped.classHistory, { '2025-2026': '6A' });
      const updated = await service.saveStudentRecord({ ...dropped, className: '8A', grade: '8', phone: '0123' });
      assert.equal(updated.status, 'dropped'); assert.equal(updated.className, ''); assert.equal(updated.grade, '');
      await assert.rejects(service.saveStudentRecord({ ...updated, status: 'active', className: '8A' }), /Đưa học lại/);
      await assert.rejects(service.saveStudentRecord({ ...updated, id: undefined, previousStudentId: student.id,
        schoolYear: '2027-2028', status: 'active', className: '8A' }), /đã bỏ học/);
      assert.equal(data.get(`${root}/students/${student.id}`).status, 'dropped');
      const returned = await service.saveStudentRecord({ ...updated, status: 'active', className: '7A', grade: '7' }, { reactivateDropout: true });
      assert.equal(returned.status, 'active'); assert.equal(returned.dropoutYear, '');
      assert.equal(returned.dropoutReactivationRevision, returned.syncRevision);
      const savedAgain = await service.saveStudentRecord({ ...returned, phone: '0456' });
      assert.notEqual(savedAgain.dropoutReactivationRevision, savedAgain.syncRevision, 'return permission applies only to its own sync revision');
    });
    await t.test('a wrong next-year dropout can collapse back into its linked source year without creating a duplicate', async () => {
      reset();
      const source = { ...record('Linh Quyên'), id: 'source-2025', accessCode: 'HS25817', studentKey: 'HS25817',
        className: '8A', grade: '8', entryGrade: '8', enrollmentYear: '2025-2026', schoolYear: '2025-2026', schoolCode: 'NAN',
        status: 'active', classHistory: { '2025-2026': '8A' }, syncRevision: 2 };
      const target = { ...source, id: 'wrong-2026', previousStudentId: source.id, schoolYear: '2026-2027',
        status: 'dropped', className: '', grade: '', dropoutPreviousClassName: '8A', dropoutYear: '2026-2027',
        classHistory: { '2025-2026': '8A' }, syncRevision: 3, sheetSync: { status: 'success', jobId: 'old-job' } };
      const { id: sourceId, ...sourceData } = source;
      const { id: targetId, ...targetData } = target;
      data.set(`${root}/students/${sourceId}`, sourceData);
      data.set(`${root}/students/${targetId}`, targetData);
      data.set(`${root}/student_code_registry/HS25817`, { studentKey: 'HS25817', studentId: targetId, studentIds: [sourceId, targetId] });
      data.set(`${root}/student_sync_jobs/old-job`, { studentId: targetId, revision: 3, status: 'success' });
      const saved = await service.saveStudentRecord({ ...target, schoolYear: '2025-2026', enrollmentYear: '2025-2026' }, {
        expected: target, collapseToPreviousYear: true, collapseSourceExpected: source, actor: 'admin'
      });
      assert.equal(saved.id, sourceId); assert.equal(saved.collapsedStudentId, targetId);
      assert.equal(saved.schoolYear, '2025-2026'); assert.equal(saved.status, 'dropped');
      assert.equal(saved.dropoutYear, '2025-2026'); assert.equal(saved.dropoutPreviousClassName, '8A');
      assert.equal(saved.previousStudentId, ''); assert.equal(saved.className, ''); assert.equal(saved.grade, '');
      assert.equal(data.has(`${root}/students/${targetId}`), false, 'wrong-year profile is removed from active students');
      assert.equal(data.get(`${root}/students/${sourceId}`).status, 'dropped');
      assert.equal(data.get(`${root}/student_archives/${targetId}`).mergedIntoStudentId, sourceId);
      assert.equal(data.get(`${root}/student_archives/${targetId}`).archiveReason, 'collapsed_wrong_school_year');
      assert.equal(data.get(`${root}/student_code_registry/HS25817`).studentId, sourceId);
      assert.deepEqual(data.get(`${root}/student_code_registry/HS25817`).studentIds, [sourceId]);
      assert.equal(data.get(`${root}/student_sync_jobs/old-job`).status, 'cancelled');
      assert.equal(data.get(`${root}/student_sync_jobs/${saved.sheetSync.jobId}`).studentId, sourceId);
    });
    await t.test('a reviewed promotion checks the prior record and full scorebook inside the save transaction', async () => {
      reset();
      const source = { ...record('An'), id: 'source', studentKey: 'HS25601', accessCode: 'HS25601', className: '6A', entryGrade: '6', enrollmentYear: '2025-2026', schoolYear: '2025-2026' };
      const target = { ...source, id: 'target', previousStudentId: 'source', schoolYear: '2026-2027' };
      const book = { id: 'book', schoolYear: '2025-2026', schoolCode: 'NAN', grade: '6', sourceFile: SCOREBOOK_SOURCE_FILE,
        edits: Object.fromEntries(QUICK_SCORE_SUBJECTS.map(subject => [studentEditKey(`custom:hkiiScore:${subject.pageIndex}:r0:s7`, source), '7'])) };
      const { id: sourceId, ...sourceData } = source;
      const { id: targetId, ...targetData } = target;
      const { id: bookId, ...bookData } = book;
      data.set(`${root}/students/${sourceId}`, sourceData); data.set(`${root}/students/${targetId}`, targetData); data.set(`${root}/scorebooks/${bookId}`, bookData);
      const input = { ...target, className: '7A', grade: '7', promotion: { outcome: 'promote' } };
      const options = { expected: target, academicDecision: { source, scorebook: book } };
      data.set(`${root}/scorebooks/book`, { ...bookData, edits: {} });
      await assert.rejects(service.saveStudentRecord(input, options), /điểm năm trước vừa thay đổi/);
      assert.equal(data.get(`${root}/students/target`).className, '6A');
      data.set(`${root}/scorebooks/book`, bookData);
      await assert.rejects(service.saveStudentRecord({ ...input, className: '8A' }, options), /không đủ hoặc không khớp/);
      const saved = await service.saveStudentRecord(input, options);
      assert.equal(saved.className, '7A'); assert.equal(saved.entryGrade, '6');
      assert.equal(saved.sheetSync.status, 'pending');
    });
    await t.test('a student cannot be saved into a year before enrollment', async () => {
      reset();
      const before = clone([...data]);
      await assert.rejects(service.saveStudentRecord({ ...record('An'), schoolYear: '2025-2026', enrollmentYear: '2026-2027' }, { allocateCode: true, codePrefix: 'HS269' }), /trước năm nhập học/);
      assert.deepEqual([...data], before, 'reject before allocating a code, creating a student or queuing a Sheet job');
      data.set(`${root}/students/old`, { ...record('An'), accessCode: 'HS001', enrollmentYear: '2026-2027' });
      await assert.rejects(service.saveStudentRecord({ ...record('An'), id: 'old', accessCode: 'HS001', schoolYear: '2025-2026' }), /trước năm nhập học/);
      assert.equal(data.get(`${root}/students/old`).schoolYear, '2026-2027');
    });
    await t.test('two administrators allocate distinct codes, but an explicit collision fails', async () => {
      reset(); const options = { codePrefix: 'HS266', allocateCode: true };
      const [a, b] = await Promise.all([service.saveStudentRecord(record('An'), options), service.saveStudentRecord(record('Bình'), options)]);
      assert.notEqual(a.accessCode, b.accessCode); assert.notEqual(a.studentKey, b.studentKey);
      await assert.rejects(service.saveStudentRecord({ ...record('Chi'), accessCode: a.accessCode }), /thuộc học sinh khác/);
      assert.equal([...data.keys()].filter(key => key.startsWith(`${root}/students/`)).length, 2);
    });
    await t.test('renaming login code freezes legacy identity and reserves historical aliases', async () => {
      reset(); data.set(`${root}/students/old`, { ...record('An'), accessCode: 'HS001' });
      const oldKey = studentEditKey('custom:hkiScore:1:r0:s0', { accessCode: 'HS001' });
      const changed = await service.saveStudentRecord({ ...record('An'), id: 'old', accessCode: 'HS999' });
      assert.equal(changed.studentKey, 'HS001'); assert.equal(studentEditKey('custom:hkiScore:1:r0:s0', changed), oldKey);
      await assert.rejects(service.saveStudentRecord({ ...record('Other'), accessCode: 'HS001' }), /thuộc học sinh khác/);
      await assert.rejects(service.saveStudentRecord({ ...changed, studentKey: 'forged' }), /định danh/);
      const promoted = await service.saveStudentRecord({ ...changed, id: undefined, schoolYear: '2027-2028', className: '7A', previousStudentId: 'old' });
      assert.equal(promoted.studentKey, changed.studentKey);
    });
    await t.test('Sheet failure survives reload and an old acknowledgement cannot clear a newer job', async () => {
      reset(); const first = await service.saveStudentRecord({ ...record('An'), accessCode: 'HS001' });
      await assert.rejects(service.retryStudentSync(first.id, async () => { throw new Error('Sheet unavailable'); }), /Sheet unavailable/);
      assert.equal(data.get(`${root}/students/${first.id}`).sheetSync.status, 'failed');
      let latest;
      await service.retryStudentSync(first.id, async () => { latest = await service.saveStudentRecord({ ...first, fullName: 'An mới' }); });
      assert.equal(data.get(`${root}/students/${first.id}`).sheetSync.jobId, latest.sheetSync.jobId);
      assert.equal(data.get(`${root}/students/${first.id}`).sheetSync.status, 'pending');
      await service.retryStudentSync(first.id, async student => assert.equal(student.fullName, 'An mới'));
      assert.equal(data.get(`${root}/students/${first.id}`).sheetSync.status, 'success');
    });
    await t.test('profile decision and sync job commit together; maintenance blocks changes', async () => {
      reset(); const student = await service.saveStudentRecord({ ...record('An'), accessCode: 'HS001' });
      data.set(`${root}/student_profile_requests/request`, { studentId: student.id, changes: { phone: '0123' } });
      await service.saveStudentRecord({ ...student, phone: '0123' }, { profileDecision: { requestId: 'request', expectedChanges: { phone: '0123' }, remainingChanges: {} } });
      assert.equal(data.has(`${root}/student_profile_requests/request`), false);
      assert.equal(data.get(`${root}/students/${student.id}`).sheetSync.status, 'pending');
      data.set(`${root}/settings/global`, { maintenance: { active: true } });
      await assert.rejects(service.deleteStudentRecord(student), /bảo trì/);
      await assert.rejects(service.saveStudentRecord({ ...student, phone: '0456' }), /bảo trì/);
    });
    await t.test('multiple profile requests commit once per student and a stale request prevents every write', async () => {
      reset(); const student = await service.saveStudentRecord({ ...record('An'), accessCode: 'HS001' });
      const older = { portraitUrl: 'old.jpg', phone: '123' }, newer = { portraitUrl: 'new.jpg' };
      data.set(`${root}/student_profile_requests/old`, { studentId: student.id, changes: older });
      data.set(`${root}/student_profile_requests/new`, { studentId: student.id, changes: newer });
      const decisions = [
        { requestId: 'old', expectedChanges: older, remainingChanges: {} },
        { requestId: 'new', expectedChanges: newer, remainingChanges: {} }
      ];
      const before = structuredClone([...data]);
      await assert.rejects(service.saveStudentRecord({ ...student, phone: '123', portraitUrl: 'new.jpg' }, {
        profileDecisions: [decisions[0], { ...decisions[1], expectedChanges: { portraitUrl: 'stale.jpg' } }]
      }), /vừa thay đổi/);
      assert.deepEqual([...data], before);
      const saved = await service.saveStudentRecord({ ...student, phone: '123', portraitUrl: 'new.jpg' }, { profileDecisions: decisions });
      assert.equal(saved.portraitUrl, 'new.jpg');
      assert.equal(saved.phone, '123');
      assert.equal(saved.accessCode, student.accessCode);
      assert.equal(saved.studentKey, student.studentKey);
      assert.equal(saved.syncRevision, student.syncRevision + 1);
      assert.equal(data.has(`${root}/student_profile_requests/old`), false);
      assert.equal(data.has(`${root}/student_profile_requests/new`), false);
      assert.equal([...data.keys()].filter(key => key.startsWith(`${root}/student_sync_jobs/`)).length, 2, 'only one new Sheet job for both requests');
      await assert.rejects(service.saveStudentRecord(saved, { profileDecisions: decisions }), /vừa thay đổi/);
    });
    await t.test('partial deletion lists successful and failed IDs and archives the committed record', async () => {
      reset(); const student = await service.saveStudentRecord({ ...record('An'), accessCode: 'HS001' });
      const result = await processRecords([student, { id: 'failure' }], async item => {
        if (item.id === 'failure') throw new Error('permission denied');
        return service.deleteStudentRecord(item);
      });
      assert.deepEqual(result.succeeded.map(item => item.record.id), [student.id]);
      assert.deepEqual(result.failed.map(item => item.record.id), ['failure']);
      assert.equal(data.has(`${root}/students/${student.id}`), false);
      assert.equal(data.get(`${root}/student_archives/${student.id}`).fullName, 'An');
    });
  } finally { delete globalThis.__studentMutations; await rm(directory, { recursive: true, force: true }); }
});
