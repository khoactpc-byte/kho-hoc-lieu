import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuizTracking } from '../src/utils/quizTracking.js';
import { findStudentAttendanceRecord, studentWorkKey } from '../src/utils/studentRecords.js';

test('tracking requires the correct student, quiz, year and campus and counts only applicable grades', () => {
  const students = [{ id: 'a', accessCode: 'HS01', fullName: 'An', className: '6A', schoolCode: 'NAN' },
    { id: 'b', accessCode: 'HS02', fullName: 'An', className: '6A', schoolCode: 'NAN' },
    { id: 'c', accessCode: 'HS03', fullName: 'Bình', className: '7A', schoolCode: 'NAN' }];
  const quiz = { id: 'quiz-a', schoolYear: '2026-2027', schoolCode: 'NAN', grade: '6', subject: 'Toán', lesson: '1' };
  const result = { ...quiz, quizId: quiz.id, studentId: 'a', studentAccessCode: 'HS01' };
  const tracking = buildQuizTracking({ quizzes: [quiz, { ...quiz, id: 'quiz-7', grade: '7' }, { ...quiz, id: 'other-campus', schoolCode: 'TQK' }],
    results: [result, { ...result, studentId: 'b', studentAccessCode: 'HS02', quizId: 'other-quiz' },
      { ...result, studentId: 'b', studentAccessCode: 'HS02', schoolYear: '2025-2026' },
      { ...result, studentId: 'b', studentAccessCode: 'HS02', schoolCode: 'TQK' }, { ...quiz, quizId: quiz.id, studentName: 'An' }],
    students, schoolYear: '2026-2027', schoolCode: 'NAN' });
  assert.equal(tracking.columns.length, 2);
  assert.equal(tracking.columns[0].submittedCount, 1);
  assert.deepEqual(tracking.columns[0].missingStudents, [students[1]]);
  assert.deepEqual(tracking.rows.map(row => [row.expectedCount, row.submittedCount, row.missingCount]), [[1, 1, 0], [1, 0, 1], [1, 0, 1]]);
  assert.equal(tracking.rows[0].cells[1].applicable, false);
});

test('attendance can resolve a legacy map ID but never a namesake or contradictory code', () => {
  const student = { id: 'a', accessCode: 'HS01', fullName: 'An' };
  assert.equal(findStudentAttendanceRecord({ a: { status: 'CP', studentName: 'An' } }, student)?.status, 'CP');
  assert.equal(findStudentAttendanceRecord({ b: { status: 'KP', studentName: 'An' } }, student), undefined);
  assert.equal(findStudentAttendanceRecord({ a: { status: 'KP', studentAccessCode: 'HS02' } }, student), undefined);
  const roster = new Map([['a', student]]);
  assert.equal(studentWorkKey({ studentId: 'a' }, roster), 'code:HS01');
  assert.equal(studentWorkKey({ studentName: 'An' }, roster), '');
  assert.equal(studentWorkKey({ studentId: 'a', studentAccessCode: 'HS02' }, roster), '');
});
