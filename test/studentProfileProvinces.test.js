import test from 'node:test';
import assert from 'node:assert/strict';
import { assertStudentProfileProvinceChanges, buildStudentProfileProvinceOptions, STUDENT_PROFILE_PROVINCE_FIELDS, studentProfileProvinceDirectoryKey, updateStudentProfileAddressDraft } from '../src/utils/studentProfileProvinces.js';

const options = buildStudentProfileProvinceOptions({
  provinces: ['TP.HCM', 'Thành phố Hồ Chí Minh', 'Cần Thơ'],
  birthProvinces: ['TP. Hồ Chí Minh', 'Bến Tre', 'Tỉnh Bến Tre']
});

test('profile province choices use separate directories and save complete, deduplicated names', () => {
  assert.deepEqual(options.birthProvince.map(option => option.value), ['Thành phố Hồ Chí Minh', 'Tỉnh Bến Tre']);
  assert.deepEqual(options.province.map(option => option.value), ['Thành phố Cần Thơ', 'Thành phố Hồ Chí Minh']);
  assert.deepEqual(options.birthProvince, options.birthRegistrationProvince);
  assert.deepEqual(options.birthProvince, options.hometownProvince);
  assert.deepEqual(options.province, options.householdProvince);
  assert.equal(studentProfileProvinceDirectoryKey('Thành phố Hồ Chí Minh', ['TP.HCM', 'Cần Thơ']), 'TP.HCM');
  assert.equal(studentProfileProvinceDirectoryKey('Thành phố Cần Thơ', ['TP.HCM', 'Cần Thơ']), 'Cần Thơ');
});

test('all five province fields reject abbreviations and choices from the wrong directory', () => {
  for (const [key, field] of Object.entries(STUDENT_PROFILE_PROVINCE_FIELDS)) {
    const input = { current: {}, draft: { [key]: 'Tphcm' }, optionsByField: options, editableFields: [{ key, label: field.label }] };
    assert.throws(() => assertStudentProfileProvinceChanges(input), /không nhập tên viết tắt/);
    assert.doesNotThrow(() => assertStudentProfileProvinceChanges({ ...input, draft: { [key]: 'Thành phố Hồ Chí Minh' } }));
  }
  assert.throws(() => assertStudentProfileProvinceChanges({ current: {}, draft: { province: 'Tỉnh Bến Tre' }, optionsByField: options, editableFields: [{ key: 'province', label: 'Tỉnh / Thành' }] }), /chọn/);
});

test('unavailable directories block new province edits but do not block unrelated edits to legacy records', () => {
  const input = { current: { birthProvince: 'Tphcm' }, draft: { birthProvince: 'Tphcm', phone: '123' }, editableFields: [{ key: 'birthProvince', label: 'Tỉnh nơi sinh' }] };
  assert.doesNotThrow(() => assertStudentProfileProvinceChanges(input));
  assert.doesNotThrow(() => assertStudentProfileProvinceChanges({ ...input, draft: { birthProvince: '' } }));
  assert.throws(() => assertStudentProfileProvinceChanges({ ...input, draft: { birthProvince: 'Thành phố Hồ Chí Minh' } }), /Chưa tải được danh mục/);
});

test('changing a province clears its dependent address fields while expanding an existing abbreviation preserves them', () => {
  const previous = { birthProvince: 'Tphcm', birthDistrict: 'Quận 5', birthWard: 'Phường 1', province: 'TP.HCM', ward: 'Phường Chợ Lớn', householdWard: 'Phường Bình Tân' };
  assert.deepEqual(updateStudentProfileAddressDraft(previous, 'birthProvince', 'Thành phố Hồ Chí Minh'), { ...previous, birthProvince: 'Thành phố Hồ Chí Minh' });
  assert.deepEqual(updateStudentProfileAddressDraft(previous, 'birthProvince', 'Tỉnh Bến Tre'), { ...previous, birthProvince: 'Tỉnh Bến Tre', birthDistrict: '', birthWard: '' });
  assert.deepEqual(updateStudentProfileAddressDraft(previous, 'province', 'Thành phố Cần Thơ'), { ...previous, province: 'Thành phố Cần Thơ', ward: '' });
  assert.equal(previous.birthDistrict, 'Quận 5', 'the original record remains untouched');
});
