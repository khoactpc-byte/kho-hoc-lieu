import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

test('scorebook cells, quick drafts and quiz reset use the actual services', async t => {
  const directory = await mkdtemp(resolve('node_modules/.score-cells-test-'));
  const prefix = 'artifacts/test/public/data/';
  const records = new Map(), listeners = new Map();
  const deleted = Symbol('delete');
  let failCommit = false, holdCommit;
  const snapshot = ref => ({ data: () => structuredClone(records.get(ref)), metadata: { hasPendingWrites: false, fromCache: false } });
  const backend = {
    doc: (...args) => args.filter(value => typeof value === 'string').join('/'),
    deleteField: () => deleted,
    onSnapshot(ref, options, next) { assert.equal(options.includeMetadataChanges, true); listeners.set(ref, next); next(snapshot(ref)); return () => listeners.delete(ref); },
    async runTransaction(_db, callback) {
      const writes = [];
      const result = await callback({
        get: async ref => { assert.equal(writes.length, 0, 'Firestore requires reads before writes'); return snapshot(ref); },
        set: (...args) => writes.push(['set', ...args]), delete: ref => writes.push(['delete', ref])
      });
      if (holdCommit) await holdCommit();
      if (failCommit) { failCommit = false; throw new Error('commit failed'); }
      writes.forEach(([kind, ref, payload, options]) => {
        if (kind === 'delete') { records.delete(ref); return; }
        if (!options) { records.set(ref, structuredClone(payload)); return; }
        const data = structuredClone(records.get(ref) || {});
        for (const field of options.mergeFields) {
          if (Array.isArray(field)) {
            const [map, key] = field;
            data[map] ||= {};
            if (payload[map][key] === deleted) delete data[map][key];
            else data[map][key] = structuredClone(payload[map][key]);
          } else data[field] = structuredClone(payload[field]);
        }
        records.set(ref, data);
        listeners.get(ref)?.(snapshot(ref));
      });
      return result;
    }
  };
  globalThis.__scoreCellsBackend = backend;
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  let windowObject, root;
  try {
    const outfile = join(directory, 'subject.mjs');
    await build({ stdin: { contents: `export * from './src/services/scorebookCells'; export * from './src/services/quizScorebook';
      export * from './src/hooks/useQuickScorebook'; export * from './src/hooks/useQuickScoreActions';`, resolveDir: resolve('.') },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'fake-score-cells', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'const b=globalThis.__scoreCellsBackend; export const doc=b.doc,deleteField=b.deleteField; export class FieldPath{constructor(...parts){return parts}}; export const runTransaction=b.runTransaction.bind(b),onSnapshot=b.onSnapshot.bind(b);'
          : args.path.endsWith('utils/helpers') ? 'export const postAppsScript=async()=>({});' : 'export const db={}; export const auth={}; export const appId="test";', loader: 'js' }));
      } }] });
    const service = await import(pathToFileURL(outfile));
    const metadata = { grade: '6', schoolYear: '2026-2027', schoolCode: 'NAN', sourceFile: 'template' };
    const path = prefix + 'scorebooks/book';
    const save = options => service.saveScorebookCells({ documentId: 'book', metadata, ...options });
    await t.test('independent cells survive, stale cells and failed commits are rejected, zero is not missing', async () => {
      records.set(path, { ...metadata, edits: { a: 0, b: '5.0' }, scoreSources: {} });
      await save({ patch: { b: { value: '8.0', source: { source: 'manual' } } }, expectedEdits: { b: '5.0' } });
      assert.equal(records.get(path).edits.a, 0);
      await assert.rejects(save({ patch: { b: { value: '9.0' } }, expectedEdits: { b: '5.0' } }), /vừa sửa/);
      const result = await save({ patch: { a: { value: '7.0' }, c: { value: '6.0' } }, onlyEmpty: true });
      assert.deepEqual(result.keys, ['c']); assert.equal(records.get(path).edits.a, 0);
      failCommit = true;
      await assert.rejects(save({ patch: { c: { value: undefined } }, expectedEdits: { c: '6.0' } }), /commit failed/);
      assert.equal(records.get(path).edits.c, '6.0');
      await save({ patch: { 'student.with.dot': { value: '2.0' } } });
      assert.equal(records.get(path).edits['student.with.dot'], '2.0');
      records.set(prefix + 'settings/global', { inputYearLocks: { '2026-2027': true } });
      await assert.rejects(save({ patch: { new: { value: '9.0' } } }), /khóa nhập liệu/);
      records.set(prefix + 'settings/global', {});
    });
    await t.test('reset atomically removes attempts and their own auto scores; manual or unknown scores survive', async () => {
      const context = { ...metadata, subject: 'Toán', lesson: '1' };
      const expected = { ...context, quizId: 'q', studentId: 'student', score: 8, total: 10 };
      const attempt = { id: 'attempt', kind: 'quiz_results', expected };
      const attemptPath = prefix + 'quiz_results/attempt';
      records.set(attemptPath, expected);
      records.set(path, { ...metadata, edits: { auto: '8.0', manual: '9.0', old: '7.0' }, scoreSources: {
        auto: { source: 'quiz', quizId: 'q', attemptId: 'attempt', attemptKind: 'quiz_results' },
        manual: { source: 'manual' }, old: { source: 'quiz' }
      } });
      const options = { attempts: [attempt], scorebooks: [{ documentId: 'book', metadata, keys: ['auto', 'manual', 'old'] }], context };
      failCommit = true;
      await assert.rejects(service.resetQuizAttempts(options), /commit failed/);
      assert.ok(records.has(attemptPath)); assert.equal(records.get(path).edits.auto, '8.0');
      records.set(attemptPath, { ...expected, score: 9 });
      await assert.rejects(service.resetQuizAttempts(options), /chấm lại/);
      records.set(attemptPath, expected);
      assert.deepEqual(await service.resetQuizAttempts(options), { deleted: 1, cleared: 1, preserved: 2 });
      assert.equal(records.has(attemptPath), false); assert.equal(records.get(path).edits.auto, undefined);
      assert.equal(records.get(path).edits.manual, '9.0'); assert.equal(records.get(path).edits.old, '7.0');
    });
    await t.test('automatic sync validates a live attempt and does not overwrite manual grades', async () => {
      const attempt = { id: 'live', kind: 'quiz_results', quizId: 'q' };
      const options = { documentId: 'book', metadata, key: 'new', score: '8.0', attempt, overwriteExisting: true };
      await assert.rejects(service.syncQuizScore(options), /được xóa/);
      records.set(prefix + 'quiz_results/live', { ...metadata, quizId: 'q', score: 8, total: 10 });
      assert.equal(await service.syncQuizScore(options), true);
      assert.equal(records.get(path).scoreSources.new.attemptId, 'live');
      records.get(path).scoreSources.new = { source: 'manual' };
      assert.equal(await service.syncQuizScore(options), false);
      await assert.rejects(service.syncQuizScore({ ...options, score: '9.0' }), /chấm lại/);
      const context = { ...metadata, subject: 'Toán', lesson: '1' };
      const result = { ...context, quizId: 'q', studentId: 'student', studentAccessCode: 'HS001', score: 8, total: 10 };
      await service.createQuizAttempt({ id: 'once', result, context });
      await assert.rejects(service.createQuizAttempt({ id: 'once', result: { ...result, score: 9 }, context }), /đã được nộp/);
      assert.equal(records.get(prefix + 'quiz_results/once').score, 8);
    });
    await t.test('teacher review commits with the score and late AI cannot recreate a deleted or replaced submission', async () => {
      const context = { ...metadata, subject: 'Toán', lesson: '1', authorId: 'teacher' };
      const expected = { ...context, quizId: 'q', fileId: 'file' };
      const essay = prefix + 'handwritten_submissions/essay';
      records.set(essay, expected);
      const options = { id: 'essay', expected, context, review: { teacherScore: '8', teacherMaxScore: '10', teacherComment: 'Good' },
        scorebook: { documentId: 'book', metadata, key: 'essay-score' } };
      await assert.rejects(service.reviewHandwrittenSubmission({ ...options, review: { ...options.review, teacherScore: '' } }), /Điểm phải/);
      failCommit = true;
      await assert.rejects(service.reviewHandwrittenSubmission(options), /commit failed/);
      assert.deepEqual(records.get(essay), expected); assert.equal(records.get(path).edits['essay-score'], undefined);
      assert.equal((await service.reviewHandwrittenSubmission(options)).status, 'written');
      assert.equal(records.get(essay).status, 'teacher_reviewed'); assert.equal(records.get(path).edits['essay-score'], '8.0');
      await assert.rejects(service.reviewHandwrittenSubmission(options), /vừa thay đổi/);
      const request = { id: 'essay', fileId: 'file', context, patch: { aiStatus: 'grading', aiStartedAt: Date.now() } };
      const runId = await service.updateAiGrading(request);
      await assert.rejects(service.updateAiGrading(request), /đang được chấm/);
      await service.updateAiGrading({ ...request, runId, patch: { aiStatus: 'graded', status: 'ai_graded', aiScore: '7' } });
      assert.equal(records.get(essay).status, 'teacher_reviewed');
      records.get(essay).aiRunId = 'new-run';
      await assert.rejects(service.updateAiGrading({ ...request, runId }), /thay thế/);
      records.delete(essay);
      await assert.rejects(service.updateAiGrading({ ...request, runId }), /được xóa/);
      assert.equal(records.has(essay), false);
    });
    windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
    globalThis.window = windowObject; globalThis.document = windowObject.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(windowObject.document.getElementById('root'));
    let state, actions;
    const columns = [{ editable: true, scoreIndex: 0 }, { editable: true, scoreIndex: 1 }, { editable: false, scoreIndex: 2 }];
    function Harness({ id = 'quick', enabled = true, identity = 'teacher' }) {
      state = service.useQuickScorebook(id, enabled, undefined, identity);
      actions = service.useQuickScoreActions({ user: { uid: 'teacher' }, canWrite: true, ...metadata,
        draft: state, getKey: (_semester, _page, _row, index) => 'cell' + index, quizKeys: new Set(), students: [{ id: 'student' }],
        columns, priorityIds: new Set(), getStudentKey: () => 'student', absenceRatios: {}, randomScore: () => '7.0', showNotification: () => {} });
      return React.createElement('div');
    }
    const quick = prefix + 'scorebooks/quick';
    await t.test('fill and clear respect numeric zero, local drafts and calculated columns', async () => {
      records.set(quick, { ...metadata, edits: { cell0: 0, cell2: '8.0' }, scoreSources: {} });
      await act(async () => root.render(React.createElement(Harness)));
      await act(async () => actions.fillMissingQuickScores());
      assert.deepEqual(records.get(quick).edits, { cell0: 0, cell1: '7.0', cell2: '8.0' });
      await act(async () => actions.clearVisibleQuickScores());
      assert.deepEqual(records.get(quick).edits, { cell2: '8.0' });
      await act(async () => state.setDrafts({ cell0: '6' }));
      await act(async () => actions.fillMissingQuickScores());
      assert.equal(records.get(quick).edits.cell0, undefined); assert.equal(state.drafts.cell0, '6');
    });
    await t.test('failed saves preserve drafts; navigation and typing during a save never lose another draft', async () => {
      await act(async () => state.setDrafts({ cell0: '8' }));
      failCommit = true;
      await act(async () => assert.rejects(state.save({ cell0: { value: '8.0' } }, metadata, 'cell0'), /commit failed/));
      assert.equal(state.drafts.cell0, '8');
      let release; holdCommit = () => new Promise(resolve => { release = resolve; });
      let saving;
      await act(async () => { saving = state.save({ cell0: { value: '8.0' } }, metadata, 'cell0'); });
      await act(async () => state.setDrafts({ cell0: '9', cell1: '3' }));
      await act(async () => root.render(React.createElement(Harness, { id: 'other' })));
      await act(async () => state.setDrafts({ other: '4' }));
      holdCommit = null;
      await act(async () => { release(); await saving; });
      assert.deepEqual(state.drafts, { other: '4' });
      await act(async () => root.render(React.createElement(Harness)));
      assert.deepEqual(state.drafts, { cell0: '9', cell1: '3' });
      await act(async () => root.render(React.createElement(Harness, { enabled: false })));
      assert.equal(state.hasUnsavedChanges(), true, 'closing the panel must preserve drafts until logout');
      await act(async () => root.render(React.createElement(Harness)));
      assert.deepEqual(state.drafts, { cell0: '9', cell1: '3' });
      await act(async () => state.setDrafts({ private: '9' }));
      await act(async () => root.render(React.createElement(Harness, { identity: 'another-teacher' })));
      assert.deepEqual(state.drafts, {});
      assert.equal(state.hasUnsavedChanges(), false);
    });
  } finally {
    if (root) await act(async () => root.unmount());
    windowObject?.close(); globalThis.window = previousWindow; globalThis.document = previousDocument;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT; delete globalThis.__scoreCellsBackend;
    await rm(directory, { recursive: true, force: true });
  }
});
