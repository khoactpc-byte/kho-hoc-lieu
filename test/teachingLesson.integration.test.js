import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('teaching reader limits queries to one week, filters campus/year/assignment and retains subscription errors', async () => {
  const directory = await mkdtemp(resolve('node_modules/.teaching-reader-test-'));
  const jobs = [], views = [], errors = [];
  globalThis.__teachingReaderFixture = {
    collectionForView: (name, context) => ({ name, context }),
    where: (field, operator, value) => ({ field, operator, value }),
    query: (source, ...filters) => ({ source, filters }),
    onSnapshot: (source, next, fail) => { const job = { source, next, fail, closed: false }; jobs.push(job); return () => { job.closed = true; }; }
  };
  try {
    const outfile = join(directory, 'reader.mjs');
    await build({ stdin: { contents: "export * from './src/services/teachingLesson.js'", resolveDir: resolve('.') }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'fake-firestore', setup(builder) {
        builder.onResolve({ filter: /^(firebase\/firestore|\.\/collectionSubscriptions)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const {onSnapshot,query,where}=globalThis.__teachingReaderFixture;'
          : 'export const {collectionForView}=globalThis.__teachingReaderFixture;' }));
      } }] });
    const { observeTeachingLesson } = await import(pathToFileURL(outfile));
    const profile = { role: 'teacher', schoolCode: 'NAN', grades: ['6'], subjects: ['Toán'] };
    const scope = { profile, schoolYear: '2026-2027', grade: '6', subject: 'Toán', lesson: '9' };
    observeTeachingLesson({ ...scope, grade: '9' }, value => views.push(value), error => errors.push(error));
    assert.equal(jobs.length, 0); assert.match(errors.pop().message, /chưa được phân công/);
    const stop = observeTeachingLesson(scope, value => views.push(value), error => errors.push(error));
    assert.equal(jobs.length, 3);
    assert.ok(jobs.every(job => job.source.filters.some(filter => filter.field === 'lesson' && filter.value === '9')));
    const note = { schoolYear: scope.schoolYear, schoolCode: 'NAN', grade: '6', subject: 'Toán', lesson: '9', content: 'Đúng bài' };
    const snapshot = items => ({ docs: items.map((item, index) => ({ id: String(index), data: () => item })) });
    jobs[0].next(snapshot([note, { ...note, schoolYear: '2025-2026' }, { ...note, schoolCode: 'TQK' }, { ...note, grade: '7' }, { ...note, subject: 'Ngữ Văn' }]));
    assert.equal(views.at(-1).notes.length, 1); assert.equal(views.at(-1).loading, true);
    jobs[1].next(snapshot([])); jobs[2].next(snapshot([]));
    assert.equal(views.at(-1).loading, false);
    jobs[0].fail(new Error('quota'));
    const count = views.length;
    jobs[1].next(snapshot([]));
    assert.equal(views.length, count, 'another listener cannot hide a failed read');
    assert.equal(errors.length, 1);
    stop(); assert.ok(jobs.every(job => job.closed));
    jobs[0].next(snapshot([note])); assert.equal(views.length, count);
  } finally { delete globalThis.__teachingReaderFixture; await rm(directory, { recursive: true, force: true }); }
});
