import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('schedule publishing is atomic, preserves manual news flags and refuses concurrent edits', async () => {
  const directory = await mkdtemp(resolve('node_modules/.schedule-test-'));
  const root = 'artifacts/test/public/data';
  const records = new Map();
  const ref = path => ({ path, id: path.split('/').at(-1) });
  const snapshot = reference => ({ ref: reference, id: reference.id, data: () => structuredClone(records.get(reference.path)) });
  let failCommit = false;
  let beforeTransaction;
  const backend = {
    path: (...args) => ref(args.map(arg => arg.path || arg).filter(arg => typeof arg === 'string').join('/')),
    getDocFromServer: async reference => snapshot(reference),
    getDocsFromServer: async reference => ({ docs: [...records.keys()].filter(path => path.startsWith(`${reference.path}/`) && !path.slice(reference.path.length + 1).includes('/'))
      .filter(path => (reference.filters || []).every(([key, value]) => records.get(path)[key] === value)).map(path => snapshot(ref(path))) }),
    async runTransaction(_db, callback) {
      beforeTransaction?.(); beforeTransaction = undefined;
      const writes = [];
      let startedWriting = false;
      await callback({ get: async reference => { assert.equal(startedWriting, false, 'transaction reads must precede writes'); return snapshot(reference); },
        set: (...args) => { startedWriting = true; writes.push(['set', ...args]); },
        delete: reference => { startedWriting = true; writes.push(['delete', reference]); } });
      if (failCommit) { failCommit = false; throw new Error('network failed'); }
      writes.forEach(([kind, reference, data, options]) => {
        if (kind === 'delete') records.delete(reference.path);
        else records.set(reference.path, options?.merge ? { ...records.get(reference.path), ...data } : data);
      });
    }
  };
  globalThis.__scheduleBackend = backend;
  try {
    const outfile = join(directory, 'service.mjs');
    await build({ entryPoints: ['src/services/schedulePublication.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'fake-schedules', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'const b=globalThis.__scheduleBackend; export const doc=b.path,collection=b.path,getDocFromServer=b.getDocFromServer,getDocsFromServer=b.getDocsFromServer; export const runTransaction=b.runTransaction.bind(b); export const where=(key,_op,value)=>[key,value]; export const query=(ref,...filters)=>({...ref,filters});'
          : 'export const db={}; export const appId="test";', loader: 'js' }));
      } }] });
    const { saveSchedulePublication, deleteSchedulePublication } = await import(pathToFileURL(outfile));
    const previous = { schoolYear: '2026-2027', schoolCode: 'NAN', semester: '1', status: 'published', updatedAt: 1 };
    records.set(`${root}/class_schedules/old`, previous);
    records.set(`${root}/news/old-news`, { type: 'class_schedule', scheduleId: 'old', isPinned: true, pinSource: 'manual' });
    records.set(`${root}/news/alias`, { type: 'class_schedule', scheduleId: 'new', isPinned: true, isHot: true, pinSource: 'manual' });
    const payload = { ...previous, updatedAt: 2, name: 'New schedule' };
    const news = { type: 'class_schedule', scheduleId: 'new', title: 'New news' };
    failCommit = true;
    await assert.rejects(saveSchedulePublication('new', payload, news), /network/);
    assert.equal(records.get(`${root}/class_schedules/old`).status, 'published');
    assert.equal(records.has(`${root}/class_schedules/new`), false);
    assert.equal(records.has(`${root}/news/alias`), true);
    await saveSchedulePublication('new', payload, news);
    assert.equal(records.get(`${root}/class_schedules/old`).status, 'draft');
    assert.equal(records.get(`${root}/news/old-news`).isHidden, true);
    assert.equal(records.get(`${root}/news/old-news`).isPinned, true);
    const canonical = [...records.entries()].find(([, data]) => data.scheduleId === 'new' && data.type === 'class_schedule');
    assert.equal(records.has(`${root}/news/alias`), false);
    assert.equal(canonical[1].isPinned, true);
    assert.equal(canonical[1].isHot, true);
    const pointers = [...records.entries()].filter(([path]) => path.startsWith(`${root}/schedule_publications/`));
    assert.equal(pointers[0][1].activeScheduleId, 'new');
    // A server reordering map keys does not produce a false conflict on a second save.
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    await saveSchedulePublication('new', { ...payload, updatedAt: 3 }, news, { ...reordered, id: 'new' });
    beforeTransaction = () => records.set(pointers[0][0], { ...records.get(pointers[0][0]), revision: 99 });
    await assert.rejects(saveSchedulePublication('third', payload, { ...news, scheduleId: 'third' }), /vừa được công bố/);
    assert.equal(records.has(`${root}/class_schedules/third`), false);
    assert.equal(records.get(`${root}/class_schedules/new`).status, 'published');
    await assert.rejects(deleteSchedulePublication('new', payload), /vừa thay đổi/);
    failCommit = true;
    await assert.rejects(deleteSchedulePublication('new', { ...payload, updatedAt: 3 }), /network/);
    assert.equal(records.has(canonical[0]), true);
    await deleteSchedulePublication('new', { ...payload, updatedAt: 3 });
    assert.equal(records.has(`${root}/class_schedules/new`), false);
    assert.equal(records.has(canonical[0]), false);
    assert.equal(records.get(pointers[0][0]).activeScheduleId, null);
  } finally {
    delete globalThis.__scheduleBackend;
    await rm(directory, { recursive: true, force: true });
  }
});
