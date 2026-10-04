import test from 'node:test';
import assert from 'node:assert/strict';
import { FieldValue } from 'firebase-admin/firestore';
import { createQuizService } from '../netlify/lib/serverQuiz.mjs';
import { createQuizHandler } from '../netlify/functions/quiz.mjs';

// Models atomic commits and transaction serialization; does not replace a rules emulator.
function memoryStore() {
  let data = new Map(), queue = Promise.resolve();
  const clone = value => value == null ? value : structuredClone(value);
  const snapshot = path => ({ exists: data.has(path), data: () => clone(data.get(path)) });
  const setField = (target, segments, value) => {
    let parent = target;
    for (const segment of segments.slice(0, -1)) parent = parent[segment] ||= {};
    if (value?.isEqual?.(FieldValue.delete())) delete parent[segments.at(-1)];
    else parent[segments.at(-1)] = clone(value);
  };
  const store = {
    failCommit: false, commits: 0,
    doc: path => ({ path, get: async () => snapshot(path) }),
    get: path => clone(data.get(path)), put: (path, value) => data.set(path, clone(value)),
    dump: () => clone([...data]),
    runTransaction(callback) {
      const pending = queue.then(async () => {
        const operations = [];
        const transaction = {
          get: async ref => { assert.equal(operations.length, 0, 'reads must precede writes'); return snapshot(ref.path); },
          set: (ref, value, options) => operations.push({ type: 'set', ref, value, options }),
          create: (ref, value) => operations.push({ type: 'create', ref, value }),
          update: (ref, ...args) => operations.push({ type: 'update', ref, args }),
          delete: ref => operations.push({ type: 'delete', ref })
        };
        const result = await callback(transaction);
        if (store.failCommit) throw new Error('fixture commit failure');
        const next = new Map([...data].map(([key, value]) => [key, clone(value)]));
        for (const { type, ref, value, options, args } of operations) {
          if (type === 'delete') { next.delete(ref.path); continue; }
          if (type === 'create') { assert.equal(next.has(ref.path), false, 'create must not replace a document'); next.set(ref.path, clone(value)); continue; }
          if (type === 'set' && !options) { next.set(ref.path, clone(value)); continue; }
          const target = clone(next.get(ref.path) || {});
          if (type === 'set') for (const field of options.mergeFields) {
            const segments = typeof field === 'string' ? [field] : field.segments;
            setField(target, segments, segments.reduce((item, segment) => item?.[segment], value));
          }
          else {
            assert.equal(next.has(ref.path), true, 'update cannot recreate a deleted document');
            if (args.length === 1) Object.assign(target, clone(args[0]));
            else for (let i = 0; i < args.length; i += 2) setField(target, args[i].segments, args[i + 1]);
          }
          next.set(ref.path, target);
        }
        data = next; if (operations.length) store.commits++;
        return result;
      });
      queue = pending.catch(() => undefined); return pending;
    }
  };
  return store;
}
const root = 'artifacts/fixture/public/data';
const teacher = { role: 'teacher', uid: 'teacher-one', teacherId: 'one', sessionVersion: 1, schoolCode: 'NAN', grades: ['6'], subjects: ['Toán'] };
const student = { role: 'student', uid: 'student-one', studentId: 'profile-one', accessCode: 'HS001', schoolCode: 'NAN', grade: '6', schoolYear: '2026-2027' };
const context = { schoolCode: 'NAN', grade: '6', subject: 'Toán', schoolYear: '2026-2027', lesson: '1' };
const defaultQuiz = () => ({ ...context, title: 'Kiểm tra', content: '<div class="teacher-only">SECRET_ANSWER_KEY</div>', deliveryMode: 'auto', isPublished: true,
  publishAt: null, quizDocUrl: 'https://fixture.invalid/PRIVATE_ARCHIVE', scoreTarget: { semester: 'hki', pageIndex: 1, scoreIndex: 0, subjectKey: 'toan', grade: '6', schoolCode: 'NAN' },
  quizData: { showScoreAfterSubmit: true, allowRetake: true, shuffleQuestions: true, shuffleOptions: true, requirePassingScore: true, passingPercent: 80,
    questions: [
      { id: 'q1', text: 'Câu 1', points: 6, correctOptionId: 'b', options: [{ id: 'a', text: '1' }, { id: 'b', text: '2' }] },
      { id: 'q2', text: 'Câu 2', points: 4, correctOptionId: 'a', options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }] }
    ] } });
