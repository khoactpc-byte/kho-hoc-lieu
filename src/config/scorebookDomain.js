export const SCOREBOOK_SCHEMA_VERSION = 2;
export const SCOREBOOK_SOURCE_FILE = 'so diem 9pc tmt 2025-2026 MAU.xlsx';
export const QUICK_SCORE_SUBJECTS = Object.freeze([
  { key: 'ngu_van', label: 'Văn', name: 'Ngữ Văn', pageIndex: 0, academic: true, txCount: 4 },
  { key: 'toan', label: 'Toán', name: 'Toán', pageIndex: 1, academic: true, txCount: 4 },
  { key: 'gdcd', label: 'GDCD', name: 'Giáo dục công dân', pageIndex: 3, academic: true, txCount: 2 },
  { key: 'lsdl', label: 'LS-ĐL', name: 'Lịch sử & Địa Lý', pageIndex: 4, academic: true, txCount: 4 },
  { key: 'khtn', label: 'KHTN', name: 'Khoa học tự nhiên', pageIndex: 5, academic: true, txCount: 4 },
  { key: 'cong_nghe', label: 'Công nghệ', name: 'Công nghệ', pageIndex: 6, academic: true, txCount: 2 }
].map(Object.freeze));
export const SUBJECT_PAGES = Object.fromEntries(QUICK_SCORE_SUBJECTS.map(subject => [subject.key, subject.pageIndex]));
export const SUBJECT_KEYS = Object.fromEntries(QUICK_SCORE_SUBJECTS.map(subject => [subject.name, subject.key]));
