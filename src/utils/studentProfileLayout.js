export const STUDENT_PROFILE_SECTIONS = [
  { key: 'identity', label: 'Thông tin' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'learning', label: 'Học tập & Giấy tờ' }
];

export function isStudentProfileFamilyField(key) {
  return /^(father|mother)/.test(key) || ['temporaryStatus', 'transport'].includes(key);
}

export function studentProfileSection(key) {
  if (/^(hocLucLop|hanhKiemLop)/.test(key)) return 'learning';
  if (isStudentProfileFamilyField(key)) return 'identity';
  if (/^(birthProvince|birthDistrict|birthWard|birthPlaceName|birthRegistration|hometown|household)/.test(key)
    || ['province', 'ward', 'address'].includes(key)) return 'address';
  return 'identity';
}