function fixture() {
  const store = memoryStore(); let count = 0;
  store.put(`${root}/settings/global`, { schoolYear: '2026-2027' });
  store.put(`${root}/students/profile-one`, { ...context, accessCode: 'HS001', fullName: 'Tên thật', className: '6A', status: 'active' });
  const service = createQuizService({ store, appId: 'fixture', now: () => 1000, uuid: () => `fixture-${++count}`, choose: () => 0 });
  const publish = (quiz = defaultQuiz(), extras = {}) => service.publish(teacher, { quizId: 'quiz-one', quiz, expectedVersion: null, ...extras });
  const privateAttempt = attemptId => store.get(`artifacts/fixture/server_quiz_attempts/${attemptId}`);
  const answer = (attemptId, correct = true) => Object.fromEntries(privateAttempt(attemptId).questions.map(question => [question.id,
    question.options.find(option => (option.sourceId === question.correctOptionId) === correct).id]));
  const bookPath = `${root}/scorebooks/2026-2027_so_diem_9pc_tmt_2025-2026_MAU_xlsx_NAN_khoi_6`;
  return { store, service, publish, answer, privateAttempt, bookPath };
}

test('server quiz replaces the public answer bank, hides keys and archives, and resumes one pinned attempt', async () => {
  const f = fixture();
  f.store.put(`${root}/lesson_quizzes/quiz-one`, { ...defaultQuiz(), updatedAt: 55, leakedField: 'old-key' });
  const legacy = await f.service.read(teacher, { quizId: 'quiz-one' });
  assert.equal(legacy.migrationRequired, true);
  await assert.rejects(f.publish(defaultQuiz(), { expectedLegacyUpdatedAt: 54 }), /Đề cũ đã thay đổi/);
  const { quiz } = await f.publish(defaultQuiz(), { expectedLegacyUpdatedAt: 55 });
  const header = f.store.get(`${root}/lesson_quizzes/quiz-one`);
  assert.equal(header.serverGraded, true); assert.equal(header.serverVersion, quiz.serverVersion);
  for (const key of ['content', 'quizData', 'quizDocUrl', 'leakedField']) assert.equal(key in header, false);
  const [first, parallel] = await Promise.all([f.service.start(student, { quizId: 'quiz-one' }), f.service.start(student, { quizId: 'quiz-one' })]);
  assert.deepEqual(first, parallel);
  const body = JSON.stringify(first);
  for (const forbidden of ['correctOptionId', 'sourceId', 'SECRET_ANSWER_KEY', 'PRIVATE_ARCHIVE', 'questionBank']) assert.equal(body.includes(forbidden), false);
  assert.equal(first.quizData.questions[0].options.every(option => !['a', 'b'].includes(option.id)), true);
  assert.deepEqual((await f.service.read(teacher, { quizId: 'quiz-one' })).quiz, quiz);
});

test('server grades only the assigned answers, derives identity, writes score atomically and replays retries', async () => {
  const f = fixture(); await f.publish();
  const opened = await f.service.start(student, { quizId: 'quiz-one' });
  const before = f.store.dump(); f.store.failCommit = true;
  await assert.rejects(f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId), score: 999 }), /commit failure/);
  assert.deepEqual(f.store.dump(), before); f.store.failCommit = false;
  const submitted = await f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId), score: 999, studentName: 'Giả', studentId: 'other' });
  assert.equal(submitted.result.score, 10); assert.equal(submitted.result.passed, true);
  assert.equal(submitted.result.scoreSync.status, 'written'); assert.equal('answers' in submitted.result, false);
  const stored = f.store.get(`${root}/quiz_results/${opened.attemptId}`);
  assert.equal(stored.studentName, 'Tên thật'); assert.equal(stored.studentId, 'profile-one');
  const key = 'custom:hkiScore:1:uHS001:s0';
  assert.equal(f.store.get(f.bookPath).edits[key], '10.0');
  assert.equal(f.store.get(f.bookPath).scoreSources[key].attemptId, opened.attemptId);
  const commits = f.store.commits;
  const repeated = await f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId, false) });
  assert.deepEqual(repeated.result, submitted.result); assert.equal(repeated.replayed, true); assert.equal(f.store.commits, commits);
  const restarted = await f.service.start(student, { quizId: 'quiz-one' });
  assert.deepEqual(restarted.result, submitted.result); assert.equal(restarted.attemptId, opened.attemptId);
});

