import { getSchoolGrade } from './schoolClasses.js';
import { isGraduatedStudent } from './studentCompletion.js';

export const EDUCATION_GRADES = Object.freeze({
  primary: Object.freeze(['1', '2', '3', '4', '5']),
  thcs: Object.freeze(['6', '7', '8', '9'])
});

export const educationGrades = level => EDUCATION_GRADES[level] || [...EDUCATION_GRADES.primary, ...EDUCATION_GRADES.thcs];
export const recordGrade = (record = {}) => getSchoolGrade(record.currentClassName || record.lopHienTai || record.current_class_name || record.className || record.lopHoc || record.currentClass || record.class || '')
  || getSchoolGrade(record.currentGrade || record.khoiHienTai || record.grade || record.entryGrade || record.enrollmentGrade || record.admissionGrade || record.khoiNhapHoc || record.khoi || '');
export const belongsToEducationLevel = (record, level) => !EDUCATION_GRADES[level]
  || (isGraduatedStudent(record) ? level === 'thcs' : EDUCATION_GRADES[level].includes(recordGrade(record)));
export const educationLabel = level => level === 'primary' ? 'Tiểu học' : level === 'thcs' ? 'THCS' : '';

export function educationRoute(route, level) {
  return EDUCATION_GRADES[level] && !/^\/(?:primary|thcs|tran-hung-dao)\//.test(route) ? `/${level}${route}` : route;
}

export function parseEducationRoute(route, currentLevel = 'thcs') {
  const match = route.match(/^\/(primary|thcs)(\/.*)$/);
  return { level: match?.[1] || currentLevel, path: match?.[2] || route };
}
