import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('lesson saving targets the captured document, preserves metadata and refuses concurrent content changes', async () => {
  const directory = await mkdtemp(resolve('node_modules/.lesson-test-'));
  const documents = new Map([['noteA', { content: 'old A', title: 'Keep this title' }], ['noteB', { content: 'B' }]]);
  const backend = {
    async runTransaction(_db, callback) {
      const writes = [];
      await callback({ get: async id => ({ data: () => documents.get(id) }),
        set: (id, data) => writes.push([id, data]) });
      writes.forEach(([id, data]) => documents.set(id, { ...documents.get(id), ...data }));
    }
  };
  globalThis.__lessonTestBackend = backend;
  try {
    const outfile = join(directory, 'lesson.mjs');
    await build({ entryPoints: ['src/services/lessonDrafts.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'offline-lesson', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const doc=(...args)=>args.at(-1); export const runTransaction=globalThis.__lessonTestBackend.runTransaction;'
          : 'export const db={}; export const appId="offline";', loader: 'js' }));
      } }] });
    const { saveLessonDraft } = await import(pathToFileURL(outfile));
    const draft = { noteId: 'noteA', authorId: 'teacher', draftKey: 'local-only', baseContent: 'old A', content: 'new A' };
    await saveLessonDraft(draft);
    assert.equal(documents.get('noteA').content, 'new A');
    assert.equal(documents.get('noteA').title, 'Keep this title');
    assert.equal(documents.get('noteB').content, 'B');
    assert.equal(Object.hasOwn(documents.get('noteA'), 'baseContent'), false);
    assert.equal(Object.hasOwn(documents.get('noteA'), 'draftKey'), false);
    documents.set('noteA', { content: 'Other teacher change' });
    await assert.rejects(saveLessonDraft({ ...draft, content: 'my pending draft' }), /vừa được người khác sửa/);
    assert.equal(documents.get('noteA').content, 'Other teacher change');
    await assert.rejects(saveLessonDraft({ ...draft, baseContent: undefined }), /Chờ tải/);
  } finally {
    delete globalThis.__lessonTestBackend;
    await rm(directory, { recursive: true, force: true });
  }
});
