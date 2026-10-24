import { contentBelongsToCampus, teacherHasContentScope } from './teacherAccess.js';
import { recordBelongsToStudent } from './studentRecords.js';
import { getSchoolGrade, getStudentSchoolCode, normalizeSchoolCode } from './schoolClasses.js';
import { quizScoreLabel } from './teacherQuizManagement.js';

export const SUBMISSION_KINDS = Object.freeze([
  ['review', 'Câu hỏi ôn tập'], ['test', 'Kiểm tra'], ['exam', 'Thi học kỳ'],
  ['homework', 'Bài về nhà'], ['essay', 'Bài tự luận']
]);
export function submissionTime(value) {
  if (value?.toMillis) return value.toMillis();
  if (value && typeof value === 'object' && Number.isFinite(value.seconds)) return value.seconds * 1000;
  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value)) return Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0;
}
const fold = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
export function submissionKind(record = {}, assignment = {}, source = '') {
  const explicit = String(assignment.assignmentType || record.assignmentType || assignment.assessmentType || record.assessmentType || '');
  if (SUBMISSION_KINDS.some(([id]) => id === explicit)) return explicit;
  if (source === 'quickResults' || assignment.type === 'quick_quiz') return 'review';
  const title = fold(assignment.title || record.assignmentTitle || record.quizTitle || record.fileName);
  if (/bai ve nha|bai tap ve nha|homework/.test(title)) return 'homework';
  const target = assignment.scoreTarget || record.scoreTarget;
  if (Number(target?.scoreIndex) === 5 || /(?:thi|kiem tra).*(?:hoc ky|hoc ki)|cuoi (?:hoc )?k[yi]|\b(?:hk1|hk2|ck1|ck2)\b/.test(title)) return 'exam';
  if (source === 'results' || assignment.id || /kiem tra|giua ky|giua ki/.test(title)) return 'test';
  return 'essay';
}
export function teacherSubmissionScope(record, profile, schoolYear) {
  return String(record.schoolYear || '') === String(schoolYear)
    && contentBelongsToCampus(record, profile?.schoolCode)
    && teacherHasContentScope(profile, { schoolCode: profile?.schoolCode, grade: record.grade, subject: record.subject });
}
const sameContext = (a, b) => String(a.grade) === String(b.grade) && a.subject === b.subject && String(a.lesson) === String(b.lesson);
const abandoned = item => ['left_page', 'locked_left_page'].includes(item.status) || item.exitReason === 'student_left_page';

// One row per student/assignment; retain all receipt identities for unread tracking.
export function buildTeacherSubmissionInbox({ results = [], quickResults = [], handwritten = [], quizzes = [], materials = [], students = [], profile, schoolYear } = {}) {
  if (!profile?.schoolCode || !profile?.grades?.length || !profile?.subjects?.length) return [];
  const roster = students.filter(s => (!s.schoolYear || String(s.schoolYear) === String(schoolYear))
    && getStudentSchoolCode(s) === normalizeSchoolCode(profile.schoolCode));
  const assignments = [...quizzes, ...materials].filter(a => contentBelongsToCampus(a, profile.schoolCode)
    && (!a.schoolYear || String(a.schoolYear) === String(schoolYear)));
  const groups = new Map();
  for (const [source, records] of Object.entries({ results, quickResults, handwritten })) for (const record of records) {
    if (!teacherSubmissionScope(record, profile, schoolYear) || abandoned(record) || (!record.studentId && !record.studentAccessCode)) continue;
    const candidates = roster.filter(s => getSchoolGrade(s.className || s.grade) === String(record.grade));
    let student = candidates.find(s => recordBelongsToStudent(record, s));
    if (!student && candidates.some(s => s.id === record.studentId || s.accessCode && s.accessCode === record.studentAccessCode)) continue;
    student ||= { id: record.studentId, accessCode: record.studentAccessCode, fullName: record.studentName || 'Chưa có tên', className: record.className || '' };
    const assignmentId = source === 'quickResults' ? record.materialId || record.quizId : record.quizId;
    const assignment = assignments.find(a => a.id === assignmentId && sameContext(a, record)) || {};
    const key = JSON.stringify([record.grade, record.subject, record.lesson, source === 'quickResults' ? 'review' : 'work', assignmentId || 'manual', String(student.accessCode || student.id).trim().toUpperCase()]);
    if (!groups.has(key)) groups.set(key, { key, student, assignment, assignmentId, grade: String(record.grade), subject: record.subject,
      lesson: String(record.lesson), title: assignment.title || record.assignmentTitle || record.quizTitle || '',
      kind: submissionKind(record, assignment, source), attempts: [], receiptKeys: [], submittedAt: 0 });
    const group = groups.get(key), time = submissionTime(record.submittedAt);
    const part = source === 'handwritten' ? 'essay' : 'result';
    if (!group[part] || time >= submissionTime(group[part].submittedAt)) group[part] = record;
    group.attempts.push({ ...record, source });
    if (record.id && time && !abandoned(record)) group.receiptKeys.push(`${source}:${record.id}:${time}`);
    group.submittedAt = Math.max(group.submittedAt, time);
    if (source !== 'handwritten' && group.kind === 'essay') group.kind = submissionKind(record, assignment, source);
  }
  return [...groups.values()].map(row => {
    const reviewed = row.essay?.status === 'teacher_reviewed' && row.essay.teacherScore != null && String(row.essay.teacherScore).trim() !== '';
    const pending = !!row.essay && !abandoned(row.essay) && !reviewed;
    const dueAt = submissionTime(row.assignment.dueAt || row.assignment.deadlineAt || row.assignment.submissionDeadline);
    return { ...row, pending, dueAt, late: !!dueAt && row.submittedAt > dueAt, canGrade: row.kind !== 'review' && quizzes.some(q => q.id === row.assignment.id && sameContext(q, row)),
      submitted: !!row.result || !!row.essay && !abandoned(row.essay),
      kindLabel: SUBMISSION_KINDS.find(([key]) => key === row.kind)?.[1] || 'Bài làm',
      title: row.title || (row.kind === 'review' ? 'Câu hỏi ôn tập' : row.kind === 'essay' ? 'Bài tự luận chưa phân loại' : 'Bài kiểm tra'),
      quizScore: quizScoreLabel(row.result?.score, row.result?.total),
      essayScore: quizScoreLabel(row.essay?.teacherScore ?? row.essay?.aiScore, row.essay?.teacherMaxScore ?? row.essay?.aiMaxScore),
      status: pending ? 'Chờ chấm' : row.result?.needsRetake ? 'Cần làm lại' : row.essay && abandoned(row.essay) && !row.result ? 'Đã thoát trang' : reviewed || row.result ? 'Đã chấm' : 'Đã nộp' };
  }).sort((a, b) => b.submittedAt - a.submittedAt || a.key.localeCompare(b.key));
}

export const unreadSubmission = (row, seen) => row.receiptKeys.some(key => !seen.has(key));
export const submissionSeenStorageKey = (profile, year) => `khl-teacher-receipts-v1:${JSON.stringify([profile?.schoolCode, profile?.teacherId || profile?.id || profile?.username || profile?.fullName, year])}`;