test('server rejects foreign questions, another student, year locks, changed profiles and changed or withdrawn versions', async () => {
  const f = fixture(); const published = await f.publish();
  const opened = await f.service.start(student, { quizId: 'quiz-one' });
  await assert.rejects(f.service.submit({ ...student, uid: 'other' }, { attemptId: opened.attemptId, answers: {} }), /không thuộc/);
  await assert.rejects(f.service.submit(student, { attemptId: opened.attemptId, answers: { outside: 'a' } }), /ngoài lượt/);
  await assert.rejects(f.service.submit(student, { attemptId: opened.attemptId, answers: { [opened.quizData.questions[0].id]: 'a' } }), /không thuộc câu/);
  await assert.rejects(f.service.submit(student, { attemptId: opened.attemptId, answers: {} }), /chưa trả lời/);
  f.store.put(`${root}/settings/global`, { schoolYear: '2026-2027', inputYearLocks: { '2026-2027': true } });
  await assert.rejects(f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId) }), /khóa/);
  f.store.put(`${root}/settings/global`, { schoolYear: '2026-2027' });
  const profile = f.store.get(`${root}/students/profile-one`); f.store.put(`${root}/students/profile-one`, { ...profile, accessCode: 'HS002' });
  await assert.rejects(f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId) }), /Hồ sơ/);
  f.store.put(`${root}/students/profile-one`, profile);
  await f.service.publish(teacher, { quizId: 'quiz-one', quiz: { isPublished: false }, expectedVersion: published.quiz.serverVersion });
  await assert.rejects(f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId) }), /đổi đề/);
  assert.equal((await f.service.start(student, { quizId: 'quiz-one' })).pending, true);
  assert.equal(f.store.get(`${root}/quiz_results/${opened.attemptId}`), undefined);
});

test('failed attempts are recorded, hidden scores stay hidden and a passed/no-retake attempt cannot be renewed', async () => {
  const f = fixture(); const quiz = defaultQuiz(); quiz.quizData.showScoreAfterSubmit = false;
  await f.publish(quiz); const opened = await f.service.start(student, { quizId: 'quiz-one' });
  const failed = await f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId, false) });
  assert.equal(failed.result.needsRetake, true);
  for (const key of ['score', 'total', 'percent', 'answers', 'correctOptionId']) assert.equal(key in failed.result, false);
  assert.equal(f.store.get(`${root}/quiz_results/${opened.attemptId}`).score, 0);
  assert.equal(f.store.get(f.bookPath), undefined);
  const retry = await f.service.start(student, { quizId: 'quiz-one' }); assert.notEqual(retry.attemptId, opened.attemptId);
  const oldReplay = await f.service.submit(student, { attemptId: opened.attemptId, answers: {} }); assert.equal(oldReplay.replayed, true);
  const passed = await f.service.submit(student, { attemptId: retry.attemptId, answers: f.answer(retry.attemptId) }); assert.equal(passed.result.completed, true);
  assert.equal((await f.service.start(student, { quizId: 'quiz-one' })).attemptId, retry.attemptId);
  const other = fixture(); const locked = defaultQuiz(); locked.quizData.allowRetake = false; await other.publish(locked);
  const single = await other.service.start(student, { quizId: 'quiz-one' });
  const terminal = await other.service.submit(student, { attemptId: single.attemptId, answers: other.answer(single.attemptId, false) });
  assert.equal(terminal.result.completed, true); assert.equal(terminal.result.needsRetake, false);
  assert.equal((await other.service.start(student, { quizId: 'quiz-one' })).attemptId, single.attemptId);
});

