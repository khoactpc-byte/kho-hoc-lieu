import { QUICK_SCORE_SUBJECTS, SCOREBOOK_SOURCE_FILE } from '../config/scorebookDomain.js';
import { academicSummary, calculateSemesterAverage, calculateYearAverage } from './scorebookCalculations.js';
import { resolveScorebookDocument } from './scorebookArchive.js';
import { studentEditKey } from './studentScoreKeys.js';
import { attendanceForYear, linkedProfileRecords, profileSchoolYear } from './studentProfileHistory.js';
import { getSchoolGrade, getStudentEntryGrade, getStudentSchoolCode } from './schoolClasses.js';

const text = value => String(value ?? '').trim();
const updatedAt = record => Number(record.updatedAt?.toMillis?.() ?? record.updatedAt) || 0;

export function studentAcademicContexts(student, records = [], currentSchoolYear = '') {
  const linked = linkedProfileRecords(student, records).sort((a, b) => updatedAt(a) - updatedAt(b));
  const byYear = new Map();
  for (const record of linked) {
    for (const [year, value] of Object.entries(record.classHistory || {})) {
      const schoolYear = profileSchoolYear(year);
      const className = typeof value === 'string' ? value : value?.className;
      if (schoolYear && className) byYear.set(schoolYear, { ...record, schoolYear, className,
        status: record.status === 'dropped' && schoolYear >= (profileSchoolYear(record.dropoutYear) || profileSchoolYear(record.schoolYear)) ? 'dropped' : 'active' });
    }
    const promotion = record.promotion;
    const sourceYear = profileSchoolYear(promotion?.sourceSchoolYear);
    if (sourceYear && promotion.sourceClassName && !byYear.has(sourceYear)) {
      byYear.set(sourceYear, { ...record, schoolYear: sourceYear, className: promotion.sourceClassName });
    }
  }
  // Actual yearly records are authoritative, including repeats and campus transfers.
  for (const record of [...linked.filter(item => item.id !== student.id), student]) {
    const schoolYear = profileSchoolYear(record.schoolYear);
    if (schoolYear) byYear.set(schoolYear, { ...record, schoolYear });
  }
  const enrollmentYear = profileSchoolYear(student.enrollmentYear);
  const lastYear = profileSchoolYear(currentSchoolYear) || profileSchoolYear(student.schoolYear);
  const entryGrade = Number(getStudentEntryGrade(student, currentSchoolYear));
  return [...byYear.values()].filter(record => {
    const grade = Number(getSchoolGrade(record.className));
    return entryGrade > 0 && grade >= Math.max(6, entryGrade) && grade <= 9
      && (!enrollmentYear || record.schoolYear >= enrollmentYear)
      && (!lastYear || record.schoolYear <= lastYear);
  }).sort((a, b) => a.schoolYear.localeCompare(b.schoolYear));
}

export function scorebookYearSummary(edits, student) {
  const read = (semester, page, index) => {
    const key = studentEditKey(`${semester}Score:${page}:r0:s${index}`, student);
    return key ? text(edits?.[`custom:${key}`] ?? edits?.[key]) : '';
  };
  const semesterAverage = (semester, page) => read(semester, page, 6)
    || calculateSemesterAverage(index => read(semester, page, index));
  return academicSummary(QUICK_SCORE_SUBJECTS.filter(subject => subject.academic).map(subject =>
    read('hkii', subject.pageIndex, 7) || calculateYearAverage(
      semesterAverage('hki', subject.pageIndex), semesterAverage('hkii', subject.pageIndex)
    )
  ));
}

// These fields are derived from completed centre results, without changing declarations from earlier grades.
export function studentCenterAcademicResults({ student, records = [], scorebooks = [], currentSchoolYear = '', attendance = [], attendanceReady = false, attendanceYears = null } = {}) {
  if (!student) return { fields: {}, sources: {} };
  const fields = {}, sources = {};
  const linked = linkedProfileRecords(student, records);
  const latestByGrade = new Map();
  for (const record of studentAcademicContexts(student, records, currentSchoolYear)) {
    latestByGrade.set(getSchoolGrade(record.className), record);
  }
  for (const [grade, record] of latestByGrade) {
    if (record.status === 'dropped') continue;
    const schoolCode = getStudentSchoolCode(record);
    if (schoolCode === 'UNKNOWN') continue;
    const { document, needsSelection } = resolveScorebookDocument(scorebooks, {
      schoolYear: record.schoolYear, grade, schoolCode, sourceFile: SCOREBOOK_SOURCE_FILE
    });
    if (!document || needsSelection) continue;
    const summary = scorebookYearSummary(document.edits, record);
    if (!summary.complete) continue;
    const academicKey = `hocLucLop${grade}`, conductKey = `hanhKiemLop${grade}`;
    const source = { schoolYear: record.schoolYear, className: record.className, schoolCode, scorebookId: document.id };
    fields[academicKey] = summary.result;
    sources[academicKey] = source;
    if (attendanceReady && (!attendanceYears || attendanceYears.has(record.schoolYear))) {
      const start = `${record.schoolYear.slice(0, 4)}-09-01`;
      const end = `${record.schoolYear.slice(5)}-05-31`;
      const campusRecords = linked.filter(item => getStudentSchoolCode(item) === schoolCode);
      const annualAttendance = attendanceForYear(record.schoolYear, campusRecords, attendance);
      // Once this year's feed has loaded, no absence documents means zero absences.
      const absences = (annualAttendance?.days || []).filter(day => day.date >= start && day.date <= end).length;
      // Match the full-year conduct result already used by the centre's scorebook.
      fields[conductKey] = absences < 20 ? 'Tốt' : 'Khá';
      sources[conductKey] = source;
    }
  }
  return { fields, sources };
}
