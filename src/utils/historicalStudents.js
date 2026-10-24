import { linkedProfileRecords, profileSchoolYear } from './studentProfileHistory.js';
import { getSchoolGrade, getStudentSchoolCode, normalizeSchoolClassName } from './schoolClasses.js';
import { stableRecordId } from './idempotency.js';

export const HISTORICAL_FIRST_YEAR = 2023;
export const ROSTER_DIGITAL_START_YEAR = 2025;
const yearStart = value => Number(profileSchoolYear(value).slice(0, 4));
const classText = value => normalizeSchoolClassName(typeof value === 'string' ? value : value?.className);
const validClass = value => /^[1-9][A-Z][A-Z0-9-]*$/.test(value);
const identity = student => String(student.studentKey || student.accessCode || student.id || '').trim();

// Only fill missing past years. Saved yearly records always win, including repeats.
export function buildHistoricalStudentPlan(records = [], targetSchoolYear = '') {
  const year = profileSchoolYear(targetSchoolYear), target = yearStart(year);
  if (!year || target < HISTORICAL_FIRST_YEAR || target >= ROSTER_DIGITAL_START_YEAR) return [];
  const seen = new Set(), rows = [];
  const ordered = records.filter(Boolean).slice().sort((a, b) => yearStart(a.schoolYear) - yearStart(b.schoolYear));
  for (const record of ordered) {
    if (seen.has(record.id || record)) continue;
    const linked = linkedProfileRecords(record, records);
    linked.forEach(item => seen.add(item.id || item));
    if (linked.some(item => profileSchoolYear(item.schoolYear) === year)) continue;
    const later = linked.filter(item => item.id && yearStart(item.schoolYear) > target);
    const source = later[0];
    if (!source) continue;
    const enrollmentYear = profileSchoolYear(source.enrollmentYear);
    if (enrollmentYear && year < enrollmentYear) continue;
    const row = { source, records: linked, schoolYear: year, className: '', basis: '', status: 'blocked', reason: '', reasonCode: '', details: [], nextStep: '' };
    const block = (reason, reasonCode, details, nextStep) => { rows.push({ ...row, reason, reasonCode, details, nextStep }); };
    if (!enrollmentYear) { block('Thiếu năm nhập học hợp lệ.', 'missing_admission',
      [`Hồ sơ ${source.schoolYear}: năm nhập học ghi “${source.enrollmentYear || 'chưa có'}”.`], 'Mở hồ sơ nguồn, đối chiếu và điền năm nhập học.'); continue; }
    if (!source.accessCode || !identity(source)) { block('Thiếu mã học sinh ổn định.', 'missing_identity',
      ['Chưa có mã để nối hồ sơ giữa các năm.'], 'Mở hồ sơ nguồn và kiểm tra mã học sinh.'); continue; }
    if (linked.some(item => profileSchoolYear(item.enrollmentYear) && profileSchoolYear(item.enrollmentYear) !== enrollmentYear)) {
      block('Các hồ sơ ghi năm nhập học khác nhau.', 'admission_conflict',
        linked.map(item => `Hồ sơ ${item.schoolYear || 'chưa rõ năm'}: nhập học ${item.enrollmentYear || 'chưa có'}.`),
        'Đối chiếu năm nhập học trong các hồ sơ rồi sửa dữ liệu sai.'); continue;
    }
    const anchors = new Map();
    const add = (key, value) => {
      const schoolYear = profileSchoolYear(key), name = classText(value);
      if (!schoolYear || !validClass(name)) return;
      const names = anchors.get(schoolYear) || new Set(); names.add(name); anchors.set(schoolYear, names);
    };
    linked.forEach(item => {
      Object.entries(item.classHistory || {}).forEach(([key, value]) => add(key, value));
      add(item.promotion?.sourceSchoolYear, item.promotion?.sourceClassName);
      add(item.schoolYear, item.className || item.dropoutPreviousClassName);
    });
    if ([...anchors.values()].some(names => names.size > 1)) { block('Một năm đang ghi nhiều lớp khác nhau.', 'class_conflict',
      [...anchors].filter(([, names]) => names.size > 1).map(([key, names]) => `${key}: ${[...names].join(', ')}.`),
      `Đối chiếu hồ sơ và lịch sử lớp; ghi đúng lớp thực tế năm ${year}.`); continue; }
    if (new Set(linked.map(getStudentSchoolCode)).size > 1) { block('Các hồ sơ ghi cơ sở khác nhau.', 'campus_conflict',
      linked.map(item => `${item.schoolYear || 'Chưa rõ năm'}: ${getStudentSchoolCode(item)}.`),
      `Xác nhận học sinh học ở cơ sở nào trong năm ${year}.`); continue; }
    const known = [...anchors].map(([key, names]) => ({ year: yearStart(key), className: [...names][0] }));
    const explicit = anchors.get(year);
    if (explicit) {
      row.className = [...explicit][0]; row.basis = 'Lịch sử lớp đã lưu';
    } else {
      if (!known.length) { block('Thiếu lớp đầy đủ để tính ngược.', 'missing_class',
        [`Hồ sơ ${source.schoolYear}: lớp ghi “${source.className || 'chưa có'}”.`],
        'Đối chiếu và điền tên lớp đầy đủ, ví dụ 7A.'); continue; }
      const projected = known.map(anchor => Number(getSchoolGrade(anchor.className)) - (anchor.year - target));
      const evidence = known.map((anchor, index) => `${anchor.year}-${anchor.year + 1}: lớp ${anchor.className} → nếu lên lớp đều thì năm ${year} ở khối ${projected[index]}.`);
      const entryGrade = Number(getSchoolGrade(source.entryGrade || source.enrollmentGrade || source.admissionGrade));
      if (entryGrade) {
        const fromEntry = entryGrade + target - yearStart(enrollmentYear);
        projected.push(fromEntry);
        evidence.push(`Nhập học ${enrollmentYear}, khối ${entryGrade} → nếu lên lớp đều thì năm ${year} ở khối ${fromEntry}.`);
      }
      if (new Set(projected).size !== 1) { block('Các mốc lớp và năm nhập học cho kết quả tính khác nhau.', 'progression_conflict', evidence,
        `Xem lịch sử từng năm và xác nhận lớp thực tế ${year}. Chưa đủ căn cứ kết luận lưu ban hoặc học vượt.`); continue; }
      const anchor = known.find(item => item.year >= target) || known[0];
      if (projected[0] < 1 || projected[0] > 9) continue;
      row.className = anchor.className.replace(/^[1-9]/, String(projected[0]));
      row.basis = `Tính ngược từ ${anchor.className}, ${anchor.year}–${anchor.year + 1}`;
    }
    if (getStudentSchoolCode(source) === 'UNKNOWN') { block('Chưa xác định cơ sở.', 'missing_campus',
      [`Hồ sơ ${source.schoolYear} chưa có cơ sở hợp lệ.`], 'Mở hồ sơ nguồn và xác nhận cơ sở học.'); continue; }
    if (linked.some(item => {
      const end = profileSchoolYear(item.dropoutYear || item.completionSchoolYear);
      return end && end <= year;
    })) { block('Có mốc nghỉ học hoặc hoàn thành trong/trước năm này.', 'inactive_year',
      linked.filter(item => profileSchoolYear(item.dropoutYear || item.completionSchoolYear)).map(item =>
        `Hồ sơ ${item.schoolYear}: nghỉ học ${item.dropoutYear || '—'}; hoàn thành ${item.completionSchoolYear || '—'}.`),
      `Xác nhận học sinh có học trong năm ${year} trước khi bổ sung hồ sơ đang học.`); continue; }
    rows.push({ ...row, status: 'ready', reason: row.basis });
  }
  return rows;
}