test('automatic points preserve manual zero, cleared cells and other subjects; reset never resurrects attempts', async () => {
  for (const protectedSource of ['manual', 'manualCleared', 'random']) {
    const f = fixture(); await f.publish(); const opened = await f.service.start(student, { quizId: 'quiz-one' });
    const key = 'custom:hkiScore:1:uHS001:s0';
    f.store.put(f.bookPath, { ...context, edits: { [key]: 0, untouched: '7.0' }, scoreSources: { [key]: { source: protectedSource } } });
    const done = await f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId) });
    assert.equal(done.result.scoreSync.status, 'existing'); assert.equal(f.store.get(f.bookPath).edits[key], 0);
    await assert.rejects(f.service.reset(teacher, { quizId: 'quiz-one', attemptIds: [opened.attemptId] }), /vừa được nộp/);
    const reset = await f.service.reset(teacher, { quizId: 'quiz-one', attemptIds: [opened.attemptId], expectedSubmittedAt: { [opened.attemptId]: 1000 } });
    assert.equal(reset.cleared, 0); assert.equal(f.store.get(f.bookPath).edits.untouched, '7.0');
    await assert.rejects(f.service.submit(student, { attemptId: opened.attemptId, answers: {} }), /không thuộc/);
    assert.notEqual((await f.service.start(student, { quizId: 'quiz-one' })).attemptId, opened.attemptId);
  }
  const f = fixture(); await f.publish();
  const profile = f.store.get(`${root}/students/profile-one`); f.store.put(`${root}/students/profile-one`, { ...profile, studentKey: 'student.with.dot' });
  const opened = await f.service.start(student, { quizId: 'quiz-one' });
  await f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId) });
  assert.equal(f.store.get(f.bookPath).edits['custom:hkiScore:1:ustudent%2ewith%2edot:s0'], '10.0');
  const before = f.store.dump(); f.store.failCommit = true;
  await assert.rejects(f.service.reset(teacher, { quizId: 'quiz-one', attemptIds: [opened.attemptId], expectedSubmittedAt: { [opened.attemptId]: 1000 } }), /commit failure/);
  assert.deepEqual(f.store.dump(), before); f.store.failCommit = false;
  const reset = await f.service.reset(teacher, { quizId: 'quiz-one', attemptIds: [opened.attemptId], expectedSubmittedAt: { [opened.attemptId]: 1000 } });
  assert.equal(reset.cleared, 1); assert.deepEqual(f.store.get(f.bookPath).edits, {});
});

test('publication refuses invalid keys, calculated columns, stale changes, cross-scope moves and archives stay private', async () => {
  const f = fixture(); const published = await f.publish(); const before = f.store.dump();
  await assert.rejects(f.service.publish(teacher, { quizId: 'quiz-one', quiz: { title: 'new' }, expectedVersion: 'stale' }), /vừa sửa/);
  await assert.rejects(f.service.publish({ ...teacher, schoolCode: 'OTHER' }, { quizId: 'quiz-one', quiz: {}, expectedVersion: published.quiz.serverVersion }), /phân công/);
  await assert.rejects(f.service.publish({ role: 'admin', uid: 'admin' }, { quizId: 'quiz-one', quiz: { grade: '7' }, expectedVersion: published.quiz.serverVersion }), /phạm vi/);
  const invalid = defaultQuiz(); invalid.quizData.questions[0].correctOptionId = 'z';
  await assert.rejects(f.service.publish(teacher, { quizId: 'quiz-one', quiz: invalid, expectedVersion: published.quiz.serverVersion }), /đáp án/);
  await assert.rejects(f.service.publish(teacher, { quizId: 'quiz-one', quiz: { scoreTarget: { ...defaultQuiz().scoreTarget, scoreIndex: 6 } }, expectedVersion: published.quiz.serverVersion }), /Cột điểm/);
  assert.deepEqual(f.store.dump(), before);
  await f.service.archive(teacher, { quizId: 'quiz-one', expectedVersion: published.quiz.serverVersion, quizDocUrl: 'https://fixture.invalid/NEW_PRIVATE_ARCHIVE' });
  assert.equal(f.store.get(`${root}/lesson_quizzes/quiz-one`).quizDocUrl, undefined);
  assert.equal((await f.service.read(teacher, { quizId: 'quiz-one' })).quiz.quizDocUrl, 'https://fixture.invalid/NEW_PRIVATE_ARCHIVE');
});

