import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { planCampusNormalization } from '../src/utils/campusNormalization.js';

test('campus migration requires a backup, preserves unrelated fields, commits book copies atomically, and rejects stale previews', async () => {
  const directory = await mkdtemp(resolve('node_modules/.campus-test-'));
  const base = 'artifacts/test/public/data';
  const student = { fullName: 'An', accessCode: 'HS123', className: '9B', schoolYear: '2025-2026', studentKey: 'stable', sheetSync: { status: 'success' } };
  const book = { schoolYear: '2025-2026', grade: '9', sourceFile: 'template.xlsx', edits: { 'custom:hkiScore:0:r0:s0': '0' } };
  const data = new Map([[`${base}/students/student`, structuredClone(student)], [`${base}/scorebooks/old`, structuredClone(book)]]);
  const commits = [];
  const snapshot = path => ({ data: () => data.has(path) ? structuredClone(data.get(path)) : undefined });
  globalThis.__campusTest = {
    path: (...args) => args.filter(arg => typeof arg === 'string').join('/'),
    async runTransaction(_db, callback) {
      const writes = [];
      await callback({
        get: async path => { assert.equal(writes.length, 0); return snapshot(path); },
        set: (path, value, options) => writes.push({ path, value, options })
      });
      commits.push(writes);
      writes.forEach(({ path, value, options }) => data.set(path, options?.mergeFields ? { ...data.get(path), ...structuredClone(value) } : structuredClone(value)));
    }
  };
  try {
    const outfile = join(directory, 'migration.mjs');
    await build({ entryPoints: ['src/services/campusNormalization.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'campus-fixture', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|scopedIdentity$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'const b=globalThis.__campusTest; export const doc=b.path, collection=b.path, runTransaction=b.runTransaction;'
          : args.path.endsWith('scopedIdentity') ? 'export const SCOPED_AUTH_ENABLED=false;' : 'export const db={}, appId="test";', loader: 'js' }));
      } }] });
    const { applyCampusNormalization } = await import(pathToFileURL(outfile));
    const plan = planCampusNormalization({ version: 2, collections: { students: [{ id: 'student', ...student }], scorebooks: [{ id: 'old', ...book }] } }, 'NAN');
    await assert.rejects(applyCampusNormalization(plan, ''), /sao lưu/);
    assert.equal(commits.length, 0);
    const progress = [];
    await applyCampusNormalization(plan, 'verified-backup', value => progress.push(value));
    assert.deepEqual(data.get(`${base}/students/student`), { ...student, schoolCode: 'NAN', schoolName: 'THCS Nguyễn An Ninh' });
    assert.equal(data.get(`${base}/students/student`).sheetSync.status, 'success', 'campus changes do not queue broad Sheet overwrites');
    const archive = data.get(`${base}/scorebooks/old`);
    assert.equal(archive.campusNormalization.backupId, 'verified-backup');
    assert.deepEqual(data.get(`${base}/scorebooks/${archive.campusNormalization.archivedTo}`).edits, book.edits);
    assert.equal(commits.length, 1, 'source archive marker and destination copy commit together');
    assert.deepEqual(progress, [{ completed: 2, total: 2 }]);
    const count = commits.length;
    await assert.rejects(applyCampusNormalization(plan, 'verified-backup'), /vừa thay đổi/);
    assert.equal(commits.length, count, 'stale migration does not overwrite updated records');
    const fresh = planCampusNormalization({ version: 2, collections: { students: [{ id: 'student', ...data.get(`${base}/students/student`), schoolName: '' }] } }, 'NAN');
    data.set(`${base}/settings/global`, { maintenance: { active: true } });
    await assert.rejects(applyCampusNormalization(fresh, 'verified-backup'), /sao lưu\/phục hồi/);
  } finally {
    delete globalThis.__campusTest;
    await rm(directory, { recursive: true, force: true });
  }
});
