import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

test('actual scorebook hook keeps drafts across navigation, merges independent edits and detects concurrent changes', async () => {
  const directory = await mkdtemp(resolve('node_modules/.scorebook-test-'));
  const output = join(directory, 'hook.mjs');
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = windowObject;
  globalThis.document = windowObject.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const documents = new Map();
  const listeners = new Map();
  let holdCommit, emitAfterCommit;
  const backend = {
    doc: (...args) => args.slice(1).join('/'),
    snapshot: id => ({ data: () => documents.get(id), metadata: { hasPendingWrites: false } }),
    onSnapshot(id, options, next) { assert.equal(options.includeMetadataChanges, true); listeners.set(id, next); next(this.snapshot(id)); return () => listeners.delete(id); },
    async runTransaction(_db, callback) {
      const writes = [];
      const result = await callback({ get: async id => this.snapshot(id), set: (id, value) => writes.push([id, value]) });
      if (holdCommit) await holdCommit();
      for (const [id, value] of writes) {
        documents.set(id, { ...documents.get(id), ...value });
        if (emitAfterCommit) {
          listeners.get(id)?.(this.snapshot(id));
          this.emit(id, { ...documents.get(id), edits: { ...documents.get(id).edits, independent: '10' } });
        }
      }
      return result;
    },
    emit(id, data) { documents.set(id, data); listeners.get(id)?.(this.snapshot(id)); }
  };
  globalThis.__scorebookTestBackend = backend;
  const root = createRoot(windowObject.document.getElementById('root'));
  try {
    await build({ entryPoints: ['src/hooks/useScorebookDraft.js'], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'fake-firestore', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'const b=globalThis.__scorebookTestBackend; export const doc=b.doc; export const onSnapshot=b.onSnapshot.bind(b); export const runTransaction=b.runTransaction.bind(b); export class FieldPath{}; export const deleteField=()=>null;'
          : 'export const db={}; export const auth={}; export const appId="test";', loader: 'js' }));
      } }] });
    const { useScorebookDraft } = await import(pathToFileURL(output));
    let state;
    const retainedDocuments = new Map();
    function Harness({ id, retained = retainedDocuments }) { state = useScorebookDraft(id, undefined, retained); return React.createElement('div', null, JSON.stringify(state.edits)); }
    const first = 'artifacts/test/public/data/scorebooks/first';
    const metadata = { grade: '6', schoolCode: 'NAN', schoolYear: '2026-2027', sourceFile: 'template' };
    await act(async () => root.render(React.createElement(Harness, { id: 'first' })));
    await act(async () => backend.emit(first, { edits: { a: '5', b: '6' } }));
    await act(async () => state.setEdits(current => ({ ...current, a: '8' })));
    await act(async () => backend.emit(first, { edits: { a: '5', b: '9' } }));
    assert.deepEqual(state.edits, { a: '8', b: '9' });
    assert.equal(state.isDirty, true);
    await act(async () => root.render(React.createElement(Harness, { id: 'second' })));
    assert.deepEqual(state.edits, {});
    await act(async () => root.render(React.createElement(Harness, { id: 'first' })));
    assert.equal(state.edits.a, '8');
    await act(async () => state.save({ ...metadata, updatedAt: 10 }));
    assert.deepEqual(documents.get(first).edits, { a: '8', b: '9' });
    assert.equal(state.isDirty, false);
    await act(async () => state.setEdits(current => ({ ...current, a: '7' })));
    await act(async () => backend.emit(first, { edits: { a: '10', b: '9' } }));
    await act(async () => assert.rejects(state.save({ ...metadata, updatedAt: 20 }), /vừa sửa/));
    assert.equal(state.edits.a, '7');
    assert.equal(documents.get(first).edits.a, '10');
    await act(async () => root.render(React.createElement(Harness, { id: 'third' })));
    const third = 'artifacts/test/public/data/scorebooks/third';
    const scoreKey = 'custom:hkiScore:0:uHS001:s0';
    await act(async () => backend.emit(third, { ...metadata, edits: { [scoreKey]: '5' }, scoreSources: { [scoreKey]: { source: 'quiz' } } }));
    await act(async () => state.setEdits({ [scoreKey]: '8' }));
    let release, pending;
    holdCommit = () => new Promise(resolve => { release = resolve; });
    await act(async () => { pending = state.save({ ...metadata, updatedAt: 30 }); });
    await act(async () => assert.rejects(state.save({ ...metadata, updatedAt: 31 }), /đang lưu/));
    await act(async () => state.setEdits({ [scoreKey]: '9' }));
    emitAfterCommit = true;
    holdCommit = null;
    await act(async () => { release(); await pending; });
    assert.equal(state.edits[scoreKey], '9');
    assert.equal(state.edits.independent, '10');
    assert.equal(state.isDirty, true);
    assert.equal(documents.get(third).scoreSources[scoreKey].source, 'manual');
    // The matching acknowledgement plus a later snapshot never makes the independent cell dirty.
    emitAfterCommit = false;
    await act(async () => state.save({ ...metadata, updatedAt: 40 }));
    assert.equal(state.isDirty, false);
    assert.equal(documents.get(third).edits.independent, '10');
    documents.set('artifacts/test/public/data/settings/global', { inputYearLocks: { '2026-2027': true } });
    await act(async () => state.setEdits(current => ({ ...current, [scoreKey]: '7' })));
    await act(async () => assert.rejects(state.save({ ...metadata, updatedAt: 50 }), /khóa nhập liệu/));
    assert.equal(state.edits[scoreKey], '7');
    await act(async () => root.render(null));
    await act(async () => root.render(React.createElement(Harness, { id: 'third' })));
    assert.equal(state.edits[scoreKey], '7', 'closing/unmounting the workspace preserves the session draft');
    assert.equal(state.isDirty, true);
    await act(async () => root.render(React.createElement(Harness, { id: 'third', retained: new Map() })));
    assert.equal(state.edits[scoreKey], '9', 'a different account gets its own clean store');
    assert.equal(state.isDirty, false);
  } finally {
    await act(async () => root.unmount());
    windowObject.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    delete globalThis.__scorebookTestBackend;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    await rm(directory, { recursive: true, force: true });
  }
});
