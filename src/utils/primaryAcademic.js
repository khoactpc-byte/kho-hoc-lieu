import { getSchoolGrade, normalizeSchoolYearKey } from './schoolClasses.js';
import { studentEditKey } from './studentScoreKeys.js';

export const PRIMARY_SCOREBOOK_SOURCE = 'so-diem-tieu-hoc-v1';
export const PRIMARY_TERMS = [
  { key: 'mid1', label: 'Giữa học kỳ I' }, { key: 'end1', label: 'Cuối học kỳ I' },
  { key: 'mid2', label: 'Giữa học kỳ II' }, { key: 'end2', label: 'Cuối năm' }
];
export const PRIMARY_SUBJECTS = [
  { key: 'tieng_viet', label: 'Tiếng Việt', score: true }, { key: 'toan', label: 'Toán', score: true },
  { key: 'dao_duc', label: 'Đạo đức' }, { key: 'tu_nhien_xa_hoi', label: 'Tự nhiên và Xã hội', maxGrade: 3 },
  { key: 'khoa_hoc', label: 'Khoa học', minGrade: 4, score: true }, { key: 'lich_su_dia_ly', label: 'Lịch sử và Địa lý', minGrade: 4, score: true },
  { key: 'ngoai_ngu', label: 'Ngoại ngữ', minGrade: 3, score: true }, { key: 'tin_hoc_cong_nghe', label: 'Tin học và Công nghệ', minGrade: 3, score: true },
  { key: 'giao_duc_the_chat', label: 'Giáo dục thể chất' }, { key: 'am_nhac', label: 'Âm nhạc' },
  { key: 'my_thuat', label: 'Mỹ thuật' }, { key: 'hoat_dong_trai_nghiem', label: 'Hoạt động trải nghiệm' }
];
export const PRIMARY_QUALITIES = [
  ['yeu_nuoc', 'Yêu nước'], ['nhan_ai', 'Nhân ái'], ['cham_chi', 'Chăm chỉ'], ['trung_thuc', 'Trung thực'], ['trach_nhiem', 'Trách nhiệm'],
  ['tu_chu', 'Tự chủ và tự học'], ['giao_tiep', 'Giao tiếp và hợp tác'], ['giai_quyet', 'Giải quyết vấn đề và sáng tạo'],
  ['ngon_ngu', 'Ngôn ngữ'], ['tinh_toan', 'Tính toán'], ['khoa_hoc', 'Khoa học'], ['cong_nghe', 'Công nghệ'],
  ['tin_hoc', 'Tin học'], ['tham_my', 'Thẩm mỹ'], ['the_chat', 'Thể chất']
].map(([key, label]) => ({ key, label }));
export const PRIMARY_SUBJECT_LEVELS = ['Hoàn thành tốt', 'Hoàn thành', 'Chưa hoàn thành'];
export const PRIMARY_QUALITY_LEVELS = ['Tốt', 'Đạt', 'Cần cố gắng'];
export const PRIMARY_YEAR_LEVELS = ['Hoàn thành xuất sắc', 'Hoàn thành tốt', 'Hoàn thành', 'Chưa hoàn thành'];

export const primarySubjectsForGrade = grade => PRIMARY_SUBJECTS.filter(subject => Number(grade) >= (subject.minGrade || 1) && Number(grade) <= (subject.maxGrade || 5));
export const primaryHasTest = (subject, term, grade) => Boolean(subject.score && (term === 'end1' || term === 'end2' || (Number(grade) >= 4 && ['toan', 'tieng_viet'].includes(subject.key))));
export const primaryCellKey = (student, term, subject, field) => {
  const key = studentEditKey(`primary:${term}:${subject}:r0:${field}`, student);
  return key ? `custom:${key}` : '';
};
export const primaryValue = (edits, student, term, subject, field) => String(edits?.[primaryCellKey(student, term, subject, field)] ?? '');
export const normalizePrimaryScore = value => {
  const text = String(value ?? '').trim();
  return !text ? '' : /^(?:[0-9]|10)$/.test(text) ? text : null;
};

export function primaryBookScope(student, schoolYear, schoolCode) {
  return { schoolYear: normalizeSchoolYearKey(student.schoolYear || schoolYear), schoolCode, grade: getSchoolGrade(student.className || student.grade), sourceFile: PRIMARY_SCOREBOOK_SOURCE };
}