test('quiz HTTP boundary verifies revoked tokens, app namespace and current staff identity; disabled endpoint does no work', async () => {
  const f = fixture(); let contextCalls = 0, claims = teacher, revoked = false, current = teacher;
  const handler = createQuizHandler({ enabled: () => true, context: () => { contextCalls++; return { appId: 'fixture', store: f.store, auth: {
    verifyIdToken: async (_token, checkRevoked) => { assert.equal(checkRevoked, true); if (revoked) throw new Error('revoked'); return { ...claims, appId: claims.appId || 'fixture' }; }
  } }; }, verifyStaff: async () => current, requireLease: async (_context, identity) => identity });
  const call = body => handler({ httpMethod: 'POST', headers: { authorization: 'Bearer fixture-token' }, body: JSON.stringify(body) });
  assert.equal((await handler({ httpMethod: 'POST', body: '{}' })).statusCode, 401);
  assert.equal((await handler({ httpMethod: 'POST', body: '[' })).statusCode, 400);
  assert.equal((await handler({ httpMethod: 'POST', body: 'a'.repeat(800001) })).statusCode, 413);
  revoked = true; assert.equal((await call({ action: 'read', quizId: 'quiz-one' })).statusCode, 401); revoked = false;
  claims = { ...teacher, appId: 'other' }; assert.equal((await call({ action: 'read', quizId: 'quiz-one' })).statusCode, 403);
  claims = teacher; current = { ...teacher, sessionVersion: 2 }; assert.equal((await call({ action: 'read', quizId: 'quiz-one' })).statusCode, 403);
  current = teacher;
  assert.equal((await call({ action: 'publish', quizId: 'quiz-one', quiz: defaultQuiz(), expectedVersion: null })).statusCode, 200);
  claims = student; const response = await call({ action: 'start', quizId: 'quiz-one' }); assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store'); assert.equal(response.body.includes('correctOptionId'), false);
  const count = contextCalls;
  const disabled = createQuizHandler({ enabled: () => false, context: () => { throw new Error('must not initialize Firebase'); } });
  assert.equal((await disabled({ httpMethod: 'POST' })).statusCode, 503); assert.equal(contextCalls, count);
});

test('clearing a quiz removes public/private answers only after a valid atomic commit and invalidates open attempts', async () => {
  const f = fixture(); const published = await f.publish();
  const opened = await f.service.start(student, { quizId: 'quiz-one' });
  const before = f.store.dump();
  await assert.rejects(f.service.clear(teacher, { quizId: 'quiz-one', expectedVersion: 'stale' }), /vừa thay đổi/);
  assert.deepEqual(f.store.dump(), before);
  f.store.failCommit = true;
  await assert.rejects(f.service.clear(teacher, { quizId: 'quiz-one', expectedVersion: published.quiz.serverVersion }), /commit failure/);
  assert.deepEqual(f.store.dump(), before); f.store.failCommit = false;
  const cleared = await f.service.clear(teacher, { quizId: 'quiz-one', expectedVersion: published.quiz.serverVersion });
  assert.equal(cleared.quiz.quizData, null); assert.equal(cleared.quiz.content, '');
  assert.equal(f.store.get(`${root}/lesson_quizzes/quiz-one`).hasContent, false);
  await assert.rejects(f.service.submit(student, { attemptId: opened.attemptId, answers: f.answer(opened.attemptId) }), /đổi đề/);
  await f.publish(defaultQuiz(), { expectedVersion: cleared.quiz.serverVersion });
  assert.equal(f.store.get(`${root}/lesson_quizzes/quiz-one`).hasContent, true);
});

test('fractional point boundaries are graded consistently without rounded percentages granting a pass', async () => {
  const f = fixture(); const quiz = defaultQuiz();
  quiz.quizData.questions = [0.1, 0.2, 0.7].map((points, index) => ({ ...quiz.quizData.questions[0], id: `fraction-${index}`, points }));
  quiz.quizData.passingPercent = 30; await f.publish(quiz);
  const opened = await f.service.start(student, { quizId: 'quiz-one' });
  const answers = Object.fromEntries(f.privateAttempt(opened.attemptId).questions.map(question => [question.id,
    question.options.find(option => (option.sourceId === question.correctOptionId) === (question.points < 0.7)).id]));
  const done = await f.service.submit(student, { attemptId: opened.attemptId, answers });
  assert.equal(done.result.score, 0.3); assert.equal(done.result.total, 1); assert.equal(done.result.passed, true);
  const second = fixture(); quiz.quizData.passingPercent = 30.01; await second.publish(quiz);
  const next = await second.service.start(student, { quizId: 'quiz-one' });
  const nextAnswers = Object.fromEntries(second.privateAttempt(next.attemptId).questions.map(question => [question.id,
    question.options.find(option => (option.sourceId === question.correctOptionId) === (question.points < 0.7)).id]));
  assert.equal((await second.service.submit(student, { attemptId: next.attemptId, answers: nextAnswers })).result.passed, false);
});
