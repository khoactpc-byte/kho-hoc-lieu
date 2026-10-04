import { doc, runTransaction } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { sameData } from '../utils/dataEquality';
import { normalizeNumericScore } from '../utils/scoreValues';
import { assertScorebookScope, hasScoreValue, inputSettingsRef, scorebookRef, writeScorebookCells } from './scorebookCells';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';
import { requestPrivateApi } from './serverQuizClient';

export async function syncQuizScore({ documentId, metadata, key, score, attempt, overwriteExisting = false }) {
  if (!key || /:r\d+(?::|$)/.test(key) || !attempt?.id || !attempt.quizId
    || !['quiz_results', 'handwritten_submissions'].includes(attempt.kind)) throw new Error('Chưa xác định được học sinh hoặc lượt làm bài.');
  const value = normalizeNumericScore(score);
  if (value === null || value === '') throw new Error('Điểm không hợp lệ.');
  if (SCOPED_AUTH_ENABLED) return (await requestPrivateApi('data', 'syncScore', { documentId, metadata, key, score: value, attempt, overwriteExisting })).written;
  const ref = scorebookRef(documentId);
  return runTransaction(db, async transaction => {
    const data = (await transaction.get(ref)).data() || {};
    const settings = (await transaction.get(inputSettingsRef())).data() || {};
    const submitted = (await transaction.get(attemptRef(attempt))).data();
    assertScorebookScope(data, metadata, settings);
    if (!submitted || submitted.quizId !== attempt.quizId) throw new Error('Lượt nộp đã thay đổi hoặc được xóa. Chưa lưu điểm.');
    for (const field of ['schoolYear', 'schoolCode', 'grade']) {
      if (submitted[field] && String(submitted[field]) !== String(metadata[field])) throw new Error('Lượt nộp thuộc phạm vi khác.');
    }
    const rawScore = attempt.kind === 'quiz_results' ? submitted.score : (submitted.teacherScore ?? submitted.aiScore);
    const maxScore = attempt.kind === 'quiz_results' ? submitted.total : (submitted.teacherMaxScore ?? submitted.aiMaxScore ?? 10);
    const denominator = Number(String(maxScore ?? 10).replace(',', '.'));
    const confirmedScore = denominator > 0 ? normalizeNumericScore(Number(String(rawScore ?? '').replace(',', '.')) / denominator * 10) : null;
    if (!hasScoreValue(rawScore) || confirmedScore !== value) throw new Error('Bài vừa được chấm lại. Tải lại điểm trước khi đồng bộ.');
    const previousSource = data.scoreSources?.[key];
    // A later automatic result must never replace a teacher's manual correction.
    if (['manual', 'manualCleared', 'random'].includes(previousSource?.source)) return false;
    if (hasScoreValue(data.edits?.[key]) && (!overwriteExisting || previousSource?.source !== 'quiz'
      || previousSource.quizId !== attempt.quizId)) return false;
    writeScorebookCells(transaction, ref, metadata, { [key]: { value, source: {
      source: 'quiz', quizId: attempt.quizId, attemptId: attempt.id, attemptKind: attempt.kind,
      updatedAt: Date.now()
    } } });
    return true;
  });
}

const attemptRef = attempt => doc(db, 'artifacts', appId, 'public', 'data', attempt.kind, attempt.id);
export async function createQuizAttempt({ id, result, context }) {
  if (!id || !result.quizId || !result.studentId || !result.studentAccessCode) throw new Error('Thiếu mã học sinh hoặc bài kiểm tra.');
  const ref = attemptRef({ id, kind: 'quiz_results' });
  await runTransaction(db, async transaction => {
    const previous = (await transaction.get(ref)).data();
    const settings = (await transaction.get(inputSettingsRef())).data() || {};
    assertSubmission(result, context);
    if (settings.inputYearLocks?.[context.schoolYear]) throw new Error('Năm học đang khóa nhập liệu. Chưa nộp bài.');
    if (previous) throw new Error('Lượt này đã được nộp. Tải lại kết quả trước khi thử lại.');
    transaction.set(ref, { ...result, scoreSync: { status: 'pending' } });
  });
}
const essayRef = id => attemptRef({ id, kind: 'handwritten_submissions' });
function assertSubmission(data, context) {
  if (!data) throw new Error('Bài nộp đã được xóa. Chưa ghi thay đổi.');
  for (const field of ['schoolYear', 'schoolCode', 'grade', 'subject', 'lesson']) {
    if (data[field] && String(data[field]) !== String(context[field] || '')) throw new Error('Bài nộp thuộc phạm vi khác.');
  }
}

