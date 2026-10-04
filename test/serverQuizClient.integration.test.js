import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createAsyncScope } from '../src/utils/asyncScope.js';

test('server quiz client sends answers with authenticated identity and discards cancelled or stale responses', async () => {
  const directory = await mkdtemp(resolve('node_modules/.server-quiz-client-test-'));
  const originalFetch = globalThis.fetch;
  const auth = { currentUser: { uid: 'student-one', isAnonymous: false, getIdToken: async () => 'fixture-id-token' } };
  globalThis.__serverQuizClient = auth;
  const stored = new Map([['khl-staff-server-session-v1', 'fixture-staff-session']]);
  globalThis.window = { sessionStorage: { getItem: key => stored.get(key) } };
  try {
    const outfile = join(directory, 'client.mjs');
    await build({ entryPoints: ['src/services/serverQuizClient.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      define: { 'import.meta.env.VITE_SERVER_QUIZ_ENABLED': '"true"' }, plugins: [{ name: 'offline-client', setup(builder) {
        builder.onResolve({ filter: /config\/firebase$|scopedIdentity$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path.endsWith('scopedIdentity')
          ? 'export const SCOPED_AUTH_ENABLED=true;' : 'export const auth=globalThis.__serverQuizClient;', loader: 'js' }));
      } }] });
    const { requestServerQuiz, SERVER_QUIZ_ENABLED } = await import(pathToFileURL(outfile));
    assert.equal(SERVER_QUIZ_ENABLED, true);
    let requestBody;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/.netlify/functions/quiz'); assert.equal(options.headers.Authorization, 'Bearer fixture-id-token');
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ result: { score: 10 } }) };
    };
    await requestServerQuiz('submit', { attemptId: 'assigned-attempt', answers: { 'assigned-question': 'assigned-option' } });
    assert.deepEqual(requestBody.answers, { 'assigned-question': 'assigned-option' });
    assert.equal(requestBody.score, undefined); assert.equal(requestBody.quizData, undefined);
    assert.equal(requestBody.staffSessionToken, 'fixture-staff-session');
    let resolveResponse;
    globalThis.fetch = async () => new Promise(resolve => { resolveResponse = resolve; });
    const previousUser = auth.currentUser;
    const pending = requestServerQuiz('start', { quizId: 'one' });
    const stale = assert.rejects(pending, { name: 'AbortError' });
    while (!resolveResponse) await new Promise(resolve => setImmediate(resolve));
    auth.currentUser = { uid: 'other' };
    resolveResponse({ ok: true, json: async () => ({ attemptId: 'old-response' }) });
    await stale; auth.currentUser = previousUser;
    resolveResponse = null;
    const controller = new AbortController();
    const cancelled = requestServerQuiz('start', { quizId: 'one' }, { signal: controller.signal });
    const rejection = assert.rejects(cancelled, { name: 'AbortError' });
    while (!resolveResponse) await new Promise(resolve => setImmediate(resolve));
    controller.abort(); resolveResponse({ ok: true, json: async () => ({ attemptId: 'late-response' }) }); await rejection;
    globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
    await assert.rejects(requestServerQuiz('start', { quizId: 'one' }, { timeoutMs: 5 }), { name: 'AbortError' });
    const getToken = auth.currentUser.getIdToken;
    auth.currentUser.getIdToken = () => new Promise(() => {});
    await assert.rejects(requestServerQuiz('start', { quizId: 'one' }, { timeoutMs: 5 }), { name: 'AbortError' });
    auth.currentUser.getIdToken = getToken;
    globalThis.fetch = async () => ({ ok: true, json: () => new Promise(() => {}) });
    await assert.rejects(requestServerQuiz('start', { quizId: 'one' }, { timeoutMs: 5 }), { name: 'AbortError' });
    globalThis.fetch = async () => ({ ok: false, status: 423, json: async () => ({ error: 'Năm học đang khóa.' }) });
    await assert.rejects(requestServerQuiz('submit', {}), error => error.status === 423 && /khóa/.test(error.message));
    globalThis.fetch = async () => ({ ok: false, json: async () => { throw new Error('html'); } });
    await assert.rejects(requestServerQuiz('start', {}), /chưa phản hồi đúng/);
    auth.currentUser = { isAnonymous: true };
    await assert.rejects(requestServerQuiz('start', {}), /đăng nhập lại/);
  } finally {
    globalThis.fetch = originalFetch; delete globalThis.window; delete globalThis.__serverQuizClient;
    await rm(directory, { recursive: true, force: true });
  }
});

