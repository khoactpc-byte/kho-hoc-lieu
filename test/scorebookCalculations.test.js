import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScoreNumber, calculateSemesterAverage, calculateYearAverage, academicSummary } from '../src/utils/scorebookCalculations.js';

test('shared score policy preserves zero, commas, weights, missing values and classification boundaries', () => {
  assert.equal(parseScoreNumber('0'), 0); assert.equal(parseScoreNumber('8,5'), 8.5); assert.equal(parseScoreNumber(''), null);
  assert.equal(calculateSemesterAverage(index => ['0', '8', '', '', '6', '9'][index]), '6.7');
  assert.equal(calculateSemesterAverage(index => ['8', '', '', '', '6', ''][index]), '');
  assert.equal(calculateYearAverage('6', '9'), '8.0'); assert.equal(calculateYearAverage('', '9'), '');
  assert.deepEqual(academicSummary(['8', '8', '8', '8', '8', '6,5']), { result: 'Tốt', complete: true, completedCount: 6, requiredCount: 6 });
  assert.equal(academicSummary([8, 8, 8, 8, 8, '']).complete, false);
  assert.equal(academicSummary([6.5, 6.5, 6.5, 6.5, 6.5, 5]).result, 'Khá');
  assert.equal(academicSummary([5, 5, 5, 5, 5, 3.5]).result, 'Đạt');
});
