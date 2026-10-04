import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from './helpers/memoryStore.js';
import { issueSessionLease, requireSessionLease, revokeSessionLease } from '../netlify/lib/sessionLease.mjs';
import { createDataService } from '../netlify/lib/serverData.mjs';
import { createQuizService } from '../netlify/lib/serverQuiz.mjs';
import { studentHtml } from '../netlify/lib/studentHtml.mjs';
import { SCOREBOOK_SOURCE_FILE } from '../src/config/scorebookDomain.js';

const root = 'artifacts/test/public/data';
const student = { uid: 'child', role: 'student', studentId: 's1', accessCode: 'HS001', schoolCode: 'NAN', grade: '6', schoolYear: '2026-2027' };
const teacher = { uid: 'teacher', role: 'teacher', schoolCode: 'NAN', grades: ['6'], subjects: ['Toán'] };
const metadata = { schoolYear: '2026-2027', schoolCode: 'NAN', grade: '6', sourceFile: SCOREBOOK_SOURCE_FILE };
const bookId = `${metadata.schoolYear}_${metadata.sourceFile}_${metadata.schoolCode}_khoi_6`.replace(/[^\w-]+/g, '_');
function fixture() {
  const store = memoryStore(); store.put(`${root}/settings/global`, { schoolYear: student.schoolYear });
  store.put(`${root}/students/s1`, { ...student, fullName: 'Tên thật', studentKey: 'HS001', className: '6A', status: 'active' });
  return { store, data: createDataService({ store, appId: 'test', now: () => 1000 }) };
}
test('lease never extends original expiry; logout revokes custom-token exchanges', async () => {
  const store = memoryStore(), context = { store, appId: 'test' }; let stamp = 1000;
  const lease = await issueSessionLease({ ...context, uid: teacher.uid, token: 'original', identity: teacher, expiresAt: 150000, now: () => stamp });
  assert.equal(lease.sessionExpiresAt, 121000);
  const claims = { ...teacher, sessionId: lease.sessionId };
  assert.equal((await requireSessionLease(context, claims, () => stamp)).uid, teacher.uid);
  stamp = 122000; await assert.rejects(requireSessionLease(context, claims, () => stamp), /hết hiệu lực/);
  const renewed = await issueSessionLease({ ...context, uid: teacher.uid, token: 'original', identity: teacher, expiresAt: 500000, now: () => stamp });
  assert.equal(renewed.originalExpiresAt, 150000); assert.equal(renewed.sessionExpiresAt, 150000);
  await revokeSessionLease(context, claims);
  await assert.rejects(issueSessionLease({ ...context, uid: teacher.uid, token: 'original', identity: teacher, expiresAt: 500000, now: () => stamp }), /thu hồi/);
});
test('score API rejects other subjects, calculated cells, forged pupils and stale edits; clears protect manual grades', async () => {
  const { store, data } = fixture(), key = 'custom:hkiScore:1:uHS001:s0';
  const save = (patch, extra = {}) => data.saveScores(teacher, { documentId: bookId, metadata, patch, ...extra });
  await save({ [key]: { value: '0', source: { source: 'quiz', forged: true } } });
  assert.equal(store.get(`${root}/scorebooks/${bookId}`).scoreSources[key].source, 'manual');
  await assert.rejects(save({ 'custom:hkiScore:0:uHS001:s0': { value: 7 } }), /phân công/);
  await assert.rejects(save({ 'custom:hkiScore:1:uHS001:s6': { value: 7 } }), /tính toán/);
  await assert.rejects(save({ 'custom:hkiScore:1:uOTHER:s0': { value: 7 } }), /học sinh/);
  await assert.rejects(save({ [key]: { value: 7 } }), /vừa sửa/);
  await save({ [key]: { value: null } }, { expectedEdits: { [key]: '0.0' }, expectedSources: { [key]: store.get(`${root}/scorebooks/${bookId}`).scoreSources[key] } });
  assert.equal(store.get(`${root}/scorebooks/${bookId}`).scoreSources[key].source, 'manualCleared');
  store.put(`${root}/settings/global`, { inputYearLocks: { [metadata.schoolYear]: true } }); await assert.rejects(save({ [key]: { value: 5 } }), /khóa/);
});
test('student writes derive ownership; profile whitelist and elapsed time cannot be forged', async () => {
  const { store, data } = fixture();
  await assert.rejects(data.profileRequest(student, { changes: { accessCode: 'HS999' } }), /không được phép/);
  await data.profileRequest(student, { changes: { phone: '123' } });
  assert.equal(store.get(`${root}/student_profile_requests/profile-s1`).studentName, 'Tên thật');
  const first = await data.progress(student, { subject: 'Toán', lesson: '1', tickId: 'tick-1', elapsedMs: 1e9 });
  await data.progress(student, { subject: 'Toán', lesson: '1', tickId: 'tick-1' });
  await data.progress(student, { subject: 'Toán', lesson: '1', tickId: 'tick-2' });
  assert.equal(store.get(`${root}/lesson_progress/${first.id}`).elapsedMs, 30000);
  store.put(`${root}/settings/global`, { schoolYear: student.schoolYear, maintenance: { active: true } });
  await assert.rejects(data.profileRequest(student, { changes: { phone: '456' } }), /phục hồi/);
});
test('quick-material bank and manual HTML never expose keys; kinds cannot exchange attempts', async () => {
  const { store } = fixture(); let count = 0;
  const options = { store, appId: 'test', now: () => 1000, uuid: () => `id-${++count}`, choose: () => 0 };
  const quick = createQuizService({ ...options, kind: 'material' }), weekly = createQuizService(options);
  const scope = { schoolYear: student.schoolYear, schoolCode: 'NAN', grade: '6', subject: 'Toán', lesson: '1' };
  const questions = Array.from({ length: 12 }, (_, index) => ({ id: `q${index}`, text: `Câu ${index}`, points: 1, correctOptionId: 'a', options: [{ id: 'a', text: 'Có' }, { id: 'b', text: 'Không' }] }));
  await quick.publish(teacher, { quizId: 'quick', expectedVersion: null, quiz: { ...scope, deliveryMode: 'auto', isPublished: true, content: 'SECRET', quizData: { questions: questions.slice(0, 10), questionBank: questions, questionCountPerAttempt: 10 } } });
  assert.equal(store.get('artifacts/test/server_quizzes/material-quick').quizData.questions.length, 12);
  assert.equal(store.get(`${root}/materials/quick`).quizData, undefined);
  const opened = await quick.start(student, { quizId: 'quick' }); assert.equal(opened.quizData.questions.length, 10); assert.equal(JSON.stringify(opened).includes('correctOptionId'), false);
  await assert.rejects(weekly.submit(student, { attemptId: opened.attemptId, answers: {} }), /không thuộc/);
  const privateAttempt = store.get(`artifacts/test/server_quiz_attempts/${opened.attemptId}`);
  const answers = Object.fromEntries(privateAttempt.questions.map(q => [q.id, q.options.find(o => o.sourceId === q.correctOptionId).id]));
  await quick.submit(student, { attemptId: opened.attemptId, answers }); assert.equal(store.get(`${root}/quick_quiz_results/${opened.attemptId}`).score, 10);
  await weekly.publish(teacher, { quizId: 'manual', expectedVersion: null, quiz: { ...scope, deliveryMode: 'manual', isPublished: true, content: '<p>Đề</p><div class="teacher-only"><b>SECRET</b><div>KEY</div></div><p>Kết thúc</p>' } });
  const manual = await weekly.start(student, { quizId: 'manual' }); assert.equal(manual.content.includes('SECRET'), false); assert.equal(manual.content.includes('Kết thúc'), true);
  assert.equal(studentHtml('<div data-answer="KEY">Đề<script>SECRET</script></div>').includes('KEY'), false);
});

