import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentProfileHistory, linkedProfileRecords, profileSchoolYear } from '../src/utils/studentProfileHistory.js';

const base = { fullName: 'Nguyễn Văn An', birthDate: '01/01/2013', accessCode: 'HS001', schoolCode: 'NAN', enrollmentYear: '2024-2025', entryGrade: '4', status: 'active' };
const record = (id, schoolYear, className, extra = {}) => ({ ...base, id, schoolYear, className, ...extra });
const history = (student, records = [], extra = {}) => buildStudentProfileHistory({ student, records, currentSchoolYear: '2026-2027', ...extra });

test('profile years accept short enrollment years and reject invalid ranges', () => {
  assert.equal(profileSchoolYear('24-25'), '2024-2025');
  assert.equal(profileSchoolYear('2024'), '2024-2025');
  assert.equal(profileSchoolYear(' 2024 - 2025 '), '2024-2025');
  assert.equal(profileSchoolYear('2024-2027'), '');
  assert.equal(profileSchoolYear(''), '');
});

test('six-year profile uses saved classes and results, and only projects future grades', () => {
  const old = record('old', '2024-2025', '4A', { hocLucLop4: 'Khá', hanhKiemLop4: 'Tốt' });
  const student = record('now', '2026-2027', '6B', { previousStudentId: 'old', classHistory: { '2024-2025': '4B', '2025-2026': '5A' }, hocLucLop5: 'Tốt' });
  const rows = history(student, [old, student], { academicResults: new Map([['now', { academic: 'Khá' }]]) });
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(row => row.schoolYear), ['2024-2025', '2025-2026', '2026-2027', '2027-2028', '2028-2029', '2029-2030']);
  assert.deepEqual(rows.map(row => row.className), ['4A', '5A', '6B', 'Khối 7', 'Khối 8', 'Khối 9']);
  assert.equal(rows[0].academic, 'Khá', 'yearly record wins over copied class history');
  assert.equal(rows[0].conduct, 'Tốt');
  assert.equal(rows[1].academic, 'Tốt');
  assert.equal(rows[2].academic, 'Khá', 'missing saved result falls back to the matching scorebook');
  assert.equal(rows[3].status, 'Dự kiến');
  assert.equal(rows[3].academic, '');
  assert.equal(rows[3].conduct, '');
  assert.equal(rows[3].attendance, null);
});

test('repeated grades keep each year result, dropouts stop projections and re-entry resumes history', () => {
  const students = [
    record('a', '2024-2025', '6A', { hocLucLop6: 'Chưa đạt' }),
    record('b', '2025-2026', '6A', { previousStudentId: 'a', hocLucLop6: 'Đạt', promotion: { outcome: 'repeat' } }),
    record('c', '2026-2027', '7A'),
    record('d', '2027-2028', '8A', { status: 'dropped' }),
    record('e', '2029-2030', '8B', { hocLucLop8: 'Khá' })
  ];
  const rows = history(students[4], students, { currentSchoolYear: '2029-2030' });
  assert.equal(rows[0].academic, 'Chưa đạt');
  assert.equal(rows[1].academic, 'Đạt');
  assert.equal(rows[1].status, 'Lưu ban');
  assert.equal(rows[3].status, 'Bỏ học');
  assert.equal(rows[4].status, 'Đã bỏ học');
  assert.equal(rows[4].className, '');
  assert.equal(rows[5].status, 'Học lại');
  assert.equal(rows[5].academic, 'Khá');
  const droppedRows = history(students[3], students.slice(0, 4), { currentSchoolYear: '2027-2028' });
  assert.equal(droppedRows[5].status, 'Đã bỏ học');
  assert.equal(droppedRows[5].projected, false);
  assert.equal(droppedRows[5].className, '');
});

test('identity links survive changed codes and multi-year promotion chains without using names', () => {
  const first = record('first', '2024-2025', '4A', { accessCode: 'OLD' });
  const second = record('second', '2025-2026', '5A', { accessCode: 'OTHER', previousStudentId: 'first' });
  const student = record('third', '2026-2027', '6A', { previousStudentId: 'second' });
  const unrelated = record('different', '2025-2026', '8A', { accessCode: 'DIFFERENT' });
  assert.deepEqual(linkedProfileRecords(student, [unrelated, first, second, student]).map(item => item.id).sort(), ['first', 'second', 'third']);
  const original = { ...student };
  const draft = { ...student, accessCode: 'NEW' };
  assert.equal(history(draft, [first, second, student], { original })[0].className, '4A');
  assert.equal(linkedProfileRecords(draft, [first, second, student, record('stranger', '2024-2025', '9A', { accessCode: 'NEW' })], original).length, 3, 'an unsaved code change cannot join another student history');
  const identified = { ...student, studentKey: 'person-a', identityCode: '000000000001' };
  assert.equal(linkedProfileRecords(identified, [record('wrong', '2024-2025', '9A', { studentKey: 'person-b', identityCode: '000000000002' })]).length, 1);
});

