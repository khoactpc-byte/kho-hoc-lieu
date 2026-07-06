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
  { name: 'Toán (TS 10)', shortName: 'Toán (TS 10)', periods: '2' },
  { name: 'Toán (TS10)', shortName: 'Toán (TS 10)', periods: '2' },
  { name: 'Ngữ văn', shortName: 'Văn', periods: '4' },
  { name: 'Ngữ văn (TS 10)', shortName: 'Văn (TS 10)', periods: '2' },
  { name: 'Ngữ văn (TS10)', shortName: 'Văn (TS 10)', periods: '2' },
  { name: 'Tiếng Anh', shortName: 'Tiếng Anh', periods: '3' },
  { name: 'Tiếng Anh (TS 10)', shortName: 'Anh (TS 10)', periods: '2' },
  { name: 'Tiếng Anh (TS10)', shortName: 'Anh (TS 10)', periods: '2' },
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
  { name: 'Nghỉ không hưởng lương', shortName: 'Nghỉ không lương', periods: '19' },
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
  { name: 'Phòng KHTN 1', shortName: 'Phòng KHTN 1', periods: '3' },
  { name: 'Phòng KHTN 2', shortName: 'Phòng KHTN 2', periods: '3' },
  { name: 'Phòng KHTN 3', shortName: 'Phòng KHTN 3', periods: '3' },
  { name: 'Phụ trách CNTT - Phòng Tin học 1', shortName: 'Phòng Tin học 1', periods: '3' },
  { name: 'Phụ trách CNTT - Phòng Tin học 2', shortName: 'Phòng Tin học 2', periods: '3' },
  { name: 'HĐTN,HN (CĐ)', shortName: 'HĐTN,HN (CĐ)', periods: '' },
  { name: 'HĐTN,HN (DC)', shortName: 'HĐTN,HN (DC)', periods: '' },
  { name: 'HĐTN,HN (SHL)', shortName: 'HĐTN,HN (SHL)', periods: '' },
  { name: 'HĐTN,HN (SHL+SHCĐ)', shortName: 'HĐTN,HN (SHL+SHCĐ)', periods: '' },
  { name: 'KHTN (Hóa học)', shortName: 'KHTN (Hóa học)', periods: '' },
  { name: 'KHTN (Sinh học)', shortName: 'KHTN (Sinh học)', periods: '' },
  { name: 'KHTN (Vật lý)', shortName: 'KHTN (Vật lý)', periods: '' },
  { name: 'LS&ĐL - GDCD', shortName: 'LS&ĐL - GDCD', periods: '' },
  { name: 'LS&ĐL (Địa lý)', shortName: 'LS&ĐL (Địa lý)', periods: '' },
  { name: 'LS&ĐL (Lịch sử)', shortName: 'LS&ĐL (Lịch sử)', periods: '' },
  { name: 'Nghệ thuật <LB> (Âm nhạc)', shortName: 'NT <LB> (AN)', periods: '' },
  { name: 'Nghệ thuật <LB> (Mĩ thuật)', shortName: 'NT <LB> (MT)', periods: '' },
  { name: 'Tổ trưởng chuyên môn', shortName: 'TTCM', periods: '3' },
  { name: 'Thanh tra nhân dân', shortName: 'TTND', periods: '2' },
  { name: 'Tư vấn học đường', shortName: 'TVHĐ', periods: '8' },
  { name: 'Ban Chấp hành Công đoàn', shortName: 'BCHCĐ', periods: '1' }
];