export function historicalStudentRecord(row) {
  if (row.status !== 'ready' || !validClass(row.className)) throw new Error('Hồ sơ năm cũ chưa đủ căn cứ.');
  const source = row.source;
  const studentKey = identity(source);
  // Profile details may be reused; yearly outcomes, sync state and later decisions may not.
  const omitted = new Set(['id', 'previousStudentId', 'promotion', 'sheetSync', 'syncRevision', 'registrationId', 'currentClassName',
    'status', 'dropoutYear', 'dropoutPreviousClassName', 'dropoutReactivationRevision', 'completionStatus',
    'completionSchoolYear', 'graduationYear', 'createdAt', 'updatedAt', 'updatedBy', 'historicalProjection', 'historicalRecovery']);
  const profile = Object.fromEntries(Object.entries(source).filter(([key, value]) => !omitted.has(key)
    && !/^(hocLucLop|hanhKiemLop)\d+$/.test(key) && value !== undefined));
  return { ...profile, id: stableRecordId('student-history', studentKey, row.schoolYear), studentKey,
    schoolYear: row.schoolYear, grade: getSchoolGrade(row.className), className: row.className, status: 'active',
    classHistory: { [row.schoolYear]: row.className },
    historicalProjection: true,
    historicalRecovery: { sourceStudentId: source.id, sourceSchoolYear: source.schoolYear, basis: row.basis } };
}

export function historicalRosterForYear(records = [], schoolYear = '') {
  const year = profileSchoolYear(schoolYear);
  const historical = yearStart(year) < ROSTER_DIGITAL_START_YEAR;
  const actual = records.filter(item => (!historical && !item.schoolYear) || profileSchoolYear(item.schoolYear) === year);
  return [...actual, ...buildHistoricalStudentPlan(records, year).filter(row => row.status === 'ready').map(historicalStudentRecord)];
}