test('essay file ownership, teacher review, AI drafts and reset preserve manual corrections', async () => {
  const { store } = fixture(); let checks = 0;
  const data = createDataService({ store, appId: 'test', now: () => 1000, verifySubmissionFile: async (_actor, payload) => {
    checks++; if (payload.uploadReceipt !== 'owned') throw Object.assign(new Error('Tệp không thuộc học sinh'), { status: 403 });
    return { fileId: payload.fileId, fileUrl: 'https://drive.test/owned', fileName: 'Tên thật.pdf', mimeType: 'application/pdf', fileSize: 42 };
  } });
  const scope = { ...metadata, subject: 'Toán', lesson: '1' }, key = 'custom:hkiScore:1:uHS001:s0';
  store.put('artifacts/test/server_quizzes/manual', { ...scope, deliveryMode: 'manual', isPublished: true, serverVersion: 'v1', scoreTarget: { semester: 'hki', pageIndex: 1, scoreIndex: 0 } });
  const submission = { quizId: 'manual', fileId: 'file-owned-123', uploadReceipt: 'wrong', fileUrl: 'https://forged.test', teacherScore: 10 };
  await assert.rejects(data.submitEssay(student, { submission, requestId: 'request' }), /không thuộc/);
  const submitted = await data.submitEssay(student, { submission: { ...submission, uploadReceipt: 'owned' }, requestId: 'request' });
  const path = `${root}/handwritten_submissions/${submitted.id}`, row = store.get(path);
  assert.equal(row.fileUrl, 'https://drive.test/owned'); assert.equal(row.fileSize, 42); assert.equal(row.teacherScore, undefined);
  assert.equal((await data.submitEssay(student, { submission: { ...submission, uploadReceipt: 'owned' }, requestId: 'request' })).replayed, true); assert.equal(checks, 3);
  await assert.rejects(data.submitEssay(student, { submission: { ...submission, uploadReceipt: 'owned' }, requestId: 'other' }), /đã nộp/);
  const scorebook = { documentId: bookId, metadata, key };
  await assert.rejects(data.reviewEssay(teacher, { id: submitted.id, expected: row, context: scope, review: { teacherScore: '', teacherMaxScore: 10 }, scorebook }), /không hợp lệ/);
  store.put(`${root}/scorebooks/${bookId}`, { ...metadata, columnWidths: [80], edits: { [key]: '8.0' }, scoreSources: { [key]: { source: 'manual' } } });
  const reviewed = await data.reviewEssay(teacher, { id: submitted.id, expected: row, context: scope, review: { teacherScore: 0, teacherMaxScore: 10 }, scorebook });
  assert.equal(reviewed.status, 'existing'); assert.equal(store.get(`${root}/scorebooks/${bookId}`).edits[key], '8.0');
  await data.aiDraft(teacher, { id: submitted.id, fileId: row.fileId, patch: { aiScore: 9, status: 'ai_graded' } });
  assert.equal(store.get(path).status, 'teacher_reviewed');
  const result = await data.resetEssays(teacher, { context: scope, attempts: [{ id: submitted.id, kind: 'handwritten_submissions', expected: store.get(path) }] });
  assert.equal(result.preserved, 1); assert.equal(store.get(path), undefined); assert.equal(store.get(`${root}/scorebooks/${bookId}`).edits[key], '8.0');
  store.put(path, row); store.put(`${root}/scorebooks/${bookId}`, { ...metadata, edits: { [key]: '9.0' }, scoreSources: { [key]: { source: 'quiz', quizId: 'manual', attemptId: submitted.id, attemptKind: 'handwritten_submissions' } } });
  assert.equal((await data.resetEssays(teacher, { context: scope, attempts: [{ id: submitted.id, kind: 'handwritten_submissions', expected: row }] })).cleared, 1);
  assert.equal(store.get(`${root}/scorebooks/${bookId}`).edits[key], undefined);
});

