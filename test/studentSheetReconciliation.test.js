import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSheetReconciliation, matchSheetStudent, sheetBirthDateKey, sheetRecordForYear, studentDuplicateGroups } from '../src/utils/studentSheetReconciliation.js';

const year = '2026-2027';
const student = (index, extra = {}) => ({ id: `student-${index}`, fullName: `Nguyễn Văn An ${index}`, birthDate: '01/02/2010',
  accessCode: `HS258${String(index).padStart(2, '0')}`, schoolYear: year, className: '9A', grade: '9', entryGrade: '8',
  enrollmentYear: '2025-2026', schoolCode: 'NAN', status: 'active', sheetClassSource: 'history', ...extra });

test('35 Sheet rows against 31 web records identifies the four missing students by the selected-year column', () => {
  const sheet = Array.from({ length: 35 }, (_, i) => {
    const raw = student(i, { rowNumber: i + 2, schoolYear: '2025-2026', currentClassName: '8A', classHistory: { '2025-2026': '8A', [year]: '9A' } });
    const projected = sheetRecordForYear(raw, year);
    return { ...projected, className: projected.currentClassName };
  });
  const web = Array.from({ length: 31 }, (_, i) => student(i));
  const report = buildSheetReconciliation(sheet, web, year);
  assert.equal(report.rows.filter(row => row.action === 'matched').length, 31);
  assert.deepEqual(report.rows.filter(row => row.action === 'create').map(row => row.student.rowNumber), [33, 34, 35, 36]);
  assert.equal(report.duplicateGroups.length, 0);
  assert.ok(sheet.every(record => record.className === '9A'));
  assert.equal(buildSheetReconciliation(sheet, [...web, ...sheet.slice(31).map((record, i) => ({ ...record, id: `added-${i}` }))], year).rows.filter(row => row.action === 'create').length, 0);
});

test('year selection never guesses promotion, includes older dropouts and respects enrollment year', () => {
  assert.equal(sheetRecordForYear(student(1, { schoolYear: '2025-2026', currentClassName: '8A' }), year), null);
  assert.equal(sheetRecordForYear(student(1, { enrollmentYear: '2027-2028' }), year), null);
  const dropped = sheetRecordForYear(student(1, { schoolYear: '2025-2026', status: 'dropped', dropoutYear: '2025-2026', classHistory: { [year]: '9A' } }), year);
  assert.equal(dropped.status, 'dropped'); assert.equal(dropped.currentClassName, ''); assert.equal(dropped.grade, '');
  const before = sheetRecordForYear({ ...dropped, enrollmentYear: '2023-2024', classHistory: { '2024-2025': '7A' } }, '2024-2025');
  assert.equal(before.status, 'active'); assert.equal(before.currentClassName, '7A'); assert.equal(before.dropoutYear, '');
});

test('duplicate groups use name/birth, identity and code, and never flag legitimate yearly records as duplicates', () => {
  const an = student(1, { identityCode: '012345678901', fullName: 'Đỗ Thị An' });
  const copy = student(2, { identityCode: '012345678902', fullName: 'do thi an', birthDate: '2010-02-01' });
  const linked = student(3, { identityCode: '012345678901' });
  const old = { ...an, id: 'old', schoolYear: '2025-2026' };
  const groups = studentDuplicateGroups([an, copy, linked, old]);
  assert.equal(groups.length, 1); assert.equal(groups[0].records.length, 3);
  assert.deepEqual(new Set(groups[0].reasons), new Set(['Cùng họ tên và ngày sinh', 'Cùng mã định danh']));
  assert.equal(sheetBirthDateKey('1/2/2010'), '2010-02-01');
});

test('ambiguous Sheet or web matches are not added or overwritten, including conflicting codes and identities', () => {
  const an = student(1, { identityCode: '012345678901' });
  const other = student(2, { identityCode: '012345678902' });
  assert.equal(matchSheetStudent({ ...an, identityCode: other.identityCode }, [an, other]).ambiguous, true);
  assert.equal(matchSheetStudent({ ...an, identityCode: '012345678903' }, [an]).conflictingIdentity, true);
  const report = buildSheetReconciliation([an, { ...an, rowNumber: 20 }], [], year);
  assert.ok(report.rows.every(row => row.action === 'ambiguous'));
  assert.equal(report.duplicateGroups.length, 1);
  assert.equal(buildSheetReconciliation([an], [{ ...an, schoolCode: 'TQK' }], year).rows[0].action, 'ambiguous');
});

test('missing yearly profiles retain their unique latest predecessor and do not reopen dropouts', () => {
  const now = student(1);
  const old = { ...now, id: 'old', schoolYear: '2025-2026', className: '8A', studentKey: 'stable' };
  const earlier = { ...old, id: 'earlier', schoolYear: '2024-2025', className: '7A' };
  const row = buildSheetReconciliation([now], [earlier, old], year).rows[0];
  assert.equal(row.action, 'create'); assert.equal(row.sourceStudent.id, 'old');
  assert.equal(buildSheetReconciliation([now], [{ ...old, status: 'dropped' }], year).rows[0].action, 'blocked');
  assert.equal(buildSheetReconciliation([now], [{ ...old, id: 'duplicate-old' }, old], year).rows[0].action, 'ambiguous');
});

test('a new admission is repaired in place instead of being linked to a mistaken year before enrollment', () => {
  const vinh = student(9, { fullName: 'Phạm Quốc Vinh', enrollmentYear: year, entryGrade: '9', identityCode: '012345678901' });
  const misplaced = { ...vinh, id: 'wrong-year', schoolYear: '2025-2026', studentKey: 'keep-identity' };
  const row = buildSheetReconciliation([vinh], [misplaced], year).rows[0];
  assert.equal(row.action, 'year'); assert.equal(row.existing.id, misplaced.id); assert.equal(row.sourceStudent, null);
  assert.match(row.reason, /Sheet ghi nhập học 2026-2027/); assert.match(row.reason, /trước năm nhập học/);
  assert.doesNotMatch(row.reason, /giữ định danh từ năm/);
  const fresh = buildSheetReconciliation([vinh], [], year).rows[0];
  assert.equal(fresh.action, 'create'); assert.equal(fresh.sourceStudent, null); assert.match(fresh.reason, /Năm nhập học trên Sheet: 2026-2027/);
});

test('an already imported profile also reports linked history before its declared enrollment for repair', () => {
  const current = student(9, { enrollmentYear: year, entryGrade: '9', previousStudentId: 'old', classHistory: { '2025-2026': '9A', [year]: '9A' } });
  const sheet = { ...current, id: '', previousStudentId: '', classHistory: { [year]: '9A' } };
  const old = { ...current, id: 'old', schoolYear: '2025-2026' };
  const row = buildSheetReconciliation([sheet], [old, current], year).rows[0];
  assert.equal(row.action, 'year'); assert.equal(row.existing.id, current.id);
  assert.equal(buildSheetReconciliation([sheet], [{ ...current, previousStudentId: '', classHistory: { [year]: '9A' } }], year).rows[0].action, 'matched');
});

test('name and birth alone do not justify moving a record from an earlier year or linking its scores', () => {
  const now = student(9, { enrollmentYear: year });
  const old = { ...now, id: 'old', schoolYear: '2025-2026', accessCode: 'HS25888' };
  assert.equal(buildSheetReconciliation([now], [old], year).rows[0].action, 'ambiguous');
  assert.equal(buildSheetReconciliation([{ ...now, enrollmentYear: '2025-2026' }], [old], year).rows[0].action, 'ambiguous');
});
