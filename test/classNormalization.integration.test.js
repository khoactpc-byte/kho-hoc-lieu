import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { planClassNormalization } from '../src/utils/classNormalization.js';

test('class repair is atomic across rosters and attendance, requires backup and rejects concurrent edits', async () => {
  const directory = await mkdtemp(resolve('node_modules/.class-test-'));
  const base = 'artifacts/test/public/data';
  const students = [{ id: 's', schoolCode: 'NAN', className: '6', studentKey: 'stable' }];
  const attendance = [{ id: 'old', schoolCode: 'NAN', className: '6', date: '2026-01-02', records: { s: { status: 'KP' } } }];
  const data = new Map([...students.map(({ id, ...row }) => [`${base}/students/${id}`, structuredClone(row)]), ...attendance.map(({ id, ...row }) => [`${base}/class_attendance/${id}`, structuredClone(row)])]);
  const plan = planClassNormalization({ version: 2, collections: { students, class_attendance: attendance } });
  let commits = 0;
  globalThis.__classRepairTest = {
    path: (...args) => args.filter(arg => typeof arg === 'string').join('/'),
    async runTransaction(_db, callback) {
      const writes = [];
      await callback({ get: async path => { assert.equal(writes.length, 0); return { data: () => structuredClone(data.get(path)) }; },
        set: (path, patch, options) => writes.push({ path, patch, options }) });
      commits++;
      writes.forEach(({ path, patch, options }) => { assert.deepEqual(options.mergeFields, Object.keys(patch)); data.set(path, { ...data.get(path), ...patch }); });
    }
  };
  try {
    const outfile = join(directory, 'repair.mjs');
    await build({ entryPoints: ['src/services/classNormalization.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'fixture', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|scopedIdentity$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'const b=globalThis.__classRepairTest; export const doc=b.path, collection=b.path, runTransaction=b.runTransaction;'
          : args.path.endsWith('scopedIdentity') ? 'export const SCOPED_AUTH_ENABLED=false;' : 'export const db={}, appId="test";', loader: 'js' }));
      } }] });
    const { applyClassNormalization } = await import(pathToFileURL(outfile));
    await assert.rejects(applyClassNormalization(plan, ''), /sao lưu/);
    data.get(`${base}/class_attendance/old`).records.s.status = 'CP';
    await assert.rejects(applyClassNormalization(plan, 'backup'), /vừa thay đổi/);
    assert.equal(commits, 0); assert.equal(data.get(`${base}/students/s`).className, '6');
    data.get(`${base}/class_attendance/old`).records.s.status = 'KP';
    await applyClassNormalization(plan, 'backup');
    assert.equal(commits, 1); assert.equal(data.get(`${base}/students/s`).className, '6A');
    assert.deepEqual(data.get(`${base}/class_attendance/old`).records, attendance[0].records);
    assert.equal(data.get(`${base}/class_attendance/old`).className, '6A');
  } finally { delete globalThis.__classRepairTest; await rm(directory, { recursive: true, force: true }); }
});
