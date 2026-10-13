import { getSchoolGrade, getStudentSchoolCode, normalizeSchoolYearKey } from './schoolClasses.js';
import { profileSchoolYear } from './studentProfileHistory.js';

const text = value => String(value ?? '').trim();
const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ');
const code = value => text(value).replace(/^'/, '').toUpperCase();
const identity = value => /^\d{12}$/.test(code(value)) ? code(value) : '';
const className = value => text(typeof value === 'object' ? value?.className : value).toUpperCase().replace(/^LỚP\s*/i, '').replace(/\s+/g, '');
export const sheetBirthDateKey = value => {
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : text(value);
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return iso ? `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
    : local ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}` : '';
};
const nameBirth = student => fold(student.fullName) && sheetBirthDateKey(student.birthDate)
  ? `${fold(student.fullName)}|${sheetBirthDateKey(student.birthDate)}` : '';
const identifiers = student => [code(student.accessCode) && `code:${code(student.accessCode)}`,
  identity(student.identityCode) && `identity:${identity(student.identityCode)}`, nameBirth(student) && `name:${nameBirth(student)}`].filter(Boolean);
const sameStableIdentity = (student, record) => Boolean(
  /^HS\d{3,15}$/.test(code(student.accessCode)) && code(student.accessCode) === code(record.accessCode)
  || identity(student.identityCode) && identity(student.identityCode) === identity(record.identityCode)
);

// Only an explicit yearly class or a summary belonging to this year can supply a class.
export function sheetRecordForYear(record, schoolYear) {
  const year = normalizeSchoolYearKey(schoolYear);
  const storedYear = profileSchoolYear(record.schoolYear);
  const entryYear = profileSchoolYear(record.enrollmentYear);
  if (!year || entryYear && entryYear > year) return null;
  const historyClass = className(Object.entries(record.classHistory || {}).find(([key]) => normalizeSchoolYearKey(key) === year)?.[1]);
  const dropoutYear = profileSchoolYear(record.dropoutYear) || (record.status === 'dropped' ? storedYear : '');
  const dropped = dropoutYear ? year >= dropoutYear : record.status === 'dropped';
  if (!dropped && !historyClass && storedYear && storedYear !== year) return null;
  const currentClassName = dropped ? '' : historyClass || text(record.currentClassName || record.lopHienTai || record.current_class_name || record.className);
  const completed = currentClassName.toUpperCase() === 'TNTHCS';
  return { ...record, schoolYear: year, currentClassName,
    grade: dropped || completed ? '' : getSchoolGrade(currentClassName),
    status: dropped ? 'dropped' : completed ? 'completed' : 'active',
    dropoutYear: dropped ? record.dropoutYear : '',
    graduationYear: completed ? record.graduationYear : '', completionStatus: completed ? record.completionStatus : '',
    completionSchoolYear: completed ? record.completionSchoolYear : '',
    sheetClassSource: historyClass ? 'history' : storedYear === year ? 'current' : 'unassigned' };
}

// Report repeated records within one source/year, not the same student's legitimate annual history.
export function studentDuplicateGroups(records = [], source = 'web') {
  const parent = records.map((_, index) => index), keys = new Map(), reasons = new Map();
  const root = index => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  records.forEach((student, index) => identifiers(student).forEach(key => {
    const scopedKey = `${profileSchoolYear(student.schoolYear)}|${key}`;
    if (keys.has(scopedKey)) {
      const previous = keys.get(scopedKey);
      parent[root(index)] = root(previous);
      const label = key.startsWith('code:') ? 'Cùng mã học sinh' : key.startsWith('identity:') ? 'Cùng mã định danh' : 'Cùng họ tên và ngày sinh';
      reasons.set(scopedKey, { index, label });
    } else keys.set(scopedKey, index);
  }));
  const groups = new Map();
  records.forEach((student, index) => {
    const key = root(index);
    if (!groups.has(key)) groups.set(key, { id: `${source}:${key}`, source, records: [], reasons: [] });
    groups.get(key).records.push(student);
  });
  reasons.forEach(({ index, label }) => { const group = groups.get(root(index)); if (!group.reasons.includes(label)) group.reasons.push(label); });
  return [...groups.values()].filter(group => group.records.length > 1);
}

export function matchSheetStudent(student, records) {
  const campus = getStudentSchoolCode(student);
  const candidates = records.filter(record => campus === 'UNKNOWN' || getStudentSchoolCode(record) === 'UNKNOWN' || getStudentSchoolCode(record) === campus);
  const exact = candidates.filter(record => code(student.accessCode) && code(record.accessCode) === code(student.accessCode)
    || identity(student.identityCode) && identity(record.identityCode) === identity(student.identityCode));
  const named = nameBirth(student) ? candidates.filter(record => nameBirth(record) === nameBirth(student)) : [];
  const matches = [...new Set([...exact, ...named])];
  if (matches.length === 1) {
    const match = matches[0];
    if (identity(student.identityCode) && identity(match.identityCode) && identity(student.identityCode) !== identity(match.identityCode)) {
      return { matches, ambiguous: true, conflictingIdentity: true, reason: 'Họ tên/ngày sinh hoặc mã học sinh khớp nhưng mã định danh khác nhau.' };
    }
  }
  return { matches, ambiguous: matches.length > 1, reason: matches.length > 1 ? 'Khớp nhiều hồ sơ trên web; cần đối chiếu trùng trước.' : '' };
}

export function buildSheetReconciliation(sheetStudents, records, schoolYear) {
  const current = records.filter(record => profileSchoolYear(record.schoolYear) === schoolYear);
  const duplicates = studentDuplicateGroups(sheetStudents, 'sheet');
  const duplicateRows = new Set(duplicates.flatMap(group => group.records));
  const rows = sheetStudents.map((student, index) => {
    const { matches, ambiguous, reason } = matchSheetStudent(student, current);
    const existing = matches.length === 1 ? matches[0] : null;
    const base = { key: `${student.rowNumber || index}:${index}`, rowNumber: student.rowNumber, student, matches, existing };
    if (duplicateRows.has(student) || ambiguous) return { ...base, action: 'ambiguous', reason: reason || 'Có nhiều dòng Sheet cùng mã định danh, mã học sinh hoặc họ tên/ngày sinh.' };
    if (existing) {
      if (existing.status === 'dropped' || student.status === 'dropped') return { ...base, action: 'matched', reason: 'Bỏ học; lớp/khối hiện tại phải để trống.' };
      if (existing.status === 'completed' && className(student.className) !== 'TNTHCS') return { ...base, action: 'blocked', reason: 'Hồ sơ đã tốt nghiệp; cần đối chiếu trước khi thay lớp TNTHCS.' };
      const entryYear = profileSchoolYear(student.enrollmentYear);
      const previous = records.find(record => record.id === existing.previousStudentId);
      const invalidHistory = Object.keys(existing.classHistory || {}).some(year => profileSchoolYear(year) && profileSchoolYear(year) < entryYear);
      if (entryYear && (profileSchoolYear(existing.enrollmentYear) !== entryYear || invalidHistory
        || previous && profileSchoolYear(previous.schoolYear) < entryYear)) {
        return { ...base, action: 'year', reason: `Năm nhập học trên Sheet là ${student.enrollmentYear}. Hồ sơ web có năm nhập học hoặc liên kết/lịch sử trước đó không khớp; chọn để sửa theo Sheet, giữ nguyên mã học sinh.` };
      }
      if (className(existing.className) !== className(student.className)) {
        return { ...base, action: student.sheetClassSource === 'unassigned' ? 'blocked' : 'class',
          reason: student.sheetClassSource === 'unassigned' ? 'Chưa xác định lớp thuộc năm đang xem.' : `Khác lớp; Sheet ghi rõ lớp năm ${schoolYear}. Chọn nếu muốn áp dụng lớp này.` };
      }
      return { ...base, action: 'matched', reason: 'Đã có trên web.' };
    }
    if (!student.fullName || !sheetBirthDateKey(student.birthDate) || getStudentSchoolCode(student) === 'UNKNOWN'
      || student.sheetClassSource === 'unassigned' || student.status !== 'dropped' && !/^(?:[1-9][A-Z][A-Z0-9-]*|TNTHCS)$/.test(className(student.className))) {
      return { ...base, action: 'blocked', reason: 'Thiếu tên, ngày sinh, cơ sở hoặc lớp đúng năm; cần bổ sung trước khi thêm.' };
    }
    const codeOwners = records.filter(record => code(student.accessCode) && code(record.accessCode) === code(student.accessCode)
      && getStudentSchoolCode(record) !== getStudentSchoolCode(student));
    if (codeOwners.length) return { ...base, action: 'ambiguous', matches: codeOwners, reason: 'Mã học sinh đang thuộc hồ sơ ở cơ sở khác. Cần đối chiếu trước khi thêm.' };
    const entryYear = profileSchoolYear(student.enrollmentYear);
    const older = records.filter(record => profileSchoolYear(record.schoolYear) < schoolYear
      && (!entryYear || profileSchoolYear(record.schoolYear) >= entryYear)
      && getStudentSchoolCode(record) === getStudentSchoolCode(student));
    const linked = matchSheetStudent(student, older);
    const latestYear = linked.matches.map(record => profileSchoolYear(record.schoolYear)).sort().at(-1);
    const latest = linked.matches.filter(record => profileSchoolYear(record.schoolYear) === latestYear);
    if (latest.length > 1 || matchSheetStudent(student, latest).conflictingIdentity) return { ...base, action: 'ambiguous', matches: linked.matches, reason: 'Hồ sơ năm trước không khớp duy nhất; cần đối chiếu định danh.' };
    if (latest[0] && !sameStableIdentity(student, latest[0])) return { ...base, action: 'ambiguous', matches: latest, reason: 'Chỉ khớp họ tên/ngày sinh; chưa đủ định danh để nối hồ sơ và điểm năm trước.' };
    if (latest[0]?.status === 'dropped') return { ...base, action: 'blocked', matches: latest, reason: 'Hồ sơ năm trước đã bỏ học; cần đưa học lại trước khi nhập năm mới.' };
    if (!latest.length && entryYear) {
      const beforeEntry = matchSheetStudent(student, records.filter(record => profileSchoolYear(record.schoolYear) < entryYear));
      if (beforeEntry.matches.length) {
        if (beforeEntry.ambiguous) return { ...base, action: 'ambiguous', matches: beforeEntry.matches, reason: 'Có nhiều hồ sơ web nằm trước năm nhập học trên Sheet; cần kiểm tra trước khi sửa năm.' };
        const misplaced = beforeEntry.matches[0];
        if (!sameStableIdentity(student, misplaced)) return { ...base, action: 'ambiguous', matches: [misplaced], reason: 'Chỉ khớp họ tên/ngày sinh với hồ sơ nằm trước năm nhập học; cần đối chiếu mã học sinh hoặc mã định danh trước khi sửa năm.' };
        if (['dropped', 'completed'].includes(misplaced.status)) return { ...base, action: 'blocked', matches: [misplaced], reason: 'Hồ sơ web trước năm nhập học đã bỏ học/tốt nghiệp; cần đối chiếu, không tự mở lại.' };
        return { ...base, existing: misplaced, matches: [misplaced], sourceStudent: null, action: 'year',
          reason: `Sheet ghi nhập học ${student.enrollmentYear}; web có hồ sơ ở ${misplaced.schoolYear}, trước năm nhập học. Chọn để sửa hồ sơ web sang ${schoolYear}; không tạo lịch sử học năm ${misplaced.schoolYear}.` };
      }
    }
    return { ...base, sourceStudent: latest[0] || null, action: 'create', reason: latest[0]
      ? `Năm nhập học trên Sheet: ${student.enrollmentYear || 'chưa ghi'}. Có hồ sơ web từ năm ${latestYear}; nối định danh khi thêm hồ sơ ${schoolYear}.`
      : `Năm nhập học trên Sheet: ${student.enrollmentYear || 'chưa ghi'}. Chưa có trên web; có thể thêm hồ sơ năm ${schoolYear}.` };
  });
  const matchedIds = new Set(rows.flatMap(row => row.matches.map(student => student.id)));
  const webOnly = current.filter(student => !matchedIds.has(student.id));
  return { rows, webOnly, duplicateGroups: [...duplicates, ...studentDuplicateGroups(current, 'web')], schoolYear };
}