export async function reviewHandwrittenSubmission({ id, expected, context, review, scorebook }) {
  if (SCOPED_AUTH_ENABLED) return requestPrivateApi('data', 'reviewEssay', { id, expected, context, review, scorebook });
  const score = Number(String(review.teacherScore).replace(',', '.'));
  const maximum = Number(String(review.teacherMaxScore).replace(',', '.'));
  if (!hasScoreValue(review.teacherScore) || !hasScoreValue(review.teacherMaxScore)
    || !Number.isFinite(score) || !Number.isFinite(maximum) || maximum <= 0 || score < 0 || score > maximum) throw new Error('Điểm phải từ 0 đến điểm tối đa; điểm tối đa phải lớn hơn 0.');
  return runTransaction(db, async transaction => {
    const data = (await transaction.get(essayRef(id))).data();
    const settings = (await transaction.get(inputSettingsRef())).data() || {};
    const scoreData = scorebook ? (await transaction.get(scorebookRef(scorebook.documentId))).data() || {} : null;
    assertSubmission(data, context);
    if (settings.inputYearLocks?.[context.schoolYear]) throw new Error('Năm học đang khóa nhập liệu.');
    if (!sameData(data, expected)) throw new Error('Bài nộp vừa thay đổi. Bản nháp điểm được giữ; đối chiếu lại trước khi lưu.');
    let status = scorebook ? 'existing' : 'noTarget';
    if (scorebook) {
      assertScorebookScope(scoreData, scorebook.metadata, settings);
      const previous = scoreData.scoreSources?.[scorebook.key];
      const mayWrite = !hasScoreValue(scoreData.edits?.[scorebook.key]) && !['manualCleared', 'manual', 'random'].includes(previous?.source)
        || previous?.source === 'quiz' && previous.quizId === data.quizId;
      if (mayWrite) {
        writeScorebookCells(transaction, scorebookRef(scorebook.documentId), scorebook.metadata, { [scorebook.key]: {
          value: normalizeNumericScore(score / maximum * 10), source: { source: 'quiz', quizId: data.quizId,
            attemptId: id, attemptKind: 'handwritten_submissions', updatedAt: Date.now() }
        } });
        status = 'written';
      }
    }
    const payload = { ...review, status: 'teacher_reviewed', reviewedAt: Date.now(), reviewedBy: context.authorId,
      scoreSync: { status } };
    transaction.set(essayRef(id), payload, { mergeFields: Object.keys(payload) });
    return { status };
  });
}

export async function updateAiGrading({ id, fileId, context, runId, patch }) {
  if (SCOPED_AUTH_ENABLED) return (await requestPrivateApi('data', 'aiDraft', { id, fileId, context, runId, patch })).runId;
  const nextRun = runId || globalThis.crypto.randomUUID();
  await runTransaction(db, async transaction => {
    const data = (await transaction.get(essayRef(id))).data();
    const settings = (await transaction.get(inputSettingsRef())).data() || {};
    assertSubmission(data, context);
    if (settings.inputYearLocks?.[context.schoolYear]) throw new Error('Năm học đang khóa nhập liệu.');
    if (data.fileId !== fileId) throw new Error('Tệp bài nộp vừa thay đổi. Kết quả cũ chưa được lưu.');
    if (runId && data.aiRunId !== runId) throw new Error('Một lượt chấm mới đã thay thế lượt này.');
    if (!runId && data.aiStatus === 'grading' && Date.now() - (data.aiStartedAt || 0) < 5 * 60 * 1000) throw new Error('Bài này đang được chấm.');
    const payload = { ...patch, aiRunId: nextRun };
    // AI output is a draft and cannot downgrade a teacher's completed review.
    if (data.status === 'teacher_reviewed') delete payload.status;
    transaction.set(essayRef(id), payload, { mergeFields: Object.keys(payload) });
  });
  return nextRun;
}

