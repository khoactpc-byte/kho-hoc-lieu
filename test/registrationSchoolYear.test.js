import test from 'node:test';
import assert from 'node:assert/strict';
import { assertStudentSchoolYear, registrationSchoolYear } from '../src/utils/schoolYearText.js';

test('new registrations retain their declared year when admin is viewing another year', () => {
  assert.equal(registrationSchoolYear({ schoolYear: '2026-2027' }, '2025-2026'), '2026-2027');
  assert.equal(registrationSchoolYear({ enrollmentYear: '2026-2027' }, '2025-2026'), '2026-2027');
  assert.equal(registrationSchoolYear({ tinhTrangHocSinh: '2026-2027' }, '2025-2026'), '2026-2027');
  assert.equal(registrationSchoolYear({}, '2026-2027'), '2026-2027');
});

test('student year cannot precede enrollment, while continuing and legacy students remain valid', () => {
  assert.throws(() => assertStudentSchoolYear({ schoolYear: '2025-2026', enrollmentYear: '2026-2027' }), /2025-2026.*2026-2027/);
  assert.throws(() => assertStudentSchoolYear({ schoolYear: '2025-2026', enrollmentYear: '2026' }), /trước năm nhập học/);
  for (const enrollmentYear of ['2026-2027', '2025-2026', '2023', '', 'Chưa rõ']) {
    assert.doesNotThrow(() => assertStudentSchoolYear({ schoolYear: '2026-2027', enrollmentYear }));
  }
});
