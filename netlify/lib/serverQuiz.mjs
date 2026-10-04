import { SCOREBOOK_SOURCE_FILE, SUBJECT_PAGES, SUBJECT_KEYS } from '../../src/config/scorebookDomain.js';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { studentScoreIdentity, hasLegacyRowEdits } from '../../src/utils/studentScoreKeys.js';
import { extractSchoolYearFromText } from '../../src/utils/schoolYearText.js';
import { studentHtml } from './studentHtml.mjs';
import { sameData } from '../../src/utils/dataEquality.js';
import { writeScoreAudit } from './scoreAudit.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const sourceFile = SCOREBOOK_SOURCE_FILE;
const cleanDocId = value => String(value).replace(/[^\w-]+/g, '_');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const year = value => extractSchoolYearFromText(value, '');
const subjectPages = SUBJECT_PAGES;
const subjectNames = SUBJECT_KEYS;

export class QuizError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const require = (condition, status, message) => { if (!condition) throw new QuizError(status, message); };
const id = value => {
  require(typeof value === 'string' && value.length > 0 && value.length <= 300 && !value.includes('/') && value !== '.' && value !== '..', 400, 'Mã bài hoặc lượt làm không hợp lệ.');
  return value;
};
const text = (value, limit = 10000) => {
  require(typeof value === 'string' && value.length <= limit, 400, 'Nội dung bài không hợp lệ hoặc quá dài.');
  return value;
};
function shuffle(items, choose) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = choose(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

function definition(data) {
  const input = data.quizData;
  const bank = input?.questionBank?.length ? input.questionBank : input?.questions;
  require(Array.isArray(bank) && bank.length > 0 && bank.length <= 200, 400, 'Đề tự chấm cần từ 1 đến 200 câu hỏi.');
  const ids = new Set();
  const questions = bank.map(question => {
    const questionId = id(question.id);
    require(!ids.has(questionId), 400, 'Câu hỏi trùng mã.'); ids.add(questionId);
    const options = (Array.isArray(question.options) ? question.options : []).filter(option => option.text?.trim()).map(option => ({ id: id(option.id), text: text(option.text) }));
    const points = Number(question.points);
    require(question.points !== null && question.points !== '' && Number.isFinite(points) && points >= 0 && points <= 100, 400, 'Điểm câu hỏi không hợp lệ.');
    require(options.length >= 2 && options.length <= 8 && new Set(options.map(option => option.id)).size === options.length
      && options.some(option => option.id === question.correctOptionId), 400, 'Câu hỏi thiếu lựa chọn hoặc đáp án hợp lệ.');
    return { id: questionId, text: text(question.text), options, correctOptionId: question.correctOptionId, points: Math.round(points * 10000) / 10000 };
  });
  require(questions.some(question => question.points > 0), 400, 'Tổng điểm của đề phải lớn hơn 0.');
  const limit = Number(input.questionCountPerAttempt || 0);
  const passingPercent = Number(input.passingPercent ?? 80);
  require(Number.isInteger(limit) && limit >= 0 && limit <= questions.length && Number.isFinite(passingPercent) && passingPercent >= 0 && passingPercent <= 100, 400, 'Số câu hoặc mức đạt không hợp lệ.');
  // Store only the validated bank. Browser-supplied score/author/policy fields are never trusted.
  return { questions, questionCountPerAttempt: limit, shuffleQuestions: input.shuffleQuestions !== false,
    shuffleOptions: input.shuffleOptions !== false, showScoreAfterSubmit: input.showScoreAfterSubmit !== false,
    allowRetake: input.allowRetake !== false, requirePassingScore: input.requirePassingScore === true, passingPercent };
}

function scope(data) {
  const result = Object.fromEntries(['schoolYear', 'schoolCode', 'grade', 'subject', 'lesson'].map(key => [key, text(data[key], 100)]));
  require(year(result.schoolYear) === result.schoolYear && /^[1-9]\d?$/.test(result.grade) && result.schoolCode && result.schoolCode !== 'UNKNOWN' && result.subject && result.lesson, 400, 'Thiếu hoặc sai năm học, cơ sở, khối, môn, tuần.');
  return result;
}
function assertTeacher(identity, data) {
  require(identity.role === 'admin' || (identity.role === 'teacher' && identity.schoolCode === data.schoolCode
    && identity.grades?.map(String).includes(String(data.grade)) && identity.subjects?.includes(data.subject)), 403, 'Chưa được phân công bài kiểm tra này.');
}
function assertStudent(identity, profile, data, settings, writable = true) {
  require(identity.role === 'student' && profile && profile.accessCode === identity.accessCode && profile.status !== 'dropped', 403, 'Hồ sơ học sinh đã thay đổi. Đăng nhập lại.');
  const grade = String(profile.className || '').match(/^[1-9]\d*/)?.[0] || String(profile.grade || '');
  require(profile.schoolCode === identity.schoolCode && grade === identity.grade && year(profile.schoolYear) === year(identity.schoolYear), 403, 'Hồ sơ học sinh đã chuyển khối, cơ sở hoặc năm học. Đăng nhập lại.');
  require(profile.schoolCode === data.schoolCode && grade === data.grade && year(profile.schoolYear) === data.schoolYear, 403, 'Bài kiểm tra không thuộc lớp hoặc năm học của em.');
  if (writable) {
    require(year(settings.schoolYear) === data.schoolYear, 403, 'Chỉ được nộp bài trong năm học hiện tại.');
    require(!settings.maintenance?.active, 423, 'Hệ thống đang sao lưu hoặc phục hồi.');
      require(!settings.inputYearLocks?.[data.schoolYear], 423, 'Năm học đang khóa nhập liệu.');
  }
}
const published = (data, now) => data.isPublished === true || (Number.isFinite(data.publishAt) && data.publishAt > 0 && data.publishAt <= now);
const metadata = data => ({ ...scope(data), title: data.title, isPublished: data.isPublished, publishAt: data.publishAt,
  deliveryMode: data.deliveryMode, scoreTarget: data.scoreTarget, serverVersion: data.serverVersion, hasContent: !data.cleared,
  updatedAt: data.updatedAt, authorId: data.authorId, serverGraded: true });
function scoreTarget(target, data) {
  if (target == null) return null;
  require(['hki', 'hkii'].includes(target.semester) && Number.isInteger(target.pageIndex) && Number.isInteger(target.scoreIndex)
    && target.scoreIndex >= 0 && target.scoreIndex <= 5
    && (target.scoreIndex >= 4 || target.scoreIndex < (['gdcd', 'cong_nghe'].includes(target.subjectKey) ? 2 : 4))
    && subjectPages[target.subjectKey] === target.pageIndex
    && subjectNames[data.subject] === target.subjectKey && String(target.grade) === data.grade
    && target.schoolCode === data.schoolCode, 400, 'Cột điểm không thuộc khối, cơ sở, môn hoặc là cột tính toán.');
  return { semester: target.semester, pageIndex: target.pageIndex, scoreIndex: target.scoreIndex,
    subjectKey: target.subjectKey, grade: data.grade, schoolCode: data.schoolCode };
}
function studentResult(result, config) {
  if (!result) return null;
  const base = { id: result.id, quizId: result.quizId, submittedAt: result.submittedAt, studentId: result.studentId,
    studentAccessCode: result.studentAccessCode, needsRetake: result.needsRetake, passed: result.passed,
    completed: result.completed, serverGraded: result.serverGraded === true, scoreSync: { status: result.scoreSync?.status || 'needsReview' } };
  // Even after submission, neither the answer key nor per-question correctness is sent.
  return config.showScoreAfterSubmit ? { ...base, score: result.score, total: result.total, percent: result.percent } : base;
}
function studentAttempt(attempt, config) {
  return { attemptId: attempt.id, version: attempt.version,
    quizData: { ...Object.fromEntries(['allowRetake', 'showScoreAfterSubmit', 'requirePassingScore', 'passingPercent'].map(key => [key, config[key]])),
      shuffleQuestions: false, shuffleOptions: false, questions: attempt.questions.map(question => ({ id: question.id, text: question.text, points: question.points,
        options: question.options.map(option => ({ id: option.id, text: option.text })) })) } };
}

// All reads precede writes in each transaction, including settings and scorebook.
export function createQuizService({ store, appId, now = Date.now, uuid = randomUUID, choose = randomInt, kind = 'lesson' }) {
  require(['lesson', 'material'].includes(kind), 400, 'Loại đề không hợp lệ.');
  const publicName = kind === 'material' ? 'materials' : 'lesson_quizzes';
  const resultName = kind === 'material' ? 'quick_quiz_results' : 'quiz_results';
  const root = `artifacts/${appId}/public/data`;
  const ref = (name, key) => store.doc(`${root}/${name}/${id(key)}`);
  const privateRef = (name, key) => store.doc(`artifacts/${appId}/server_${name}/${id(key)}`);
  const settingsRef = ref('settings', 'global');
  const headRef = quizId => privateRef('quizzes', kind === 'material' ? `material-${quizId}` : quizId);
  const slotRef = (quizId, uid) => privateRef('quiz_slots', digest(`${kind === 'material' ? 'material:' : ''}${quizId}:${uid}`));
  const resultRef = attemptId => ref(resultName, attemptId);
  const publicMetadata = data => ({ ...metadata(data), ...(kind === 'material' ? { type: 'quick_quiz', studentSafe: true, placement: data.placement || 'lesson_content', createdAt: data.createdAt || data.updatedAt, url: '' } : {}) });
  const snapshotData = snapshot => snapshot.exists ? snapshot.data() : null;

  async function read(identity, { quizId }) {
    const head = snapshotData(await headRef(quizId).get());
    const legacy = head ? null : snapshotData(await ref(publicName, quizId).get());
    const data = head || legacy;
    require(data, 404, 'Chưa có bài kiểm tra.'); assertTeacher(identity, data);
    return { quiz: data, migrationRequired: !head };
  }
  async function publish(identity, { quizId, quiz, expectedVersion, expectedLegacyUpdatedAt }) {
    require(quiz && typeof quiz === 'object' && !Array.isArray(quiz), 400, 'Dữ liệu đề không hợp lệ.');
    const version = uuid(), updatedAt = now();
    return store.runTransaction(async transaction => {
      const old = snapshotData(await transaction.get(headRef(quizId)));
      const oldPublic = snapshotData(await transaction.get(ref(publicName, quizId)));
      const settings = snapshotData(await transaction.get(settingsRef)) || {};
      if (old || oldPublic) assertTeacher(identity, old || oldPublic);
      require((old?.serverVersion ?? null) === expectedVersion, 409, 'Có người vừa sửa đề. Tải lại trước khi lưu.');
      if (!old && oldPublic) require(same(oldPublic.updatedAt ?? null, expectedLegacyUpdatedAt), 409, 'Đề cũ đã thay đổi. Tải lại trước khi chuyển đáp án.');
      const data = { ...(old || oldPublic || {}), ...quiz };
      const context = scope(data); assertTeacher(identity, context);
      if (old || oldPublic) require(['schoolYear', 'schoolCode', 'grade', 'subject', 'lesson'].every(key => String((old || oldPublic)[key]) === context[key]), 409, 'Không được chuyển đề sang phạm vi khác.');
      require(!settings.maintenance?.active, 423, 'Hệ thống đang sao lưu hoặc phục hồi.');
      require(!settings.inputYearLocks?.[context.schoolYear], 423, 'Năm học đang khóa nhập liệu.');
      require(['auto', 'manual'].includes(data.deliveryMode) && (kind === 'lesson' || data.deliveryMode === 'auto'), 400, 'Hình thức đề không hợp lệ.');
      const config = data.deliveryMode === 'auto' ? definition(data) : null;
      require(data.publishAt == null || (typeof data.publishAt === 'number' && Number.isFinite(data.publishAt) && data.publishAt > 0), 400, 'Lịch phát đề không hợp lệ.');
      const full = { ...context, content: text(data.content || '', 300000), title: text(data.title || '', 500),
        isPublished: data.isPublished === true, publishAt: data.publishAt ?? null, deliveryMode: data.deliveryMode, quizData: config,
        kind, createdAt: old?.createdAt || updatedAt, placement: data.placement || 'lesson_content',
        scoreTarget: scoreTarget(data.scoreTarget, context), serverVersion: version, updatedAt, authorId: identity.uid,
        quizDocUrl: text(data.quizDocUrl || '', 2000), quizDocFileId: text(data.quizDocFileId || '', 500), quizDocName: text(data.quizDocName || '', 500) };
      transaction.set(headRef(quizId), full);
      // Replace, never merge: remove answer fields and archives from the old public document.
      transaction.set(ref(publicName, quizId), publicMetadata(full));
      return { quiz: full, migrationRequired: false };
    });
  }
  async function start(identity, { quizId }) {
    const attemptId = uuid(); const stamp = now();
    return store.runTransaction(async transaction => {
      const head = snapshotData(await transaction.get(headRef(quizId)));
      require(head, 409, 'Giáo viên chưa chuyển đề này sang chấm trên máy chủ.');
      const publicData = snapshotData(await transaction.get(ref(publicName, quizId)));
      const settings = snapshotData(await transaction.get(settingsRef)) || {};
      const profile = snapshotData(await transaction.get(ref('students', identity.studentId)));
      const slot = snapshotData(await transaction.get(slotRef(quizId, identity.uid)));
      assertStudent(identity, profile, head, settings, false);
      require(publicData?.serverVersion === head.serverVersion, 409, 'Đề đã thay đổi. Mở lại bài.');
      if (!published(head, stamp)) return { quiz: publicMetadata(head), pending: true };
      if (year(settings.schoolYear) !== head.schoolYear || settings.inputYearLocks?.[head.schoolYear]) {
        return { quiz: publicMetadata(head), pending: true, readOnly: true };
      }
      require(!settings.maintenance?.active, 423, 'Hệ thống đang sao lưu hoặc phục hồi. Thử lại sau.');
      if (head.deliveryMode === 'manual') return { quiz: publicMetadata(head), content: studentHtml(head.content), manual: true };
      if (slot?.version === head.serverVersion && slot.attemptId) {
        const attempt = snapshotData(await transaction.get(privateRef('quiz_attempts', slot.attemptId)));
        require(attempt, 409, 'Lượt làm đã bị xóa. Báo giáo viên mở lại.');
        if (attempt.status === 'open') return { quiz: publicMetadata(head), ...studentAttempt(attempt, head.quizData) };
        const result = snapshotData(await transaction.get(resultRef(attempt.id)));
        require(result, 409, 'Kết quả đã bị xóa. Báo giáo viên mở lại.');
        if (!result.needsRetake || !head.quizData.allowRetake) return { quiz: publicMetadata(head), ...studentAttempt(attempt, head.quizData), result: studentResult(result, head.quizData) };
        require(Number(slot.count || 0) < 30, 429, 'Đã đạt giới hạn 30 lượt. Báo giáo viên mở lại.');
      }
      const config = head.quizData;
      const selected = config.shuffleQuestions ? shuffle(config.questions, choose) : config.questions;
      const questions = selected.slice(0, config.questionCountPerAttempt || selected.length).map(question => {
        const options = config.shuffleOptions ? shuffle(question.options, choose) : question.options;
        return { id: uuid(), text: question.text, points: question.points, correctOptionId: question.correctOptionId,
          options: options.map(option => ({ id: uuid(), sourceId: option.id, text: option.text })) };
      });
      require(questions.reduce((sum, question) => sum + question.points, 0) > 0, 400, 'Lượt chọn câu có tổng điểm bằng 0. Giáo viên kiểm tra lại đề.');
      const attempt = { id: attemptId, quizId, kind, version: head.serverVersion, uid: identity.uid, studentId: identity.studentId,
        status: 'open', startedAt: stamp, questions };
      transaction.create(privateRef('quiz_attempts', attemptId), attempt);
      transaction.set(slotRef(quizId, identity.uid), { attemptId, version: head.serverVersion, count: slot?.version === head.serverVersion ? Number(slot.count || 0) + 1 : 1 });
      return { quiz: publicMetadata(head), ...studentAttempt(attempt, config) };
    });
  }
  async function submit(identity, { attemptId, answers, autoSubmit = false }) {
    require(answers && typeof answers === 'object' && !Array.isArray(answers) && Object.keys(answers).length <= 200, 400, 'Câu trả lời không hợp lệ.');
    const stamp = now();
    return store.runTransaction(async transaction => {
      const attemptRef = privateRef('quiz_attempts', attemptId);
      const attempt = snapshotData(await transaction.get(attemptRef));
      require(attempt && (attempt.kind || 'lesson') === kind && attempt.uid === identity.uid && attempt.studentId === identity.studentId, 403, 'Lượt làm không thuộc tài khoản này.');
      const head = snapshotData(await transaction.get(headRef(attempt.quizId)));
      require(head && head.serverVersion === attempt.version, 409, 'Giáo viên đã đổi đề. Mở lại bài để làm lượt mới.');
      const publicData = snapshotData(await transaction.get(ref(publicName, attempt.quizId)));
      const settings = snapshotData(await transaction.get(settingsRef)) || {};
      const profile = snapshotData(await transaction.get(ref('students', identity.studentId)));
      const slot = snapshotData(await transaction.get(slotRef(attempt.quizId, identity.uid)));
      const existing = snapshotData(await transaction.get(resultRef(attemptId)));
      assertStudent(identity, profile, head, settings);
      require(publicData?.serverVersion === head.serverVersion && published(head, stamp), 403, 'Bài kiểm tra đã thu hồi.');
      // Idempotent retry returns the committed result, even after a new retry attempt starts.
      if (attempt.status === 'submitted') {
        require(existing, 409, 'Kết quả đã bị xóa. Báo giáo viên mở lại.');
        return { result: studentResult(existing, head.quizData), replayed: true };
      }
      require(slot?.attemptId === attemptId && slot.version === attempt.version && !existing, 409, 'Lượt làm đã hết hiệu lực.');
      require(Object.keys(answers).every(key => attempt.questions.some(question => question.id === key)), 400, 'Có câu trả lời ngoài lượt đề đã cấp.');
      const graded = attempt.questions.map(question => {
        const selectedId = answers[question.id] ?? '';
        require(typeof selectedId === 'string' && (selectedId === '' || question.options.some(option => option.id === selectedId)), 400, 'Lựa chọn không thuộc câu hỏi.');
        const selected = question.options.find(option => option.id === selectedId);
        const isCorrect = !!selected && selected.sourceId === question.correctOptionId;
        return { questionId: question.id, questionText: question.text, selectedOptionId: selected?.sourceId || '',
          correctOptionId: question.correctOptionId, points: question.points, earned: isCorrect ? question.points : 0, isCorrect };
      });
      require(autoSubmit === true || graded.every(answer => answer.selectedOptionId), 400, 'Còn câu chưa trả lời.');
      const scoreTicks = graded.reduce((sum, answer) => sum + Math.round(answer.earned * 10000), 0);
      const totalTicks = graded.reduce((sum, answer) => sum + Math.round(answer.points * 10000), 0);
      const score = scoreTicks / 10000, total = totalTicks / 10000;
      const passed = !head.quizData.requirePassingScore || scoreTicks * 100 >= totalTicks * head.quizData.passingPercent;
      const needsRetake = !passed && head.quizData.allowRetake && autoSubmit !== true;
      const result = { id: attemptId, ...scope(head), quizId: attempt.quizId, studentId: identity.studentId,
        studentAccessCode: profile.accessCode, studentName: profile.fullName || '', authorId: identity.uid,
        ...(profile.studentKey ? { studentKey: profile.studentKey } : {}), ...(kind === 'material' ? { materialId: attempt.quizId } : {}),
        score, total, percent: Math.round(score * 100 / total), answers: graded, passed, needsRetake, completed: !needsRetake,
        serverGraded: true, serverVersion: attempt.version, submittedAt: stamp, autoSubmitted: autoSubmit === true,
        scoreTarget: head.scoreTarget, scoreSync: { status: 'noTarget' } };
      let bookRef, book, key, value;
      if (head.scoreTarget && !needsRetake) {
        const target = head.scoreTarget;
        bookRef = ref('scorebooks', cleanDocId(`${head.schoolYear}_${sourceFile}_${head.schoolCode}_khoi_${head.grade}`));
        book = snapshotData(await transaction.get(bookRef)) || {};
        key = `custom:${target.semester}Score:${target.pageIndex}:u${studentScoreIdentity(profile)}:s${target.scoreIndex}`;
        value = (Math.round(score / total * 100) / 10).toFixed(1);
        const validScope = ['schoolYear', 'schoolCode', 'grade'].every(field => !book[field] || book[field] === head[field]) && (!book.sourceFile || book.sourceFile === sourceFile);
        const previous = book.scoreSources?.[key];
        const canReplace = (!present(book.edits?.[key]) && !previous) || (previous?.source === 'quiz' && previous.quizId === attempt.quizId);
        result.scoreSync.status = !validScope || hasLegacyRowEdits(book.edits) || hasLegacyRowEdits(book.scoreSources) ? 'needsReview' : canReplace ? 'written' : 'existing';
      }
      if (result.scoreSync.status === 'written') {
        transaction.set(bookRef, { schoolYear: head.schoolYear, schoolCode: head.schoolCode, grade: head.grade, sourceFile, schemaVersion: 2, updatedAt: stamp,
          edits: { [key]: value }, scoreSources: { [key]: { source: 'quiz', quizId: attempt.quizId, attemptId, attemptKind: resultName, updatedAt: stamp } } },
        { mergeFields: ['schoolYear', 'schoolCode', 'grade', 'sourceFile', 'schemaVersion', 'updatedAt', new FieldPath('edits', key), new FieldPath('scoreSources', key)] });
        writeScoreAudit(transaction, { store, appId, actor: identity, bookId: bookRef.id, scope: head, before: book,
          after: { edits: { ...book.edits, [key]: value }, scoreSources: { ...book.scoreSources, [key]: { source: 'quiz', quizId: attempt.quizId, attemptId, attemptKind: resultName, updatedAt: stamp } } }, keys: [key], createdAt: stamp, reason: 'server-grade' });
      }
      transaction.create(resultRef(attemptId), result);
      transaction.update(attemptRef, { status: 'submitted', submittedAt: stamp });
      return { result: studentResult(result, head.quizData), replayed: false };
    });
  }
  async function reset(identity, { quizId, attemptIds = [], essayIds = [], expectedEssays = {}, expectedSubmittedAt = {} }) {
    require(Array.isArray(attemptIds) && Array.isArray(essayIds) && attemptIds.length + essayIds.length > 0 && attemptIds.length + essayIds.length <= 100 && new Set(attemptIds).size === attemptIds.length && new Set(essayIds).size === essayIds.length && (kind === 'lesson' || !essayIds.length), 400, 'Chỉ mở lại từ 1 đến 100 lượt mỗi lần.');
    return store.runTransaction(async transaction => {
      const head = snapshotData(await transaction.get(headRef(quizId)));
      require(head, 404, 'Chưa có đề trên máy chủ.'); assertTeacher(identity, head);
      const settings = snapshotData(await transaction.get(settingsRef)) || {};
      require(!settings.maintenance?.active, 423, 'Hệ thống đang sao lưu hoặc phục hồi.');
      require(!settings.inputYearLocks?.[head.schoolYear], 423, 'Năm học đang khóa nhập liệu.');
      const entries = [];
      const books = new Map();
      for (const attemptId of attemptIds) {
        const attempt = snapshotData(await transaction.get(privateRef('quiz_attempts', attemptId)));
        require(attempt && (attempt.kind || 'lesson') === kind && attempt.quizId === quizId, 409, 'Lượt làm đã thay đổi hoặc không thuộc đề này.');
        const result = snapshotData(await transaction.get(resultRef(attemptId)));
        require((result?.submittedAt ?? null) === (expectedSubmittedAt[attemptId] ?? null), 409, 'Bài vừa được nộp hoặc thay đổi. Tải lại trước khi mở lại.');
        const slot = snapshotData(await transaction.get(slotRef(quizId, attempt.uid)));
        let bookId, key;
        if (result?.scoreTarget) {
          bookId = cleanDocId(`${result.schoolYear}_${sourceFile}_${result.schoolCode}_khoi_${result.grade}`);
          if (!books.has(bookId)) books.set(bookId, snapshotData(await transaction.get(ref('scorebooks', bookId))) || {});
          const book = books.get(bookId);
          require(['schoolYear', 'schoolCode', 'grade'].every(field => !book[field] || book[field] === result[field]) && (!book.sourceFile || book.sourceFile === sourceFile), 409, 'Sổ điểm đã thay đổi phạm vi. Chưa mở lại bài.');
          const target = result.scoreTarget;
          key = `custom:${target.semester}Score:${target.pageIndex}:u${studentScoreIdentity(result)}:s${target.scoreIndex}`;
        }
        entries.push({ attempt, result, slot, bookId, key });
      }
      for (const essayId of essayIds) {
        const result = snapshotData(await transaction.get(ref('handwritten_submissions', essayId)));
        require(result && result.quizId === quizId && sameData(result, expectedEssays[essayId]), 409, 'Bài tự luận vừa thay đổi. Tải lại trước khi mở lại.');
        assertTeacher(identity, result);
        const essaySlotRef = privateRef('essay_slots', digest(`${result.studentId}:${quizId}`));
        const slot = snapshotData(await transaction.get(essaySlotRef));
        let bookId, key;
        if (result.scoreTarget) {
          bookId = cleanDocId(`${result.schoolYear}_${sourceFile}_${result.schoolCode}_khoi_${result.grade}`);
          if (!books.has(bookId)) books.set(bookId, snapshotData(await transaction.get(ref('scorebooks', bookId))) || {});
          const book = books.get(bookId);
          require(['schoolYear', 'schoolCode', 'grade'].every(field => !book[field] || book[field] === result[field]) && (!book.sourceFile || book.sourceFile === sourceFile), 409, 'Sổ điểm tự luận đổi phạm vi.');
          const target = result.scoreTarget;
          key = `custom:${target.semester}Score:${target.pageIndex}:u${studentScoreIdentity(result)}:s${target.scoreIndex}`;
        }
        entries.push({ attempt: { id: essayId, quizId }, result, slot, essaySlotRef, essay: true, bookId, key });
      }
      let cleared = 0;
      const patches = new Map();
      for (const { attempt, slot, bookId, key, essay, essaySlotRef } of entries) {
        const source = key && books.get(bookId)?.scoreSources?.[key];
        if (key && source?.attemptId === attempt.id && source?.source === 'quiz' && source.quizId === quizId && source.attemptKind === (essay ? 'handwritten_submissions' : resultName)) {
          const keys = patches.get(bookId) || new Set(); keys.add(key); patches.set(bookId, keys);
        }
        if (essay) { transaction.delete(ref('handwritten_submissions', attempt.id)); if (slot?.id === attempt.id) transaction.delete(essaySlotRef); }
        else {
          transaction.delete(resultRef(attempt.id)); transaction.delete(privateRef('quiz_attempts', attempt.id));
          if (slot?.attemptId === attempt.id) transaction.delete(slotRef(quizId, attempt.uid));
        }
      }
      for (const [bookId, keys] of patches) {
        const fields = [...keys].flatMap(key => [new FieldPath('edits', key), FieldValue.delete(), new FieldPath('scoreSources', key), FieldValue.delete()]);
        transaction.update(ref('scorebooks', bookId), ...fields); cleared += keys.size;
        const book = books.get(bookId), after = { edits: { ...book.edits }, scoreSources: { ...book.scoreSources } };
        for (const key of keys) { delete after.edits[key]; delete after.scoreSources[key]; }
        writeScoreAudit(transaction, { store, appId, actor: identity, bookId, scope: head, before: book, after, keys: [...keys], createdAt: now(), reason: 'quiz-reset' });
      }
      return { deleted: entries.length, cleared };
    });
  }
  async function archive(identity, { quizId, expectedVersion, quizDocUrl, quizDocFileId, quizDocName }) {
    return store.runTransaction(async transaction => {
      const head = snapshotData(await transaction.get(headRef(quizId)));
      const settings = snapshotData(await transaction.get(settingsRef)) || {};
      require(head, 404, 'Chưa có đề.'); assertTeacher(identity, head);
      require(head.serverVersion === expectedVersion, 409, 'Đề đã thay đổi. Chưa gắn bản Google Doc cũ.');
      require(!settings.maintenance?.active, 423, 'Hệ thống đang sao lưu hoặc phục hồi.');
      require(!settings.inputYearLocks?.[head.schoolYear], 423, 'Năm học đang khóa nhập liệu.');
      const patch = { quizDocUrl: text(quizDocUrl || '', 2000), quizDocFileId: text(quizDocFileId || '', 500), quizDocName: text(quizDocName || '', 500) };
      transaction.update(headRef(quizId), patch);
      return { quiz: { ...head, ...patch } };
    });
  }
  async function clear(identity, { quizId, expectedVersion, expectedLegacyUpdatedAt }) {
    return store.runTransaction(async transaction => {
      const head = snapshotData(await transaction.get(headRef(quizId)));
      const oldPublic = snapshotData(await transaction.get(ref(publicName, quizId)));
      const settings = snapshotData(await transaction.get(settingsRef)) || {};
      const previous = head || oldPublic;
      if (!previous) return { quiz: null };
      assertTeacher(identity, previous);
      require((head?.serverVersion ?? null) === expectedVersion, 409, 'Đề vừa thay đổi. Tải lại trước khi xóa nội dung.');
      if (!head) require(same(oldPublic.updatedAt ?? null, expectedLegacyUpdatedAt), 409, 'Đề cũ vừa thay đổi. Tải lại trước khi xóa nội dung.');
      const context = scope(previous);
      require(!settings.maintenance?.active, 423, 'Hệ thống đang sao lưu hoặc phục hồi.');
      require(!settings.inputYearLocks?.[context.schoolYear], 423, 'Năm học đang khóa nhập liệu.');
      const tombstone = { ...context, cleared: true, content: '', title: '', quizData: null, scoreTarget: null,
        deliveryMode: 'manual', isPublished: false, publishAt: null, serverVersion: uuid(), updatedAt: now(), authorId: identity.uid };
      transaction.set(headRef(quizId), tombstone); transaction.set(ref(publicName, quizId), publicMetadata(tombstone));
      return { quiz: tombstone };
    });
  }
  async function history(identity, { after = '' } = {}) {
    require(identity.role === 'student' && identity.studentIds?.length > 0, 403, 'Cần đăng nhập học sinh.');
    let query = store.collection(`${root}/${resultName}`).where('studentId', 'in', identity.studentIds).orderBy(FieldPath.documentId()).limit(100);
    if (after) query = query.startAfter(id(after));
    const page = await query.get(), results = [];
    for (const doc of page.docs) {
      const result = doc.data(), head = snapshotData(await headRef(result.quizId).get());
      if (!head || !head.quizData) continue;
      results.push({ ...studentResult(result, head.quizData), schoolYear: result.schoolYear, schoolCode: result.schoolCode,
        grade: result.grade, subject: result.subject, lesson: result.lesson, ...(kind === 'material' ? { materialId: result.quizId } : {}) });
    }
    return { results, after: page.docs.length === 100 ? page.docs.at(-1).id : null };
  }
  async function studentDocument(identity, payload) {
    let content, data;
    const escape = value => String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    if (identity.role === 'student') {
      const response = await start(identity, payload);
      require(!response.pending, 403, 'Đề chưa phát hoặc đang khóa.'); data = response.quiz;
      content = response.manual ? response.content : response.quizData.questions.map((q, i) => `<p>${i + 1}. ${escape(q.text)}</p><ul>${q.options.map(o => `<li>${escape(o.text)}</li>`).join('')}</ul>`).join('');
    } else {
      data = (await read(identity, payload)).quiz;
      content = data.deliveryMode === 'manual' ? studentHtml(data.content) : data.quizData.questions.map((q, i) => `<p>${i + 1}. ${escape(q.text)}</p><ul>${q.options.map(o => `<li>${escape(o.text)}</li>`).join('')}</ul>`).join('');
    }
    return { html: `<h1>${escape(data.title)}</h1>${content}`, filename: `De-hoc-sinh-${payload.quizId}-${data.serverVersion}`.slice(0, 200), serverVersion: data.serverVersion };
  }
  return { read, publish, start, submit, reset, archive, clear, history, studentDocument };
}
