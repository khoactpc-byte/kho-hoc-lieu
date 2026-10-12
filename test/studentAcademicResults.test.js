import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_SCORE_SUBJECTS, SCOREBOOK_SOURCE_FILE } from '../src/config/scorebookDomain.js';
import { studentCenterAcademicResults, scorebookYearSummary } from '../src/utils/studentAcademicResults.js';
import { studentEditKey } from '../src/utils/studentScoreKeys.js';
import { scorebookDocumentId } from '../src/utils/scorebookArchive.js';

const base = { id: 'now', studentKey: 'person-1', accessCode: 'HS001', className: '8A', schoolYear: '2026-2027',
  schoolCode: 'NAN', entryGrade: '7', enrollmentYear: '2025-2026', hocLucLop6: 'Khá', hanhKiemLop6: 'Tốt' };
const old = { ...base, id: 'old', schoolYear: '2025-2026', className: '7A' };
const book = (student, score = '8.5', extra = {}) => ({ id: `book-${student.id}`, schoolYear: student.schoolYear,
  schoolCode: student.schoolCode, grade: student.className[0], sourceFile: SCOREBOOK_SOURCE_FILE,
  edits: Object.fromEntries(QUICK_SCORE_SUBJECTS.map(subject => [
    `custom:${studentEditKey(`hkiiScore:${subject.pageIndex}:r0:s7`, student)}`, score
  ])), ...extra });
const results = options => studentCenterAcademicResults({ student: base, records: [old, base], currentSchoolYear: '2026-2027', attendanceReady: true, ...options });

test('entry at grade 7 preserves declared grade 6 and fills only completed centre grades', () => {
  const result = results({ scorebooks: [book(old), book(base, '6.5'), book({ ...base, id: 'future', schoolYear: '2027-2028', className: '9A' })] });
  assert.deepEqual(result.fields, { hocLucLop7: 'Tốt', hanhKiemLop7: 'Tốt', hocLucLop8: 'Khá', hanhKiemLop8: 'Tốt' });
  assert.equal(base.hocLucLop6, 'Khá');
  assert.equal(result.sources.hocLucLop7.schoolYear, '2025-2026');
  assert.equal(result.sources.hocLucLop8.schoolYear, '2026-2027');
});

test('partial years and unknown attendance never create premature classifications', () => {
  const partial = book(base);
  delete partial.edits[Object.keys(partial.edits)[0]];
  assert.deepEqual(results({ scorebooks: [partial] }).fields, {});
  assert.deepEqual(results({ scorebooks: [book(base)], attendanceReady: false }).fields, { hocLucLop8: 'Tốt' });
  assert.deepEqual(results({ scorebooks: [book(old), book(base)], attendanceYears: new Set([base.schoolYear]) }).fields,
    { hocLucLop7: 'Tốt', hocLucLop8: 'Tốt', hanhKiemLop8: 'Tốt' }, 'unloaded years must not be treated as zero absences');
  const edits = Object.fromEntries(QUICK_SCORE_SUBJECTS.flatMap(subject => ['hki', 'hkii'].map(semester => [
    `custom:${studentEditKey(`${semester}Score:${subject.pageIndex}:r0:s6`, base)}`, '8'
  ])));
  assert.equal(scorebookYearSummary(edits, base).complete, true);
  assert.equal(scorebookYearSummary(edits, base).result, 'Tốt');
});

test('lookup isolates student identity, campus, year, source and ambiguous archives', () => {
  const wrongStudent = { ...base, id: 'stranger', studentKey: 'other-person', accessCode: 'OTHER' };
  assert.deepEqual(results({ scorebooks: [book(wrongStudent)] }).fields, {});
  for (const extra of [{ schoolCode: 'TQK' }, { schoolYear: '2024-2025' }, { sourceFile: 'other-template' }]) {
    assert.deepEqual(results({ scorebooks: [book(base, '8.5', extra)] }).fields, {});
  }
  assert.deepEqual(results({ scorebooks: [book(base), book(base, '6.5', { id: 'second-version' })] }).fields, {});
  const canonical = book(base, '6.5');
  canonical.id = scorebookDocumentId(canonical);
  assert.equal(results({ scorebooks: [canonical, book(base)] }).fields.hocLucLop8, 'Khá');
  assert.deepEqual(results({ scorebooks: [book(base, '8.5', { edits: { 'custom:hkiiScore:0:r0:s7': '8.5' } })] }).fields, {});
});

test('class history reads prior grades by stable code without guessing future classes', () => {
  const student = { ...base, classHistory: { '2025-2026': '7A' } };
  const result = results({ student, records: [student], scorebooks: [book(old)] });
  assert.equal(result.fields.hocLucLop7, 'Tốt');
  assert.equal(result.fields.hocLucLop8, undefined);
  const unrelated = { ...old, studentKey: 'other', accessCode: 'OTHER', fullName: 'Same name' };
  assert.deepEqual(results({ student: { ...base, fullName: 'Same name' }, records: [unrelated], scorebooks: [book(unrelated)] }).fields, {});
});

test('repeats use the latest real attempt and dropouts do not synthesize later results', () => {
  const student = { ...base, className: '7B' };
  assert.equal(results({ student, records: [old, student], scorebooks: [book(old), book(student, '6.5')] }).fields.hocLucLop7, 'Khá');
  const partial = book(student);
  delete partial.edits[Object.keys(partial.edits)[0]];
  assert.equal(results({ student, records: [old, student], scorebooks: [book(old), partial] }).fields.hocLucLop7, undefined);
  const dropped = { ...base, status: 'dropped', dropoutYear: base.schoolYear, classHistory: { '2025-2026': '7A' } };
  const result = results({ student: dropped, records: [dropped], scorebooks: [book(old), book(base)] });
  assert.equal(result.fields.hocLucLop7, 'Tốt');
  assert.equal(result.fields.hocLucLop8, undefined);
});

test('conduct matches annual summary and counts corrected, unique, matching absence days', () => {
  const attendance = Array.from({ length: 20 }, (_, index) => ({ id: `day-${index}`, schoolYear: old.schoolYear, schoolCode: 'NAN',
    date: `2025-09-${String(index + 1).padStart(2, '0')}`, records: { old: { studentId: 'old', status: 'CP', updatedAt: 1 } } }));
  attendance.push({ ...attendance[0], id: 'copy' }, { ...attendance[0], id: 'outside-year', date: '2026-06-01' },
    { ...attendance[0], id: 'other-campus', schoolCode: 'TQK', date: '2025-09-25' });
  assert.equal(results({ scorebooks: [book(old)], attendance }).fields.hanhKiemLop7, 'Khá');
  attendance.push({ ...attendance[0], id: 'correction', records: { old: { studentId: 'old', status: '', updatedAt: 2 } } });
  assert.equal(results({ scorebooks: [book(old)], attendance }).fields.hanhKiemLop7, 'Tốt');
  const transferred = { ...base, id: 'other-campus-record', schoolCode: 'TQK' };
  const otherCampusAttendance = Array.from({ length: 20 }, (_, index) => ({ id: `other-${index}`, schoolYear: base.schoolYear,
    schoolCode: 'TQK', date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    records: { [transferred.id]: { studentId: transferred.id, status: 'KP' } } }));
  assert.equal(results({ records: [old, transferred, base], scorebooks: [book(base)], attendance: otherCampusAttendance }).fields.hanhKiemLop8,
    'Tốt', 'a linked record at another campus must not change this campus conduct result');
});
