export const PROFILE_INTAKE_FIELDS = new Set(('fullName birthDate birthProvince birthDistrict birthWard birthPlaceName birthRegistrationProvince birthRegistrationDistrict birthRegistrationWard hometownProvince hometownDistrict hometownWard identityCode phone province ward address householdProvince householdWard householdAddress fatherName fatherBirthYear fatherJob fatherPhone motherName motherBirthYear motherJob motherPhone temporaryStatus transport portraitUrl birthCertificateUrl identityCardUrl transcriptUrl hocLucLop6 hocLucLop7 hocLucLop8 hanhKiemLop6 hanhKiemLop7 hanhKiemLop8').split(' '));
export function cleanIntakeChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length
    || Object.entries(changes).some(([key,value])=>!PROFILE_INTAKE_FIELDS.has(key) || typeof value !== 'string' || value.length>2000)) throw new Error('Trường hồ sơ không được phép hoặc quá dài.');
  return Object.fromEntries(Object.keys(changes).sort().map(key=>[key,changes[key].trim()]));
}
