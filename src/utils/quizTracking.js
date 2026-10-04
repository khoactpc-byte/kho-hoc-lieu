import { DEFAULT_SCHOOL_CODE, getStudentSchoolCode, normalizeSchoolCode } from './schoolClasses.js';
import { recordBelongsToStudent } from './studentRecords.js';

export function buildQuizTracking({ quizzes = [], results = [], students = [], schoolYear, schoolCode, isVisible = () => true }) {
  const campus = value => normalizeSchoolCode(value) || DEFAULT_SCHOOL_CODE;
  const byQuiz = new Map();
  results.forEach(result => {
    if (!result.quizId) return;
    const key = String(result.quizId);
    if (!byQuiz.has(key)) byQuiz.set(key, []);
    byQuiz.get(key).push(result);
  });
  const columns = quizzes.filter(quiz => String(quiz.schoolYear || schoolYear) === String(schoolYear)
    && campus(quiz.schoolCode) === campus(schoolCode) && isVisible(quiz)).map(quiz => {
    const matchingResults = (byQuiz.get(String(quiz.id)) || []).filter(result => String(result.schoolYear || '') === String(schoolYear)
      && campus(result.schoolCode) === campus(quiz.schoolCode)
      && String(result.grade || '') === String(quiz.grade || '')
      && String(result.subject || '') === String(quiz.subject || '')
      && String(result.lesson || '') === String(quiz.lesson || ''));
    const expectedStudents = students.filter(student => {
      const grade = String(student.className || student.grade || '').match(/[1-9]\d*/)?.[0] || '';
      return grade === String(quiz.grade) && getStudentSchoolCode(student) === campus(quiz.schoolCode);
    });
    const submittedStudentIds = new Set(expectedStudents.filter(student => matchingResults.some(result => recordBelongsToStudent(result, student))).map(student => student.id));
    const missingStudents = expectedStudents.filter(student => !submittedStudentIds.has(student.id));
    return { ...quiz, submittedStudentIds, expectedCount: expectedStudents.length,
      submittedCount: expectedStudents.length - missingStudents.length, missingCount: missingStudents.length, missingStudents };
  });
  const rows = students.map(student => {
    const grade = String(student.className || student.grade || '').match(/[1-9]\d*/)?.[0] || '';
    const cells = columns.map(column => ({ columnId: column.id,
      applicable: String(column.grade) === grade && campus(column.schoolCode) === getStudentSchoolCode(student),
      submitted: column.submittedStudentIds.has(student.id) }));
    const expectedCount = cells.filter(cell => cell.applicable).length;
    const submittedCount = cells.filter(cell => cell.applicable && cell.submitted).length;
    return { student, key: student.id, cells, expectedCount, submittedCount, missingCount: expectedCount - submittedCount };
  });
  return { columns, rows };
}
