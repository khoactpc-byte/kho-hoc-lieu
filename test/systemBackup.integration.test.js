import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { contentDigest } from '../src/utils/chunkedData.js';

test('actual backup service captures chunked assignments and restores their pointer atomically with documents', async () => {
  const directory = await mkdtemp(resolve('node_modules/.backup-test-'));
  const root = 'artifacts/test/public/data';
  const records = new Map();
  const commits = [];
  const deleted = Symbol('delete');
  let rejectNextCommit = false;
  let beforeTransaction;
  const snapshot = ref => ({ id: ref.split('/').at(-1), data: () => records.has(ref) ? structuredClone(records.get(ref)) : undefined });
  const apply = writes => {
    if (rejectNextCommit) { rejectNextCommit = false; throw new Error('simulated network failure'); }
    commits.push(writes);
    writes.forEach(([kind, ref, data, options]) => {
      if (kind === 'delete') { records.delete(ref); return; }
      const next = options?.merge ? { ...records.get(ref), ...data } : { ...data };
      Object.keys(next).forEach(key => { if (next[key] === deleted) delete next[key]; });
      records.set(ref, next);
    });
  };
  const backend = {
    path: (...args) => args.filter(arg => typeof arg === 'string').join('/'),
    deleteField: () => deleted,
    getDocFromServer: async ref => snapshot(ref),
    getDocsFromServer: async ref => ({ docs: [...records.keys()].filter(key => key.startsWith(`${ref}/`) && !key.slice(ref.length + 1).includes('/')).map(snapshot) }),
    async runTransaction(_db, callback) {
      beforeTransaction?.(); beforeTransaction = undefined;
      const writes = [];
      const value = await callback({ get: async ref => snapshot(ref), set: (...args) => writes.push(['set', ...args]), delete: ref => writes.push(['delete', ref]) });
      if (writes.length) apply(writes);
      return value;
    },
    writeBatch() { const writes = []; return { set: (...args) => writes.push(['set', ...args]), commit: async () => apply(writes) }; }
  };
  globalThis.__backupTestBackend = backend;
  try {
    const outfile = join(directory, 'service.mjs');
    await build({ entryPoints: ['src/services/systemBackup.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'fake-backup-firestore', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'const b=globalThis.__backupTestBackend; export const doc=b.path, collection=b.path, deleteField=b.deleteField; export const getDocFromServer=b.getDocFromServer, getDocsFromServer=b.getDocsFromServer; export const runTransaction=b.runTransaction.bind(b), writeBatch=b.writeBatch.bind(b); export const onSnapshot=()=>{throw new Error("not part of this test")};'
          : 'export const db={}; export const auth={}; export const appId="test";', loader: 'js' }));
      } }] });
    const { captureSystemSnapshot, restoreAtomicSnapshot } = await import(pathToFileURL(outfile));
    const parent = `${root}/settings/thdTeachingAssignments`;
    const original = { rows: [{ teacher: 'Khoa', classes: ['6A'] }] };
    const text = JSON.stringify(original);
    records.set(`${root}/students/a`, { fullName: 'An' });
    records.set(`${root}/settings/global`, { schoolYear: '2026-2027', adminPass: 'legacy secret' });
    records.set(parent, { chunked: true, generation: 'old', chunkCount: 1, digest: await contentDigest(text) });
    records.set(`${parent}/generations/old/chunks/0`, { generation: 'old', index: 0, text });
    const backup = await captureSystemSnapshot('2026-2027');
    assert.equal(Object.keys(backup.collections).length, 21);
    assert.deepEqual(backup.teachingAssignments, original);
    assert.equal(Object.hasOwn(backup.settings, 'adminPass'), false);
    assert.equal(backup.manifest.counts.students, 1);
    records.delete(`${parent}/generations/old/chunks/0`);
    await assert.rejects(captureSystemSnapshot('2026-2027'), /chưa đủ/);
    records.set(`${parent}/generations/old/chunks/0`, { generation: 'old', index: 0, text });
    const restored = { version: 1, collections: { students: [{ id: 'b', fullName: 'Bình' }] }, teachingAssignments: { rows: [] } };
    await restoreAtomicSnapshot(restored);
    const committed = commits.at(-1).map(write => write[1]);
    assert.ok(committed.includes(`${root}/students/a`));
    assert.ok(committed.includes(`${root}/students/b`));
    assert.ok(committed.includes(parent));
    assert.equal(records.has(`${root}/students/a`), false);
    const currentGeneration = records.get(parent).generation;
    assert.notEqual(currentGeneration, 'old');
    // A transaction failure never clears or partially replaces the active dataset.
    rejectNextCommit = true;
    await assert.rejects(restoreAtomicSnapshot({ version: 1, collections: { students: [{ id: 'c' }] } }), /network/);
    assert.equal(records.has(`${root}/students/b`), true);
    assert.equal(records.has(`${root}/students/c`), false);
    assert.equal(records.get(parent).generation, currentGeneration);
    // A record changed after the initial inventory is not overwritten.
    beforeTransaction = () => records.set(`${root}/students/b`, { fullName: 'Changed while restoring' });
    await assert.rejects(restoreAtomicSnapshot({ version: 1, collections: { students: [{ id: 'b', fullName: 'Old' }] } }), /vừa thay đổi/);
    assert.equal(records.get(`${root}/students/b`).fullName, 'Changed while restoring');
    records.set(`${root}/settings/global`, { schoolYear: '2027-2028', addedAfterBackup: true, adminPass: 'current credential' });
    await restoreAtomicSnapshot({ version: 1, collections: { students: [] }, settings: { schoolYear: '2026-2027', adminPass: 'old credential' } });
    assert.deepEqual(records.get(`${root}/settings/global`), { schoolYear: '2026-2027', adminPass: 'current credential' });
  } finally {
    delete globalThis.__backupTestBackend;
    await rm(directory, { recursive: true, force: true });
  }
});
