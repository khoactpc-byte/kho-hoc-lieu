import { QUICK_SCORE_SUBJECTS, SCOREBOOK_SOURCE_FILE } from '../config/scorebookDomain.js';
import { studentAcademicContexts, studentCenterAcademicResults } from './studentAcademicResults.js';
import { buildStudentProfileHistory, linkedProfileRecords } from './studentProfileHistory.js';
import { studentEditKey } from './studentScoreKeys.js';
import { getSchoolGrade, getStudentSchoolCode } from './schoolClasses.js';

// Each query projects only this pupil's score cells or attendance entries.
export async function readStudentProfileAcademicHistory({ student, records = [], currentSchoolYear, read }) {
  const linked = linkedProfileRecords(student, records);
  const contexts = studentAcademicContexts(student, linked, currentSchoolYear);
  const attendanceFields = [...new Set(linked.flatMap(record => [record.id, record.accessCode, record.studentKey]).filter(Boolean))].map(key => ['records', key]);
  const attendanceRequests = new Map();
  const results = await Promise.all(contexts.map(async context => {
    const schoolCode = getStudentSchoolCode(context), grade = getSchoolGrade(context.className);
    if (schoolCode === 'UNKNOWN') return null;
    const scoreFields = QUICK_SCORE_SUBJECTS.flatMap(subject => ['hki', 'hkii'].flatMap(semester =>
      Array.from({ length: 8 }, (_, index) => {
        const key = studentEditKey(`${semester}Score:${subject.pageIndex}:r0:s${index}`, context);
        return [['edits', `custom:${key}`], ['edits', key]];
      }).flat()));
    const attendanceKey = `${context.schoolYear}:${schoolCode}`;
    if (!attendanceRequests.has(attendanceKey)) attendanceRequests.set(attendanceKey, read({ collection: 'class_attendance',
      filters: { schoolYear: context.schoolYear, schoolCode }, fields: [['schoolYear'], ['schoolCode'], ['className'], ['date'], ['updatedAt'], ...attendanceFields], limit: 2000 }));
    const [scorebooks, attendance] = await Promise.all([
      read({ collection: 'scorebooks', filters: { schoolYear: context.schoolYear, schoolCode, grade, sourceFile: SCOREBOOK_SOURCE_FILE },
        fields: [['schoolYear'], ['schoolCode'], ['grade'], ['sourceFile'], ['updatedAt'], ['campusNormalization'], ...scoreFields], limit: 50 }),
      attendanceRequests.get(attendanceKey)
    ]);
    const summary = studentCenterAcademicResults({ student: context, records: [context], currentSchoolYear: context.schoolYear,
      scorebooks, attendance, attendanceReady: true, attendanceYears: new Set([context.schoolYear]) });
    return { schoolYear: context.schoolYear, schoolCode, grade, academic: summary.fields[`hocLucLop${grade}`] || '', conduct: summary.fields[`hanhKiemLop${grade}`] || '' };
  }));
  const attendance = (await Promise.all(attendanceRequests.values())).flat();
  return { rows: buildStudentProfileHistory({ student, records: linked, currentSchoolYear, attendance,
    annualResults: new Map(results.filter(Boolean).map(result => [result.schoolYear, result])) }) };
}
