import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useAssignmentDraft } from '../src/hooks/useAssignmentDraft.js';

test('assignment draft preserves unsaved edits on remote updates and edits typed during saving', async () => {
  const windowObject = new JSDOM('<div id="root"></div>').window;
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = windowObject;
  globalThis.document = windowObject.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(windowObject.document.getElementById('root'));
  let state;
  function Harness({ remote }) { state = useAssignmentDraft(remote); return null; }
  try {
    const original = { teacher: 'Original' };
    await act(async () => root.render(React.createElement(Harness, { remote: original })));
    await act(async () => { state.setDirty(true); state.setValue({ teacher: 'Local' }); });
    await act(async () => root.render(React.createElement(Harness, { remote: { teacher: 'Other account' } })));
    assert.equal(state.value.teacher, 'Local');
    assert.equal(state.base, original);
    assert.equal(state.dirty, true);
    const sent = state.value;
    await act(async () => state.setValue({ teacher: 'Typed while saving' }));
    await act(async () => state.acknowledge(sent, { teacher: 'Saved local' }));
    assert.equal(state.value.teacher, 'Typed while saving');
    assert.equal(state.base.teacher, 'Saved local');
    assert.equal(state.dirty, true);
    const newer = state.value;
    await act(async () => state.acknowledge(newer, newer));
    assert.equal(state.dirty, false);
    await act(async () => root.render(React.createElement(Harness, { remote: { teacher: 'Latest' } })));
    assert.equal(state.value.teacher, 'Latest');
  } finally {
    await act(async () => root.unmount());
    windowObject.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

test('assignment service rejects stale drafts before staging and concurrent legacy changes before publication', async () => {
  const directory = await mkdtemp(resolve('node_modules/.assignment-test-'));
  const records = new Map();
  const parent = 'artifacts/test/public/data/settings/thdTeachingAssignments';
  const global = 'artifacts/test/public/data/settings/global';
  const deleted = Symbol('deleted');
  let afterStaging;
  const snapshot = ref => ({ data: () => structuredClone(records.get(ref)) });
  const apply = writes => writes.forEach(([ref, data, options]) => {
    const value = options?.merge || options?.mergeFields ? { ...records.get(ref), ...data } : { ...data };
    Object.keys(value).forEach(key => { if (value[key] === deleted) delete value[key]; });
    records.set(ref, value);
  });
  const backend = {
    path: (...args) => args.filter(arg => typeof arg === 'string').join('/'),
    snapshot,
    getDocsFromServer: async ref => ({ docs: [...records.keys()].filter(key => key.startsWith(`${ref}/`) && !key.slice(ref.length + 1).includes('/')).map(snapshot) }),
    async runTransaction(_db, callback) {
      const writes = [];
      const value = await callback({ get: async ref => { assert.equal(writes.length, 0); return snapshot(ref); }, set: (...args) => writes.push(args) });
      apply(writes); return value;
    },
    writeBatch() { const writes = []; return { set: (...args) => writes.push(args), commit: async () => { apply(writes); afterStaging?.(); afterStaging = undefined; } }; },
    deleteField: () => deleted
  };
  globalThis.__assignmentTestBackend = backend;
  try {
    const outfile = join(directory, 'service.mjs');
    await build({ entryPoints: ['src/services/teachingAssignments.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'assignment-backend', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'const b=globalThis.__assignmentTestBackend; export const doc=b.path, collection=b.path, deleteField=b.deleteField; export const getDocFromServer=async ref=>b.snapshot(ref), getDocsFromServer=b.getDocsFromServer; export const runTransaction=b.runTransaction.bind(b), writeBatch=b.writeBatch.bind(b); export const onSnapshot=()=>{};'
          : 'export const db={}; export const appId="test";', loader: 'js' }));
      } }] });
    const { saveTeachingAssignments, saveSimpleTeachingAssignments } = await import(pathToFileURL(outfile));
    records.set(parent, { value: { teacher: 'Other' } });
    records.set(global, { principalName: 'Keep' });
    await assert.rejects(saveTeachingAssignments({ teacher: 'Local' }, { baseValue: { teacher: 'Old' } }), /từ lúc bắt đầu/);
    assert.equal(records.size, 2);
    assert.equal(records.get(parent).value.teacher, 'Other');
    // Metadata without generation/updatedAt still participates in conflict detection.
    afterStaging = () => records.set(parent, { value: { teacher: 'Concurrent' } });
    await assert.rejects(saveTeachingAssignments({ teacher: 'Local' }, { baseValue: { teacher: 'Other' } }), /vừa được/);
    assert.equal(records.get(parent).value.teacher, 'Concurrent');
    records.delete(parent);
    records.set(global, { principalName: 'Keep', thdTeachingAssignments: { teacher: 'Legacy' } });
    afterStaging = () => records.set(global, { ...records.get(global), thdTeachingAssignments: { teacher: 'New legacy' } });
    await assert.rejects(saveTeachingAssignments({ teacher: 'Local' }, { baseValue: { teacher: 'Legacy' } }), /vừa được/);
    assert.equal(records.has(parent), false);
    await saveTeachingAssignments({ teacher: 'Published' }, { baseValue: { teacher: 'New legacy' } });
    assert.ok(records.get(parent).generation);
    assert.equal(Object.hasOwn(records.get(global), 'thdTeachingAssignments'), false);
    assert.equal(records.get(global).principalName, 'Keep');
    const oldSimple = { obsolete: true, current: 'A' };
    records.set(global, { ...records.get(global), teachingAssignments: oldSimple });
    await assert.rejects(saveSimpleTeachingAssignments({ current: 'B' }, {}), /từ lúc bắt đầu/);
    await saveSimpleTeachingAssignments({ current: 'B' }, oldSimple);
    assert.deepEqual(records.get(global).teachingAssignments, { current: 'B' });
  } finally {
    delete globalThis.__assignmentTestBackend;
    await rm(directory, { recursive: true, force: true });
  }
});
