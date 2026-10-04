import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeSelfQuizSubmission, filterQuizResultsForContext, quizPassingPercent, isQuickQuizResultPassing } from '../src/utils/selfQuiz.js';
import { vietnamDateKey } from '../src/utils/vietnamDate.js';
import { extractSchoolYearFromText, normalizeAdmissionSchoolYear } from '../src/utils/schoolYearText.js';

test('automatic quiz submission stores unanswered choices and respects zero-point questions', () => {
  const quizData = { questions: [{ id: 'unanswered', text: 'A', points: 1, correctOptionId: 'a', options: [{ id: 'a' }] },
    { id: 'zero', points: 0, correctOptionId: 'a', options: [{ id: 'a' }] }, { id: 'invalid', correctOptionId: '', options: [] }] };
  const result = gradeSelfQuizSubmission({ quizData, answersByQuestionId: { zero: 'a' }, studentName: ' An ' });
  assert.equal(result.score, 0); assert.equal(result.total, 2);
  assert.equal(result.answers[0].selectedOptionId, ''); assert.equal(result.answers[2].isCorrect, false);
  const findUndefined = value => value && typeof value === 'object' && Object.values(value).some(item => item === undefined || findUndefined(item));
  assert.equal(Boolean(findUndefined(result)), false, 'Firestore rejects undefined nested values');
});

test('quiz result context never mixes another quiz, year or subject into the current class', () => {
  const context = { quizId: 'quiz-a', schoolYear: '2026-2027', grade: '6', subject: 'Toán', lesson: '1' };
  const base = { ...context, submittedAt: 1 };
  const results = [base, { ...base, quizId: 'quiz-b' }, { ...base, schoolYear: '2025-2026' }, { ...base, subject: 'Ngữ Văn' }, { ...base, quizId: '' }];
  assert.deepEqual(filterQuizResultsForContext(results, context), [base]);
});

test('quick quiz submission and progress use the same configured passing threshold, including zero', () => {
  assert.equal(quizPassingPercent(0), 0);
  assert.equal(quizPassingPercent('invalid'), 80);
  assert.equal(quizPassingPercent(150), 100);
  assert.equal(isQuickQuizResultPassing({ percent: 70, passingPercent: 60 }), true);
  assert.equal(isQuickQuizResultPassing({ percent: 70 }, { quizData: { passingPercent: 90 } }), false);
  assert.equal(isQuickQuizResultPassing({ percent: 0, passingPercent: 0 }), true);
  assert.equal(isQuickQuizResultPassing({ passingPercent: 0 }), false);
  assert.equal(isQuickQuizResultPassing({ percent: Infinity, passingPercent: 80 }), false);
});

test('daily backup changes date at Vietnam midnight and school-year parsing validates year pairs', () => {
  assert.equal(vietnamDateKey(new Date('2026-10-02T16:59:59Z')), '2026-10-02');
  assert.equal(vietnamDateKey(new Date('2026-10-02T17:00:00Z')), '2026-10-03');
  assert.equal(vietnamDateKey(new Date('2026-12-31T17:00:00Z')), '2027-01-01');
  assert.equal(extractSchoolYearFromText('Tuyển sinh 2026–27', 'fallback'), '2026-2027');
  assert.equal(extractSchoolYearFromText('Năm học 2026/2028', 'fallback'), 'fallback');
  assert.equal(extractSchoolYearFromText('Tuyển sinh 2026', 'fallback'), '2026-2027');
  assert.equal(normalizeAdmissionSchoolYear('2025-2026', '2026-2027'), '2026-2027');
});