test('cumulative grades are not attributed to an ambiguous repeated year or an unknown past class', () => {
  const student = record('now', '2026-2027', '7A', { hocLucLop6: 'Tốt', classHistory: { '2024-2025': '6A', '2025-2026': '6A' } });
  const rows = history(student);
  assert.equal(rows[0].academic, '');
  assert.equal(rows[1].academic, '');
  const missing = history(record('x', '2026-2027', '6A'));
  assert.equal(missing[1].className, '');
  assert.equal(missing[1].status, 'Chưa có hồ sơ');
});

test('attendance counts unique dates, honors later corrections and isolates student, year and campus', () => {
  const old = record('old', '2024-2025', '4A');
  const student = record('now', '2026-2027', '6A');
  const day = (id, schoolYear, date, studentId, status, updatedAt = 1, extra = {}) => ({ id, schoolYear, date, schoolCode: 'NAN', records: { [studentId]: { studentId, status, updatedAt } }, ...extra });
  const attendance = [
    day('old-date', '2024-2025', '2024-09-01', 'old', 'KP'),
    day('p', '2026-2027', '2026-09-01', 'now', 'CP'),
    day('p-copy', '2026-2027', '2026-09-01', 'now', 'CP'),
    day('k', '2026-2027', '2026-09-02', 'now', 'KP'),
    day('cleared-old', '2026-2027', '2026-09-03', 'now', 'CP'),
    day('cleared-new', '2026-2027', '2026-09-03', 'now', '', 2),
    day('other-student', '2026-2027', '2026-09-04', 'other', 'KP'),
    day('other-campus', '2026-2027', '2026-09-05', 'now', 'KP', 3, { schoolCode: 'TQK' }),
    day('name-only', '2026-2027', '2026-09-06', 'unknown', 'KP', 1, { records: { unknown: { studentName: base.fullName, status: 'KP' } } })
  ];
  const rows = history(student, [old, student], { attendance });
  assert.equal(rows[0].attendance.total, 1);
  assert.equal(rows[1].attendance, null, 'missing attendance is unknown, not zero absences');
  assert.equal(rows[2].attendance.total, 2);
  assert.equal(rows[2].attendance.permitted, 1);
  assert.equal(rows[2].attendance.unpermitted, 1);
  assert.deepEqual(rows[2].attendance.days.map(item => item.date), ['2026-09-01', '2026-09-02']);
  const zero = history(student, [], { attendance: [day('present', '2026-2027', '2026-09-01', 'now', '')] });
  assert.equal(zero[2].attendance.total, 0);
  const unmarked = history(student, [], { attendance: [day('class', '2026-2027', '2026-09-01', 'other', 'KP', 1, { className: '6A' })] });
  assert.equal(unmarked[2].attendance.total, 0, 'an unmarked student has no recorded absences in their class log');
});

test('admin edits replace their saved record and do not reuse another grade scorebook', () => {
  const saved = record('now', '2026-2027', '6A', { updatedAt: 100 });
  const edited = { ...saved, className: '7B', status: 'dropped', updatedAt: 0 };
  const rows = history(edited, [saved], { original: saved, academicResults: new Map([['now', { academic: 'Tốt' }]]) });
  assert.equal(rows[2].className, '7B');
  assert.equal(rows[2].status, 'Bỏ học');
  assert.equal(rows[2].academic, '');
  assert.equal(rows[3].className, '');
});

test('timeline retains actual years beyond the first six and never projects beyond grade nine', () => {
  const student = record('now', '2031-2032', '9A');
  assert.equal(history(student, [], { currentSchoolYear: '2031-2032' }).at(-1).schoolYear, '2031-2032');
  const ninth = history(record('now', '2026-2027', '9A'));
  assert.equal(ninth[3].projected, false);
  assert.equal(ninth[3].className, '');
  assert.deepEqual(buildStudentProfileHistory(), []);
});
