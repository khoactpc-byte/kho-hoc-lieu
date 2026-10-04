import { getStudentSchoolCode, normalizeSchoolYearKey } from './schoolClasses.js';
import { stableDataString } from './dataEquality.js';

export function promotionSourceVersions(students, schoolYear) {
  return Object.fromEntries(students.filter(student => normalizeSchoolYearKey(student.schoolYear || schoolYear) === schoolYear)
    .map(student => [student.id, stableDataString(Object.fromEntries(Object.entries(student).filter(([key]) => key !== 'id')))]));
}

export function assertPromotionPreviewCurrent(expected, students, schoolYear) {
  const current = promotionSourceVersions(students, schoolYear);
  if (!expected || Object.keys(expected).length !== Object.keys(current).length ||
      Object.entries(current).some(([id, value]) => expected[id] !== value)) {
    throw new Error('Danh sách hoặc hồ sơ nguồn đã thay đổi từ lúc xem trước. Hãy làm mới danh sách để đối soát trước khi chuyển năm.');
  }
}

const code = student => String(student.accessCode || student.studentCode || '').trim().toUpperCase();
const identity = student => {
  const value = String(student.identityCode || '').replace(/^'/, '').trim();
  return /^\d{12}$/.test(value) ? value : '';
};
const name = student => String(student.fullName || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const birthday = student => {
  const raw = String(student.birthDate || '').trim();
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|T|\s)/);
  if (iso) return `${iso[3].padStart(2, '0')}${iso[2].padStart(2, '0')}${iso[1]}`;
  const local = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (local) return `${local[1].padStart(2, '0')}${local[2].padStart(2, '0')}${local[3]}`;
  return /^\d{8}$/.test(raw) ? raw : '';
};
const unique = matches => {
  if (matches.length > 1) throw new Error('Có nhiều hồ sơ năm mới cùng danh tính. Cần đối soát trước khi chuyển năm.');
  const match = matches[0] || null;
  if (match?.status === 'dropped') throw new Error('Hồ sơ năm mới đã được đánh dấu nghỉ. Cần đối soát trước khi chuyển năm.');
  return match;
};

export function findPromotionTarget(student, targets) {
  const campus = getStudentSchoolCode(student);
  const linked = targets.filter(candidate => student.id && candidate.previousStudentId === student.id);
  if (linked.some(candidate => getStudentSchoolCode(candidate) !== campus)) throw new Error('Hồ sơ liên kết năm mới thuộc cơ sở khác. Cần đối soát trước khi chuyển năm.');
  const candidates = targets.filter(candidate => getStudentSchoolCode(candidate) === campus);
  const matches = candidates.filter(candidate =>
    (student.id && candidate.previousStudentId === student.id) ||
    (student.studentKey && candidate.studentKey === student.studentKey) ||
    (code(student) && code(candidate) === code(student)) ||
    (identity(student) && identity(candidate) === identity(student)));
  if (matches.length) return unique(matches);
  if (!name(student) || !birthday(student)) return null;
  // Legacy matching is allowed only when present identifiers do not contradict it.
  return unique(candidates.filter(candidate => name(candidate) === name(student) &&
    birthday(candidate) === birthday(student) &&
    !(code(student) && code(candidate) && code(student) !== code(candidate)) &&
    !(identity(student) && identity(candidate) && identity(student) !== identity(candidate))));
}
