import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { parseFragment } from 'parse5';
import { buildEssayGradingPrompt, essayFeedbackBody, parseEssayDraftScore } from '../../src/utils/essayGrading.js';
import { teacherHasContentScope } from '../../src/utils/teacherAccess.js';
import { recordBelongsToStudent } from '../../src/utils/studentRecords.js';
import { documentId, fail, writable } from './dataPolicy.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fingerprint = row => digest(['fileId', 'submittedAt', 'quizId', 'studentId', 'studentAccessCode', 'schoolCode', 'schoolYear', 'grade', 'subject', 'lesson'].map(k => row[k] ?? null));
const sameScope = (a, b) => ['schoolCode', 'schoolYear', 'grade', 'subject', 'lesson'].every(k => !a[k] || String(a[k]) === String(b[k]));
const textOf = html => {
  const read = node => node.nodeName === '#text' ? node.value : ['script', 'style'].includes(node.tagName) ? '' : (node.childNodes || []).map(read).join(' ') + '\n';
  return read(parseFragment(String(html || '')));
};
export const essayWorkerAuthorized = (token, expected) => !!expected && typeof token === 'string' && Buffer.byteLength(token) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
export async function essayBridge(action, payload, { env = process.env, fetchImpl = fetch } = {}) {
  fail(env.APPS_SCRIPT_URL && env.APPS_SCRIPT_CLIENT_TOKEN && env.IDENTITY_BRIDGE_TOKEN, 503, 'Chưa cấu hình máy chủ chấm bài.');
  const response = await fetchImpl(env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, action, clientToken: env.APPS_SCRIPT_CLIENT_TOKEN, identityBridgeToken: env.IDENTITY_BRIDGE_TOKEN }), signal: AbortSignal.timeout(action === 'gradeQueuedEssay' ? 150000 : 20000) });
  fail(response.ok, 502, 'Máy chủ chấm bài chưa phản hồi.');
  const result = await response.json();
  fail(result.status === 'success', 503, String(result.message || 'Chưa xử lý được bài.').replace(/AIza[\w-]+/g, '[ẩn khóa]').slice(0, 700));
  return result;
}
export async function dispatchEssayJobs(ids, { env = process.env, fetchImpl = fetch } = {}) {
  const origin = env.DEPLOY_URL || env.URL;
  fail(/^https:\/\/(?:[a-f0-9]+--)?phocaptmt\.netlify\.app$/.test(origin || '') && env.IDENTITY_BRIDGE_TOKEN, 503, 'Chưa cấu hình hàng chờ chấm nền.');
  const response = await fetchImpl(`${origin}/.netlify/functions/essay-ai-background`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Essay-Worker': env.IDENTITY_BRIDGE_TOKEN },
    body: JSON.stringify({ ids }), signal: AbortSignal.timeout(15000) });
  fail(response.status === 202, 503, 'Bài đã vào hàng chờ; máy chủ sẽ thử chấm nền sau.');
}
export function createEssayWorkService({ store, appId, now = Date.now, bridge = essayBridge }) {
  const root = `artifacts/${appId}/public/data`, ref = (kind, id) => store.doc(`${root}/${kind}/${documentId(id)}`);
  const jobRef = id => store.doc(`artifacts/${appId}/server_essay_ai_jobs/${documentId(id)}`);
  const settingsRef = ref('settings', 'global');
  const poolRef = store.doc(`artifacts/${appId}/server_essay_ai_runtime/pool`);
  const staff = (actor, row) => fail(actor?.role === 'admin' || teacherHasContentScope(actor, row), 403, 'Không được phân công bài tự luận này.');
  async function queue(actor, { id, retry = false, uploadReceipt }) {
    const target = ref('handwritten_submissions', id), job = jobRef(id);
    let verifiedFingerprint;
    if (actor.role === 'student') {
      const source = (await target.get()).data();
      fail(source && source.studentAccessCode === actor.accessCode, 403, 'Bài nộp không thuộc học sinh.');
      await bridge('verifyStudentUpload', { studentId: source.studentId, accessCode: actor.accessCode, fileId: source.fileId, uploadReceipt: uploadReceipt || source.uploadReceipt });
      verifiedFingerprint = fingerprint(source);
    }
    return store.runTransaction(async tx => {
      const row = (await tx.get(target)).data(), settings = (await tx.get(settingsRef)).data() || {}, previous = (await tx.get(job)).data();
      fail(row?.fileId && !['left_page', 'locked_left_page'].includes(row.status), 400, 'Bài chưa có tệp tự luận hợp lệ.');
      writable(settings, row.schoolYear);
      if (actor.role === 'student') {
        fail(actor.accessCode && actor.accessCode === row.studentAccessCode && actor.schoolYear === row.schoolYear && actor.schoolCode === row.schoolCode && settings.schoolYear === row.schoolYear, 403, 'Chỉ được xếp chấm bài của chính mình.');
        fail(fingerprint(row) === verifiedFingerprint && String(actor.className || actor.grade).match(/^\d+/)?.[0] === String(row.grade), 403, 'Tệp hoặc lớp vừa thay đổi.');
        fail(!retry, 403, 'Giáo viên quyết định chấm lại.');
      } else staff(actor, row);
      if (row.status === 'teacher_reviewed' || row.aiStatus === 'graded' && !retry) return { status: 'done' };
      if (previous?.lockUntil > now() || previous?.state === 'pending' && previous.fingerprint === fingerprint(row)) return { status: 'queued' };
      if ((previous?.state === 'error' || row.aiStatus === 'error') && !retry) return { status: 'error', message: 'AI chưa chấm được; giáo viên có thể bấm Chấm lại AI.' };
      if (actor.role === 'student') {
        const slotRef = store.doc(`artifacts/${appId}/server_essay_ai_files/${digest([row.fileId, row.studentAccessCode])}`);
        const slot = (await tx.get(slotRef)).data();
        fail(!slot || slot.id === id, 409, 'Tệp này đã được xếp chấm. Không tạo lượt trùng.');
        tx.set(slotRef, { id });
      }
      tx.set(job, { id, state: 'pending', fingerprint: fingerprint(row), requestedAt: now(), lockUntil: 0 });
      tx.set(target, { aiStatus: 'queued', aiError: '', aiAutoRequestedAt: now() }, { mergeFields: ['aiStatus', 'aiError', 'aiAutoRequestedAt'] });
      return { status: 'queued' };
    });
  }
  async function grade(id) {
    const target = ref('handwritten_submissions', id), job = jobRef(id), run = randomUUID();
    const row = await store.runTransaction(async tx => {
      const current = (await tx.get(target)).data(), pending = (await tx.get(job)).data(), settings = (await tx.get(settingsRef)).data() || {}, pool = (await tx.get(poolRef)).data() || {};
      if (!pending || pending.state !== 'pending' || pending.lockUntil > now()) return null;
      if (!current || fingerprint(current) !== pending.fingerprint || current.status === 'teacher_reviewed') { tx.set(job, { state: 'stale' }, { mergeFields: ['state'] }); return null; }
      if (settings.maintenance?.active) return null;
      if (settings.inputYearLocks?.[current.schoolYear]) {
        tx.set(job, { state: 'error', lockUntil: 0 }, { mergeFields: ['state', 'lockUntil'] });
        tx.set(target, { aiStatus: 'error', aiError: 'Năm học đang khóa. Giáo viên có thể chấm lại sau khi mở khóa.' }, { mergeFields: ['aiStatus', 'aiError'] });
        return null;
      }
      writable(settings, current.schoolYear);
      const active = (pool.active || []).filter(slot => slot.until > now());
      if (active.length >= 2) return null;
      tx.set(poolRef, { active: [...active, { run, until: now() + 20 * 60 * 1000 }] });
      tx.set(job, { lockUntil: now() + 20 * 60 * 1000, run }, { mergeFields: ['lockUntil', 'run'] });
      tx.set(target, { aiStatus: 'grading', aiStartedAt: now(), aiRunId: run }, { mergeFields: ['aiStatus', 'aiStartedAt', 'aiRunId'] });
      return current;
    });
    if (!row) return { status: 'skipped' };
    try {
      const quizId = row.quizId;
      const privateQuiz = quizId ? (await store.doc(`artifacts/${appId}/server_quizzes/${documentId(quizId)}`).get()).data() : null;
      const publicQuiz = quizId ? (await ref('lesson_quizzes', quizId).get()).data() : null;
      const quiz = privateQuiz || publicQuiz;
      fail(!quiz || sameScope(quiz, row), 403, 'Đề không khớp bài nộp.');
      const noteId = `${row.schoolCode === 'NAN' ? '' : `${row.schoolCode}_`}g${row.grade}_${row.subject.replace(/\s/g, '')}_l${row.lesson}`;
      const note = (await ref('lesson_notes', noteId).get()).data();
      fail(!note || sameScope(note, row), 403, 'Học liệu không khớp bài nộp.');
      const prompt = buildEssayGradingPrompt({ submission: row, assignmentText: textOf(quiz?.content || ''), lessonText: textOf(note?.content || '') });
      const result = await bridge('gradeQueuedEssay', { fileId: row.fileId, schoolCode: row.schoolCode, grade: row.grade, subject: row.subject, lesson: row.lesson, schoolYear: row.schoolYear, prompt });
      const feedback = String(result.result || result.text || '').trim();
      fail(feedback && feedback.length < 50000, 502, 'AI chưa trả bản nhận xét hợp lệ.');
      const parsed = parseEssayDraftScore(feedback);
      return await finish(id, row, run, { aiStatus: 'graded', aiScore: parsed.score, aiMaxScore: parsed.maxScore,
        aiNeedsReview: parsed.needsReview, aiComment: feedback, aiModel: String(result.model || '').slice(0, 100), aiGradedAt: now(), aiError: '' }, 'done');
    } catch (error) {
      await finish(id, row, run, { aiStatus: 'error', aiError: error.status ? error.message : 'Chưa chấm được. Giữ bài để giáo viên thử lại.', aiFailedAt: now() }, 'error');
      return { status: 'error' };
    }
  }
  async function finish(id, source, run, patch, state) {
    return store.runTransaction(async tx => {
      const target = ref('handwritten_submissions', id), job = jobRef(id), current = (await tx.get(target)).data(), pending = (await tx.get(job)).data(), pool = (await tx.get(poolRef)).data() || {}, settings = (await tx.get(settingsRef)).data() || {};
      tx.set(poolRef, { active: (pool.active || []).filter(slot => slot.run !== run && slot.until > now()) });
      if (!current || current.aiRunId !== run || pending?.run !== run || fingerprint(current) !== fingerprint(source)) {
        if (pending?.run === run) tx.set(job, { state: 'stale', lockUntil: 0 }, { mergeFields: ['state', 'lockUntil'] });
        return { status: 'stale' };
      }
      if (settings.maintenance?.active || settings.inputYearLocks?.[current.schoolYear]) {
        tx.set(job, { state: 'error', lockUntil: 0 }, { mergeFields: ['state', 'lockUntil'] });
        tx.set(target, { aiStatus: 'error', aiError: 'Hệ thống đang bảo trì hoặc năm học vừa khóa. Chưa lưu điểm AI.' }, { mergeFields: ['aiStatus', 'aiError'] });
        return { status: 'locked' };
      }
      if (current.status !== 'teacher_reviewed' && patch.aiStatus === 'graded') patch.status = 'ai_graded';
      tx.set(target, patch, { mergeFields: Object.keys(patch) }); tx.set(job, { state, lockUntil: 0 }, { mergeFields: ['state', 'lockUntil'] });
      return { status: state };
    });
  }
  async function send(actor, { id, reviewedAt }) {
    const target = ref('handwritten_submissions', id), row = (await target.get()).data();
    fail(row, 404, 'Không tìm thấy bài nộp.'); staff(actor, row);
    const score = Number(String(row.teacherScore).replace(',', '.')), maximum = Number(String(row.teacherMaxScore).replace(',', '.'));
    fail(row.status === 'teacher_reviewed' && Number.isFinite(row.reviewedAt) && row.reviewedAt === reviewedAt && row.teacherScore != null && row.teacherScore !== '' && Number.isFinite(score) && maximum > 0 && maximum <= 1000 && score >= 0 && score <= maximum, 409, 'Duyệt và lưu bản chấm hiện tại trước khi gửi.');
    writable((await settingsRef.get()).data() || {}, row.schoolYear);
    let student = row.studentId ? (await ref('students', row.studentId).get()).data() : null;
    if (!student || !recordBelongsToStudent(row, student)) {
      const matches = await store.collection(`${root}/students`).where('accessCode', '==', row.studentAccessCode).limit(30).get();
      student = matches.docs.map(d => d.data()).find(s => s.schoolYear === row.schoolYear && s.schoolCode === row.schoolCode);
    }
    fail(student && recordBelongsToStudent(row, student) && student.schoolCode === row.schoolCode && student.schoolYear === row.schoolYear && String(student.className || student.grade).match(/^\d+/)?.[0] === String(row.grade), 409, 'Chưa đối chiếu được người nhận. Không gửi sang hồ sơ khác.');
    if (row.feedbackSentReviewAt === reviewedAt) return { sent: true, replayed: true };
    const messageId = `essay-${digest([id, reviewedAt, row.teacherScore, row.teacherMaxScore, row.teacherComment])}`;
    const mail = await bridge('deliverEssayFeedback', { messageId, schoolYear: row.schoolYear, recipientValue: student.accessCode,
      recipientLabel: student.fullName || student.accessCode, title: `${row.subject} · Tuần ${row.lesson} · Kết quả tự luận`,
      body: essayFeedbackBody(row, student), sender: actor.fullName || 'Giáo viên' });
    await store.runTransaction(async tx => {
      const current = (await tx.get(target)).data();
      if (current?.reviewedAt === reviewedAt) tx.set(target, { feedbackSentReviewAt: reviewedAt, feedbackSentAt: now(), feedbackMessageId: mail.id || messageId }, { mergeFields: ['feedbackSentReviewAt', 'feedbackSentAt', 'feedbackMessageId'] });
    });
    return { sent: true, messageId: mail.id || messageId };
  }
  async function pendingIds() {
    const snapshot = await store.collection(`artifacts/${appId}/server_essay_ai_jobs`).where('state', '==', 'pending').limit(10).get();
    return snapshot.docs.filter(d => !(d.data().lockUntil > now())).slice(0, 2).map(d => d.id);
  }
  return { queue, grade, send, pendingIds };
}
