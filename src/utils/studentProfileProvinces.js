import { provinceFilterLabel } from './provinceLabels.js';

export const STUDENT_PROFILE_PROVINCE_FIELDS = {
  birthProvince: { kind: 'birth', label: 'Tỉnh nơi sinh', dependents: ['birthDistrict', 'birthWard'] },
  birthRegistrationProvince: { kind: 'birth', label: 'Tỉnh đăng ký khai sinh', dependents: ['birthRegistrationDistrict', 'birthRegistrationWard'] },
  hometownProvince: { kind: 'birth', label: 'Tỉnh quê quán', dependents: ['hometownDistrict', 'hometownWard'] },
  province: { kind: 'address', label: 'Tỉnh / Thành', dependents: ['ward'] },
  householdProvince: { kind: 'address', label: 'Tỉnh / Thành HK', dependents: ['householdWard'] }
};

export function studentProfileProvinceLabel(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const key = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z]/g, '');
  if (['hcm', 'tphcm', 'hochiminh', 'tphochiminh', 'thanhphohochiminh'].includes(key)) return 'Thành phố Hồ Chí Minh';
  return provinceFilterLabel(text.replace(/^tp[.\s]+/iu, 'Thành phố '));
}

export function buildStudentProfileProvinceOptions({ provinces = [], birthProvinces = [] } = {}) {
  const choices = values => [...new Set(values.map(studentProfileProvinceLabel).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }))
    .map(value => ({ value, label: value }));
  const byKind = { birth: choices(birthProvinces), address: choices(provinces) };
  return Object.fromEntries(Object.entries(STUDENT_PROFILE_PROVINCE_FIELDS).map(([key, field]) => [key, byKind[field.kind]]));
}

// The Sheet directory still uses its original province keys for commune lookup.
export function studentProfileProvinceDirectoryKey(value, provinces = []) {
  const label = studentProfileProvinceLabel(value);
  return provinces.find(province => studentProfileProvinceLabel(province) === label) || String(value || '').trim();
}

export function updateStudentProfileAddressDraft(previous, key, value) {
  const next = { ...previous, [key]: value };
  const field = STUDENT_PROFILE_PROVINCE_FIELDS[key];
  if (field && studentProfileProvinceLabel(previous[key]) !== studentProfileProvinceLabel(value)) {
    for (const dependent of field.dependents) next[dependent] = '';
  }
  return next;
}

export function assertStudentProfileProvinceChanges({ draft, current, optionsByField = {}, editableFields }) {
  for (const field of editableFields) {
    if (!Object.hasOwn(STUDENT_PROFILE_PROVINCE_FIELDS, field.key)) continue;
    const next = String(draft[field.key] || '').trim();
    const previous = String(current[field.key] || '').trim();
    // Preserve unrelated edits to older records, including unrecognized legacy values.
    if (!next || next === previous) continue;
    const choices = optionsByField[field.key] || [];
    if (!choices.length) throw new Error(`Chưa tải được danh mục tỉnh/thành. Vui lòng tải lại trước khi đổi ${field.label}.`);
    if (!choices.some(option => option.value === next)) throw new Error(`Vui lòng chọn ${field.label} trong danh sách tỉnh/thành phố, không nhập tên viết tắt.`);
  }
}