test('score synchronization trusts stored server results and legacy score migration verifies the live roster', async () => {
  const { store, data } = fixture(), key = 'custom:hkiScore:1:uHS001:s0';
  const attempt = { kind: 'quiz_results', id: 'result', quizId: 'quiz' };
  const result = { ...metadata, subject: 'Toán', studentKey: 'HS001', quizId: 'quiz', serverGraded: true, score: 8, total: 10, scoreTarget: { semester: 'hki', pageIndex: 1, scoreIndex: 0 } };
  store.put(`${root}/quiz_results/result`, result);
  await assert.rejects(data.syncScore(teacher, { documentId: bookId, metadata, key, score: 10, attempt }), /Điểm vừa thay đổi/);
  assert.equal((await data.syncScore(teacher, { documentId: bookId, metadata, key, score: 8, attempt })).written, true);
  store.put(`${root}/scorebooks/${bookId}`, { ...metadata, edits: {}, scoreSources: { [key]: { source: 'manualCleared' } } });
  assert.equal((await data.syncScore(teacher, { documentId: bookId, metadata, key, score: 8, attempt })).written, false);
  store.put(`${root}/quiz_results/result`, { ...result, serverGraded: false });
  await assert.rejects(data.syncScore(teacher, { documentId: bookId, metadata, key, score: 8, attempt }), /xác nhận/);
  const old = { 'custom:hkiScore:1:r0:s0': '7.0' }, roster = [{ id: 's1', studentKey: 'HS001' }];
  store.put(`${root}/scorebooks/${bookId}`, { ...metadata, edits: old, scoreSources: {}, columnWidths: [80] });
  const payload = { documentId: bookId, roster, expectedEdits: old, expectedSources: {} }, admin = { uid: 'admin', role: 'admin' };
  assert.equal((await data.migrateScores(admin, payload)).edits[key], '7.0'); assert.deepEqual(store.get(`${root}/scorebooks/${bookId}`).edits, old);
  await data.migrateScores(admin, { ...payload, dryRun: false }); assert.equal(store.get(`${root}/scorebooks/${bookId}`).edits[key], '7.0');
  assert.deepEqual(store.get(`${root}/scorebooks/${bookId}`).columnWidths, [80]);
  await assert.rejects(data.migrateScores(admin, { ...payload, dryRun: false }), /đã thay đổi/);
});

test('large score edits paginate the atomic audit; failed commits leave both scores and audit unchanged', async () => {
  const { store, data } = fixture(), admin = { uid: 'admin', role: 'admin' };
  const expected = Object.fromEntries(Array.from({ length: 400 }, (_, index) => [`header-${index}`, 'a'.repeat(800)]));
  const patch = Object.fromEntries(Object.keys(expected).map(key => [key, { value: 'b'.repeat(800) }]));
  store.put(`${root}/scorebooks/${bookId}`, { ...metadata, edits: expected, scoreSources: {} });
  await data.saveScores(admin, { documentId: bookId, metadata, patch, expectedEdits: expected });
  const audit = (await store.collection('artifacts/test/server_score_audit').get()).docs.map(item => item.data());
  assert.ok(audit.length > 1); assert.equal(audit.reduce((total, page) => total + page.changes.length, 0), 400);
  assert.ok(audit.every(page => Buffer.byteLength(JSON.stringify(page)) < 350000));
  const before = store.dump(); store.failCommit = true;
  await assert.rejects(data.saveScores(admin, { documentId: bookId, metadata, patch: { 'header-0': { value: 'c' } }, expectedEdits: { 'header-0': 'b'.repeat(800) } }), /commit failure/);
  store.failCommit = false; assert.deepEqual(store.dump(), before);
});
