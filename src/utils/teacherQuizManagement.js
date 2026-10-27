import { contentBelongsToCampus, teacherHasContentScope } from './teacherAccess.js';
import { getSchoolGrade, getStudentSchoolCode, normalizeSchoolCode } from './schoolClasses.js';
import { TOTAL_LESSONS } from '../config/learningDomain.js';
import { recordBelongsToStudent } from './studentRecords.js';
import { compareTeachingSubjects } from './teacherPresentation.js';

const number = value => value == null || String(value).trim() === '' ? null : Number.isFinite(Number(String(value).replace(',', '.'))) ? Number(String(value).replace(',', '.')) : null;
export function quizScoreLabel(score, total) {
  const value = number(score), maximum = number(total);
  return value === null ? '—' : `${String(value).replace('.', ',')}${maximum === null ? '' : `/${String(maximum).replace('.', ',')}`}`;
}
const latest = records => [...records].sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0))[0] || null;
export function buildTeacherQuizManagement({ quizzes = [], results = [], handwritten = [], students = [], profile, schoolYear, isVisible = () => false } = {}) {
  if (!profile?.schoolCode || !profile?.grades?.length || !profile?.subjects?.length) return [];
  const inScope = item => contentBelongsToCampus(item, profile.schoolCode) && teacherHasContentScope(profile, {
    schoolCode: profile.schoolCode, grade: item.grade, subject: item.subject });
  const rosterCandidates = students.filter(student => (student.id || student.accessCode) && (!student.schoolYear || String(student.schoolYear) === String(schoolYear))
    && getStudentSchoolCode(student) === normalizeSchoolCode(profile.schoolCode) && profile.grades.map(String).includes(getSchoolGrade(student.className || student.grade))
    && !['dropped', 'graduated', 'bohoc', 'nghihoc'].includes(String(student.status || '').normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase()));
  const byStudent = new Map();
  [...rosterCandidates].sort((a, b) => Number(String(b.schoolYear) === String(schoolYear)) - Number(String(a.schoolYear) === String(schoolYear))).forEach(student => {
    const key = String(student.accessCode || student.id).trim().toUpperCase();
    if (!byStudent.has(key)) byStudent.set(key, student);
  });
  const roster = [...byStudent.values()];
  return quizzes.filter(quiz => quiz.id && inScope(quiz) && String(quiz.schoolYear || schoolYear) === String(schoolYear)
    && Number.isInteger(Number(quiz.lesson)) && Number(quiz.lesson) >= 1 && Number(quiz.lesson) <= TOTAL_LESSONS).map(quiz => {
    const sameContext = record => inScope(record) && String(record.schoolYear || '') === String(schoolYear)
      && String(record.grade) === String(quiz.grade) && record.subject === quiz.subject && String(record.lesson) === String(quiz.lesson);
    const quizResults = results.filter(record => sameContext(record) && String(record.quizId || '') === String(quiz.id));
    const essays = handwritten.filter(record => sameContext(record) && (!record.quizId || String(record.quizId) === String(quiz.id)));
    const rows = roster.filter(student => getSchoolGrade(student.className || student.grade) === String(quiz.grade)).map(student => {
      const result = latest(quizResults.filter(record => recordBelongsToStudent(record, student)));
      const essay = latest(essays.filter(record => recordBelongsToStudent(record, student)));
      const submitted = !!result || !!essay;
      const pending = !!essay && (essay.status !== 'teacher_reviewed' || !essay.teacherAssessment && number(essay.teacherScore) === null);
      return { key: student.id || student.accessCode, student, result, essay, submitted, pending,
        quizScore: quizScoreLabel(result?.score, result?.total), essayScore: essay?.teacherAssessment || essay?.aiAssessment || quizScoreLabel(essay?.teacherScore ?? essay?.aiScore, essay?.teacherMaxScore ?? essay?.aiMaxScore),
        status: pending ? 'Chờ chấm' : submitted ? 'Đã làm' : 'Chưa làm' };
    }).sort((a, b) => String(a.student.fullName || '').localeCompare(String(b.student.fullName || ''), 'vi'));
    return { ...quiz, rows, available: isVisible(quiz), expectedCount: rows.length, submittedCount: rows.filter(row => row.submitted).length,
      missingCount: rows.filter(row => !row.submitted).length, pendingCount: rows.filter(row => row.pending).length };
  }).sort((a, b) => Number(a.grade) - Number(b.grade) || compareTeachingSubjects(a.subject, b.subject) || Number(a.lesson) - Number(b.lesson));
}
