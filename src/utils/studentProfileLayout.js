export const STUDENT_PROFILE_SECTIONS = [
  { key: 'identity', label: 'Thông tin' },
  { key: 'address', label: 'Địa chỉ & Gia đình' },
  { key: 'learning', label: 'Học tập & Giấy tờ' }
];

export function studentProfileSection(key) {
  if (/^(hocLucLop|hanhKiemLop)/.test(key)) return 'learning';
  if (/^(father|mother)/.test(key) || ['temporaryStatus', 'transport'].includes(key)) return 'address';
  if (/^(birthProvince|birthDistrict|birthWard|birthPlaceName|birthRegistration|hometown|household)/.test(key)
    || ['province', 'ward', 'address'].includes(key)) return 'address';
  return 'identity';
}
