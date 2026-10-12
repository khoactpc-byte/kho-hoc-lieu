import test from 'node:test';
import assert from 'node:assert/strict';
import { nanClass, planClassNormalization, attendanceDocumentId, verifyClassNormalization } from '../src/utils/classNormalization.js';

test('explicit NAN repair keeps years, stable identities, scores and attendance while normalizing legacy labels', () => {
  const student = { id: 's', schoolCode: 'NAN', className: 'Lớp 9', classSuffix: '', studentKey: 'stable', accessCode: 'HS123', schoolYear: '2025-2026',
    classHistory: { '2023-2024': '7PC', '2024-2025': { className: '8B', academic: 'Khá' }, '2022-2023': { className: '6B', schoolCode: 'TQK' } },
    promotion: { sourceSchoolYear: '2024-2025', sourceClassName: '8', status: 'promoted' }, hocLucLop8: 'Khá' };
  const collections = { students: [student, { id: 'b', schoolCode: 'TQK', className: '9B' }],
    class_attendance: [{ id: 'legacy-id', schoolCode: 'NAN', className: '9', schoolYear: '2025-2026', date: '2026-01-02', records: { s: { status: 'KP' } } }],
    scorebooks: [{ id: 'book', schoolCode: 'NAN', edits: { 'custom:hkiScore:0:r0:s1': '0' } }] };
  const original = structuredClone(collections);
  const plan = planClassNormalization({ version: 2, collections });
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(plan.counts, { students: 1, class_attendance: 1 });
  const patch = plan.groups[0].operations[0].patch;
  assert.equal(patch.className, '9A'); assert.equal(patch.classSuffix, 'A');
  assert.equal(patch.classHistory['2023-2024'], '7A');
  assert.deepEqual(patch.classHistory['2024-2025'], { className: '8A', academic: 'Khá' });
  assert.equal(patch.classHistory['2022-2023'].className, '6B');
  assert.equal(patch.promotion.sourceClassName, '8A');
  for (const group of plan.groups) for (const op of group.operations) {
    const row = collections[op.name].find(item => item.id === op.id);
    Object.assign(row, op.patch);
  }
  assert.equal(collections.students[0].studentKey, original.students[0].studentKey);
  assert.equal(collections.students[0].schoolYear, original.students[0].schoolYear);
  assert.deepEqual(collections.scorebooks, original.scorebooks);
  assert.deepEqual(collections.class_attendance[0].records, original.class_attendance[0].records);
  assert.equal(planClassNormalization({ version: 2, collections }).groups.length, 0);
  assert.equal(verifyClassNormalization({ collections: original }, { collections }, plan), true);
  const altered = structuredClone(collections); altered.scorebooks[0].edits['custom:hkiScore:0:r0:s1'] = '8';
  assert.throws(() => verifyClassNormalization({ collections: original }, { collections: altered }, plan), /Sổ điểm vừa thay đổi/);
  assert.equal(attendanceDocumentId(collections.class_attendance, { schoolYear: '2025-2026', schoolCode: 'NAN', className: '9A', date: '2026-01-02' }), 'legacy-id');
});

test('merged schedule rows change class keys together without changing lesson cells', () => {
  const row = { id: 'schedule', schoolCode: 'NAN', classRows: [{ id: '6&9', label: 'Lớp 6&9', grades: ['6', '9'] }], schedule: { '6&9': { '2-1': { subject: 'Toán', teacher: 'Cô A' } } } };
  const plan = planClassNormalization({ version: 2, collections: { class_schedules: [row] } });
  const patch = plan.groups[0].operations[0].patch;
  assert.deepEqual(patch.classRows, [{ id: '6A&9A', label: 'Lớp 6A&9A', grades: ['6A', '9A'] }]);
  assert.deepEqual(patch.schedule['6A&9A'], row.schedule['6&9']);
});

test('colliding attendance or schedule classes block repair and unrecognized text is preserved', () => {
  const attendance = { schoolCode: 'NAN', schoolYear: '2025-2026', date: '2026-01-02' };
  assert.equal(planClassNormalization({ version: 2, collections: { class_attendance: [{ id: 'a', ...attendance, className: '6' }, { id: 'b', ...attendance, className: '6A' }] } }).conflicts.length, 1);
  const schedule = { id: 's', schoolCode: 'NAN', classRows: [{ id: '6', grades: ['6'] }, { id: '6A', grades: ['6A'] }] };
  assert.equal(planClassNormalization({ version: 2, collections: { class_schedules: [schedule] } }).conflicts.length, 1);
  assert.equal(nanClass('Đã tốt nghiệp'), 'Đã tốt nghiệp'); assert.equal(nanClass(''), '');
  assert.equal(planClassNormalization({ version: 2, collections: { students: [{ id: 'unknown', className: '8B' }] } }).groups.length, 0);
});
