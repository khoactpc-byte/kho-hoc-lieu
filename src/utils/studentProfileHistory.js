import { getSchoolGrade, getStudentSchoolCode } from './schoolClasses.js';
import { isGraduatedStudent } from './studentCompletion.js';

const text = value => String(value ?? '').trim();
const code = value => text(value).toUpperCase();
const identity = value => /^\d{12}$/.test(text(value)) ? text(value) : '';
const timestamp = value => Number(value?.toMillis?.() ?? (value?.seconds ? value.seconds * 1000 : value)) || 0;

export function profileSchoolYear(value) {
  const match = text(value).match(/^(\d{4}|\d{2})(?:\s*[-–/]\s*(\d{4}|\d{2}))?$/);
  if (!match) return '';
  const start = Number(match[1]) + (match[1].length === 2 ? 2000 : 0);
  const end = match[2] ? Number(match[2]) + (match[2].length === 2 ? 2000 : 0) : start + 1;
  return start >= 1900 && start <= 2200 && end === start + 1 ? `${start}-${end}` : '';
}

// Follow saved identifiers across yearly records. A matching name is never an identity.
export function linkedProfileRecords(student = {}, records = [], original = student) {
  const linked = [original || student];
  const remaining = (Array.isArray(records) ? records : []).filter(Boolean).slice();
  let changed = true;
  while (changed) {
    changed = false;
    const ids = new Set(linked.flatMap(item => [item.id, item.previousStudentId, item.studentKey]).map(text).filter(Boolean));
    const keys = new Set(linked.map(item => text(item.studentKey)).filter(Boolean));
    const codes = new Set(linked.flatMap(item => [item.accessCode, item.studentAccessCode]).map(code).filter(Boolean));
    const identities = new Set(linked.map(item => identity(item.identityCode)).filter(Boolean));
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const item = remaining[index];
      const exactLink = [item.id, item.previousStudentId, item.studentKey].some(value => text(value) && ids.has(text(value)));
      const conflict = (item.studentKey && keys.size && !keys.has(text(item.studentKey)))
        || (identity(item.identityCode) && identities.size && !identities.has(identity(item.identityCode)));
      const stableLink = !conflict && ((identity(item.identityCode) && identities.has(identity(item.identityCode)))
        || [item.accessCode, item.studentAccessCode].some(value => code(value) && codes.has(code(value))));
      if (!exactLink && !stableLink) continue;
      linked.push(item);
      remaining.splice(index, 1);
      changed = true;
    }
  }
  const byId = new Map();
  linked.filter(item => item !== original && item !== student).forEach(item => {
    const key = item.id || item;
    if (!byId.has(key) || timestamp(item.updatedAt) >= timestamp(byId.get(key).updatedAt)) byId.set(key, item);
  });
  if (original?.id && original.id !== student.id) byId.set(original.id, original);
  byId.set(student.id || student, student);
  return [...byId.values()];
}

export function attendanceForYear(schoolYear, records, attendance) {
  const yearlyRecords = records.filter(item => profileSchoolYear(item.schoolYear) === schoolYear);
  const candidates = yearlyRecords.length ? yearlyRecords : records;
  const ids = new Set(candidates.map(item => text(item.id)).filter(Boolean));
  const codes = new Set(candidates.flatMap(item => [item.accessCode, item.studentAccessCode]).map(code).filter(Boolean));
  const campuses = new Set(candidates.map(getStudentSchoolCode).filter(value => value !== 'UNKNOWN'));
  const days = new Map();
  let hasClassAttendance = false;
  (Array.isArray(attendance) ? attendance : []).forEach(document => {
    if (profileSchoolYear(document.schoolYear) !== schoolYear || !/^\d{4}-\d{2}-\d{2}$/.test(document.date || '')) return;
    const campus = getStudentSchoolCode(document);
    if (campus !== 'UNKNOWN' && campuses.size && !campuses.has(campus)) return;
    // The attendance screen stores only exceptions: an unmarked student is present.
    if (yearlyRecords.some(item => code(item.className) === code(document.className)
      && campus !== 'UNKNOWN' && getStudentSchoolCode(item) === campus)) hasClassAttendance = true;
    Object.entries(document.records || {}).forEach(([key, entry]) => {
      if (!entry || !['', 'CP', 'KP'].includes(entry.status)) return;
      const exact = ids.has(text(entry.studentId || key));
      const byCode = campus !== 'UNKNOWN' && campuses.has(campus)
        && codes.has(code(entry.studentAccessCode || entry.accessCode));
      if (!exact && !byCode) return;
      const next = { date: document.date, status: entry.status, updatedAt: timestamp(entry.updatedAt || document.updatedAt), exact, id: text(document.id) };
      const previous = days.get(next.date);
      if (!previous || next.updatedAt > previous.updatedAt
        || (next.updatedAt === previous.updatedAt && (Number(next.exact) > Number(previous.exact)
          || (next.exact === previous.exact && next.id > previous.id)))) days.set(next.date, next);
    });
  });
  if (!days.size && !hasClassAttendance) return null;
  const absences = [...days.values()].filter(day => day.status).sort((a, b) => a.date.localeCompare(b.date));
  return { total: absences.length, permitted: absences.filter(day => day.status === 'CP').length,
    unpermitted: absences.filter(day => day.status === 'KP').length, days: absences };
}

