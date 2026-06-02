export const THD_CLASS_GRADES = ['6', '7', '8', '9'];
export const DEFAULT_THD_CLASS_COUNT = 5;
export const POSITION_OPTIONS = ['HT', 'PHT', 'TPT', 'TTCM', 'GV'];

export const emptyThdTeacher = () => ({ name: '', subject: '', position: 'GV', note: '' });

export const emptyThdSubject = () => ({
  name: '',
  shortName: '',
  periods: '',
  periodsSemester1: '',
  periodsSemester2: '',
  grades: THD_CLASS_GRADES
});

export const createDefaultThdClasses = () => Object.fromEntries(
  THD_CLASS_GRADES.map(grade => [
    grade,
    Array.from({ length: DEFAULT_THD_CLASS_COUNT }, (_, index) => `${grade}/${index + 1}`)
  ])
);

export const THD_CHECK_SUBJECT_OPTIONS = [
  { label: 'KHTN', value: 'KHTN', aliases: ['Khoa học tự nhiên', 'Khoa học Tự nhiên'] },
  { label: 'LS&ĐL', value: 'LS&ĐL', aliases: ['Lịch sử & Địa Lý', 'Lịch sử và địa lý'] },
  { label: 'GDCD', value: 'GDCD', aliases: ['Giáo dục công dân'] },
  { label: 'GDĐP', value: 'GDĐP', aliases: ['Giáo dục địa phương', 'Nội dung giáo dục địa phương'] },
  { label: 'Tiếng Anh', value: 'Tiếng Anh', aliases: ['T.Anh', 'Anh văn', 'Anh'] },
  { label: 'MT', value: 'MT', aliases: ['Mĩ thuật', 'Mỹ thuật', 'NT (MT)'] },
  { label: 'AN', value: 'AN', aliases: ['Âm nhạc', 'NT (AN)'] },
  { label: 'Tin học', value: 'Tin học', aliases: ['Tin'] },
  { label: 'GDTC', value: 'GDTC', aliases: ['Giáo dục thể chất'] },
  { label: 'Toán', value: 'Toán', aliases: ['Toán'] },
  { label: 'Văn', value: 'Văn', aliases: ['Ngữ Văn', 'Ngữ văn', 'Văn'] },
  { label: 'C nghệ', value: 'C nghệ', aliases: ['Công nghệ', 'CNGHỆ', 'CNghệ', 'CN nghệ'] },
  { label: 'Chủ nhiệm', value: 'Chủ nhiệm', aliases: ['Chủ nhiệm', 'CN', 'GVCN', 'GV chủ nhiệm', 'Giáo viên chủ nhiệm'] }
];

export const TEACHING_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'team-toan', label: 'Tổ Toán' },
  { value: 'team-van', label: 'Tổ Văn' },
  { value: 'team-anh', label: 'Tổ Anh' },
  { value: 'team-khtn', label: 'Tổ KHTN' },
  { value: 'team-khxh', label: 'Tổ KHXH (LS&ĐL; GDCD)' },
  { value: 'team-cam', label: 'Tổ CAM (Công nghệ; MT; AN)' },
  { value: 'team-tin-gdtc', label: 'Tổ Tin-GDTC (Tin; GDTC)' },
  { value: 'check-error', label: 'Kiểm tra sai' },
  { value: 'surplus', label: 'GV dư tiết > 0' },
  { value: 'deficit', label: 'GV thiếu tiết < 0' }
];

export const THD_CORE_TEACHING_SUBJECT_KEYS = new Set([
  'khtn',
  'ls dl',
  'gdcd',
  'gddp',
  'tieng anh',
  'mt',
  'an',
  'tin hoc',
  'gdtc',
  'toan',
  'van',
  'c nghe'
]);