test('server quiz subscription exposes only migrated metadata and never subscribes students to answer-bearing results', async () => {
  const directory = await mkdtemp(resolve('node_modules/.server-quiz-policy-test-'));
  try {
    const outfile = join(directory, 'policy.mjs');
    await build({ entryPoints: ['src/services/collectionSubscriptions.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      define: { 'import.meta.env.VITE_SERVER_QUIZ_ENABLED': '"true"' }, plugins: [{ name: 'offline-policy', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const collection=(...args)=>({name:args.at(-1)}),where=(...args)=>args,query=(base,...filters)=>({...base,filters});'
          : 'export const db={};export const appId="fixture";', loader: 'js' }));
      } }] });
    const { collectionForView } = await import(pathToFileURL(outfile));
    const view = { scoped: true, identity: { role: 'student', accessCode: 'HS001', schoolCode: 'NAN', grade: '6', schoolYear: '2026-2027' } };
    assert.equal(collectionForView('quiz_results', view), null);
    assert.deepEqual(collectionForView('lesson_quizzes', view).filters, [
      ['schoolCode', '==', 'NAN'], ['grade', '==', '6'], ['schoolYear', '==', '2026-2027'], ['serverGraded', '==', true]
    ]);
    assert.deepEqual(collectionForView('quiz_results', { scoped: true, identity: { role: 'teacher', schoolCode: 'NAN', grades: ['6'], subjects: ['Toán'] } }).filters,
      [['schoolCode', '==', 'NAN'], ['grade', 'in', ['6']], ['subject', '==', 'Toán']]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('App server submission sends only assigned answers and never calculates or writes browser scores', async () => {
  const source = (await readFile('src/App.jsx', 'utf8')).replace(/\r\n?/g, '\n');
  const start = source.indexOf('  const handleSubmitSelfQuiz = async');
  const end = source.indexOf('  const handleSubmitSelfQuizRef', start);
  assert.ok(start > 0 && end > start);
  const mutations = [], requests = [];
  const scope = createAsyncScope(); scope.setScope('quiz-one');
  const result = { id: 'attempt', completed: true, score: 10, total: 10, serverGraded: true, scoreSync: { status: 'written' } };
  let pendingResponse;
  const forbidden = () => { throw new Error('browser grading or Firestore write must not run'); };
  const values = {
    SERVER_QUIZ_ENABLED: true, isSubmittingSelfQuiz: false, activeSelfQuiz: { allowRetake: true }, currentSelfQuizAttemptData: { questions: [] },
    quizId: 'quiz-one', user: { uid: 'student' }, serverQuizSession: { quizId: 'quiz-one', attemptId: 'assigned-attempt' },
    activeStudentIsReadOnly: false, canWriteCurrentSchoolYear: true, studentCanAccessCurrentGradeQuiz: true,
    activeStudentProfile: { id: 'student', fullName: 'Tên thật' }, currentStudent: null, studentSavedQuizResult: null,
    currentQuizResults: [], activeSelfQuizPassingPercent: 80, shuffledSelfQuizQuestions: [{ id: 'assigned-question' }],
    studentQuizAnswers: { 'assigned-question': 'assigned-option' }, studentQuizDraftKey: 'draft-key',
    quizRequestScopeRef: { current: scope }, studentQuizName: '',
    setStudentQuizWarning: value => mutations.push(['warning', value]), setIsSubmittingSelfQuiz: value => mutations.push(['submitting', value]),
    setServerQuizSession: value => mutations.push(['session', value(values.serverQuizSession)]),
    setStudentQuizResult: value => mutations.push(['result', value]), setStudentQuizAnswers: value => mutations.push(['answers', value]),
    setStudentSelfQuizAttemptSeed: value => mutations.push(['seed', value(0)]),
    localStorage: { removeItem: key => mutations.push(['removed-draft', key]) },
    showNotification: (...args) => mutations.push(['notification', ...args]), formatPointScore: value => String(value),
    isStudentQuizResultPassing: value => value?.completed === true,
    requestServerQuiz: async (action, payload) => { requests.push([action, payload]); return new Promise(resolve => { pendingResponse = resolve; }); },
    gradeSelfQuizSubmission: forbidden, createQuizAttempt: forbidden, writeQuizScoreToScorebook: forbidden, updateDoc: forbidden
  };
  const handler = new Function(...Object.keys(values), `${source.slice(start, end)}; return handleSubmitSelfQuiz;`)(...Object.values(values));
  const pending = handler();
  assert.deepEqual(requests, [['submit', { attemptId: 'assigned-attempt', answers: { 'assigned-question': 'assigned-option' }, autoSubmit: false }]]);
  pendingResponse({ result }); await pending;
  assert.deepEqual(mutations.find(item => item[0] === 'result'), ['result', result]);
  assert.ok(mutations.some(item => item[0] === 'removed-draft'));
  mutations.length = 0;
  const stale = handler();
  scope.setScope('another-quiz'); pendingResponse({ result }); await stale;
  assert.deepEqual(mutations, [['warning', ''], ['submitting', true]], 'late result cannot change the new quiz or its draft');
});

test('App clears the quiz editor only after saving succeeds in the same view', async () => {
  const source = (await readFile('src/App.jsx', 'utf8')).replace(/\r\n?/g, '\n');
  const start = source.indexOf('  const handleClearQuiz = async');
  const end = source.indexOf('  const handleToggleQuizPublish', start);
  assert.ok(start > 0 && end > start);
  const section = source.slice(start, end), updates = [];
  const editor = { innerHTML: 'Bản đang soạn', setAttribute: () => {} }, answer = { innerHTML: 'Đáp án đang soạn' };
  const values = { window: { confirm: () => true }, quizId: 'quiz-one', user: { uid: 'teacher' },
    quizContextRef: { current: 'same-view' }, quizEditorRef: { current: editor }, quizAnswerEditorRef: { current: answer },
    getDefaultSelfQuizDraft: () => ({ questions: [] }), persistQuiz: async () => ({ ok: false }) };
  for (const [, setter] of section.matchAll(/\b(set\w+)\(/g)) values[setter] = value => updates.push([setter, value]);
  const make = () => new Function(...Object.keys(values), `${section};return handleClearQuiz;`)(...Object.values(values));
  await make()(); assert.deepEqual(updates, []); assert.equal(editor.innerHTML, 'Bản đang soạn'); assert.equal(answer.innerHTML, 'Đáp án đang soạn');
  values.persistQuiz = async () => { values.quizContextRef.current = 'another-view'; return { ok: true }; };
  await make()(); assert.deepEqual(updates, []); assert.equal(editor.innerHTML, 'Bản đang soạn');
  values.persistQuiz = async () => ({ ok: true });
  await make()(); assert.ok(updates.length > 0); assert.equal(editor.innerHTML, ''); assert.equal(answer.innerHTML, '');
});
