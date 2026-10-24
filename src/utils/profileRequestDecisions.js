import { STUDENT_PROFILE_ADDRESS_GROUPS } from './studentProfileProvinces.js';

// Reject only pending proposals; saved profile values are never cleared here.
export function profileRequestRejectedFields(changes = {}, fieldKey = '') {
  if (!fieldKey) return Object.keys(changes);
  const provinceGroup = STUDENT_PROFILE_ADDRESS_GROUPS.find(group => group.province === fieldKey);
  const districtGroup = STUDENT_PROFILE_ADDRESS_GROUPS.find(group => group.district === fieldKey);
  const keys = [fieldKey, ...(provinceGroup ? [provinceGroup.district, provinceGroup.ward] : districtGroup ? [districtGroup.ward] : [])];
  return keys.filter(key => key && Object.hasOwn(changes, key));
}