export const DEFAULT_THD_SUBJECTS = [
  { name: 'Toán', shortName: 'Toán', periods: '4' },
  { name: 'Ngữ văn', shortName: 'Văn', periods: '4' },
  { name: 'Tiếng Anh', shortName: 'Tiếng Anh', periods: '3' },
  { name: 'Khoa học tự nhiên', shortName: 'KHTN', periods: '4' },
  { name: 'Lịch sử và Địa lí', shortName: 'LS&ĐL', periods: '3' },
  { name: 'Công nghệ', shortName: 'C nghệ', periods: '1' },
  { name: 'Tin học', shortName: 'Tin học', periods: '1' },
  { name: 'Giáo dục thể chất', shortName: 'GDTC', periods: '2' },
  { name: 'Giáo dục công dân', shortName: 'GDCD', periods: '1' },
  { name: 'Mĩ thuật', shortName: 'MT', periods: '1' },
  { name: 'Âm nhạc', shortName: 'AN', periods: '1' },
  { name: 'Giáo dục địa phương', shortName: 'GDĐP', periods: '1' },
  { name: 'Chủ nhiệm', shortName: 'GVCN', periods: '4' },
  { name: 'Bí thư Chi đoàn', shortName: 'BTCD', periods: '0' },
  { name: 'Chủ tịch Công đoàn', shortName: 'CTCĐ', periods: '3' },
  { name: 'Nghỉ hậu sản', shortName: 'Nghỉ hậu sản', periods: '19' },
  { name: 'Hậu sản', shortName: 'Hậu sản', periods: '19' },
  { name: 'Con nhỏ dưới 12 tháng tuổi', shortName: 'Con nhỏ < 12 tháng', periods: '3' },
  { name: 'Hoạt động trải nghiệm chủ đề', shortName: 'TN (CĐ)', periods: '1' },
  { name: 'Hoạt động trải nghiệm sinh hoạt lớp', shortName: 'TN (SHL)', periods: '1' },
  { name: 'Hoạt động trải nghiệm SHL và chủ đề', shortName: 'TN (SHL, CĐ)', periods: '2' },
  { name: 'Hoạt động trải nghiệm lớp 7/10 chủ đề', shortName: 'TN 7/10 (CĐ)', periods: '1' },
  { name: 'Hoạt động trải nghiệm lớp 9/2 chủ đề', shortName: 'TN 9/2 (CĐ)', periods: '1' },
  { name: 'Hoạt động trải nghiệm lớp 9/6 chủ đề', shortName: 'TN 9/6 (CĐ)', periods: '1' },
  { name: 'Hoạt động trải nghiệm lớp 9/8 chủ đề', shortName: 'TN 9/8 (CĐ)', periods: '1' },
  { name: 'Nghỉ việc', shortName: 'nghỉ việc', periods: '0' },
  { name: 'Thực hành Hóa', shortName: 'TH HÓA', periods: '3' },
  { name: 'Thực hành Sinh', shortName: 'TH SINH', periods: '3' },
  { name: 'Thực hành Lý', shortName: 'TH LÝ', periods: '3' },
  { name: 'Thực hành Tin 1', shortName: 'TH TIN 1', periods: '3' },
  { name: 'Thực hành Tin 2', shortName: 'TH TIN 2', periods: '3' },
  { name: 'Phụ trách thiết bị', shortName: 'P.TB', periods: '3' },
  { name: 'Thư ký hội đồng', shortName: 'TKHĐ', periods: '0' },
  { name: 'Tuyển sinh 10', shortName: 'TS 10', periods: '2' },
  { name: 'Tuyển sinh 10', shortName: 'TS10', periods: '2' },
  { name: 'Tổ trưởng Công đoàn', shortName: 'TTCĐ', periods: '1' },
  { name: 'Tổ trưởng chuyên môn', shortName: 'TTCM', periods: '3' },
  { name: 'Thanh tra nhân dân', shortName: 'TTND', periods: '2' },
  { name: 'Tư vấn học đường', shortName: 'TVHĐ', periods: '8' },
  { name: 'Ban Chấp hành Công đoàn', shortName: 'BCHCĐ', periods: '1' }
];
