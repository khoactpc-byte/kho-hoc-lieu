import { teacherSubmissionScope } from './teacherSubmissionInbox.js';
import { recordBelongsToStudent } from './studentRecords.js';
import { getSchoolGrade, getStudentSchoolCode, normalizeSchoolCode } from './schoolClasses.js';

export const matchesTeacherWeeks = (row, { grade = 'all', subject = 'all', weeks = [] } = {}) =>
  (grade === 'all' || String(row.grade) === String(grade)) && (subject === 'all' || row.subject === subject)
  && weeks.map(String).includes(String(row.lesson));
const abandoned = item => ['left_page', 'locked_left_page'].includes(item.status);
export function buildWeeklyMissingWork({ quizzes = [], materials = [], results = [], quickResults = [], handwritten = [], students = [], profile, schoolYear, filter, isVisible = () => false }) {
  const published = [...quizzes.filter(q => isVisible(q)).map(q => ({ ...q, kind: 'quiz' })),
    ...materials.filter(m => m.type === 'quick_quiz' && m.isPublished !== false).map(m => ({ ...m, kind: 'review' }))]
    .filter(a => teacherSubmissionScope({ ...a, schoolYear: a.schoolYear || schoolYear }, profile, schoolYear) && matchesTeacherWeeks(a, filter));
  const unlinked = new Map();
  handwritten.filter(r => !abandoned(r) && teacherSubmissionScope(r, profile, schoolYear) && matchesTeacherWeeks(r, filter)
    && !quizzes.some(q => q.id === r.quizId)).forEach(r => {
    const key = JSON.stringify([r.grade, r.subject, r.lesson, 'manual']);
    if (!unlinked.has(key)) unlinked.set(key, { ...r, id: key, matchUnlinked: true, kind: 'quiz', deliveryMode: 'manual', title: 'Tự luận chưa gắn đề', observedOnly: true });
  });
  published.push(...unlinked.values());
  const byStudent = new Map();
  students.filter(s => s.id || s.accessCode).filter(s => (!s.schoolYear || String(s.schoolYear) === String(schoolYear)) && getStudentSchoolCode(s) === normalizeSchoolCode(profile?.schoolCode))
    .filter(s => !['dropped', 'graduated', 'bohoc', 'nghihoc'].includes(String(s.status || '').normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase()))
    .forEach(s => byStudent.set(String(s.accessCode || s.id).trim().toUpperCase(), s));
  return [...byStudent.values()].map(student => {
    const assignments = published.filter(a => String(a.grade) === getSchoolGrade(student.className || student.grade));
    if (!assignments.length) return null;
    const missing = [], completed = [];
    for (const a of assignments) {
      const valid = r => teacherSubmissionScope(r, profile, schoolYear) && String(r.grade) === String(a.grade) && r.subject === a.subject && String(r.lesson) === String(a.lesson)
        && recordBelongsToStudent(r, student) && !abandoned(r);
      const quizAttempts = (a.kind === 'review' ? quickResults : results).filter(r => valid(r) && String(r.materialId || r.quizId) === String(a.id));
      const hasQuiz = quizAttempts.some(r => r.completed !== false && !r.needsRetake);
      const hasEssay = handwritten.some(r => valid(r) && (a.matchUnlinked ? !quizzes.some(q => q.id === r.quizId) : String(r.quizId || '') === String(a.id)));
      const needsQuiz = a.kind === 'review' || a.deliveryMode === 'auto' && !!a.quizData?.questions?.length;
      const needsEssay = a.kind !== 'review' && (a.deliveryMode === 'manual' || a.hasEssay === true || a.requiresEssay === true || /tự luận|tu luan/i.test(a.content || ''));
      const title = `Tuần ${a.lesson} · ${a.subject} · ${a.title || (a.kind === 'review' ? 'Ôn tập' : 'Bài kiểm tra')}`;
      if (needsQuiz && !hasQuiz) missing.push(`${title}: ${quizAttempts.length ? 'cần làm lại trắc nghiệm' : 'chưa làm trắc nghiệm'}`);
      if (needsEssay && !hasEssay) missing.push(`${title}: ${a.observedOnly ? 'chưa thấy bài nộp' : 'chưa nộp tự luận'}`);
      if (!needsQuiz && !needsEssay && !hasQuiz && !hasEssay) missing.push(`${title}: chưa nộp bài`);
      if (quizAttempts.length || hasEssay) completed.push(a.id);
    }
    const observedOnly = assignments.some(a => a.observedOnly);
    return { key: student.id || student.accessCode, student, expected: assignments.length, submitted: completed.length, missing, observedOnly,
      status: !completed.length ? observedOnly ? 'Chưa thấy bài nộp' : 'Chưa làm' : missing.length ? 'Chưa đủ bài' : 'Đã nộp đủ' };
  }).filter(Boolean).sort((a, b) => (b.missing.length - a.missing.length) || String(a.student.fullName).localeCompare(String(b.student.fullName), 'vi'));
}
