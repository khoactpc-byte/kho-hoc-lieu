import { extractSchoolYearFromText } from './schoolYearText.js';

const profileYear = record => {
  if (!record.schoolYear) return '';
  const normalized = extractSchoolYearFromText(record.schoolYear);
  if (!normalized) throw new Error('Năm học của hồ sơ không hợp lệ. Cần giáo viên đối soát.');
  return normalized;
};
export function eligibleStudentProfiles(records, currentSchoolYear) {
  const currentYear = extractSchoolYearFromText(currentSchoolYear);
  if (!currentYear) throw new Error('Chưa cấu hình năm học hiện tại hợp lệ.');
  const active = records.filter(item => item.status !== 'dropped');
  if (!active.length) throw new Error('Không tìm thấy hồ sơ học sinh còn hiệu lực.');
  const eligible = active.filter(item => profileYear(item) <= currentYear);
  if (!eligible.length) throw new Error('Hồ sơ học sinh chưa đến năm học được phép truy cập.');
  return eligible;
}
export function selectStudentIdentity(records, currentSchoolYear) {
  const eligible = eligibleStudentProfiles(records, currentSchoolYear);
  const latestYear = eligible.map(profileYear).sort().at(-1);
  const latest = eligible.filter(item => profileYear(item) === latestYear);
  if (latest.length !== 1) throw new Error('Có nhiều hồ sơ cùng mã trong một năm học. Cần giáo viên đối soát.');
  return latest[0];
}
