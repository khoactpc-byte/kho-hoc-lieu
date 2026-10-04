import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { recordBelongsToStudent } from '../src/utils/studentRecords.js';
import { selectStudentIdentity } from '../src/utils/studentIdentitySelection.js';

test('identity exchange cannot select a future or ambiguous student profile', () => {
  const current = { id: 'current', schoolYear: '2026-2027' };
  const future = { id: 'future', schoolYear: '2027-2028' };
  assert.equal(selectStudentIdentity([future, current], '2026-2027'), current);
  assert.throws(() => selectStudentIdentity([current, { ...current, id: 'duplicate' }], '2026-2027'), /nhiều hồ sơ/);
  assert.throws(() => selectStudentIdentity([{ ...current, status: 'dropped' }], '2026-2027'), /còn hiệu lực/);
  assert.throws(() => selectStudentIdentity([future], '2026-2027'), /chưa đến năm/);
  assert.equal(selectStudentIdentity([{ ...current, schoolYear: '2026/27' }, future], '2026 - 2027').id, 'current');
  assert.throws(() => selectStudentIdentity([current, { ...current, id: 'same-year', schoolYear: '2026/27' }], '2026-2027'), /nhiều hồ sơ/);
  assert.throws(() => selectStudentIdentity([current], ''), /Chưa cấu hình/);
});

test('private work never matches a namesake or contradictory access code', () => {
  const student = { id: 'a', accessCode: 'HS001', fullName: 'Nguyễn An' };
  assert.equal(recordBelongsToStudent({ studentName: student.fullName }, student), false);
  assert.equal(recordBelongsToStudent({ studentId: 'a' }, student), true);
  assert.equal(recordBelongsToStudent({ studentId: 'a', studentAccessCode: 'HS002' }, student), false);
  assert.equal(recordBelongsToStudent({ studentAccessCode: 'hs001' }, student), true);
});

test('logout cancels a pending identity response and serializes auth mutations after a token sign-in', async () => {
  const directory = await mkdtemp(resolve('node_modules/.identity-test-'));
  const originalFetch = globalThis.fetch;
  let pendingFetch; let pendingSignIn;
  const calls = [];
  let token = 'old';
  globalThis.__authBackend = {
    setPersistence: async () => calls.push('session-persistence'),
    signInWithCustomToken: async (_auth, next) => { calls.push('sign-in'); await new Promise(resolve => { pendingSignIn = resolve; }); token = next; },
    signOut: async () => { calls.push('sign-out'); token = null; },
    signInAnonymously: async () => { calls.push('anonymous'); token = 'anonymous'; }
  };
  const stored = new Map();
  globalThis.window = { sessionStorage: { setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) } };
  try {
    const outfile = join(directory, 'identity.mjs');
    await build({ entryPoints: ['src/services/scopedIdentity.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { 'import.meta.env.VITE_SCOPED_AUTH_ENABLED': '"true"' },
      plugins: [{ name: 'fake-auth', setup(builder) {
        builder.onResolve({ filter: /^firebase\/auth$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/auth'
          ? 'const b=globalThis.__authBackend; export const browserSessionPersistence={}; export const setPersistence=b.setPersistence,signInWithCustomToken=b.signInWithCustomToken,signOut=b.signOut,signInAnonymously=b.signInAnonymously;'
          : 'export const auth={};', loader: 'js' }));
      } }] });
    const service = await import(pathToFileURL(outfile));
    globalThis.fetch = async () => new Promise(resolve => { pendingFetch = resolve; });
    const first = service.exchangeScopedIdentity({ kind: 'staff' });
    const rejected = assert.rejects(first, { name: 'AbortError' });
    await service.resetScopedIdentity();
    pendingFetch({ ok: true, json: async () => ({ firebaseToken: 'late-admin' }) });
    await rejected;
    assert.equal(token, 'anonymous'); assert.equal(calls.includes('sign-in'), false);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ firebaseToken: 'student', studentSessionToken: 'secret' }) });
    const second = service.exchangeScopedIdentity({ kind: 'student' });
    const secondRejected = assert.rejects(second, { name: 'AbortError' });
    while (!pendingSignIn) await new Promise(resolve => setImmediate(resolve));
    const reset = service.resetScopedIdentity();
    pendingSignIn();
    await secondRejected; await reset;
    assert.equal(token, 'anonymous'); assert.equal(stored.size, 0);
    assert.deepEqual(calls.slice(-4), ['sign-in', 'sign-out', 'sign-out', 'anonymous']);
    // Closing the login dialog alone cancels a non-abortable custom-token sign-in.
    pendingSignIn = null;
    const controller = new AbortController();
    const cancelled = service.exchangeScopedIdentity({ kind: 'student' }, { signal: controller.signal });
    const cancelledRejected = assert.rejects(cancelled, { name: 'AbortError' });
    while (!pendingSignIn) await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    pendingSignIn();
    await cancelledRejected;
    assert.equal(token, null);
    assert.equal(stored.size, 0);
  } finally {
    delete globalThis.__authBackend; delete globalThis.window; globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test('subscription policy closes anonymous/private queries and limits student records to their own code', async () => {
  const directory = await mkdtemp(resolve('node_modules/.subscriptions-test-'));
  try {
    const outfile = join(directory, 'policy.mjs');
    await build({ entryPoints: ['src/services/collectionSubscriptions.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'fake-query', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const collection=(...args)=>({collection:args.at(-1)}), where=(...args)=>args, query=(base,...filters)=>({...base,filters});'
          : 'export const db={};export const appId="test";', loader: 'js' }));
      } }] });
    const { collectionForView } = await import(pathToFileURL(outfile));
    assert.equal(collectionForView('students', {}), null);
    assert.equal(collectionForView('lesson_quizzes', { scoped: true }), null);
    assert.equal(collectionForView('news', {}).collection, 'news');
    const studentView = { role: 'student', student: { id: 'a', accessCode: 'HS001' }, grade: '6' };
    for (const name of ['students', 'quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions']) {
      assert.equal(collectionForView(name, studentView).filters[0][2], 'HS001');
    }
    assert.equal(collectionForView('admission_applications', studentView), null);
    assert.equal(collectionForView('class_attendance', studentView), null);
    const teacher = { role: 'teacher', schoolCode: 'NAN', grades: ['6'], subjects: ['Toán'] };
    assert.deepEqual(collectionForView('class_attendance', { scoped: true, identity: teacher }).filters,
      [['schoolCode', '==', 'NAN'], ['grade', 'in', ['6']]]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
