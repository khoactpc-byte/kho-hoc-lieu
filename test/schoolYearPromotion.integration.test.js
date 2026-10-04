import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('promotion checkpoints commit with student writes, retry preserves targets, and old attempts cannot finalize', async () => {
  const directory = await mkdtemp(resolve('node_modules/.promotion-test-'));
  const records = new Map();
  const root = 'artifacts/test/public/data';
  const global = `${root}/settings/global`;
  const commits = [];
  let rejectTarget;
  const snapshot = ref => ({ exists: () => records.has(ref), data: () => structuredClone(records.get(ref)) });
  const backend = {
    path: (...args) => args.filter(arg => typeof arg === 'string').join('/'),
    async runTransaction(_db, callback) {
      const writes = [];
      const result = await callback({ get: async ref => { assert.equal(writes.length, 0, 'all reads precede writes'); return snapshot(ref); }, set: (...args) => writes.push(args) });
      if (rejectTarget && writes.some(write => write[0] === rejectTarget)) { rejectTarget = undefined; throw new Error('network failed after first group'); }
      commits.push(writes);
      writes.forEach(([ref, data, options]) => records.set(ref, options?.merge || options?.mergeFields ? { ...records.get(ref), ...data } : structuredClone(data)));
      return result;
    }
  };
  globalThis.__promotionTestBackend = backend;
  try {
    const outfile = join(directory, 'service.mjs');
    await build({ stdin: { contents: 'export * from "./src/services/schoolYearPromotion.js"; export * from "./src/services/studentTransitions.js";', resolveDir: resolve('.'), loader: 'js' },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'promotion-backend', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'const b=globalThis.__promotionTestBackend; export const collection=b.path; export const doc=b.path; export const runTransaction=b.runTransaction.bind(b);'
          : 'export const db={}; export const appId="test";', loader: 'js' }));
      } }] });
    const { beginPromotionJob, recordPromotionStage, applyStudentTransitions, finalizePromotionJob, failPromotionJob } = await import(pathToFileURL(outfile));
    records.set(global, { schoolYear: '2025-2026', principalName: 'Keep', extraSchoolYears: ['2028-2029'], schoolClassesByYear: { '2028-2029': { keep: true } } });
    const operations = Array.from({ length: 101 }, (_, index) => {
      const sourceRef = `${root}/students/source-${index}`;
      const source = { accessCode: `HS${index}`, className: '6A', status: 'active' };
      records.set(sourceRef, source);
      return { type: 'create', ref: `${root}/students/target-${index}`, sourceRef, expectedSource: source,
        data: { accessCode: `HS${index}`, previousStudentId: `source-${index}`, className: '7A', schoolYear: '2026-2027' } };
    });
    const first = await beginPromotionJob('2025-2026', '2026-2027', 'admin');
    await assert.rejects(beginPromotionJob('2025-2026', '2026-2027', 'other-admin'), /đang chạy/);
    rejectTarget = operations[100].ref;
    await assert.rejects(applyStudentTransitions(operations, first), /network/);
    assert.equal(records.has(operations[99].ref), true);
    assert.equal(records.has(operations[100].ref), false);
    assert.equal(records.get(global).schoolYearPromotion.firebaseProcessed, 100);
    assert.equal(records.get(global).schoolYear, '2025-2026');
    const groupCommit = commits.find(writes => writes.some(write => write[0] === operations[0].ref));
    assert.ok(groupCommit.some(write => write[0] === `${root}/school_year_jobs/${first.id}`));
    await failPromotionJob(first, 'retry required');
    await assert.rejects(beginPromotionJob('2025-2026', '2027-2028', 'admin'), /trước chưa hoàn tất/);
    const retry = await beginPromotionJob('2025-2026', '2026-2027', 'admin');
    assert.equal(retry.attemptCount, 2);
    assert.equal(retry.sequence, first.sequence + 1);
    await assert.rejects(finalizePromotionJob(first, ['7A']), /hết quyền/);
    await failPromotionJob(first, 'late failure');
    assert.equal(records.get(global).schoolYearPromotion.attemptId, retry.attemptId);
    records.set(operations[0].ref, { ...records.get(operations[0].ref), teacherNote: 'Keep new note' });
    assert.equal(await applyStudentTransitions(operations, retry), 1);
    assert.equal(records.get(operations[0].ref).teacherNote, 'Keep new note');
    assert.equal(records.get(global).schoolYearPromotion.firebaseProcessed, 101);
    const bookRef = `${root}/scorebooks/grade6`;
    records.set(bookRef, { edits: { a: '8' }, updatedAt: 2 });
    await assert.rejects(applyStudentTransitions([], retry, [{ ref: bookRef, edits: { a: '5' }, updatedAt: 1 }]), /Điểm học tập đã thay đổi/);
    const conflictedSource = { ...operations[0], ref: `${root}/students/new-target` };
    records.set(conflictedSource.sourceRef, { ...records.get(conflictedSource.sourceRef), status: 'dropped' });
    await assert.rejects(applyStudentTransitions([conflictedSource], retry), /nguồn vừa thay đổi/);
    assert.equal(records.has(conflictedSource.ref), false);
    records.set(conflictedSource.sourceRef, operations[0].expectedSource);
    records.set(operations[0].ref, { ...records.get(operations[0].ref), className: '8A' });
    await assert.rejects(applyStudentTransitions([operations[0]], retry), /dữ liệu khác/);
    assert.equal(records.get(operations[0].ref).className, '8A');
    records.set(operations[0].ref, { ...records.get(operations[0].ref), className: '7A' });
    const changed = { type: 'patch', ref: operations[0].sourceRef, expected: operations[0].expectedSource, data: { className: '7A' } };
    records.set(changed.ref, { ...records.get(changed.ref), status: 'dropped' });
    await assert.rejects(applyStudentTransitions([changed], retry), /vừa thay đổi/);
    assert.equal(records.get(changed.ref).className, '6A');
    const missing = { type: 'patch', ref: `${root}/students/deleted`, data: { className: '7A' } };
    await assert.rejects(applyStudentTransitions([missing], retry), /đã bị xóa/);
    await recordPromotionStage(retry, 'sheet', { sheetProcessed: 101 });
    // Finalization reads current settings instead of a stale UI copy.
    records.set(global, { ...records.get(global), extraSchoolYears: ['2028-2029', '2029-2030'], unrelated: 'Keep latest' });
    const complete = await finalizePromotionJob(retry, ['7A']);
    assert.ok(complete.extraSchoolYears.includes('2029-2030'));
    assert.deepEqual(complete.schoolClassesByYear['2028-2029'], { keep: true });
    assert.equal(records.get(global).schoolYear, '2026-2027');
    assert.equal(records.get(global).unrelated, 'Keep latest');
    assert.equal(records.get(`${root}/school_year_jobs/${first.id}-${first.attemptId}`).status, 'failed');
    assert.equal(records.get(`${root}/school_year_jobs/${retry.id}-${retry.attemptId}`).status, 'success');
    await failPromotionJob(retry, 'after completion');
    assert.equal(records.get(global).schoolYearPromotion.status, 'success');
    const expired = await beginPromotionJob('2026-2027', '2027-2028', 'admin');
    records.get(global).schoolYearPromotion.leaseExpiresAt = 0;
    await assert.rejects(recordPromotionStage(expired, 'sheet'), /hết quyền/);
  } finally {
    delete globalThis.__promotionTestBackend;
    await rm(directory, { recursive: true, force: true });
  }
});
