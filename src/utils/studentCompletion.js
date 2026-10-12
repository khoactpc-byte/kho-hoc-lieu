import { getSchoolGrade } from './schoolClasses.js';

export const THCS_COMPLETED_CLASS = 'TNTHCS';
export const isGraduatedStudent = (student = {}) => String(student.currentClassName || student.className || '').trim().toUpperCase() === THCS_COMPLETED_CLASS;

// Keep the source-year 9A record. TNTHCS belongs to the following year's record.
export function grade9CompletionFields(item, sourceSchoolYear, targetSchoolYear) {
  const sourceStart = Number(sourceSchoolYear.slice(0, 4));
  const result = String(item.academicResult || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/đ/g, 'd');
  const conduct = String(item.conductResult || '').trim().toLocaleLowerCase('vi-VN');
  if (sourceSchoolYear !== `${sourceStart}-${sourceStart + 1}` || targetSchoolYear !== `${sourceStart + 1}-${sourceStart + 2}`
    || getSchoolGrade(item.sourceClassName || item.student?.className) !== '9'
    || item.source !== 'so_diem' || !['tot', 'kha', 'dat'].includes(result)
    || !['tốt', 'khá', 'đạt'].includes(conduct)) {
    throw new Error('Chưa đủ kết quả lớp 9 đúng năm để ghi TNTHCS.');
  }
  return { hocLucLop9: item.academicResult, hanhKiemLop9: item.conductResult,
    completionStatus: 'completed_grade_9', completionSchoolYear: sourceSchoolYear, graduationYear: String(sourceStart + 1) };
}

// Missing or blank Sheet history cells must never erase an existing yearly class.
export function mergeStudentClassHistory(existing = {}, incoming = {}) {
  const result = { ...existing };
  for (const [year, value] of Object.entries(incoming || {})) {
    const match = year.trim().match(/^(20\d{2})\s*-\s*(20\d{2})$/);
    const className = typeof value === 'string' ? value.trim() : String(value?.className || '').trim();
    if (match && Number(match[2]) === Number(match[1]) + 1 && className) result[`${match[1]}-${match[2]}`] = value;
  }
  return result;
}