export function buildStudentProfileHistory({ student = {}, records = [], original = student, currentSchoolYear = '', attendance = [], academicResults = new Map() } = {}) {
  const linked = linkedProfileRecords(student, records, original);
  const actual = new Map();
  const history = new Map();
  const promotions = new Map();
  const ordered = linked.slice().sort((a, b) => timestamp(a.updatedAt) - timestamp(b.updatedAt));
  // Unsaved admin edits take precedence over the saved version of this same record.
  ordered.sort((a, b) => Number(a === student) - Number(b === student));
  ordered.forEach(item => {
    Object.entries(item.classHistory || {}).forEach(([year, value]) => {
      const key = profileSchoolYear(year);
      const className = typeof value === 'string' ? value : text(value?.className);
      if (key && className) history.set(key, className);
    });
    const promotion = item.promotion;
    const sourceYear = profileSchoolYear(promotion?.sourceSchoolYear);
    if (sourceYear) {
      promotions.set(sourceYear, promotion);
      if (promotion.sourceClassName && !history.has(sourceYear)) history.set(sourceYear, promotion.sourceClassName);
    }
    const year = profileSchoolYear(item.schoolYear);
    if (year) actual.set(year, item);
  });
  const enrollmentYear = profileSchoolYear(student.enrollmentYear)
    || [...actual.keys(), ...history.keys()].sort()[0] || profileSchoolYear(currentSchoolYear);
  if (!enrollmentYear) return [];
  const start = Number(enrollmentYear.slice(0, 4));
  const currentYear = Number((profileSchoolYear(currentSchoolYear) || profileSchoolYear(student.schoolYear) || enrollmentYear).slice(0, 4));
  const knownYears = [...actual.keys(), ...history.keys(), ...linked.map(item => profileSchoolYear(item.dropoutYear)).filter(Boolean)];
  const end = Math.max(start + 5, ...knownYears.map(year => Number(year.slice(0, 4))));
  const gradeYears = new Map();
  new Set([...actual.keys(), ...history.keys()]).forEach(year => {
    const grade = getSchoolGrade(actual.get(year)?.className || history.get(year));
    if (grade) gradeYears.set(grade, (gradeYears.get(grade) || 0) + 1);
  });
  let lastClass = '', lastClassYear = 0, dropped = false, graduated = false, previousGrade = '', previousYear = 0;
  const rows = [];
  // Include earlier records to carry a known dropout forward when enrollment year was corrected.
  for (let year = Math.min(start, ...knownYears.map(key => Number(key.slice(0, 4)))); year <= end; year += 1) {
    const schoolYear = `${year}-${year + 1}`;
    const record = actual.get(schoolYear);
    const className = record?.className || history.get(schoolYear) || '';
    const grade = getSchoolGrade(className);
    const completion = isGraduatedStudent({ className });
    if (completion) graduated = true;
    const dropout = record?.status === 'dropped' || linked.some(item => item.status === 'dropped' && profileSchoolYear(item.dropoutYear) === schoolYear);
    const returning = dropped && record && record.status !== 'dropped';
    if (dropout) dropped = true;
    else if (returning) dropped = false;
    const projectedGrade = !dropped && !graduated && lastClass && year > currentYear ? Number(getSchoolGrade(lastClass)) + year - lastClassYear : 0;
    const projected = !className && projectedGrade >= 1 && projectedGrade <= 9;
    const entryGrade = year === start && !className && !dropped ? getSchoolGrade(student.entryGrade) : '';
    let status = 'Chưa có hồ sơ';
    if (completion) status = `Tốt nghiệp THCS ${record?.graduationYear || year}`;
    else if (graduated) status = 'Đã tốt nghiệp THCS';
    else if (dropout) status = 'Bỏ học';
    else if (dropped) status = 'Đã bỏ học';
    else if (returning) status = 'Học lại';
    else if (record?.promotion?.outcome === 'repeat' || (grade && previousGrade === grade && previousYear === year - 1)) status = 'Lưu ban';
    else if (className) status = year === currentYear ? 'Đang học' : year > currentYear ? 'Đã xếp lớp' : 'Đã học';
    else if (projected) status = 'Dự kiến';
    else if (entryGrade) status = 'Khối nhập học';
    else if (year > currentYear) status = '—';

    const result = prefix => {
      if (!grade || year > currentYear || (dropped && !dropout)) return '';
      const scorebookRecord = record === student ? original : record;
      const matchingScorebook = scorebookRecord && getSchoolGrade(scorebookRecord.className) === grade
        && profileSchoolYear(scorebookRecord.schoolYear) === schoolYear && getStudentSchoolCode(scorebookRecord) === getStudentSchoolCode(record);
      const scorebook = record?.id && matchingScorebook ? academicResults.get(record.id)?.[prefix === 'hocLuc' ? 'academic' : 'conduct'] : '';
      if (scorebook) return scorebook;
      const specific = text(record?.[`${prefix}Lop${grade}`] || record?.[prefix]);
      if (specific) return specific;
      if (prefix === 'hocLuc' && promotions.get(schoolYear)?.academicResult) return text(promotions.get(schoolYear).academicResult);
      // Cumulative grade fields cannot distinguish two years spent in the same grade.
      if (gradeYears.get(grade) !== 1) return '';
      return text(ordered.slice().reverse().find(item => text(item[`${prefix}Lop${grade}`]))?.[`${prefix}Lop${grade}`]);
    };
    if (year >= start) rows.push({ schoolYear, className: dropped && !dropout ? '' : className || (projected ? `Khối ${projectedGrade}` : entryGrade ? `Khối ${entryGrade}` : ''),
      academic: result('hocLuc'), conduct: result('hanhKiem'), status, projected, current: year === currentYear,
      attendance: year <= currentYear ? attendanceForYear(schoolYear, linked, attendance) : null });
    if (className && (!dropped || dropout)) { lastClass = className; lastClassYear = year; }
    if (grade && (!dropped || dropout)) { previousGrade = grade; previousYear = year; }
  }
  return rows;
}