export async function resetQuizAttempts({ attempts, scorebooks, context }) {
  if (SCOPED_AUTH_ENABLED) return requestPrivateApi('data', 'resetEssays', { attempts, scorebooks, context });
  if (!context.schoolYear || !context.schoolCode) throw new Error('Thiếu phạm vi bài kiểm tra.');
  const unique = new Map();
  for (const attempt of attempts) {
    if (!['quiz_results', 'handwritten_submissions'].includes(attempt.kind) || !attempt.id || attempt.id.includes('/')) throw new Error('Lượt làm bài không hợp lệ.');
    unique.set(`${attempt.kind}/${attempt.id}`, attempt);
  }
  const records = [...unique.values()];
  const groups = scorebooks || [];
  groups.forEach(group => {
    for (const field of ['schoolYear', 'schoolCode', 'grade']) {
      if (String(group.metadata?.[field]) !== String(context[field])) throw new Error('Sổ điểm thuộc phạm vi khác. Chưa xóa.');
    }
  });
  if (records.length + groups.length > 350) throw new Error('Quá nhiều lượt nộp cho một lần xóa an toàn. Chọn từng học sinh rồi thử lại.');
  return runTransaction(db, async transaction => {
    const settings = (await transaction.get(inputSettingsRef())).data() || {};
    if (settings.inputYearLocks?.[context.schoolYear]) throw new Error('Năm học đang khóa nhập liệu. Chưa xóa lượt nộp.');
    // All reads precede writes. Attempts and their proven auto scores commit together.
    const observed = await Promise.all(records.map(record => transaction.get(attemptRef(record))));
    const scoreSnapshots = await Promise.all(groups.map(group => transaction.get(scorebookRef(group.documentId))));
    observed.forEach((snapshot, index) => {
      const data = snapshot.data();
      if (!data) throw new Error('Lượt nộp đã thay đổi hoặc được xóa. Tải lại rồi xác nhận.');
      if (!sameData(data, records[index].expected)) throw new Error('Bài nộp vừa được sửa hoặc chấm lại. Tải lại rồi xác nhận trước khi xóa.');
      for (const field of ['schoolYear', 'schoolCode', 'grade', 'subject', 'lesson']) {
        if (data[field] && String(data[field]) !== String(context[field] || '')) throw new Error('Lượt nộp thuộc phạm vi khác. Chưa xóa.');
      }
    });
    let cleared = 0, preserved = 0;
    const changes = groups.map((group, index) => {
      const data = scoreSnapshots[index].data() || {};
      assertScorebookScope(data, group.metadata, settings);
      const patch = {};
      for (const key of new Set(group.keys)) {
        if (!hasScoreValue(data.edits?.[key])) continue;
        const source = data.scoreSources?.[key];
        const owner = records.find(record => record.id === source?.attemptId && record.kind === source?.attemptKind
          && record.expected.quizId === source?.quizId);
        if (source?.source !== 'quiz' || !owner) { preserved += 1; continue; }
        patch[key] = { value: undefined, source: undefined };
        cleared += 1;
      }
      return patch;
    });
    records.forEach(record => transaction.delete(attemptRef(record)));
    groups.forEach((group, index) => writeScorebookCells(transaction, scorebookRef(group.documentId), group.metadata, changes[index]));
    return { deleted: records.length, cleared, preserved };
  });
}
