import test from 'node:test';
import assert from 'node:assert/strict';
import { academicPromotionOutcome, buildStudentYearReconciliation, reconciledStudentRecord, restoreClassesFromPriorRoster, sheetClassConflict } from '../src/utils/studentYearReconciliation.js';
import { SCOREBOOK_SOURCE_FILE, QUICK_SCORE_SUBJECTS } from '../src/config/scorebookDomain.js';
import { studentEditKey } from '../src/utils/studentScoreKeys.js';

const previous = { id: 'old', studentKey: 'one', accessCode: 'HS25601', fullName: 'An', className: '6A', entryGrade: '6', enrollmentYear: '2025-2026', schoolYear: '2025-2026', schoolCode: 'NAN' };
const current = { ...previous, id: 'new', previousStudentId: 'old', schoolYear: '2026-2027' };
const book = (score = '7', count = 6, patch = {}) => ({ id: 'book', schoolYear: '2025-2026', schoolCode: 'NAN', grade: '6', sourceFile: SCOREBOOK_SOURCE_FILE,
  edits: Object.fromEntries(QUICK_SCORE_SUBJECTS.slice(0, count).map(subject => [studentEditKey(`custom:hkiiScore:${subject.pageIndex}:r0:s7`, previous), score])), ...patch });
const audit = (student = current, books = [], records = [previous]) => buildStudentYearReconciliation({ records: [...records, student], scorebooks: books, targetSchoolYear: '2026-2027' }).find(row => row.student.id === student.id);

test('Vietnamese Đạt and Chưa đạt are distinct promotion outcomes', () => {
  assert.equal(academicPromotionOutcome('Đạt'), 'promote');
  assert.equal(academicPromotionOutcome('Chưa đạt'), 'repeat');
  assert.equal(academicPromotionOutcome(''), '');
});
test('full prior-year scores suggest promotion, retain admission and write both years in history', () => {
  const row = audit(current, [book()]);
  assert.equal(row.action, 'review'); assert.equal(row.proposedClass, '7A');
  const saved = reconciledStudentRecord(row);
  assert.equal(saved.entryGrade, '6'); assert.equal(saved.enrollmentYear, '2025-2026');
  assert.equal(saved.schoolYear, '2026-2027'); assert.equal(saved.grade, '7');
  assert.deepEqual(saved.classHistory, { '2025-2026': '6A', '2026-2027': '7A' });
});
test('missing or partial annual scores never decide promotion, even with an imported grade field', () => {
  for (const books of [[], [book('8', 1)], [book('8', 5)]]) {
    const row = audit({ ...current, hocLucLop6: 'Tốt' }, books);
    assert.equal(row.action, 'blocked'); assert.equal(row.proposedClass, '');
    assert.throws(() => reconciledStudentRecord(row), /chưa đủ căn cứ/);
  }
});
test('full failed results suggest repeating instead of adding a year to entry grade', () => {
  const row = audit(current, [book('2')]);
  assert.equal(row.action, 'review'); assert.equal(row.outcome, 'repeat'); assert.equal(row.proposedClass, '6A');
});
test('wrong year, campus, grade, archived or ambiguous books cannot supply a decision', () => {
  for (const books of [[book('8', 6, { schoolYear: '2026-2027' })], [book('8', 6, { schoolCode: 'TQK' })],
    [book('8', 6, { grade: '7' })], [book('8', 6, { campusNormalization: { archivedTo: 'other' } })],
    [book('8', 6, { id: 'v1' }), book('8', 6, { id: 'v2' })]]) {
    assert.equal(audit(current, books).action, 'blocked');
  }
});
test('a saved promotion can be restored; a conflicting complete result blocks it for review', () => {
  const student = { ...current, promotion: { sourceSchoolYear: '2025-2026', targetSchoolYear: '2026-2027', sourceClassName: '6A', targetClassName: '7A', outcome: 'promote', academicResult: 'Đạt' } };
  assert.equal(audit(student).action, 'restore', 'restore an existing decision without inventing a new one from missing scores');
  assert.equal(audit(student, [book('2')]).action, 'blocked');
  assert.equal(audit({ ...student, classHistory: { '2026-2027': '8A' } }).action, 'blocked');
  assert.equal(audit({ ...student, className: '7A' }).action, 'unchanged');
});
test('new admissions, dropped students, missing identifiers and multiple prior records are protected', () => {
  assert.equal(audit({ ...current, enrollmentYear: '2026-2027' }, [book()]).action, 'unchanged');
  assert.equal(audit({ ...current, status: 'dropped' }, [book()]).action, 'blocked');
  assert.equal(audit({ ...current, studentKey: 'other', accessCode: 'HS999', previousStudentId: '' }, [book()]).action, 'blocked');
  assert.equal(audit(current, [book()], [previous, { ...previous, id: 'another' }]).action, 'blocked');
});
test('Sheet profile imports preserve both promotions and real repeats', () => {
  assert.equal(sheetClassConflict({ className: '7A' }, { className: '6A' }), true);
  assert.equal(sheetClassConflict({ className: '6A' }, { className: '7A' }), true);
  assert.equal(sheetClassConflict({ className: '7A' }, { className: '7A' }), false);
});
test('recovery restores an observed prior roster and rejects stale, duplicate or contradictory rows', () => {
  const rows = [audit(current, [book()])];
  const recovered = restoreClassesFromPriorRoster(rows, [previous, current], 'HS25601,6A,7A');
  assert.equal(recovered[0].action, 'restore');
  assert.equal(reconciledStudentRecord(recovered[0]).className, '7A');
  assert.equal(reconciledStudentRecord(recovered[0]).promotion, undefined, 'recovery does not invent a new educational decision');
  assert.throws(() => restoreClassesFromPriorRoster(rows, [previous, current], 'HS25601,7A,8A'), /đã thay đổi/);
  assert.throws(() => restoreClassesFromPriorRoster(rows, [previous, current], 'HS25601,6A,8A'), /chưa khớp lịch sử/);
  assert.throws(() => restoreClassesFromPriorRoster(rows, [previous, current], 'HS25601,6A,7A\nHS25601,6A,7A'), /bị lặp/);
  const dropped = { ...current, status: 'dropped' };
  const dropRow = audit(dropped);
  assert.equal(reconciledStudentRecord(restoreClassesFromPriorRoster([dropRow], [previous, dropped], 'HS25601,6A,7A')[0]).status, 'dropped');
});
