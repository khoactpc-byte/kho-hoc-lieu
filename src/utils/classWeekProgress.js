import { contentBelongsToCampus } from './teacherAccess.js';
import { getStudentSchoolCode, normalizeSchoolClassName, normalizeSchoolYearKey } from './schoolClasses.js';
import { recordBelongsToStudent } from './studentRecords.js';
import { isQuickQuizResultPassing } from './selfQuiz.js';

export function studentWeekPercent(elapsedMs, hasQuickQuiz, quickPassed, targetMs = 30 * 60 * 1000) {
  const theory = Math.min(1, Math.max(0, Number(elapsedMs) || 0) / targetMs);
  return Math.round(hasQuickQuiz ? theory * 50 + (quickPassed ? 50 : 0) : theory * 100);
}

export function buildClassWeekProgress({ students = [], progress = [], quickResults = [], materials = [], schoolYear, schoolCode, grade, subject, className, totalLessons = 35 }) {
  const year = normalizeSchoolYearKey(schoolYear);
  const roster = [...new Map(students.filter(student =>
    !['dropped', 'completed', 'graduated'].includes(student.status)
    && normalizeSchoolYearKey(student.schoolYear || schoolYear) === year
    && getStudentSchoolCode(student) === schoolCode
    && normalizeSchoolClassName(student.className) === normalizeSchoolClassName(className)
  ).map(student => [String(student.accessCode || student.id).trim().toUpperCase(), student])).values()];
  const inScope = row => normalizeSchoolYearKey(row.schoolYear) === year && contentBelongsToCampus(row, schoolCode)
    && String(row.grade) === String(grade) && row.subject === subject;
  const records = progress.filter(inScope), results = quickResults.filter(inScope);
  const quizzes = materials.filter(row => row.type === 'quick_quiz' && inScope({ ...row, schoolYear: row.schoolYear || schoolYear }));
  const weeks = {};
  for (let index = 1; index <= totalLessons; index++) {
    const lesson = String(index);
    const lessonQuizzes = quizzes.filter(row => String(row.lesson) === lesson);
    const lessonRecords = records.filter(row => String(row.lesson) === lesson);
    const lessonResults = results.filter(row => String(row.lesson) === lesson);
    const total = roster.reduce((sum, student) => {
      const elapsed = Math.max(0, ...lessonRecords.filter(row => recordBelongsToStudent(row, student)).map(row => Number(row.elapsedMs) || 0));
      const passed = lessonResults.some(row => recordBelongsToStudent(row, student)
        && (!row.materialId || lessonQuizzes.some(item => String(item.id) === String(row.materialId)))
        && isQuickQuizResultPassing(row, lessonQuizzes.find(item => String(item.id) === String(row.materialId))));
      return sum + studentWeekPercent(elapsed, lessonQuizzes.length > 0, passed);
    }, 0);
    weeks[lesson] = roster.length ? Math.round(total / roster.length) : null;
  }
  return { studentCount: roster.length, weeks };
}
