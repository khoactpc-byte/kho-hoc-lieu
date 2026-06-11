import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { BookOpenText, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Save, Search, X } from 'lucide-react';
import { appId, db } from '../config/firebase';
import scorebookTemplate from '../data/scorebookTemplate.json';

const PREFERRED_START_SHEET = 'Bia';

const makeCellKey = (sheetName, row, col) => `${sheetName}!${row}:${col}`;

const cleanDocId = (value) => String(value || 'default').replace(/[^\w-]+/g, '_');

const coerceDisplayText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(coerceDisplayText).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    const directKey = ['text', 'value', 'label', 'name', 'date', 'display', 'title'].find(key => value[key] !== undefined && value[key] !== null);
    if (directKey) return coerceDisplayText(value[directKey]);
    const semesterParts = [
      value.hk1,
      value.hk2,
      value.hki,
      value.hkii,
      value.semester1,
      value.semester2,
      value.term1,
      value.term2
    ].map(coerceDisplayText).map(item => item.trim()).filter(Boolean);
    if (semesterParts.length) return [...new Set(semesterParts)].join('\n');
    return Object.values(value).map(coerceDisplayText).filter(Boolean).join('\n');
  }
  return String(value);
};

const decodeDisplayText = (value) => {
  const text = coerceDisplayText(value);
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
};

const decodeSemesterDisplayText = (value, preferredSemester = 'hk2') => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const preferredKeys = preferredSemester === 'hk1'
      ? ['hk1', 'hki', 'semester1', 'term1']
      : ['hk2', 'hkii', 'semester2', 'term2'];
    const preferredText = preferredKeys
      .map(key => decodeDisplayText(value[key]).trim())
      .find(Boolean);
    if (preferredText) return preferredText;
    const fallbackText = ['fullYear', 'value', 'teacherName', 'name', 'text', 'label', 'display', 'title']
      .map(key => decodeDisplayText(value[key]).trim())
      .find(Boolean);
    if (fallbackText) return fallbackText;
  }
  return decodeDisplayText(value);
};

const firstUrl = (value = '') => {
  const text = String(value || '').trim();
  if (/^data:image\//i.test(text)) return text;
  return text.split(/\s*,\s*|\n+/).map(item => item.trim()).filter(Boolean)[0] || '';
};

const extractDriveFileId = (value = '') => {
  const text = String(value || '');
  return text.match(/\/d\/([^/?#]+)/)?.[1]
    || text.match(/[?&]id=([^&#]+)/)?.[1]
    || '';
};

const normalizeImageUrl = (value = '') => {
  const url = firstUrl(value);
  const fileId = extractDriveFileId(url);
  return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w900` : url;
};

const getDriveEmbedUrl = (value = '') => {
  const fileId = extractDriveFileId(firstUrl(value));
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : '';
};

const COVER_TEXT = {
  school: 'TR\u01af\u1edcNG: THCS NGUY\u1ec4N AN NINH',
  ward: 'Ph\u01b0\u1eddng: Trung M\u1ef9 T\u00e2y',
  city: 'T\u1ec9nh/Th\u00e0nh ph\u1ed1: Th\u00e0nh ph\u1ed1 H\u1ed3 Ch\u00ed Minh',
  title: 'S\u1ed4 THEO D\u00d5I V\u00c0 \u0110\u00c1NH GI\u00c1 H\u1eccC SINH',
  subtitle: 'C\u1ea4P TRUNG H\u1eccC C\u01a0 S\u1ede'
};

const TRANSCRIPT_TEXT = {
  school: 'TR\u01af\u1edcNG: THCS NGUY\u1ec4N AN NINH',
  ward: 'X\u00e3 (Ph\u01b0\u1eddng): Ph\u01b0\u1eddng Trung M\u1ef9 T\u00e2y',
  city: 'T\u1ec9nh (Th\u00e0nh ph\u1ed1): Th\u00e0nh ph\u1ed1 H\u1ed3 Ch\u00ed Minh',
  title: 'H\u1eccC B\u1ea0',
  subtitle: 'TRUNG H\u1eccC C\u01a0 S\u1ede'
};

const TRANSCRIPT_GUIDE_SECTIONS = [
  {
    title: '1. Quy \u0111\u1ecbnh chung',
    lines: [
      'H\u1ecdc b\u1ea1 h\u1ecdc sinh \u0111\u01b0\u1ee3c nh\u00e0 tr\u01b0\u1eddng qu\u1ea3n l\u00fd v\u00e0 b\u1ea3o qu\u1ea3n trong tr\u01b0\u1eddng; \u0111\u1ea7u n\u0103m h\u1ecdc, cu\u1ed1i h\u1ecdc k\u1ef3, cu\u1ed1i n\u0103m h\u1ecdc, \u0111\u01b0\u1ee3c b\u00e0n giao cho gi\u00e1o vi\u00ean ch\u1ee7 nhi\u1ec7m l\u1edbp \u0111\u1ec3 th\u1ef1c hi\u1ec7n vi\u1ec7c ghi v\u00e0o H\u1ecdc b\u1ea1 v\u00e0 thu l\u1ea1i sau khi \u0111\u00e3 ho\u00e0n th\u00e0nh.',
      'N\u1ed9i dung trang 1 ph\u1ea3i \u0111\u01b0\u1ee3c ghi \u0111\u1ea7y \u0111\u1ee7 khi x\u00e1c l\u1eadp H\u1ecdc b\u1ea1; Hi\u1ec7u tr\u01b0\u1edfng k\u00fd, \u0111\u00f3ng d\u1ea5u x\u00e1c nh\u1eadn qu\u00e1 tr\u00ecnh h\u1ecdc t\u1eadp t\u1eeb l\u1edbp 6 \u0111\u1ebfn l\u1edbp 9.'
    ]
  },
  {
    title: '2. Gi\u00e1o vi\u00ean m\u00f4n h\u1ecdc',
    lines: [
      'Ghi \u0111i\u1ec3m trung b\u00ecnh m\u00f4n h\u1ecdc ho\u1eb7c m\u1ee9c \u0111\u00e1nh gi\u00e1 k\u1ebft qu\u1ea3 h\u1ecdc t\u1eadp theo m\u00f4n h\u1ecdc t\u1eebng h\u1ecdc k\u00ec, c\u1ea3 n\u0103m h\u1ecdc; nh\u1eadn x\u00e9t s\u1ef1 ti\u1ebfn b\u1ed9, \u01b0u \u0111i\u1ec3m n\u1ed5i b\u1eadt, h\u1ea1n ch\u1ebf ch\u1ee7 y\u1ebfu (n\u1ebfu c\u00f3) c\u1ee7a h\u1ecdc sinh.',
      'Khi s\u1eeda ch\u1eefa (n\u1ebfu c\u00f3), d\u00f9ng b\u00fat m\u1ef1c \u0111\u1ecf g\u1ea1ch ngang n\u1ed9i dung c\u0169, ghi n\u1ed9i dung m\u1edbi v\u00e0o ph\u00eda tr\u00ean b\u00ean ph\u1ea3i v\u1ecb tr\u00ed ghi n\u1ed9i dung c\u0169, k\u00fd x\u00e1c nh\u1eadn v\u1ec1 vi\u1ec7c s\u1eeda ch\u1eefa b\u00ean c\u1ea1nh n\u1ed9i dung \u0111\u00e3 s\u1eeda.'
    ]
  },
  {
    title: '3. Gi\u00e1o vi\u00ean ch\u1ee7 nhi\u1ec7m',
    lines: [
      'Ti\u1ebfp nh\u1eadn v\u00e0 b\u00e0n giao l\u1ea1i H\u1ecdc b\u1ea1 h\u1ecdc sinh v\u1edbi v\u0103n ph\u00f2ng nh\u00e0 tr\u01b0\u1eddng.',
      '\u0110\u00f4n \u0111\u1ed1c vi\u1ec7c ghi v\u00e0o H\u1ecdc b\u1ea1 \u0111i\u1ec3m trung b\u00ecnh m\u00f4n h\u1ecdc ho\u1eb7c m\u1ee9c \u0111\u00e1nh gi\u00e1 k\u1ebft qu\u1ea3 h\u1ecdc t\u1eadp c\u1ee7a h\u1ecdc sinh c\u1ee7a gi\u00e1o vi\u00ean m\u00f4n h\u1ecdc.',
      'Ghi \u0111\u1ea7y \u0111\u1ee7 c\u00e1c n\u1ed9i dung tr\u00ean trang 1, n\u1ed9i dung \u1edf ph\u1ea7n \u0111\u1ea7u c\u00e1c trang ti\u1ebfp theo, nh\u1eadn x\u00e9t k\u1ebft qu\u1ea3 r\u00e8n luy\u1ec7n v\u00e0 h\u1ecdc t\u1eadp c\u1ee7a h\u1ecdc sinh theo t\u1eebng n\u0103m h\u1ecdc.',
      'Ghi r\u00f5 \u0111\u01b0\u1ee3c l\u00ean l\u1edbp ho\u1eb7c kh\u00f4ng \u0111\u01b0\u1ee3c l\u00ean l\u1edbp; ho\u00e0n th\u00e0nh ho\u1eb7c ch\u01b0a ho\u00e0n th\u00e0nh ch\u01b0\u01a1ng tr\u00ecnh trung h\u1ecdc c\u01a1 s\u1edf; ch\u1ee9ng ch\u1ec9, k\u1ebft qu\u1ea3 tham gia c\u00e1c cu\u1ed9c thi, khen th\u01b0\u1edfng (n\u1ebfu c\u00f3).',
      'Ghi nh\u1eadn x\u00e9t s\u1ef1 ti\u1ebfn b\u1ed9, \u01b0u \u0111i\u1ec3m n\u1ed5i b\u1eadt, h\u1ea1n ch\u1ebf ch\u1ee7 y\u1ebfu v\u00e0 nh\u1eefng bi\u1ec3u hi\u1ec7n n\u1ed5i b\u1eadt c\u1ee7a h\u1ecdc sinh trong qu\u00e1 tr\u00ecnh r\u00e8n luy\u1ec7n v\u00e0 h\u1ecdc t\u1eadp.'
    ]
  },
  {
    title: '4. Hi\u1ec7u tr\u01b0\u1edfng',
    lines: [
      'Ph\u00ea duy\u1ec7t H\u1ecdc b\u1ea1 c\u1ee7a h\u1ecdc sinh khi k\u1ebft th\u00fac n\u0103m h\u1ecdc.',
      'Ki\u1ec3m tra vi\u1ec7c qu\u1ea3n l\u00fd, b\u1ea3o qu\u1ea3n, ghi H\u1ecdc b\u1ea1.'
    ]
  }
];

const TRANSCRIPT_SUBJECTS = [
  { label: 'Ng\u1eef v\u0103n', scorePage: 0, teacherSubject: 'Ng\u1eef V\u0103n' },
  { label: 'To\u00e1n', scorePage: 1, teacherSubject: 'To\u00e1n' },
  { label: 'Ngo\u1ea1i ng\u1eef 1\nTi\u1ebfng Anh', scorePage: 2, teacherSubject: 'Ti\u1ebfng Anh' },
  { label: 'GDCD', scorePage: 3, teacherSubject: 'Gi\u00e1o d\u1ee5c c\u00f4ng d\u00e2n' },
  { label: 'L\u1ecbch s\u1eed v\u00e0 \u0111\u1ecba l\u00fd', scorePage: 4, teacherSubject: 'L\u1ecbch s\u1eed & \u0110\u1ecba L\u00fd' },
  { label: 'Khoa h\u1ecdc T\u1ef1 nhi\u00ean', scorePage: 5, teacherSubject: 'Khoa h\u1ecdc t\u1ef1 nhi\u00ean' },
  { label: 'C\u00f4ng ngh\u1ec7', scorePage: 6, teacherSubject: 'C\u00f4ng ngh\u1ec7' },
  { label: 'Tin h\u1ecdc', scorePage: 7, teacherSubject: 'Tin h\u1ecdc' },
  { label: 'Gi\u00e1o d\u1ee5c th\u1ec3 ch\u1ea5t', reviewPage: 0, teacherSubject: 'Gi\u00e1o d\u1ee5c th\u1ec3 ch\u1ea5t' },
  { label: 'Ngh\u1ec7 thu\u1eadt', reviewPage: 1, teacherSubject: 'Ngh\u1ec7 thu\u1eadt' },
  { label: 'H\u0110TT', reviewPage: 2, teacherSubject: 'H\u0110TT' },
  { label: 'GD\u0110P', reviewPage: 3, teacherSubject: 'Gi\u00e1o d\u1ee5c \u0111\u1ecba ph\u01b0\u01a1ng' },
  { label: 'Ti\u1ebfng d\u00e2n t\u1ed9c thi\u1ec3u\ns\u1ed1' },
  { label: 'Ngo\u1ea1i ng\u1eef 2' }
];

const GUIDE_TITLE = 'H\u01af\u1edaNG D\u1eaaN S\u1eec D\u1ee4NG S\u1ed4 THEO D\u00d5I V\u00c0 \u0110\u00c1NH GI\u00c1 H\u1eccC SINH';
const GUIDE_PARAGRAPHS = [
  '1. S\u1ed5 theo d\u00f5i v\u00e0 \u0111\u00e1nh gi\u00e1 h\u1ecdc sinh (theo l\u1edbp h\u1ecdc) \u0111\u01b0\u1ee3c quy \u0111\u1ecbnh t\u1ea1i \u0110i\u1ec1u l\u1ec7 tr\u01b0\u1eddng trung h\u1ecdc c\u01a1 s\u1edf, tr\u01b0\u1eddng trung h\u1ecdc ph\u1ed5 th\u00f4ng v\u00e0 tr\u01b0\u1eddng ph\u1ed5 th\u00f4ng c\u00f3 nhi\u1ec1u c\u1ea5p h\u1ecdc.',
  '2. S\u1ed5 theo d\u00f5i v\u00e0 \u0111\u00e1nh gi\u00e1 h\u1ecdc sinh (theo l\u1edbp h\u1ecdc) do nh\u00e0 tr\u01b0\u1eddng qu\u1ea3n l\u00fd v\u00e0 s\u1eed d\u1ee5ng.',
  '3. Gi\u00e1o vi\u00ean m\u00f4n h\u1ecdc tr\u1ef1c ti\u1ebfp ghi v\u00e0o S\u1ed5 theo d\u00f5i v\u00e0 \u0111\u00e1nh gi\u00e1 h\u1ecdc sinh (theo l\u1edbp h\u1ecdc) \u0111\u1ea7y \u0111\u1ee7 c\u00e1c th\u00f4ng tin c\u1ea7n thi\u1ebft c\u1ee7a m\u00f4n h\u1ecdc do gi\u00e1o vi\u00ean ph\u1ee5 tr\u00e1ch, kh\u1edbp v\u1edbi c\u00e1c th\u00f4ng tin trong S\u1ed5 theo d\u00f5i v\u00e0 \u0111\u00e1nh gi\u00e1 h\u1ecdc sinh (c\u1ee7a gi\u00e1o vi\u00ean), k\u00ed t\u00ean v\u00e0 ghi r\u00f5 h\u1ecd t\u00ean v\u00e0o cu\u1ed1i danh s\u00e1ch h\u1ecdc sinh \u0111\u1ed1i v\u1edbi t\u1eebng m\u00f4n h\u1ecdc. Tr\u01b0\u1eddng h\u1ee3p c\u00f3 nhi\u1ec1u gi\u00e1o vi\u00ean c\u00f9ng tham gia d\u1ea1y h\u1ecdc th\u00ec c\u00e1c gi\u00e1o vi\u00ean m\u00f4n h\u1ecdc c\u00f9ng k\u00ed t\u00ean v\u00e0 ghi r\u00f5 h\u1ecd t\u00ean v\u00e0o cu\u1ed1i danh s\u00e1ch h\u1ecdc sinh \u0111\u1ed1i v\u1edbi t\u1eebng m\u00f4n h\u1ecdc.',
  'Gi\u00e1o vi\u00ean ch\u1ee7 nhi\u1ec7m tr\u1ef1c ti\u1ebfp ghi v\u00e0o S\u1ed5 theo d\u00f5i v\u00e0 \u0111\u00e1nh gi\u00e1 h\u1ecdc sinh (theo l\u1edbp h\u1ecdc) nh\u1eefng th\u00f4ng tin thu\u1ed9c nhi\u1ec7m v\u1ee5 quy \u0111\u1ecbnh cho gi\u00e1o vi\u00ean ch\u1ee7 nhi\u1ec7m l\u1edbp.',
  '4. Kh\u00f4ng ghi b\u1eb1ng m\u1ef1c \u0111\u1ecf (tr\u1eeb tr\u01b0\u1eddng h\u1ee3p s\u1eeda ch\u1eefa), c\u00e1c lo\u1ea1i m\u1ef1c c\u00f3 th\u1ec3 t\u1ea9y x\u00f3a \u0111\u01b0\u1ee3c; vi\u1ec7c ghi S\u1ed5 theo d\u00f5i v\u00e0 \u0111\u00e1nh gi\u00e1 h\u1ecdc sinh (theo l\u1edbp h\u1ecdc) ph\u1ea3i c\u1eadp nh\u1eadt \u0111\u00fang ti\u1ebfn \u0111\u1ed9 th\u1eddi gian k\u1ebf ho\u1ea1ch d\u1ea1y h\u1ecdc v\u00e0 gi\u00e1o d\u1ee5c c\u1ee7a t\u1ed5 chuy\u00ean m\u00f4n v\u00e0 b\u1ea3o qu\u1ea3n, gi\u1eef g\u00ecn c\u1ea9n th\u1eadn, s\u1ea1ch s\u1ebd.',
  '5. Khi s\u1eeda ch\u1eefa d\u00f9ng b\u00fat \u0111\u1ecf g\u1ea1ch ngang n\u1ed9i dung c\u0169, ghi n\u1ed9i dung m\u1edbi v\u00e0o ph\u00eda tr\u00ean b\u00ean ph\u1ea3i v\u1ecb tr\u00ed ghi n\u1ed9i dung c\u0169, k\u00fd x\u00e1c nh\u1eadn v\u00e0 s\u1ef1 s\u1eeda ch\u1eefa \u1edf ngay c\u1ea1nh ho\u1eb7c \u1edf c\u1ed9t Ghi ch\u00fa.',
  '6. Nh\u00e0 tr\u01b0\u1eddng, gi\u00e1o vi\u00ean ch\u1ee7 nhi\u1ec7m l\u1edbp, gi\u00e1o vi\u00ean m\u00f4n h\u1ecdc ch\u1ec9 cung c\u1ea5p c\u00e1c th\u00f4ng tin v\u1ec1 k\u1ebft qu\u1ea3 r\u00e8n luy\u1ec7n v\u00e0 h\u1ecdc t\u1eadp c\u1ee7a h\u1ecdc sinh trong S\u1ed5 theo d\u00f5i v\u00e0 \u0111\u00e1nh gi\u00e1 h\u1ecdc sinh (theo l\u1edbp h\u1ecdc) cho ri\u00eang t\u1eebng h\u1ecdc sinh ho\u1eb7c cha m\u1eb9 h\u1ecdc sinh.'
];

const HKI_REVIEW_SUBJECTS = [
  { title: 'Môn Giáo dục thể chất', loadStudents: false, teacherKeys: ['GDTC', 'Giáo dục thể chất'] },
  { title: 'Môn Nghệ thuật', loadStudents: false, teacherKeys: ['Nghệ thuật', 'NT (AN)', 'NT (MT)', 'Âm nhạc', 'Mĩ thuật', 'Mỹ thuật'] },
  { title: 'Môn Hoạt động tập thể', loadStudents: true, classSubject: 'HĐTT', teacherKeys: ['HĐTT', 'HDTT', 'Hoạt động tập thể'] },
  { title: 'Môn Nội dung giáo dục địa phương', loadStudents: true, classSubject: 'Giáo dục địa phương', teacherKeys: ['Giáo dục địa phương', 'GDĐP', 'GDDP', 'Nội dung giáo dục địa phương'] }
];

const HKI_REVIEW_ROW_COUNT = 40;

const HKI_SCORE_SUBJECTS = [
  { title: 'Môn Ngữ văn', classSubject: 'Ngữ Văn', teacherKeys: ['Ngữ Văn', 'Ngữ văn', 'Văn'] },
  { title: 'Môn Toán', classSubject: 'Toán', teacherKeys: ['Toán'] },
  { title: 'Môn Ngoại ngữ\nTiếng Anh', teacherKeys: ['Tiếng Anh', 'Ngoại ngữ'], loadStudents: false, loadTeacher: false },
  { title: 'Môn GDCD', classSubject: 'Giáo dục công dân', teacherKeys: ['GDCD', 'Giáo dục công dân'] },
  { title: 'Môn Lịch sử và địa lý', classSubject: 'Lịch sử & Địa Lý', teacherKeys: ['Lịch sử & Địa Lý', 'Lịch sử và địa lý', 'LS&ĐL'] },
  { title: 'Môn Khoa học Tự nhiên', classSubject: 'Khoa học tự nhiên', teacherKeys: ['Khoa học tự nhiên', 'Khoa học Tự nhiên', 'KHTN'] },
  { title: 'Môn Công nghệ', classSubject: 'Công nghệ', teacherKeys: ['Công nghệ'] },
  { title: 'Môn Tin học', teacherKeys: ['Tin học'], loadStudents: false, loadTeacher: false }
];

const HKI_SCORE_ROW_COUNT = 40;

const HKI_SUMMARY_ROW_COUNT = 40;
const CLASSIFICATION_ROW_COUNT = 40;
const HKI_SUMMARY_REVIEW_COLUMNS = [
  { label: 'Giáo dục\nthể chất', sourcePage: null },
  { label: 'Nghệ\nthuật', sourcePage: null },
  { label: 'HĐTT', sourcePage: 2 },
  { label: 'GDĐP', sourcePage: 3 }
];
const HKI_SUMMARY_SCORE_COLUMNS = [
  { label: 'Ngữ văn', sourcePage: 0, academic: true },
  { label: 'Toán', sourcePage: 1, academic: true },
  { label: 'Ngoại\nngữ 1', sourcePage: null, academic: false },
  { label: 'Giáo dục\ncông dân', sourcePage: 3, academic: true },
  { label: 'Lịch sử\nvà địa lý', sourcePage: 4, academic: true },
  { label: 'Khoa\nhọc Tự\nnhiên', sourcePage: 5, academic: true },
  { label: 'Công\nnghệ', sourcePage: 6, academic: true },
  { label: 'Tin học', sourcePage: 7, academic: false }
];

const CLASS_TEACHER_SUBJECTS = [
  'Toán',
  'Ngữ Văn',
  'Khoa học tự nhiên',
  'Lịch sử & Địa Lý',
  'Giáo dục công dân',
  'Giáo dục địa phương',
  'Công nghệ',
  'HĐTT',
  'Chủ nhiệm'
];

const getClassLabel = (grade) => {
  const text = String(grade || '').trim();
  const cleaned = text
    .replace(/^khối\s*/i, '')
    .replace(/^lớp\s*/i, '')
    .replace(/\s*PC$/i, '')
    .trim();
  const gradeText = cleaned.match(/(?:^|\D)(1[0-2]|[1-9])(?:\D|$)/)?.[1] || cleaned || '9';
  return `LỚP ${gradeText}PC`;
};

const getPcClassName = (value, fallback = '9') => getClassLabel(value || fallback).replace('LỚP ', '');

const getGradeFromClass = (className = '') => {
  const match = String(className || '').trim().match(/(?:^|\D)(1[0-2]|[1-9])(?:\D|$)/);
  return match ? match[1] : '';
};

const joinClean = (items = [], separator = ' ') => items.map(item => String(item || '').trim()).filter(Boolean).join(separator);

const formatGender = (value = '') => {
  const text = String(value || '').trim();
  if (/^nữ$|nu/i.test(text)) return 'Nữ';
  if (/^nam$/i.test(text)) return 'Nam';
  return text;
};

const getSchoolYearStartYear = (schoolYear = '') => {
  const match = String(schoolYear || '').match(/\d{4}/);
  return match ? Number(match[0]) : new Date().getFullYear();
};

const schoolYearLabelFromStart = (startYear) => `${startYear} - ${startYear + 1}`;
const compactSchoolYearLabel = (schoolYear = '') => String(schoolYear || '').replace(/\s*-\s*/g, '-');
const TRANSCRIPT_DIGITAL_START_YEAR = 2025;

const pad2 = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseDateValue = (value = '') => {
  const text = String(value || '').trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  const viMatch = text.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
  if (viMatch) return new Date(Number(viMatch[3]), Number(viMatch[2]) - 1, Number(viMatch[1]));
  return null;
};

const stableTextIndex = (seed = '', length = 1) => {
  const size = Math.max(1, Number(length) || 1);
  let hash = 0;
  for (let index = 0; index < String(seed || '').length; index += 1) {
    hash = ((hash * 31) + String(seed || '').charCodeAt(index)) >>> 0;
  }
  return hash % size;
};

const formatHomeroomCommentLines = (text = '') => (
  String(text || '')
    .split(/(?<=\.)\s+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `- ${line}`)
    .join('\n')
);

const getStudentAgeAtSchoolYearEnd = (student = {}, schoolYearLabel = '') => {
  const birthDate = parseDateValue(student.birthDate || student.dateOfBirth || student.ngaySinh || '');
  if (!birthDate) return null;
  const endYear = getSchoolYearStartYear(schoolYearLabel) + 1;
  const endDate = new Date(endYear, 4, 31);
  let age = endDate.getFullYear() - birthDate.getFullYear();
  const birthdayThisYear = new Date(endDate.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  if (endDate < birthdayThisYear) age -= 1;
  return age;
};

const HOMEROOM_COMMENT_BANK = {
  adult: {
    pass: [
      'Học viên học tập nghiêm túc, kết quả đạt yêu cầu. Cần tiếp tục ôn luyện để củng cố kiến thức.',
      'Học viên có ý thức học tập, chấp hành nội quy. Cần rèn thêm kỹ năng làm bài.',
      'Học viên có nhiều cố gắng, tham gia học tập tương đối đầy đủ. Kết quả đạt yêu cầu.',
      'Học viên biết khắc phục khó khăn để theo học. Cần chủ động hơn trong việc tự học.',
      'Học viên có thái độ chín chắn, hòa nhã. Cần tiếp tục ôn tập để tiến bộ hơn.'
    ],
    good: [
      'Học viên học tập nghiêm túc, kết quả khá. Cần duy trì tinh thần tự học để tiến bộ hơn.',
      'Học viên có ý thức tốt, tiếp thu bài khá. Cần phát huy tinh thần học tập hiện có.',
      'Học viên có nhiều cố gắng, hoàn thành tốt yêu cầu học tập. Cần tiếp tục rèn luyện thêm.',
      'Học viên chấp hành tốt nội quy, kết quả học tập khá. Mong tiếp tục giữ vững phong độ.',
      'Học viên có tinh thần trách nhiệm với việc học, kết quả khá. Cần phát huy hơn nữa.'
    ]
  },
  young: {
    pass: [
      'Có ý thức học tập, kết quả đạt yêu cầu. Cần cố gắng hơn trong việc ôn bài.',
      'Có tinh thần cố gắng, tiếp thu bài ở mức đạt. Cần mạnh dạn hơn khi trao đổi bài.',
      'Chấp hành tốt nội quy, thái độ học tập tương đối tốt. Cần rèn thêm kỹ năng làm bài.',
      'Hoàn thành cơ bản nhiệm vụ học tập. Cần chủ động hơn trong tự học và ôn luyện.',
      'Có tinh thần cầu tiến, biết tiếp thu góp ý. Cần tích cực hơn trong học tập.'
    ],
    good: [
      'Có ý thức học tập tốt, kết quả khá. Cần tiếp tục phát huy tinh thần tự học.',
      'Học tập nghiêm túc, tiếp thu bài khá. Mong tiếp tục duy trì sự cố gắng.',
      'Chấp hành tốt nội quy, hoàn thành tốt yêu cầu học tập. Cần rèn thêm kỹ năng vận dụng.',
      'Có tinh thần học hỏi, kết quả học tập khá. Cần mạnh dạn trao đổi bài nhiều hơn.',
      'Có tiến bộ rõ trong học tập, kết quả khá. Cần tiếp tục duy trì nề nếp học tập.'
    ]
  },
  minor: {
    pass: [
      'Em có ý thức học tập, kết quả đạt yêu cầu. Cần chăm chỉ ôn bài hơn.',
      'Em tiếp thu bài ở mức đạt. Cần luyện tập thêm để tiến bộ hơn.',
      'Em chấp hành tốt nội quy, hòa đồng với bạn bè. Cần cố gắng hơn trong học tập.',
      'Em hoàn thành cơ bản nhiệm vụ học tập. Cần rèn thêm tính cẩn thận khi làm bài.',
      'Em có tinh thần học hỏi, tuy còn chậm nhưng biết cố gắng.'
    ],
    good: [
      'Em có ý thức học tập tốt, kết quả khá. Cần tiếp tục phát huy.',
      'Em học tập nghiêm túc, tiếp thu bài khá. Cần duy trì nề nếp học tập.',
      'Em hoàn thành tốt nhiệm vụ học tập, hòa đồng với bạn bè. Cần luyện tập thêm để tiến bộ hơn.',
      'Em có nhiều cố gắng và đạt kết quả khá. Cần mạnh dạn phát biểu hơn.',
      'Em có tinh thần học hỏi, kết quả học tập khá. Mong em tiếp tục cố gắng.'
    ]
  }
};

const getHomeroomCommentFallback = (student = {}, academicResult = '', schoolYearLabel = '') => {
  const age = getStudentAgeAtSchoolYearEnd(student, schoolYearLabel);
  const ageGroup = age !== null && age < 18 ? 'minor' : age !== null && age <= 27 ? 'young' : 'adult';
  const resultKey = /khá|kha|tốt|tot/i.test(String(academicResult || '')) ? 'good' : 'pass';
  const options = HOMEROOM_COMMENT_BANK[ageGroup]?.[resultKey] || HOMEROOM_COMMENT_BANK.young.pass;
  const seed = `${student.id || ''}|${student.fullName || ''}|${student.birthDate || ''}|${schoolYearLabel}|${academicResult}`;
  return formatHomeroomCommentLines(options[stableTextIndex(seed, options.length)] || '');
};

const addDaysToDateKey = (dateKey, days) => {
  const date = parseDateValue(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

const nthWeekdayOfMonth = (year, month, weekday, nth) => {
  const date = new Date(year, month - 1, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (nth - 1) * 7);
  return toDateKey(date);
};

const lastWeekdayOfMonth = (year, month, weekday) => {
  const date = new Date(year, month, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return toDateKey(date);
};

const formatSignatureDateText = (value = '') => {
  const parsed = parseDateValue(value);
  if (!parsed) return String(value || '');
  return `Trung Mỹ Tây, ngày ${pad2(parsed.getDate())} tháng ${parsed.getMonth() + 1} năm ${parsed.getFullYear()}`;
};

const parseScoreNumber = (value) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

const formatScoreNumber = (value) => {
  if (!Number.isFinite(value)) return '';
  return (Math.round(value * 10) / 10).toFixed(1);
};
const formatScoreDisplayValue = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const parsed = parseScoreNumber(text);
  return parsed === null ? text : formatScoreNumber(parsed);
};
const normalizeScoreInput = (value = '') => {
  const normalized = String(value || '').replace(/\u00a0/g, ' ').trim();
  if (!normalized) return '';
  const parsed = parseScoreNumber(normalized);
  if (parsed === null) return normalized;
  return formatScoreNumber(Math.min(10, Math.max(0, parsed)));
};

const weekdayShortVi = (date) => {
  const day = date.getDay();
  if (day === 0) return 'CN';
  return String(day + 1);
};

const normalizeSortText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .trim();

const normalizeSubjectKey = (value = '') => normalizeSortText(value).replace(/[^a-z0-9]/g, '');

const splitTeacherSubjects = (value = '') => String(value || '')
  .split(/\s*(?:,|;|\n|\+|\/)\s*/)
  .map(item => item.trim())
  .filter(Boolean);

const getGivenNameSortKey = (fullName = '') => {
  const parts = normalizeSortText(fullName).split(/\s+/).filter(Boolean);
  return `${parts[parts.length - 1] || ''} ${parts.join(' ')}`;
};

const titleCaseText = (value = '') => {
  const text = String(value || '').trim().toLocaleLowerCase('vi');
  return text.replace(/(^|[\s/.-])(\p{L})/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('vi')}`);
};

const compactAdministrativeText = (value = '', targetLength = 72) => {
  const steps = [
    [/Khu\s*phố/giu, 'KP.'],
    [/Phường/giu, 'P.'],
    [/Thành\s*phố/giu, 'TP.'],
    [/Hồ\s*Chí\s*Minh/giu, 'HCM'],
    [/Thị\s*trấn/giu, 'TT.'],
    [/Quận/giu, 'Q.'],
    [/Huyện/giu, 'H.'],
    [/Xã/giu, 'X.'],
    [/Đường/giu, 'Đ.']
  ];
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= targetLength) return text;
  for (const [pattern, replacement] of steps) {
    text = text.replace(pattern, replacement).replace(/\s+/g, ' ').trim();
    if (text.length <= targetLength) return text;
  }
  return text;
};

const fitSingleLineFontSize = (value = '', baseSize = 18.5, minSize = 11.5, comfortableLength = 58) => {
  const length = String(value || '').length;
  if (length <= comfortableLength) return baseSize;
  return Math.max(minSize, Math.round((baseSize - ((length - comfortableLength) * 0.2)) * 10) / 10);
};

const fitTeacherSignatureFontSize = (value = '') => {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean).length;
  const length = String(value || '').trim().length;
  if (words >= 6 || length > 30) return 12.4;
  if (words >= 5 || length > 24) return 13.4;
  if (words >= 4 || length > 19) return 14.4;
  return 16;
};

const sentenceCaseText = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return '';
  const lower = text.toLocaleLowerCase('vi');
  return lower.charAt(0).toLocaleUpperCase('vi') + lower.slice(1);
};

const columnLabel = (index) => {
  let label = '';
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

const colorToCss = (value) => {
  if (!value || typeof value !== 'string') return '';
  const color = value.replace('#', '').trim();
  if (!color || color === '00000000' || color === 'FFFFFFFF') return '';
  if (color.length === 8 && color.slice(0, 2) === '00') return '';
  const rgb = color.length === 8 ? color.slice(2) : color;
  return rgb.length === 6 ? `#${rgb}` : '';
};

const getCellValue = (cell) => {
  if (!cell) return '';
  if (cell.v !== undefined && cell.v !== null) return String(cell.v);
  if (cell.f) return String(cell.f);
  return '';
};

const buildSheetMaps = (sheet) => {
  const cellMap = new Map();
  const mergeMap = new Map();
  const covered = new Set();

  (sheet.cells || []).forEach((cell) => {
    cellMap.set(`${cell.r}:${cell.c}`, cell);
  });

  (sheet.merges || []).forEach((merge) => {
    mergeMap.set(`${merge.r}:${merge.c}`, merge);
    for (let row = merge.r; row < merge.r + merge.rs; row += 1) {
      for (let col = merge.c; col < merge.c + merge.cs; col += 1) {
        if (row !== merge.r || col !== merge.c) covered.add(`${row}:${col}`);
      }
    }
  });

  return { cellMap, mergeMap, covered };
};

const makeRange = (start, end) => Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);

const splitByBreaks = (total, breaks = [], desiredParts = 1) => {
  const validBreaks = [...new Set((breaks || []).filter((item) => item > 0 && item < total))].sort((a, b) => a - b);
  if (validBreaks.length > 0) {
    let start = 1;
    const parts = validBreaks.map((breakPoint) => {
      const part = [start, breakPoint];
      start = breakPoint + 1;
      return part;
    });
    if (start <= total) parts.push([start, total]);
    return parts;
  }

  const count = Math.max(1, desiredParts || 1);
  const size = Math.ceil(total / count);
  return Array.from({ length: count }, (_, index) => {
    const start = index * size + 1;
    return [start, Math.min(total, start + size - 1)];
  }).filter(([start]) => start <= total);
};

const buildPageSegments = (sheet) => {
  const blankPages = Math.max(0, Number(sheet.blankPages) || 0);
  const contentPages = Math.max(1, Number(sheet.contentPages || sheet.pageCount || 1) - blankPages);
  const colParts = splitByBreaks(sheet.cols || 1, sheet.colBreaks || [], 1);
  const desiredRowParts = Math.max(1, Math.ceil(contentPages / Math.max(1, colParts.length)));
  const rowParts = splitByBreaks(sheet.rows || 1, sheet.rowBreaks || [], desiredRowParts);
  const pages = [];

  rowParts.forEach(([rowStart, rowEnd]) => {
    colParts.forEach(([colStart, colEnd]) => {
      if (pages.length < contentPages) {
        pages.push({ rowStart, rowEnd, colStart, colEnd, blank: false });
      }
    });
  });

  while (pages.length < contentPages) {
    pages.push({ rowStart: 1, rowEnd: sheet.rows || 1, colStart: 1, colEnd: sheet.cols || 1, blank: false });
  }
  for (let index = 0; index < blankPages; index += 1) {
    pages.push({ blank: true });
  }
  return pages;
};

const styleFromCell = (cell, rowHeight) => {
  const style = cell?.s || {};
  const horizontalAlign = ['left', 'center', 'right', 'justify'].includes(style.align) ? style.align : 'left';
  const verticalAlign = style.valign === 'center' ? 'middle' : (style.valign || 'middle');
  const css = {
    minWidth: 22,
    height: rowHeight || 22,
    fontWeight: style.bold ? 800 : 500,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontFamily: '"Times New Roman", Times, serif',
    fontSize: style.fontSize ? `${Math.max(8, Math.min(Number(style.fontSize), 28))}px` : '12px',
    textAlign: horizontalAlign,
    verticalAlign,
    color: colorToCss(style.color) || '#111827',
    backgroundColor: colorToCss(style.fill) || '#ffffff',
    whiteSpace: style.wrap ? 'pre-wrap' : 'pre-line'
  };

  if (style.border) {
    css.borderColor = '#64748b';
    css.borderWidth = '1px';
  }

  if (Number(style.rotate) === 90) {
    css.writingMode = 'vertical-rl';
    css.textOrientation = 'mixed';
    css.textAlign = 'center';
  }

  return css;
};

function ScorebookCell({ cell, editValue, originalValue, rowHeight, rowSpan, colSpan, onCommit }) {
  const ref = useRef(null);
  const value = decodeDisplayText(editValue ?? originalValue);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  return (
    <td
      rowSpan={rowSpan}
      colSpan={colSpan}
      className="scorebook-cell border border-slate-300 p-0 align-middle"
      style={styleFromCell(cell, rowHeight)}
    >
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        className="min-h-full w-full px-1 py-0.5 outline-none focus:bg-amber-50 focus:ring-2 focus:ring-amber-300 print:ring-0"
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData?.getData('text/plain') || '';
          document.execCommand('insertText', false, text);
        }}
        onBlur={(event) => onCommit(event.currentTarget.textContent || '')}
      >
        {value}
      </div>
    </td>
  );
}

function EditableText({ value, onCommit, className = '', style = {}, as: Tag = 'div' }) {
  const ref = useRef(null);
  const displayValue = decodeDisplayText(value);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== displayValue) {
      ref.current.textContent = displayValue;
    }
  }, [displayValue]);

  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className={`${className} outline-none focus:bg-amber-50 focus:ring-2 focus:ring-amber-300 print:ring-0`}
      style={style}
      onPaste={(event) => {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
      }}
      onBlur={(event) => onCommit(event.currentTarget.textContent || '')}
    >
      {displayValue}
    </Tag>
  );
}

function TranscriptStudentPhoto({ url, alt = 'Ảnh học sinh' }) {
  const [fallbackMode, setFallbackMode] = useState(false);
  const imageUrl = normalizeImageUrl(url);
  const embedUrl = getDriveEmbedUrl(url);
  const frameStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center center',
    display: 'block',
    background: '#fff'
  };

  if (!imageUrl) return 'Ảnh 3 x 4 cm';
  if (fallbackMode && embedUrl) {
    return (
      <iframe
        title={alt}
        src={embedUrl}
        style={{ ...frameStyle, border: 0, pointerEvents: 'none' }}
        loading="lazy"
      />
    );
  }
  if (fallbackMode) return 'Ảnh 3 x 4 cm';
  return (
    <img
      src={imageUrl}
      alt={alt}
      onError={() => setFallbackMode(true)}
      referrerPolicy="no-referrer"
      style={{ ...frameStyle, transform: 'scale(1.035)' }}
    />
  );
}

function TeacherSignatureImage({ url, alt = 'Chu ky giao vien', style = {} }) {
  const [hidden, setHidden] = useState(false);
  const imageUrl = normalizeImageUrl(url);

  useEffect(() => {
    setHidden(false);
  }, [imageUrl]);

  if (!imageUrl || hidden) return null;
  return (
    <img
      src={imageUrl}
      alt={alt}
      onError={() => setHidden(true)}
      referrerPolicy="no-referrer"
      style={{
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        display: 'block',
        margin: '0 auto',
        mixBlendMode: 'multiply',
        ...style
      }}
    />
  );
}

export default function ScorebookWorkspace({
  grade,
  initialMode = 'scorebook',
  currentSchoolYear,
  principalName = '',
  transcriptStartDates = {},
  transcriptEndDates = {},
  transcriptGrade9EndDates = {},
  transcriptStartSigners = {},
  transcriptEndSigners = {},
  nanTeachers = [],
  teachingAssignments = {},
  classTeacherAssignments = {},
  students = [],
  user,
  onSaveSetting,
  onGradeChange,
  onClose,
  showNotification
}) {
  const sheets = scorebookTemplate.sheets || [];
  const workbookSheets = useMemo(() => {
    const fullYearCoverSheet = {
      name: 'BiaPhanGhiDiem_CaNam',
      label: 'Bìa cả năm',
      rows: 1,
      cols: 1,
      pageCount: 1,
      contentPages: 1,
      blankPages: 0
    };
    if (sheets.some(sheet => sheet.name === fullYearCoverSheet.name)) return sheets;
    const insertIndex = sheets.findIndex(sheet => sheet.name === 'TongHopCaNam');
    if (insertIndex < 0) return [...sheets, fullYearCoverSheet];
    return [
      ...sheets.slice(0, insertIndex),
      fullYearCoverSheet,
      ...sheets.slice(insertIndex)
    ];
  }, [sheets]);
  const defaultSheet = workbookSheets.find((sheet) => sheet.name === PREFERRED_START_SHEET)?.name || workbookSheets[0]?.name || '';
  const [activeSheetName, setActiveSheetName] = useState(defaultSheet);
  const [edits, setEdits] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [columnWidthsBySheet, setColumnWidthsBySheet] = useState({});
  const showHeaders = false;
  const [previewMode, setPreviewMode] = useState(false);
  const [printMode, setPrintMode] = useState('all');
  const [printPageIndex, setPrintPageIndex] = useState(0);
  const [showTeacherPanel, setShowTeacherPanel] = useState(false);
  const [showTranscriptPrintPanel, setShowTranscriptPrintPanel] = useState(false);
  const [transcriptBlankSignatureMode, setTranscriptBlankSignatureMode] = useState(false);
  const [transcriptPrintDraft, setTranscriptPrintDraft] = useState({ includeCover: true, mode: 'all', year: '', duplexBlank: true });
  const [transcriptPrintSelection, setTranscriptPrintSelection] = useState(null);
  const [transcriptPrintStudentIds, setTranscriptPrintStudentIds] = useState([]);
  const [teacherPanelDraft, setTeacherPanelDraft] = useState({});
  const [scorebookEditsByYearGrade, setScorebookEditsByYearGrade] = useState({});
  const [attendanceDocs, setAttendanceDocs] = useState([]);
  const [workspaceMode, setWorkspaceMode] = useState(initialMode);
  const [transcriptStudentId, setTranscriptStudentId] = useState('');
  const [transcriptStudentSearch, setTranscriptStudentSearch] = useState('');

  useEffect(() => {
    const nextMode = initialMode === 'transcript' ? 'transcript' : 'scorebook';
    setWorkspaceMode(nextMode);
    setPreviewMode(false);
    if (nextMode === 'scorebook') {
      setShowTranscriptPrintPanel(false);
    }
  }, [initialMode]);

  const docId = useMemo(() => cleanDocId(`${currentSchoolYear || 'nam-hoc'}_${scorebookTemplate.sourceFile || 'so-diem'}_khoi_${grade || 'tat-ca'}`), [currentSchoolYear, grade]);
  const activeSheet = workbookSheets.find((sheet) => sheet.name === activeSheetName) || workbookSheets[0] || { name: '', label: '', rows: 0, cols: 0 };
  const sheetMaps = useMemo(() => buildSheetMaps(activeSheet || {}), [activeSheet]);
  const currentSchoolYearKey = compactSchoolYearLabel(currentSchoolYear);
  const legacyTeacherYearKey = compactSchoolYearLabel(schoolYearLabelFromStart(TRANSCRIPT_DIGITAL_START_YEAR));
  const getTeacherAssignmentsForYearGrade = (schoolYearLabel = currentSchoolYear, gradeValue = grade) => {
    const byYear = classTeacherAssignments?.byYear;
    const schoolYearKey = compactSchoolYearLabel(schoolYearLabel);
    if (byYear && byYear[schoolYearKey]?.[String(gradeValue)]) return byYear[schoolYearKey][String(gradeValue)];
    if (!byYear && schoolYearKey === legacyTeacherYearKey) return classTeacherAssignments?.[String(gradeValue)] || {};
    return {};
  };

  useEffect(() => {
    if (!docId) return undefined;
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', docId);
    return onSnapshot(ref, (snapshot) => {
      if (!snapshot.exists()) {
        setEdits({});
        setColumnWidthsBySheet({});
        setLastSavedAt(null);
        setIsDirty(false);
        return;
      }
      const data = snapshot.data() || {};
      setEdits(data.edits || {});
      setColumnWidthsBySheet(data.columnWidths || {});
      setLastSavedAt(data.updatedAt || null);
      setIsDirty(false);
    }, () => {
      showNotification?.('Chưa tải được dữ liệu sổ điểm đã lưu.', 'error');
    });
  }, [docId, showNotification]);

  useEffect(() => {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'scorebooks');
    return onSnapshot(ref, (snapshot) => {
      const nextMap = {};
      snapshot.docs.forEach((item) => {
        const data = item.data() || {};
        if (String(data.sourceFile || '') !== String(scorebookTemplate.sourceFile || '')) return;
        const gradeKey = String(data.grade || '').trim();
        const schoolYearKey = compactSchoolYearLabel(data.schoolYear || '');
        if (!gradeKey || !schoolYearKey) return;
        const mapKey = `${schoolYearKey}__${gradeKey}`;
        const existing = nextMap[mapKey];
        if (!existing || Number(data.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
          nextMap[mapKey] = { edits: data.edits || {}, updatedAt: Number(data.updatedAt || 0) };
        }
      });
      setScorebookEditsByYearGrade(nextMap);
    }, () => {
      showNotification?.('Chưa tải đủ dữ liệu sổ điểm liên năm cho học bạ.', 'error');
    });
  }, [showNotification]);

  useEffect(() => {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'class_attendance');
    return onSnapshot(ref, (snapshot) => {
      setAttendanceDocs(snapshot.docs
        .map(item => ({ id: item.id, ...item.data() })));
    }, () => {
      showNotification?.('Chưa tải được dữ liệu điểm danh.', 'error');
    });
  }, [showNotification]);

  useEffect(() => {
    setPrintPageIndex(0);
    setPrintMode('all');
  }, [activeSheetName]);

  useEffect(() => {
    if (showTeacherPanel) {
      setTeacherPanelDraft(getTeacherAssignmentsForYearGrade(currentSchoolYear, grade));
    }
  }, [showTeacherPanel, classTeacherAssignments, grade, currentSchoolYear]);

  const commitCell = (row, col, originalValue, nextValue) => {
    const normalized = String(nextValue || '').replace(/\u00a0/g, ' ').trimEnd();
    const key = makeCellKey(activeSheet.name, row, col);
    setEdits((prev) => {
      const next = { ...prev };
      if (normalized === String(originalValue || '')) delete next[key];
      else next[key] = normalized;
      return next;
    });
    setIsDirty(true);
  };

  const commitCustomText = (key, originalValue, nextValue) => {
    const isScoreInput = /Score:\d+:r\d+:s\d+$/.test(String(key || ''));
    const normalized = isScoreInput
      ? normalizeScoreInput(nextValue)
      : String(nextValue || '').replace(/\u00a0/g, ' ').trimEnd();
    const editKey = `custom:${key}`;
    setEdits((prev) => {
      const next = { ...prev };
      if (normalized === String(originalValue || '')) delete next[editKey];
      else next[editKey] = normalized;
      return next;
    });
    setIsDirty(true);
  };

  const customText = (key, fallback) => decodeDisplayText(edits[`custom:${key}`] ?? fallback);
  const customTextOrFallback = (key, fallback) => {
    const value = edits[`custom:${key}`];
    if (String(value || '').trim() === '' && String(fallback || '').trim()) return decodeDisplayText(fallback);
    return decodeDisplayText(value ?? fallback);
  };

  const saveScorebook = async () => {
    if (!user) {
      showNotification?.('Chưa có phiên đăng nhập để lưu sổ điểm.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', docId), {
        grade: String(grade || ''),
        schoolYear: currentSchoolYear || '',
        sourceFile: scorebookTemplate.sourceFile || '',
        edits,
        columnWidths: columnWidthsBySheet,
        updatedAt: Date.now(),
        authorId: user.uid
      }, { merge: true });
      setIsDirty(false);
      showNotification?.('Đã lưu sổ điểm.');
    } catch (error) {
      showNotification?.(`Chưa lưu được sổ điểm: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const waitForPrintImages = (root = document) => Promise.all(Array.from(root.images || []).map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (typeof img.decode === 'function') {
      return img.decode().catch(() => undefined);
    }
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
      window.setTimeout(resolve, 1800);
    });
  }));

  const printSheet = (mode = 'all') => {
    const wasPreviewMode = previewMode;
    flushSync(() => {
      setPrintMode(mode);
      setPreviewMode(true);
    });
    showNotification?.('Đang mở hộp in của trình duyệt.');
    const cleanupAfterPrint = () => {
      setPrintMode('all');
      if (!wasPreviewMode) setPreviewMode(false);
      window.removeEventListener('afterprint', cleanupAfterPrint);
    };
    window.addEventListener('afterprint', cleanupAfterPrint);
    requestAnimationFrame(() => {
      waitForPrintImages(document).finally(() => {
        window.setTimeout(() => window.print(), 150);
      });
    });
  };

  const getPrintDocumentHtml = (contentHtml, title = 'In học bạ') => {
    const styles = Array.from(document.querySelectorAll('style'))
      .map(style => style.textContent || '')
      .join('\n')
      .replace(/<\/script/gi, '<\\/script');
    const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(link => link.outerHTML)
      .join('\n');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  ${links}
  <style>
    ${styles}
    @page { size: 210mm 297mm; margin: 0; }
    html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
    body { font-family: "Times New Roman", Times, serif; }
    .print-now {
      position: fixed;
      right: 18px;
      top: 18px;
      z-index: 999999;
      border: 0;
      border-radius: 12px;
      background: #059669;
      color: white;
      font: 800 14px Arial, sans-serif;
      padding: 12px 18px;
      box-shadow: 0 12px 26px rgba(15, 23, 42, 0.22);
      cursor: pointer;
    }
    .print-hint {
      position: fixed;
      right: 18px;
      top: 70px;
      z-index: 999999;
      border-radius: 12px;
      background: white;
      color: #334155;
      font: 700 12px Arial, sans-serif;
      padding: 10px 12px;
      box-shadow: 0 12px 26px rgba(15, 23, 42, 0.16);
    }
    .scorebook-toolbar, .scorebook-tabs, .transcript-list-panel, .scorebook-page-label { display: none !important; }
    .scorebook-print-root { border: 0 !important; box-shadow: none !important; border-radius: 0 !important; overflow: visible !important; }
    .scorebook-scroll { display: block !important; width: 210mm !important; overflow: visible !important; box-shadow: none !important; border: none !important; padding: 0 !important; background: white !important; }
    .transcript-print-root { display: block !important; width: 210mm !important; margin: 0 auto !important; padding: 0 !important; background: white !important; }
    .transcript-page-frame {
      width: 210mm !important;
      height: 297mm !important;
      padding: 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
      break-after: page;
      page-break-after: always;
      box-shadow: none !important;
      border: 0 !important;
      background: white !important;
    }
    .transcript-print-root > div:last-child .transcript-page-frame {
      break-after: auto !important;
      page-break-after: auto !important;
    }
    .transcript-page { width: 210mm !important; height: 297mm !important; }
    @media screen {
      body { background: #e2e8f0 !important; padding: 18px 0 !important; }
    }
    @media print {
      body * { visibility: visible !important; }
      .transcript-print-root, .transcript-print-root * { visibility: visible !important; }
      .print-now, .print-hint { display: none !important; }
      body { background: white !important; padding: 0 !important; }
      .transcript-print-root { margin: 0 !important; }
    }
  </style>
</head>
<body>
  <button class="print-now" onclick="window.print()">In ngay</button>
  <div class="print-hint">Nếu chưa hiện hộp in, bấm In ngay hoặc Ctrl+P.</div>
  ${contentHtml}
  <script>
    const waitForImages = () => Promise.all(Array.from(document.images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 3000);
      });
    }));
    window.addEventListener('load', () => {
      waitForImages().then(() => {
        setTimeout(() => {
          window.focus();
          window.print();
        }, 350);
      });
    });
  </script>
</body>
</html>`;
  };

  const printTranscript = (selection = null) => {
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) {
      showNotification?.('Trình duyệt đang chặn cửa sổ in. Hãy cho phép pop-up hoặc dùng Ctrl+P trên trang hiện tại.', 'error');
      return;
    }
    printWindow.document.open();
    printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Đang chuẩn bị in...</title></head><body style="font-family:Arial,sans-serif;padding:24px">Đang chuẩn bị trang in học bạ...</body></html>');
    printWindow.document.close();
    flushSync(() => {
      setTranscriptPrintSelection(selection);
      setShowTranscriptPrintPanel(false);
    });
    const element = document.querySelector('.transcript-print-root');
    if (!element) {
      printWindow.close();
      showNotification?.('Chưa chuẩn bị được trang in, thử bấm lại một lần nữa.', 'error');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(getPrintDocumentHtml(element.outerHTML, 'In học bạ'));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => setTranscriptPrintSelection(null), 500);
    showNotification?.('Đã mở cửa sổ in học bạ.');
    const cleanupAfterPrint = () => {
      setTranscriptPrintSelection(null);
      window.removeEventListener('afterprint', cleanupAfterPrint);
    };
    window.addEventListener('afterprint', cleanupAfterPrint);
  };

  const saveTeacherPanel = async () => {
    if (!onSaveSetting) {
      showNotification?.('Chưa có quyền lưu phân công giáo viên từ màn hình này.', 'error');
      return;
    }
    const currentAssignments = getTeacherAssignmentsForYearGrade(currentSchoolYear, grade);
    const mergedTeacherPanelDraft = CLASS_TEACHER_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = Object.prototype.hasOwnProperty.call(teacherPanelDraft || {}, subject)
        ? (teacherPanelDraft?.[subject] || '')
        : getClassSubjectTeacherName(subject);
      return acc;
    }, { ...currentAssignments });
    const nextByYear = {
      ...(classTeacherAssignments?.byYear || {}),
      [currentSchoolYearKey]: {
        ...(classTeacherAssignments?.byYear?.[currentSchoolYearKey] || {}),
        [String(grade)]: mergedTeacherPanelDraft
      }
    };
    const nextAssignments = {
      ...(classTeacherAssignments || {}),
      [String(grade)]: currentSchoolYearKey === legacyTeacherYearKey
        ? mergedTeacherPanelDraft
        : (classTeacherAssignments?.[String(grade)] || {}),
      byYear: nextByYear
    };
    try {
      await onSaveSetting('classTeacherAssignments', nextAssignments);
      setShowTeacherPanel(false);
      showNotification?.('Đã lưu giáo viên từng lớp.');
    } catch (error) {
      showNotification?.(`Chưa lưu được giáo viên từng lớp: ${error.message}`, 'error');
    }
  };

  const rowNumbers = Array.from({ length: activeSheet.rows || 0 }, (_, index) => index + 1);
  const colNumbers = Array.from({ length: activeSheet.cols || 0 }, (_, index) => index + 1);
  const activeColWidths = colNumbers.map((col) => Math.max(18, Number(columnWidthsBySheet[activeSheet.name]?.[col - 1] ?? activeSheet.colWidths?.[col - 1]) || 72));
  const tableWidth = Math.max(900, activeColWidths.reduce((sum, width) => sum + width, 0) + (showHeaders ? 44 : 0));
  const tableHeight = rowNumbers.reduce((sum, row) => sum + Math.max(18, Number(activeSheet.rowHeights?.[row - 1]) || 22), 0) + (showHeaders ? 28 : 0);
  const lastSavedText = lastSavedAt ? new Date(lastSavedAt).toLocaleString('vi-VN') : 'Chưa lưu';
  const pageWidth = 1123;
  const pageHeight = 1587;
  const transcriptPageWidth = 794;
  const transcriptPageHeight = 1123;
  const pageMargin = 32;
  const scoreSheetInsetX = 38;
  const coverFrameWidthInset = 76;
  const coverFrameHeightInset = 76;
  const previewScale = Math.min(1, (pageWidth - pageMargin * 2) / tableWidth, (pageHeight - pageMargin * 2) / Math.max(1, tableHeight));
  const pageSegments = buildPageSegments(activeSheet);
  const isCoverSheet = activeSheet.name === 'Bia';
  const isInnerCoverSheet = activeSheet.name === 'Bia lot';
  const isProfileSheet = activeSheet.name === 'So_Yeu_Ly_Lich';
  const isGuideSheet = activeSheet.name === 'Huong_Dan';
  const isAttendanceSheet = activeSheet.name === 'Diem_Danh_CN';
  const isGradeSectionCoverSheet = activeSheet.name === 'BiaPhanGhiDiem_HKI' || activeSheet.name === 'BiaPhanGhiDiem_HKII' || activeSheet.name === 'BiaPhanGhiDiem_CaNam';
  const isSemesterOneReviewSheet = activeSheet.name === 'Diem_HKI_MonNX';
  const isSemesterOneScoreSheet = activeSheet.name === 'Diem_HKI_MonTinhDiem';
  const isSemesterOneSummarySheet = activeSheet.name === 'DiemTongKet_HKI';
  const isSemesterTwoReviewSheet = activeSheet.name === 'Diem_HKII_MonNX';
  const isSemesterTwoScoreSheet = activeSheet.name === 'Diem_HKII_MonTinhDiem';
  const isSemesterTwoSummarySheet = activeSheet.name === 'DiemTongKet_HKII';
  const isFullYearSummarySheet = activeSheet.name === 'TongHopCaNam';
  const isClassificationSheet = activeSheet.name === 'DanhGiaXepLoai';
  const isPrincipalCommentSheet = activeSheet.name === 'NhanXetCuaHT_CaNam';
  const classLabel = getClassLabel(grade);
  const teacherPanelHomeroomTeacherName = decodeSemesterDisplayText(
    getTeacherAssignmentsForYearGrade(currentSchoolYear, grade)?.['Chủ nhiệm']
    || getTeacherAssignmentsForYearGrade(currentSchoolYear, grade)?.['Chu nhiem']
    || '',
    'hk2'
  );
  const teacherSignatureByKey = useMemo(() => {
    const map = new Map();
    (Array.isArray(nanTeachers) ? nanTeachers : []).forEach((teacher) => {
      const signatureUrl = String(teacher.signatureUrl || teacher.signature || teacher.signUrl || teacher.signatureLink || '').trim();
      if (!signatureUrl) return;
      const candidates = [
        teacher.name,
        teacher.shortName,
        teacher.abbrev,
        teacher.shortLabel,
        teacher.teacherShortName
      ].map(value => normalizeSortText(decodeDisplayText(value))).filter(Boolean);
      [...new Set(candidates)].forEach(key => map.set(key, signatureUrl));
    });
    return map;
  }, [nanTeachers]);

  const getTeacherSignatureUrl = (teacherName = '') => {
    const rawText = decodeDisplayText(teacherName).trim();
    if (!rawText) return '';
    const candidates = [
      normalizeSortText(rawText),
      ...rawText.split(/\s*(?:-|–|—|,|;|\/|\n)\s*/).map(normalizeSortText)
    ].filter(Boolean);
    for (const key of candidates) {
      if (teacherSignatureByKey.has(key)) return teacherSignatureByKey.get(key);
    }
    for (const key of candidates) {
      for (const [teacherKey, url] of teacherSignatureByKey.entries()) {
        if (teacherKey && (key.includes(teacherKey) || teacherKey.includes(key))) return url;
      }
    }
    return '';
  };

  const getTeachingRowsForYear = (schoolYearLabel = currentSchoolYear) => {
    const yearKey = compactSchoolYearLabel(schoolYearLabel);
    const byYearRows = teachingAssignments?.byYear?.[yearKey];
    const batchRows = (teachingAssignments?.batchesByYear?.[yearKey] || [])
      .flatMap(batch => Array.isArray(batch?.rows) ? batch.rows : []);
    if (Array.isArray(batchRows) && batchRows.length) return batchRows;
    if (Array.isArray(byYearRows)) return byYearRows;
    if (!teachingAssignments?.byYear && Array.isArray(teachingAssignments?.rows)) return teachingAssignments.rows;
    return [];
  };

  const getAssignmentClassList = (className = '') => String(className || '')
    .split(/\s*(?:,|;|\+|\/|\n)\s*/)
    .map(item => item.trim())
    .filter(Boolean);

  const matchesTeachingClass = (rowClassName = '', contextGrade = grade) => {
    const targetClass = normalizeSubjectKey(getPcClassName(contextGrade));
    const targetGrade = String(contextGrade || '').trim();
    const classes = getAssignmentClassList(rowClassName);
    if (!classes.length) return false;
    return classes.some(className => {
      const normalizedClass = normalizeSubjectKey(className);
      return normalizedClass === targetClass || getGradeFromClass(className) === targetGrade;
    });
  };

  const getTranscriptAssignmentTeacherName = (subject = {}, context = {}) => {
    if (subject.loadTeacher === false) return '';
    const contextGrade = context.gradeValue ?? grade;
    const contextSchoolYear = context.schoolYear ?? currentSchoolYear;
    const teacherKeys = (subject.teacherKeys || []).map(normalizeSortText);
    const compactTeacherKeys = (subject.teacherKeys || []).map(normalizeSubjectKey);
    const names = getTeachingRowsForYear(contextSchoolYear)
      .filter(row => Boolean(row?.transcriptSigner || row?.signTranscript || row?.isTranscriptSigner))
      .filter(row => matchesTeachingClass(row.className ?? row.classAssigned ?? '', contextGrade))
      .filter(row => {
        const rawAssignment = row.assignment ?? row.assignedSubject ?? row.subject ?? row.specialty ?? '';
        const normalizedAssignment = normalizeSortText(rawAssignment);
        const compactAssignment = normalizeSubjectKey(rawAssignment);
        return teacherKeys.includes(normalizedAssignment) || compactTeacherKeys.includes(compactAssignment);
      })
      .map(row => decodeDisplayText(row.teacherName || row.name).trim())
      .filter(Boolean);
    return [...new Set(names)].join(' - ');
  };

  const getAssignedTeacherName = (subject = {}, context = {}) => {
    if (subject.loadTeacher === false) return '';
    if (context.transcriptSignerOnly) return getTranscriptAssignmentTeacherName(subject, context);
    const contextGrade = context.gradeValue ?? grade;
    const contextSchoolYear = context.schoolYear ?? currentSchoolYear;
    const preferredSemester = context.preferredSemester || '';
    const assignments = getTeacherAssignmentsForYearGrade(contextSchoolYear, contextGrade);
    if (subject.classSubject && assignments[subject.classSubject]) {
      return preferredSemester
        ? decodeSemesterDisplayText(assignments[subject.classSubject], preferredSemester)
        : decodeDisplayText(assignments[subject.classSubject]);
    }
    const teacherKeys = (subject.teacherKeys || []).map(normalizeSortText);
    const compactTeacherKeys = (subject.teacherKeys || []).map(normalizeSubjectKey);
    const assignmentNames = Object.entries(assignments)
      .filter(([key, value]) => {
        if (!value) return false;
        const normalizedKey = normalizeSortText(key);
        const compactKey = normalizeSubjectKey(key);
        return teacherKeys.includes(normalizedKey) || compactTeacherKeys.includes(compactKey);
      })
      .map(([, value]) => value)
      .filter(Boolean);
    if (assignmentNames.length) {
      const names = assignmentNames
        .map(value => preferredSemester ? decodeSemesterDisplayText(value, preferredSemester) : decodeDisplayText(value))
        .filter(Boolean);
      return [...new Set(names)].join(' - ');
    }

    const teacherNames = (Array.isArray(nanTeachers) ? nanTeachers : [])
      .filter(teacher => Array.isArray(teacher.grades) && teacher.grades.map(String).includes(String(contextGrade)))
      .filter(teacher => splitTeacherSubjects(teacher.subject).some(item => {
        const normalizedKey = normalizeSortText(item);
        const compactKey = normalizeSubjectKey(item);
        return teacherKeys.includes(normalizedKey) || compactTeacherKeys.includes(compactKey);
      }))
      .map(teacher => decodeDisplayText(teacher.name).trim())
      .filter(Boolean);
    return [...new Set(teacherNames)].join(' - ');
  };
  const getClassSubjectTeacherName = (subject, context = {}) => getAssignedTeacherName({
    classSubject: subject,
    teacherKeys: [subject]
  }, context);
  const homeroomTeacherName = getTranscriptAssignmentTeacherName({
    classSubject: 'Chủ nhiệm',
    teacherKeys: ['Chủ nhiệm', 'Chu nhiem', 'CN', 'GVCN', 'GV chủ nhiệm', 'Giáo viên chủ nhiệm']
  }) || teacherPanelHomeroomTeacherName;
  const homeroomTeacherSignatureUrl = getTeacherSignatureUrl(homeroomTeacherName);
  const schoolYearStartYear = getSchoolYearStartYear(currentSchoolYear);
  const attendanceMonths = Array.from({ length: 9 }, (_, index) => {
    const month = index < 4 ? index + 9 : index - 3;
    const year = month >= 9 ? schoolYearStartYear : schoolYearStartYear + 1;
    return { month, year };
  });
  const attendancePageSegments = attendanceMonths.map((monthInfo, index) => ({ attendance: true, index, ...monthInfo }));
  const hkiReviewPageSegments = HKI_REVIEW_SUBJECTS.map((subject, index) => ({ hkiReview: true, subject, index }));
  const hkiScorePageSegments = HKI_SCORE_SUBJECTS.map((subject, index) => ({ hkiScore: true, subject, index }));
  const hkiSummaryPageSegments = [{ hkiSummary: true, index: 0 }];
  const hkiiReviewPageSegments = HKI_REVIEW_SUBJECTS.map((subject, index) => ({ hkiiReview: true, subject, index }));
  const hkiiScorePageSegments = HKI_SCORE_SUBJECTS.map((subject, index) => ({ hkiiScore: true, subject, index }));
  const hkiiSummaryPageSegments = [{ hkiiSummary: true, index: 0 }];
  const fullYearSummaryPageSegments = [{ fullYearSummary: true, index: 0 }];
  const classificationPageSegments = [{ classification: true, index: 0 }];
  const principalCommentPageSegments = [{ principalComment: true, index: 0 }];
  const activePageSegments = isAttendanceSheet ? attendancePageSegments : (isSemesterOneReviewSheet ? hkiReviewPageSegments : (isSemesterOneScoreSheet ? hkiScorePageSegments : (isSemesterOneSummarySheet ? hkiSummaryPageSegments : (isSemesterTwoReviewSheet ? hkiiReviewPageSegments : (isSemesterTwoScoreSheet ? hkiiScorePageSegments : (isSemesterTwoSummarySheet ? hkiiSummaryPageSegments : (isFullYearSummarySheet ? fullYearSummaryPageSegments : (isClassificationSheet ? classificationPageSegments : (isPrincipalCommentSheet ? principalCommentPageSegments : pageSegments)))))))));
  const getSheetPageCount = (sheet) => {
    if (!sheet) return 0;
    if (sheet.name === 'Diem_Danh_CN') return attendancePageSegments.length;
    if (sheet.name === 'Diem_HKI_MonNX' || sheet.name === 'Diem_HKII_MonNX') return HKI_REVIEW_SUBJECTS.length;
    if (sheet.name === 'Diem_HKI_MonTinhDiem' || sheet.name === 'Diem_HKII_MonTinhDiem') return HKI_SCORE_SUBJECTS.length;
    if (sheet.name === 'DiemTongKet_HKI' || sheet.name === 'DiemTongKet_HKII' || sheet.name === 'TongHopCaNam' || sheet.name === 'DanhGiaXepLoai' || sheet.name === 'NhanXetCuaHT_CaNam') return 1;
    return buildPageSegments(sheet).length;
  };
  const activeSheetGlobalPageOffset = workbookSheets
    .slice(0, Math.max(0, workbookSheets.findIndex(sheet => sheet.name === activeSheet.name)))
    .reduce((sum, sheet) => sum + getSheetPageCount(sheet), 0);
  const getPageSegmentsForSheet = (sheet) => {
    if (!sheet) return [];
    if (sheet.name === 'Diem_Danh_CN') return attendancePageSegments;
    if (sheet.name === 'Diem_HKI_MonNX') return hkiReviewPageSegments;
    if (sheet.name === 'Diem_HKI_MonTinhDiem') return hkiScorePageSegments;
    if (sheet.name === 'DiemTongKet_HKI') return hkiSummaryPageSegments;
    if (sheet.name === 'Diem_HKII_MonNX') return hkiiReviewPageSegments;
    if (sheet.name === 'Diem_HKII_MonTinhDiem') return hkiiScorePageSegments;
    if (sheet.name === 'DiemTongKet_HKII') return hkiiSummaryPageSegments;
    if (sheet.name === 'TongHopCaNam') return fullYearSummaryPageSegments;
    if (sheet.name === 'DanhGiaXepLoai') return classificationPageSegments;
    if (sheet.name === 'NhanXetCuaHT_CaNam') return principalCommentPageSegments;
    return buildPageSegments(sheet);
  };
  const workbookPageEntries = workbookSheets.flatMap((sheet) => (
    getPageSegmentsForSheet(sheet).map((page, index) => ({ ...page, sheet, originalIndex: index }))
  )).map((page, globalIndex) => ({ ...page, globalPageNumber: globalIndex + 1 }));
  const allClassStudents = useMemo(() => {
    return [...(Array.isArray(students) ? students : [])]
      .filter(student => (student.status || 'active') !== 'dropped')
      .filter(student => String(getGradeFromClass(student.className || student.grade || '')) === String(grade))
      .filter(student => !student.schoolYear || String(student.schoolYear) === String(currentSchoolYear))
      .sort((a, b) => {
        const classCompare = String(a.className || '').localeCompare(String(b.className || ''), 'vi', { numeric: true, sensitivity: 'base' });
        if (classCompare) return classCompare;
        return getGivenNameSortKey(a.fullName).localeCompare(getGivenNameSortKey(b.fullName), 'vi', { sensitivity: 'base' });
      });
  }, [students, grade, currentSchoolYear]);
  const transcriptStudents = useMemo(() => allClassStudents, [allClassStudents]);
  const selectedTranscriptStudent = useMemo(() => {
    if (!transcriptStudents.length) return null;
    return transcriptStudents.find(student => student.id === transcriptStudentId) || transcriptStudents[0];
  }, [transcriptStudents, transcriptStudentId]);
  const transcriptStudentOptionLabel = (student = {}) => (
    `${titleCaseText(student.fullName)}${student.className ? ` - ${student.className}` : ''}`
  );
  useEffect(() => {
    if (!transcriptStudents.length) {
      if (transcriptStudentId) setTranscriptStudentId('');
      if (transcriptStudentSearch) setTranscriptStudentSearch('');
      return;
    }
    if (!transcriptStudents.some(student => student.id === transcriptStudentId)) {
      setTranscriptStudentId(transcriptStudents[0].id);
    }
  }, [transcriptStudents, transcriptStudentId, transcriptStudentSearch]);
  useEffect(() => {
    if (selectedTranscriptStudent && !transcriptStudentSearch) {
      setTranscriptStudentSearch(transcriptStudentOptionLabel(selectedTranscriptStudent));
    }
  }, [selectedTranscriptStudent, transcriptStudentSearch]);
  const selectedTranscriptStudentIndex = Math.max(0, transcriptStudents.findIndex(student => student.id === selectedTranscriptStudent?.id));
  const selectTranscriptStudent = (student) => {
    if (!student?.id) return;
    setTranscriptStudentId(student.id);
    setTranscriptStudentSearch(transcriptStudentOptionLabel(student));
  };
  const selectTranscriptStudentByIndex = (index) => {
    if (!transcriptStudents.length) return;
    const nextIndex = Math.min(Math.max(index, 0), transcriptStudents.length - 1);
    selectTranscriptStudent(transcriptStudents[nextIndex]);
  };
  const selectTranscriptStudentBySearch = (value) => {
    setTranscriptStudentSearch(value);
    const normalized = normalizeSortText(value);
    if (!normalized) return;
    const exact = transcriptStudents.find(student => normalizeSortText(transcriptStudentOptionLabel(student)) === normalized);
    const found = exact || transcriptStudents.find(student => (
      normalizeSortText(`${student.fullName || ''} ${student.className || ''} ${student.accessCode || ''} ${student.studentCode || ''}`).includes(normalized)
    ));
    if (found?.id) setTranscriptStudentId(found.id);
  };
  const classStudents = useMemo(() => allClassStudents.slice(0, 40), [allClassStudents]);
  const hkiReviewStudents = useMemo(() => allClassStudents.slice(0, HKI_REVIEW_ROW_COUNT), [allClassStudents]);
  const hkiScoreStudents = useMemo(() => allClassStudents.slice(0, HKI_SCORE_ROW_COUNT), [allClassStudents]);
  const hkiSummaryStudents = useMemo(() => allClassStudents.slice(0, HKI_SUMMARY_ROW_COUNT), [allClassStudents]);
  const classificationStudents = useMemo(() => allClassStudents.slice(0, CLASSIFICATION_ROW_COUNT), [allClassStudents]);
  const classGenderStats = useMemo(() => {
    return allClassStudents.reduce((acc, student) => {
      const gender = formatGender(student.gender);
      if (gender === 'Nam') acc.male += 1;
      else if (gender === 'Nữ') acc.female += 1;
      return acc;
    }, { male: 0, female: 0 });
  }, [allClassStudents]);
  const attendanceMap = useMemo(() => {
    const map = new Map();
    attendanceDocs.forEach(item => {
      map.set(`${item.date}__${item.className}`, item.records || {});
    });
    return map;
  }, [attendanceDocs]);
  const getStudentAttendanceStatus = (student, date) => {
    if (!student?.id) return '';
    const dateKey = toDateKey(date);
    const classKey = String(grade || '');
    const studentClassKey = getGradeFromClass(student.className || student.grade || '') || classKey;
    const records = attendanceMap.get(`${dateKey}__${studentClassKey}`)
      || attendanceMap.get(`${dateKey}__${classKey}`)
      || {};
    const record = records[student.id] || Object.values(records).find(item => item?.studentId === student.id);
    return record?.status || '';
  };
  const getSemesterAbsenceCount = (student, semester = 'hki') => {
    if (!student?.id) return 0;
    const start = semester === 'hkii'
      ? new Date(schoolYearStartYear + 1, 0, 16)
      : new Date(schoolYearStartYear, 8, 1);
    const end = semester === 'hkii'
      ? new Date(schoolYearStartYear + 1, 4, 31)
      : new Date(schoolYearStartYear + 1, 0, 15);
    let count = 0;
    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const status = getStudentAttendanceStatus(student, date);
      if (status === 'CP' || status === 'KP') count += 1;
    }
    return count;
  };
  const getFullYearAbsenceCount = (student) => {
    if (!student?.id) return 0;
    const start = new Date(schoolYearStartYear, 8, 1);
    const end = new Date(schoolYearStartYear + 1, 4, 31);
    let count = 0;
    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const status = getStudentAttendanceStatus(student, date);
      if (status === 'CP' || status === 'KP') count += 1;
    }
    return count;
  };
  const getSemesterReviewResult = (semester, pageIndex, rowIndex) => {
    if (pageIndex === null || pageIndex === undefined) return '';
    const gradeIndex = semester === 'hkii' ? 7 : 6;
    const saved = customText(`${semester}Review:${pageIndex}:r${rowIndex}:g${gradeIndex}`, '');
    if (saved || semester !== 'hkii') return saved;
    return customText(`${semester}Review:${pageIndex}:r${rowIndex}:g6`, '');
  };
  const getFullYearReviewResult = (pageIndex, rowIndex) => {
    if (pageIndex === null || pageIndex === undefined) return '';
    const saved = customText(`hkiiReview:${pageIndex}:r${rowIndex}:g7`, '');
    if (saved) return saved;
    return customText(`hkiiReview:${pageIndex}:r${rowIndex}:g6`, '');
  };
  const getScoreInputValue = (semester, pageIndex, rowIndex, scoreIndex) => (
    customText(`${semester}Score:${pageIndex}:r${rowIndex}:s${scoreIndex}`, '')
  );
  const getSemesterTermAverage = (semester, pageIndex, rowIndex) => {
    const txScores = [0, 1, 2, 3]
      .map(scoreIndex => parseScoreNumber(getScoreInputValue(semester, pageIndex, rowIndex, scoreIndex)))
      .filter(value => value !== null);
    const midterm = parseScoreNumber(getScoreInputValue(semester, pageIndex, rowIndex, 4));
    const final = parseScoreNumber(getScoreInputValue(semester, pageIndex, rowIndex, 5));
    if (!txScores.length || midterm === null || final === null) return '';
    const total = txScores.reduce((sum, value) => sum + value, 0) + (2 * midterm) + (3 * final);
    return formatScoreNumber(total / (txScores.length + 5));
  };
  const getSemesterScoreResult = (semester, pageIndex, rowIndex, scoreIndex = semester === 'hkii' ? 7 : 6) => {
    if (pageIndex === null || pageIndex === undefined) return '';
    const saved = getScoreInputValue(semester, pageIndex, rowIndex, scoreIndex);
    if (saved !== '') return formatScoreDisplayValue(saved);
    if (scoreIndex === 6) return getSemesterTermAverage(semester, pageIndex, rowIndex);
    if (semester === 'hkii' && scoreIndex === 7) {
      const hkiAverage = parseScoreNumber(getSemesterScoreResult('hki', pageIndex, rowIndex, 6));
      const hkiiAverage = parseScoreNumber(getSemesterScoreResult('hkii', pageIndex, rowIndex, 6));
      if (hkiAverage === null || hkiiAverage === null) return '';
      return formatScoreNumber((hkiAverage + (2 * hkiiAverage)) / 3);
    }
    return '';
  };
  const isAutoPassReviewColumn = (column = {}) => column.sourcePage === 2 || column.sourcePage === 3;
  const hasSemesterAcademicScores = (semester, rowIndex) => HKI_SUMMARY_SCORE_COLUMNS
    .some(column => String(getSemesterScoreResult(semester, column.sourcePage, rowIndex, 6) || '').trim());
  const hasFullYearAcademicScores = (rowIndex, scoreColumns = HKI_SUMMARY_SCORE_COLUMNS) => scoreColumns
    .some(column => String(getSemesterScoreResult('hkii', column.sourcePage, rowIndex, 7) || '').trim());
  const getSummaryReviewDisplay = (semester, column, rowIndex) => {
    const saved = getSemesterReviewResult(semester, column.sourcePage, rowIndex);
    if (String(saved || '').trim()) return saved;
    return isAutoPassReviewColumn(column) && hasSemesterAcademicScores(semester, rowIndex) ? 'Đ' : '';
  };
  const getFullYearSummaryReviewDisplay = (column, rowIndex, scoreColumns) => {
    const saved = getFullYearReviewResult(column.sourcePage, rowIndex);
    if (String(saved || '').trim()) return saved;
    return isAutoPassReviewColumn(column) && hasFullYearAcademicScores(rowIndex, scoreColumns) ? 'Đ' : '';
  };
  const getAcademicResult = (rowIndex, semester = 'hki') => {
    const scores = HKI_SUMMARY_SCORE_COLUMNS
      .filter(column => column.academic)
      .map(column => parseScoreNumber(getSemesterScoreResult(semester, column.sourcePage, rowIndex)))
      .filter(value => value !== null);
    if (!scores.length) return '';
    if (scores.filter(score => score >= 8).length >= 5 && scores.every(score => score >= 6.5)) return 'Tốt';
    if (scores.filter(score => score >= 6.5).length >= 5 && scores.every(score => score >= 5)) return 'Khá';
    if (scores.filter(score => score >= 5).length >= 5 && scores.every(score => score >= 3.5)) return 'Đạt';
    return 'Chưa đạt';
  };
  const isPassingAcademicResult = (value = '') => ['Đạt', 'Khá', 'Tốt'].includes(String(value || '').trim());

  const findMergeForPosition = (row, col, sheet = activeSheet) => {
    for (const merge of sheet.merges || []) {
      const rowEnd = merge.r + merge.rs - 1;
      const colEnd = merge.c + merge.cs - 1;
      if (row >= merge.r && row <= rowEnd && col >= merge.c && col <= colEnd) return merge;
    }
    return null;
  };

  const renderScorebookTable = ({ rows, cols, includeHeaders, sheet = activeSheet }) => {
    const rowSet = rows;
    const colSet = cols;
    const localSheetMaps = sheet.name === activeSheet.name ? sheetMaps : buildSheetMaps(sheet || {});
    const localColWidths = colSet.map((col) => Math.max(18, Number(columnWidthsBySheet[sheet.name]?.[col - 1] ?? sheet.colWidths?.[col - 1]) || 72));
    const firstRow = rowSet[0] || 1;
    const lastRow = rowSet[rowSet.length - 1] || firstRow;
    const firstCol = colSet[0] || 1;
    const lastCol = colSet[colSet.length - 1] || firstCol;
    const width = localColWidths.reduce((sum, colWidth) => sum + colWidth, includeHeaders ? 44 : 0);

    return (
      <table className="scorebook-table border-collapse bg-white text-slate-900" style={{ width }}>
        <colgroup>
          {includeHeaders && <col className="scorebook-axis" style={{ width: 44 }} />}
          {colSet.map((col, index) => (
            <col key={`col-${col}`} style={{ width: localColWidths[index] }} />
          ))}
        </colgroup>
        {includeHeaders && (
          <thead className="scorebook-axis">
            <tr>
              <th className="scorebook-axis sticky left-0 top-0 z-20 h-7 border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-500" />
              {colSet.map((col) => (
                <th key={`head-${col}`} className="scorebook-axis sticky top-0 z-10 h-7 border border-slate-300 bg-slate-100 p-0 text-[10px] font-black text-slate-600 relative select-none">
                  <div className="flex h-full items-center justify-center">{columnLabel(col)}</div>
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rowSet.map((row) => {
            const rowHeight = Math.max(18, Number(sheet.rowHeights?.[row - 1]) || 22);
            return (
              <tr key={`row-${row}`} style={{ height: rowHeight }}>
                {includeHeaders && (
                  <th className="scorebook-axis sticky left-0 z-10 border border-slate-300 bg-slate-100 px-1 text-[10px] font-black text-slate-500 text-center select-none" style={{ height: rowHeight }}>
                    {row}
                  </th>
                )}
                {colSet.map((col) => {
                  const merge = findMergeForPosition(row, col, sheet);
                  const renderRow = merge ? Math.max(merge.r, firstRow) : row;
                  const renderCol = merge ? Math.max(merge.c, firstCol) : col;
                  if (row !== renderRow || col !== renderCol) return null;

                  const sourceRow = merge?.r || row;
                  const sourceCol = merge?.c || col;
                  const mergeRowEnd = merge ? Math.min(merge.r + merge.rs - 1, lastRow) : row;
                  const mergeColEnd = merge ? Math.min(merge.c + merge.cs - 1, lastCol) : col;
                  const positionKey = `${sourceRow}:${sourceCol}`;
                  const cell = localSheetMaps.cellMap.get(positionKey);
                  const rawOriginalValue = getCellValue(cell);
                  const originalValue = sheet.name === 'DanhGiaXepLoai' && sourceRow === 31 && sourceCol === 11 && principalName ? principalName : rawOriginalValue;
                  const editKey = makeCellKey(sheet.name, sourceRow, sourceCol);
                  return (
                    <ScorebookCell
                      key={`${row}:${col}`}
                      cell={cell}
                      editValue={edits[editKey]}
                      originalValue={originalValue}
                      rowHeight={rowHeight}
                      rowSpan={merge ? mergeRowEnd - renderRow + 1 : 1}
                      colSpan={merge ? mergeColEnd - renderCol + 1 : 1}
                      onCommit={(nextValue) => {
                        if (sheet.name === activeSheet.name) commitCell(sourceRow, sourceCol, originalValue, nextValue);
                      }}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const renderCoverPage = ({ framed = true } = {}) => (
    <div
      className="scorebook-cover-page bg-white text-black"
      style={{
        width: pageWidth - pageMargin * 2 - coverFrameWidthInset,
        height: pageHeight - pageMargin * 2 - coverFrameHeightInset,
        fontFamily: '"Times New Roman", Times, serif',
        position: 'relative',
        border: framed ? '3px double #111' : '0',
        boxSizing: 'border-box',
        margin: `${coverFrameHeightInset / 2}px auto`
      }}
    >
      <div style={{ position: 'absolute', top: 70, left: 70, fontSize: 22, fontWeight: 700, lineHeight: 1.95 }}>
        <EditableText value={customText('cover:school', COVER_TEXT.school)} onCommit={(next) => commitCustomText('cover:school', COVER_TEXT.school, next)} />
        <EditableText value={customText('cover:ward', COVER_TEXT.ward)} onCommit={(next) => commitCustomText('cover:ward', COVER_TEXT.ward, next)} />
        <EditableText value={customText('cover:city', COVER_TEXT.city)} onCommit={(next) => commitCustomText('cover:city', COVER_TEXT.city, next)} />
      </div>
      <div style={{ position: 'absolute', top: 515, left: 0, right: 0, textAlign: 'center' }}>
        <EditableText value={customText('cover:title', COVER_TEXT.title)} onCommit={(next) => commitCustomText('cover:title', COVER_TEXT.title, next)} style={{ fontSize: 34, fontWeight: 700, letterSpacing: 0 }} />
        <EditableText value={customText('cover:subtitle', COVER_TEXT.subtitle)} onCommit={(next) => commitCustomText('cover:subtitle', COVER_TEXT.subtitle, next)} style={{ marginTop: 22, fontSize: 28, fontWeight: 700, letterSpacing: 0 }} />
      </div>
      <div style={{ position: 'absolute', top: 910, left: 0, right: 0, textAlign: 'center', fontSize: 30, fontWeight: 700 }}>
        {classLabel}
      </div>
      <div style={{ position: 'absolute', bottom: 245, left: 0, right: 0, textAlign: 'center', fontSize: 30, fontWeight: 700 }}>
        {currentSchoolYear}
      </div>
    </div>
  );

  const renderGuidePage = () => (
    <div
      className="scorebook-guide-page bg-white text-black"
      style={{
        width: pageWidth - pageMargin * 2,
        height: pageHeight - pageMargin * 2 - coverFrameHeightInset,
        fontFamily: '"Times New Roman", Times, serif',
        position: 'relative',
        boxSizing: 'border-box',
        padding: '58px 46px 40px 46px'
      }}
    >
      <EditableText
        value={customText('guide:title', GUIDE_TITLE)}
        onCommit={(next) => commitCustomText('guide:title', GUIDE_TITLE, next)}
        className="text-center"
        style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginBottom: 28 }}
      />
      <div style={{ fontSize: 19, lineHeight: 1.22, fontWeight: 400 }}>
        {GUIDE_PARAGRAPHS.map((paragraph, index) => (
          <EditableText
            key={`guide-p-${index}`}
            value={customText(`guide:p:${index}`, paragraph)}
            onCommit={(next) => commitCustomText(`guide:p:${index}`, paragraph, next)}
            style={{ marginBottom: index === 2 || index === 3 ? 24 : 22, textAlign: 'left' }}
          />
        ))}
      </div>
    </div>
  );

  const renderGradeSectionCoverPage = (sheetName = activeSheet.name) => {
    const semesterLabel = sheetName === 'BiaPhanGhiDiem_CaNam'
      ? 'CẢ NĂM'
      : (sheetName === 'BiaPhanGhiDiem_HKII' ? 'HỌC KỲ II' : 'HỌC KỲ I');
    const key = sheetName === 'BiaPhanGhiDiem_CaNam'
      ? 'gradeCover:fullYear'
      : (sheetName === 'BiaPhanGhiDiem_HKII' ? 'gradeCover:hk2' : 'gradeCover:hk1');
    return (
      <div
        className="scorebook-grade-section-cover-page bg-white text-black"
        style={{
          width: pageWidth - pageMargin * 2,
          height: pageHeight - pageMargin * 2,
          fontFamily: '"Times New Roman", Times, serif',
          position: 'relative',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ position: 'absolute', top: '39%', left: 0, right: 0, transform: 'translateY(-50%)', textAlign: 'center', fontWeight: 700, lineHeight: 1.25 }}>
          <EditableText
            value={customText(`${key}:title`, 'PHẦN GHI ĐIỂM')}
            onCommit={(next) => commitCustomText(`${key}:title`, 'PHẦN GHI ĐIỂM', next)}
            style={{ fontSize: 44, letterSpacing: 0 }}
          />
          <EditableText
            value={customText(`${key}:semester`, semesterLabel)}
            onCommit={(next) => commitCustomText(`${key}:semester`, semesterLabel, next)}
            style={{ marginTop: 14, fontSize: 34, letterSpacing: 0 }}
          />
        </div>
      </div>
    );
  };

  const renderInnerCoverPage = ({ framed = true } = {}) => (
    <div
      className="scorebook-cover-page bg-white text-black"
      style={{
        width: pageWidth - pageMargin * 2 - coverFrameWidthInset,
        height: pageHeight - pageMargin * 2 - coverFrameHeightInset,
        fontFamily: '"Times New Roman", Times, serif',
        position: 'relative',
        border: framed ? '3px double #111' : '0',
        boxSizing: 'border-box',
        margin: `${coverFrameHeightInset / 2}px auto`
      }}
    >
      <div style={{ position: 'absolute', top: 56, left: 82, fontSize: 19, fontWeight: 700, lineHeight: 2 }}>
        <EditableText value={customText('innerCover:school', COVER_TEXT.school)} onCommit={(next) => commitCustomText('innerCover:school', COVER_TEXT.school, next)} />
        <EditableText value={customText('innerCover:ward', COVER_TEXT.ward)} onCommit={(next) => commitCustomText('innerCover:ward', COVER_TEXT.ward, next)} />
        <EditableText value={customText('innerCover:city', COVER_TEXT.city)} onCommit={(next) => commitCustomText('innerCover:city', COVER_TEXT.city, next)} />
      </div>
      <div style={{ position: 'absolute', top: 360, left: 0, right: 0, textAlign: 'center' }}>
        <EditableText value={customText('innerCover:title', COVER_TEXT.title)} onCommit={(next) => commitCustomText('innerCover:title', COVER_TEXT.title, next)} style={{ fontSize: 31, fontWeight: 700, letterSpacing: 0 }} />
        <EditableText value={customText('innerCover:subtitle', COVER_TEXT.subtitle)} onCommit={(next) => commitCustomText('innerCover:subtitle', COVER_TEXT.subtitle, next)} style={{ marginTop: 26, fontSize: 24, fontWeight: 700, letterSpacing: 0 }} />
      </div>
      <div style={{ position: 'absolute', top: 615, left: 0, right: 0, textAlign: 'center', fontSize: 23, fontWeight: 700, lineHeight: 1.55 }}>
        <EditableText value={customText('innerCover:schoolType', 'TRƯỜNG TRUNG HỌC CƠ SỞ')} onCommit={(next) => commitCustomText('innerCover:schoolType', 'TRƯỜNG TRUNG HỌC CƠ SỞ', next)} />
        <EditableText value={customText('innerCover:schoolName', 'TRƯỜNG THCS NGUYỄN AN NINH')} onCommit={(next) => commitCustomText('innerCover:schoolName', 'TRƯỜNG THCS NGUYỄN AN NINH', next)} />
      </div>
      <div style={{ position: 'absolute', top: 790, left: 0, right: 0, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
        Xã <span style={{ fontStyle: 'italic', fontWeight: 400 }}>(Phường, thị trấn)</span>: Phường Trung Mỹ Tây
      </div>
      <div style={{ position: 'absolute', top: 845, left: 0, right: 0, textAlign: 'center', fontSize: 21, fontWeight: 700 }}>
        Tỉnh/Thành phố: Thành phố Hồ Chí Minh
      </div>
      <div style={{ position: 'absolute', top: 915, left: 0, right: 0, textAlign: 'center', fontSize: 21, fontWeight: 700 }}>
        {classLabel} &nbsp; - &nbsp; {currentSchoolYear}
      </div>
      <div style={{ position: 'absolute', top: 1030, left: 105, width: 260, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>GIÁO VIÊN CHỦ NHIỆM</div>
        <div style={{ fontSize: 15, fontStyle: 'italic', marginTop: 6 }}>(Ký, ghi rõ họ tên)</div>
      </div>
      <div style={{ position: 'absolute', top: 995, right: 70, width: 340, textAlign: 'center', fontSize: 16, fontStyle: 'italic', whiteSpace: 'nowrap' }}>
        {getTranscriptEndDateText(currentSchoolYear, grade)}
      </div>
      <div style={{ position: 'absolute', top: 1030, right: 110, width: 260, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>HIỆU TRƯỞNG</div>
        <div style={{ fontSize: 15, fontStyle: 'italic', marginTop: 6 }}>(Ký, ghi rõ họ tên, đóng dấu)</div>
      </div>
      <div style={{ position: 'absolute', top: 1120, left: 105, width: 260, height: 82, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TeacherSignatureImage url={homeroomTeacherSignatureUrl} alt={`Chu ky ${homeroomTeacherName}`} style={{ height: 70 }} />
      </div>
      <div style={{ position: 'absolute', top: 1218, left: 105, width: 260, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>
        {homeroomTeacherName}
      </div>
      <div style={{ position: 'absolute', top: 1218, right: 110, width: 260, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>
        {principalName}
      </div>
    </div>
  );

  const profileRowBorder = (index) => {
    const isGroupEnd = (index + 1) % 5 === 0;
    return isGroupEnd ? '1.4px solid #111' : '1px dotted #111';
  };

  const studentAddress = (student = {}, targetLength = 72) => compactAdministrativeText(joinClean([student.address, titleCaseText(student.ward), titleCaseText(student.province)], ' '), targetLength);

  const parentText = (student = {}, parent = 'father') => {
    const name = titleCaseText(student[`${parent}Name`]);
    const job = sentenceCaseText(student[`${parent}Job`]);
    const phone = student[`${parent}Phone`];
    const email = student[`${parent}Email`];
    return joinClean([name, job, phone, email], ', ');
  };

  const renderProfilePageOne = () => {
    const rows = Array.from({ length: 40 }, (_, index) => classStudents[index] || {});
    const rowHeight = 30;
    const cellBase = { borderLeft: '1.2px solid #111', borderRight: '1.2px solid #111', padding: '2px 5px', verticalAlign: 'middle', fontSize: 13.6, lineHeight: 1.04, height: rowHeight };
    const twoLine = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.04 };
    const titleStyle = { fontSize: 30, fontWeight: 700, lineHeight: 1, marginBottom: 6 };
    const headerRowStyle = { height: 60 };
    const headerCellStyle = { border: '1.4px solid #111', padding: 5, whiteSpace: 'pre-line', fontSize: 14.5, lineHeight: 1.2, textAlign: 'center', fontWeight: 700, height: 60 };
    return (
      <div className="scorebook-profile-page bg-white text-black" style={{ width: pageWidth - pageMargin * 2, height: pageHeight - pageMargin * 2, fontFamily: '"Times New Roman", Times, serif', position: 'relative', boxSizing: 'border-box', padding: '26px 20px 25px 20px' }}>
        <div style={{ ...titleStyle, textAlign: 'right' }}>SƠ YẾU LÝ LỊCH</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif' }}>
          <colgroup>
            <col style={{ width: 42 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 112 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 76 }} />
            <col />
          </colgroup>
          <thead>
            <tr style={headerRowStyle}>
              {['Số\nTT', 'Họ và tên học sinh', 'Ngày, tháng,\nnăm sinh', 'Nơi sinh', 'Nam\nnữ', 'Dân tộc', 'Đối tượng\nưu tiên', 'Địa chỉ gia đình'].map((header) => (
                <th key={header} style={headerCellStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((student, index) => {
              const borderBottom = profileRowBorder(index);
              return (
                <tr key={`profile-1-${index}`} style={{ height: rowHeight }}>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{index + 1}</td>
                  <td style={{ ...cellBase, borderBottom }}><div style={twoLine}>{titleCaseText(student.fullName) || ''}</div></td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{student.birthDate || ''}</td>
                  <td style={{ ...cellBase, borderBottom }}><div style={twoLine}>{titleCaseText(student.birthProvince || student.birthPlace || student.province) || ''}</div></td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{formatGender(student.gender)}</td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{titleCaseText(student.ethnicity || student.ethnic || (student.fullName ? 'Kinh' : ''))}</td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{student.priorityObject || student.policyObject || ''}</td>
                  <td style={{ ...cellBase, borderBottom }}><div style={twoLine}>{studentAddress(student, 96)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderProfilePageTwo = () => {
    const rows = Array.from({ length: 40 }, (_, index) => classStudents[index] || {});
    const rowHeight = 30;
    const cellBase = { borderLeft: '1.2px solid #111', borderRight: '1.2px solid #111', padding: '2px 5px', verticalAlign: 'middle', fontSize: 13.6, lineHeight: 1.04, height: rowHeight };
    const twoLine = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.04 };
    const titleStyle = { fontSize: 30, fontWeight: 700, lineHeight: 1, marginBottom: 6 };
    const headerRowStyle = { height: 60 };
    const headerCellStyle = { border: '1.4px solid #111', padding: 5, whiteSpace: 'pre-line', fontSize: 13.1, lineHeight: 1.08, textAlign: 'center', fontWeight: 700, height: 60 };
    return (
      <div className="scorebook-profile-page bg-white text-black" style={{ width: pageWidth - pageMargin * 2, height: pageHeight - pageMargin * 2, fontFamily: '"Times New Roman", Times, serif', position: 'relative', boxSizing: 'border-box', padding: '26px 20px 25px 20px' }}>
        <div style={titleStyle}>HỌC SINH</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif' }}>
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 290 }} />
            <col style={{ width: 330 }} />
            <col />
          </colgroup>
          <thead>
            <tr style={headerRowStyle}>
              {['Số\nTT', 'Họ và tên cha, nghề nghiệp,\nđiện thoại, email\n(hoặc người giám hộ)', 'Họ và tên mẹ, nghề nghiệp,\nđiện thoại, email\n(hoặc người giám hộ)', 'Những thay đổi cần chú ý trong năm học\n(gia đình sức khỏe, nơi ở...)'].map((header) => (
                <th key={header} style={headerCellStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((student, index) => {
              const borderBottom = profileRowBorder(index);
              return (
                <tr key={`profile-2-${index}`} style={{ height: rowHeight }}>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{index + 1}</td>
                  <td style={{ ...cellBase, borderBottom }}><div style={twoLine}>{parentText(student, 'father')}</div></td>
                  <td style={{ ...cellBase, borderBottom }}><div style={twoLine}>{parentText(student, 'mother')}</div></td>
                  <td style={{ ...cellBase, borderBottom }}><div style={twoLine}>{student.yearNotes || student.healthNotes || ''}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderProfilePage = (index = 0) => (index === 0 ? renderProfilePageOne() : renderProfilePageTwo());

  const renderAttendancePage = (pageIndex = 0) => {
    const monthInfo = attendanceMonths[pageIndex] || attendanceMonths[0];
    const daysInMonth = new Date(monthInfo.year, monthInfo.month, 0).getDate();
    const dayDates = Array.from({ length: daysInMonth }, (_, index) => new Date(monthInfo.year, monthInfo.month - 1, index + 1));
    const rows = Array.from({ length: 40 }, (_, index) => classStudents[index] || {});
    const classKey = String(grade || '');
    const getStudentStatus = (student, date) => {
      if (!student?.id) return '';
      const dateKey = toDateKey(date);
      const studentClassKey = getGradeFromClass(student.className || student.grade || '') || classKey;
      const records = attendanceMap.get(`${dateKey}__${studentClassKey}`)
        || attendanceMap.get(`${dateKey}__${classKey}`)
        || {};
      const record = records[student.id] || Object.values(records).find(item => item?.studentId === student.id);
      return record?.status || '';
    };
    const rowStatuses = rows.map(student => dayDates.map(date => getStudentStatus(student, date)));
    const rowTotals = rowStatuses.map(statuses => {
      const cp = statuses.filter(status => status === 'CP').length;
      const kp = statuses.filter(status => status === 'KP').length;
      return { cp, kp, total: cp + kp };
    });
    const dayTotals = dayDates.map((_, dayIndex) => rowStatuses.reduce((sum, statuses) => sum + (statuses[dayIndex] ? 1 : 0), 0));
    const monthTotals = rowTotals.reduce((acc, item) => ({
      cp: acc.cp + item.cp,
      kp: acc.kp + item.kp,
      total: acc.total + item.total
    }), { cp: 0, kp: 0, total: 0 });
    const attendancePaddingX = 16;
    const availableTableWidth = pageWidth - pageMargin * 2 - attendancePaddingX * 2;
    const sttWidth = 36;
    const nameWidth = 160;
    const totalWidth = 32;
    const dayWidth = Math.floor(((availableTableWidth - sttWidth - nameWidth - totalWidth * 3) / daysInMonth) * 10) / 10;
    const tableTotalWidth = sttWidth + nameWidth + (daysInMonth * dayWidth) + (totalWidth * 3);
    const cellBase = {
      borderLeft: '1.2px solid #111',
      borderRight: '1.2px solid #111',
      padding: '2px 3px',
      verticalAlign: 'middle',
      fontSize: 13,
      lineHeight: 1.05
    };
    const headerCell = {
      ...cellBase,
      borderTop: '1.4px solid #111',
      borderBottom: '1.4px solid #111',
      textAlign: 'center',
      fontWeight: 700
    };
    const diagonalLine = (deg, width) => ({
      position: 'absolute',
      left: -1,
      top: -1,
      width,
      borderTop: '1px solid #111',
      transform: `rotate(${deg}deg)`,
      transformOrigin: '0 0'
    });
    const nameClamp = {
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
      lineHeight: 1.05
    };

    return (
      <div className="scorebook-attendance-page bg-white text-black" style={{ width: pageWidth - pageMargin * 2, height: pageHeight - pageMargin * 2, fontFamily: '"Times New Roman", Times, serif', position: 'relative', boxSizing: 'border-box', padding: `30px ${attendancePaddingX}px 24px ${attendancePaddingX}px` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, fontSize: 16, fontStyle: 'italic', fontWeight: 700 }}>
          <div>Tháng {monthInfo.month} năm {monthInfo.year}</div>
          <div>Tổng số học sinh của {classLabel.replace('LỚP', 'lớp')}: {classStudents.length}</div>
        </div>
        <table style={{ width: tableTotalWidth, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif', border: '1.4px solid #111' }}>
          <colgroup>
            <col style={{ width: sttWidth }} />
            <col style={{ width: nameWidth }} />
            {dayDates.map((date) => <col key={`attendance-col-${toDateKey(date)}`} style={{ width: dayWidth }} />)}
            <col style={{ width: totalWidth }} />
            <col style={{ width: totalWidth }} />
            <col style={{ width: totalWidth }} />
          </colgroup>
          <thead>
            <tr style={{ height: 37 }}>
              <th rowSpan={2} style={headerCell}>Số<br />TT</th>
              <th rowSpan={2} style={{ ...headerCell, position: 'relative', overflow: 'hidden', padding: 0 }}>
                <div style={diagonalLine(23, 170)}></div>
                <div style={diagonalLine(13, 160)}></div>
                <div style={{ position: 'absolute', top: 8, right: 8 }}>Ngày</div>
                <div style={{ position: 'absolute', bottom: 8, left: 34 }}>Họ và tên</div>
                <div style={{ position: 'absolute', bottom: 8, right: 8 }}>Thứ</div>
              </th>
              {dayDates.map((date) => (
                <th key={`day-${toDateKey(date)}`} style={headerCell}>{date.getDate()}</th>
              ))}
              <th colSpan={3} style={headerCell}>Tổng số<br />buổi nghỉ</th>
            </tr>
            <tr style={{ height: 28 }}>
              {dayDates.map((date) => (
                <th key={`weekday-${toDateKey(date)}`} style={headerCell}>
                  {weekdayShortVi(date)}
                </th>
              ))}
              <th style={headerCell}>TS</th>
              <th style={headerCell}>P</th>
              <th style={headerCell}>K</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((student, index) => {
              const borderBottom = profileRowBorder(index);
              const totals = rowTotals[index] || { cp: 0, kp: 0, total: 0 };
              return (
                <tr key={`attendance-${pageIndex}-${index}`} style={{ height: 27 }}>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{index + 1}</td>
                  <td style={{ ...cellBase, borderBottom }}><div style={nameClamp}>{titleCaseText(student.fullName) || ''}</div></td>
                  {dayDates.map((date, dayIndex) => (
                    <td key={`attendance-${pageIndex}-${index}-${toDateKey(date)}`} style={{ ...cellBase, textAlign: 'center', fontWeight: 700, borderBottom }}>
                      {rowStatuses[index]?.[dayIndex] || ''}
                    </td>
                  ))}
                  <td style={{ ...cellBase, textAlign: 'center', fontWeight: 700, borderBottom }}>{totals.total || ''}</td>
                  <td style={{ ...cellBase, textAlign: 'center', fontWeight: 700, borderBottom }}>{totals.cp || ''}</td>
                  <td style={{ ...cellBase, textAlign: 'center', fontWeight: 700, borderBottom }}>{totals.kp || ''}</td>
                </tr>
              );
            })}
            <tr style={{ height: 27 }}>
              <td style={{ ...cellBase, borderBottom: '1.4px solid #111' }}></td>
              <td style={{ ...cellBase, borderBottom: '1.4px solid #111', fontWeight: 700 }}>Tổng số</td>
              {dayDates.map((date, dayIndex) => (
                <td key={`attendance-total-${pageIndex}-${toDateKey(date)}`} style={{ ...cellBase, textAlign: 'center', fontWeight: 700, borderBottom: '1.4px solid #111' }}>
                  {dayTotals[dayIndex] || ''}
                </td>
              ))}
              <td style={{ ...cellBase, textAlign: 'center', fontWeight: 700, borderBottom: '1.4px solid #111' }}>{monthTotals.total || ''}</td>
              <td style={{ ...cellBase, textAlign: 'center', fontWeight: 700, borderBottom: '1.4px solid #111' }}>{monthTotals.cp || ''}</td>
              <td style={{ ...cellBase, textAlign: 'center', fontWeight: 700, borderBottom: '1.4px solid #111' }}>{monthTotals.kp || ''}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ position: 'absolute', right: 70, bottom: 126, width: 220, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
          <div>Ký xác nhận của<br />giáo viên chủ nhiệm</div>
          <div style={{ height: 82, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeacherSignatureImage url={homeroomTeacherSignatureUrl} alt={`Chu ky ${homeroomTeacherName}`} style={{ height: 58 }} />
          </div>
          <div>{homeroomTeacherName}</div>
        </div>
      </div>
    );
  };

  const renderHkiReviewPage = (pageIndex = 0, semester = 'hki') => {
    const subject = HKI_REVIEW_SUBJECTS[pageIndex] || HKI_REVIEW_SUBJECTS[0];
    const keyPrefix = `${semester}Review`;
    const isHkii = semester === 'hkii';
    const semesterTitle = semester === 'hkii' ? 'HỌC KÌ II' : 'HỌC KÌ I';
    const rows = Array.from({ length: HKI_REVIEW_ROW_COUNT }, (_, index) => (
      subject.loadStudents ? hkiReviewStudents[index] : null
    ));
    const pageInnerWidth = pageWidth - pageMargin * 2;
    const tableWidth = pageInnerWidth - (scoreSheetInsetX * 2);
    const fixedReviewWidth = isHkii ? 44 + 220 + (52 * 4) + (50 * 4) + 94 : 44 + 260 + (68 * 4) + (78 * 3);
    const reviewColWidths = isHkii
      ? [44, 220, 52, 52, 52, 52, 50, 50, 50, 50, 94, tableWidth - fixedReviewWidth]
      : [44, 260, 68, 68, 68, 68, 78, 78, 78, tableWidth - fixedReviewWidth];
    const cellBase = {
      borderLeft: '1.15px solid #111',
      borderRight: '1.15px solid #111',
      padding: '2px 4px',
      verticalAlign: 'middle',
      fontSize: 16,
      lineHeight: 1.05,
      height: 24
    };
    const headerCell = {
      ...cellBase,
      borderTop: '1.35px solid #111',
      borderBottom: '1.35px solid #111',
      textAlign: 'center',
      fontWeight: 700,
      fontSize: 17,
      height: 45
    };
    const titleKey = `${keyPrefix}:${pageIndex}:title`;
    const subjectKey = `${keyPrefix}:${pageIndex}:subject`;
    const teacherName = getAssignedTeacherName(subject, { transcriptSignerOnly: true });
    const teacherKey = `${keyPrefix}:${pageIndex}:teacher`;
    const teacherDisplay = teacherName ? customTextOrFallback(teacherKey, teacherName) : '';
    const teacherSignatureUrl = getTeacherSignatureUrl(teacherDisplay || teacherName);
    const signatureStyle = subject.loadStudents
      ? { marginTop: 25, marginLeft: 'auto', marginRight: scoreSheetInsetX + 40 }
      : { position: 'absolute', right: scoreSheetInsetX + 40, bottom: 122 };
    const gradeValue = (rowIndex, gradeIndex, fallback) => {
      const key = `${keyPrefix}:${pageIndex}:r${rowIndex}:g${gradeIndex}`;
      if (isHkii && gradeIndex === 7) {
        const saved = customText(key, '');
        if (saved) return saved;
        return customText(`${keyPrefix}:${pageIndex}:r${rowIndex}:g6`, fallback);
      }
      return customText(key, fallback);
    };
    const commitGrade = (rowIndex, gradeIndex, fallback, next) => {
      commitCustomText(`${keyPrefix}:${pageIndex}:r${rowIndex}:g${gradeIndex}`, fallback, next);
    };

    return (
      <div className="scorebook-hki-review-page bg-white text-black" style={{ width: pageInnerWidth, height: pageHeight - pageMargin * 2, fontFamily: '"Times New Roman", Times, serif', position: 'relative', boxSizing: 'border-box' }}>
        <EditableText
          value={customText(titleKey, semesterTitle)}
          onCommit={(next) => commitCustomText(titleKey, semesterTitle, next)}
          className="text-center"
          style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.12, height: 32 }}
        />
        <EditableText
          value={customText(subjectKey, subject.title)}
          onCommit={(next) => commitCustomText(subjectKey, subject.title, next)}
          className="text-center"
          style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.18, height: 40 }}
        />
        <table style={{ width: tableWidth, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif', margin: '0 auto' }}>
          <colgroup>
            {reviewColWidths.map((width, index) => <col key={`hki-review-col-${index}`} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...headerCell, fontSize: 17, whiteSpace: 'pre-line' }}>Số<br />TT</th>
              <th rowSpan={2} style={headerCell}>Họ và tên</th>
              <th colSpan={isHkii ? 8 : 7} style={{ ...headerCell, height: 54 }}>
                <div>Mức đánh giá</div>
                <div style={{ fontSize: 16, fontWeight: 400, marginTop: 3 }}>Đạt (Đ), Chưa đạt (CĐ)</div>
              </th>
              {isHkii && <th rowSpan={2} style={{ ...headerCell, height: 54 }}>Mức đánh<br />giá lại</th>}
              <th rowSpan={2} style={headerCell}>Ghi chú</th>
            </tr>
            <tr>
              <th colSpan={4} style={{ ...headerCell, height: 44 }}>Thường xuyên</th>
              <th style={{ ...headerCell, height: 44 }}>Giữa kì</th>
              <th style={{ ...headerCell, height: 44 }}>Cuối kì</th>
              <th style={{ ...headerCell, height: 44 }}>Học kì</th>
              {isHkii && <th style={{ ...headerCell, height: 44 }}>Cả năm</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((student, index) => {
              const hasStudent = Boolean(student?.fullName);
              const borderBottom = profileRowBorder(index);
              const defaultGrades = hasStudent
                ? (isHkii ? ['Đ', 'Đ', '', '', 'Đ', 'Đ', 'Đ', 'Đ', ''] : ['Đ', 'Đ', '', '', 'Đ', 'Đ', 'Đ'])
                : (isHkii ? ['', '', '', '', '', '', '', '', ''] : ['', '', '', '', '', '', '']);
              return (
                <tr key={`hki-review-${pageIndex}-${index}`} style={{ height: 24 }}>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{hasStudent ? index + 1 : ''}</td>
                  <td style={{ ...cellBase, borderBottom }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hasStudent ? titleCaseText(student.fullName) : ''}</div>
                  </td>
                  {(isHkii ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 3, 4, 5, 6]).map((gradeIndex) => (
                    <td key={`hki-review-grade-${pageIndex}-${index}-${gradeIndex}`} style={{ ...cellBase, textAlign: 'center', fontSize: 17, borderBottom }}>
                      <EditableText
                        value={gradeValue(index, gradeIndex, defaultGrades[gradeIndex])}
                        onCommit={(next) => commitGrade(index, gradeIndex, defaultGrades[gradeIndex], next)}
                        style={{ minHeight: 20, fontWeight: 500 }}
                      />
                    </td>
                  ))}
                  <td style={{ ...cellBase, borderBottom }}>
                    <EditableText
                      value={customText(`${keyPrefix}:${pageIndex}:r${index}:note`, '')}
                      onCommit={(next) => commitCustomText(`${keyPrefix}:${pageIndex}:r${index}:note`, '', next)}
                      style={{ minHeight: 20 }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ width: 250, textAlign: 'center', fontSize: 17, ...signatureStyle }}>
          <div style={{ fontWeight: 700 }}>Giáo viên môn học</div>
          <div style={{ fontStyle: 'italic', marginTop: 5 }}>(Kí và ghi rõ họ tên)</div>
          <div style={{ height: 68, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeacherSignatureImage url={teacherSignatureUrl} alt={`Chu ky ${teacherDisplay || teacherName}`} style={{ height: 64 }} />
          </div>
          <EditableText
            value={teacherDisplay}
            onCommit={(next) => commitCustomText(teacherKey, teacherName, next)}
            style={{ minHeight: 24, fontWeight: 700 }}
          />
        </div>
      </div>
    );
  };

  const renderHkiScorePage = (pageIndex = 0, semester = 'hki') => {
    const subject = HKI_SCORE_SUBJECTS[pageIndex] || HKI_SCORE_SUBJECTS[0];
    const keyPrefix = `${semester}Score`;
    const isHkii = semester === 'hkii';
    const semesterTitle = semester === 'hkii' ? 'HỌC KÌ II' : 'HỌC KÌ I';
    const averageHeader = semester === 'hkii' ? 'ĐTB\nmhkII' : 'ĐTB\nmhkI';
    const shouldLoadStudents = subject.loadStudents !== false;
    const rows = Array.from({ length: HKI_SCORE_ROW_COUNT }, (_, index) => (
      shouldLoadStudents ? (hkiScoreStudents[index] || {}) : {}
    ));
    const pageInnerWidth = pageWidth - pageMargin * 2;
    const tableWidth = pageInnerWidth - (scoreSheetInsetX * 2);
    const fixedWidth = isHkii ? 44 + 230 + (54 * 4) + (58 * 4) + 68 : 44 + 260 + (68 * 4) + (74 * 3);
    const scoreColWidths = isHkii
      ? [44, 230, 54, 54, 54, 54, 58, 58, 58, 58, 68, tableWidth - fixedWidth]
      : [44, 260, 68, 68, 68, 68, 74, 74, 74, tableWidth - fixedWidth];
    const cellBase = {
      borderLeft: '1.15px solid #111',
      borderRight: '1.15px solid #111',
      padding: '2px 4px',
      verticalAlign: 'middle',
      fontSize: 15.5,
      lineHeight: 1.05,
      height: 24
    };
    const headerCell = {
      ...cellBase,
      borderTop: '1.35px solid #111',
      borderBottom: '1.35px solid #111',
      textAlign: 'center',
      fontWeight: 700,
      fontSize: 15.5
    };
    const titleKey = `${keyPrefix}:${pageIndex}:title`;
    const subjectKey = `${keyPrefix}:${pageIndex}:subject`;
    const teacherName = subject.loadTeacher === false ? '' : getAssignedTeacherName(subject, { transcriptSignerOnly: true });
    const teacherKey = `${keyPrefix}:${pageIndex}:teacher`;
    const teacherDisplay = teacherName ? customTextOrFallback(teacherKey, teacherName) : '';
    const teacherSignatureUrl = getTeacherSignatureUrl(teacherDisplay || teacherName);
    const scoreValue = (rowIndex, scoreIndex) => {
      if (scoreIndex === 6 || (isHkii && scoreIndex === 7)) return getSemesterScoreResult(semester, pageIndex, rowIndex, scoreIndex);
      return formatScoreDisplayValue(customText(`${keyPrefix}:${pageIndex}:r${rowIndex}:s${scoreIndex}`, ''));
    };

    return (
      <div className="scorebook-hki-score-page bg-white text-black" style={{ width: pageInnerWidth, height: pageHeight - pageMargin * 2, fontFamily: '"Times New Roman", Times, serif', position: 'relative', boxSizing: 'border-box' }}>
        <EditableText
          value={customText(titleKey, semesterTitle)}
          onCommit={(next) => commitCustomText(titleKey, semesterTitle, next)}
          className="text-center"
          style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.12, height: 32 }}
        />
        <EditableText
          value={customText(subjectKey, subject.title)}
          onCommit={(next) => commitCustomText(subjectKey, subject.title, next)}
          className="text-center"
          style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.08, height: 62, whiteSpace: 'pre-line' }}
        />
        <table style={{ width: tableWidth, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif', margin: '0 auto' }}>
          <colgroup>
            {scoreColWidths.map((width, index) => <col key={`hki-score-col-${index}`} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...headerCell, height: 76, whiteSpace: 'pre-line' }}>Số<br />TT</th>
              <th style={{ ...headerCell, height: 76 }}>Họ và tên</th>
              <th colSpan={4} style={{ ...headerCell, height: 76 }}>ĐĐGtx</th>
              <th style={{ ...headerCell, height: 76, whiteSpace: 'pre-line' }}>ĐĐG<br />gk</th>
              <th style={{ ...headerCell, height: 76, whiteSpace: 'pre-line' }}>ĐĐG<br />ck</th>
              <th style={{ ...headerCell, height: 76, whiteSpace: 'pre-line' }}>{averageHeader}</th>
              {isHkii && <th style={{ ...headerCell, height: 76, whiteSpace: 'pre-line' }}>ĐTB<br />mcn</th>}
              {isHkii && <th style={{ ...headerCell, height: 76, whiteSpace: 'pre-line' }}>Đánh<br />giá lại</th>}
              <th style={{ ...headerCell, height: 76 }}>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((student, index) => {
              const hasStudent = Boolean(student?.fullName);
              const borderBottom = profileRowBorder(index);
              return (
                <tr key={`hki-score-${pageIndex}-${index}`} style={{ height: 24 }}>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{hasStudent ? index + 1 : ''}</td>
                  <td style={{ ...cellBase, borderBottom }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hasStudent ? titleCaseText(student.fullName) : ''}</div>
                  </td>
                  {(isHkii ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 3, 4, 5, 6]).map((scoreIndex) => (
                    <td key={`hki-score-cell-${pageIndex}-${index}-${scoreIndex}`} style={{ ...cellBase, textAlign: 'center', borderBottom }}>
                      {scoreIndex === 6 || (isHkii && scoreIndex === 7) ? (
                        <div style={{ minHeight: 20, fontWeight: 500 }}>{scoreValue(index, scoreIndex)}</div>
                      ) : (
                        <EditableText
                          value={scoreValue(index, scoreIndex)}
                          onCommit={(next) => commitCustomText(`${keyPrefix}:${pageIndex}:r${index}:s${scoreIndex}`, '', next)}
                          style={{ minHeight: 20 }}
                        />
                      )}
                    </td>
                  ))}
                  <td style={{ ...cellBase, borderBottom }}>
                    <EditableText
                      value={customText(`${keyPrefix}:${pageIndex}:r${index}:note`, '')}
                      onCommit={(next) => commitCustomText(`${keyPrefix}:${pageIndex}:r${index}:note`, '', next)}
                      style={{ minHeight: 20 }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ width: 250, textAlign: 'center', fontSize: 17, marginTop: 25, marginLeft: 'auto', marginRight: scoreSheetInsetX + 40 }}>
          <div style={{ fontWeight: 700 }}>Giáo viên môn học</div>
          <div style={{ fontStyle: 'italic', marginTop: 5 }}>(Kí và ghi rõ họ tên)</div>
          <div style={{ height: 68, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeacherSignatureImage url={teacherSignatureUrl} alt={`Chu ky ${teacherDisplay || teacherName}`} style={{ height: 64 }} />
          </div>
          <EditableText
            value={teacherDisplay}
            onCommit={(next) => commitCustomText(teacherKey, teacherName, next)}
            style={{ minHeight: 24, fontWeight: 700 }}
          />
        </div>
      </div>
    );
  };

  const renderHkiSummaryPage = (semester = 'hki') => {
    const keyPrefix = `${semester}Summary`;
    const title = semester === 'hkii' ? 'TỔNG HỢP HỌC KỲ II' : 'TỔNG HỢP HỌC KỲ I';
    const rows = Array.from({ length: HKI_SUMMARY_ROW_COUNT }, (_, index) => hkiSummaryStudents[index] || {});
    const pageInnerWidth = pageWidth - pageMargin * 2;
    const tableWidth = pageInnerWidth - (scoreSheetInsetX * 2);
    const fixedSummaryWidth = 32 + 180 + (46 * 4) + (54 * 3) + 58 + (60 * 3) + 54 + 64;
    const summaryColWidths = [32, 180, 46, 46, 46, 46, 54, 54, 54, 58, 60, 60, 60, 54, 64, tableWidth - fixedSummaryWidth];
    const cellBase = {
      borderLeft: '1.05px solid #111',
      borderRight: '1.05px solid #111',
      padding: '2px 3px',
      verticalAlign: 'middle',
      fontSize: 13.8,
      lineHeight: 1.05,
      height: 26
    };
    const headerCell = {
      ...cellBase,
      borderTop: '1.35px solid #111',
      borderBottom: '1.35px solid #111',
      textAlign: 'center',
      fontWeight: 700,
      fontSize: 14.2,
      lineHeight: 1.08,
      whiteSpace: 'pre-line'
    };
    const groupHeader = {
      ...headerCell,
      height: 52,
      fontSize: 14.5
    };
    const subjectHeader = {
      ...headerCell,
      height: 100,
      fontSize: 14,
      borderTop: 0
    };
    const nameClamp = {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    };

    return (
      <div className="scorebook-hki-summary-page bg-white text-black" style={{ width: pageInnerWidth, height: pageHeight - pageMargin * 2, fontFamily: '"Times New Roman", Times, serif', position: 'relative', boxSizing: 'border-box' }}>
        <div style={{ height: 30, textAlign: 'center', fontSize: 22, fontWeight: 700, lineHeight: '28px' }}>{title}</div>
        <table style={{ width: tableWidth, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif', margin: '0 auto' }}>
          <colgroup>
            {summaryColWidths.map((width, index) => <col key={`hki-summary-col-${index}`} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={headerCell}>Số<br />TT</th>
              <th rowSpan={2} style={headerCell}>Họ và tên</th>
              <th colSpan={4} style={groupHeader}>Môn học đánh giá bằng<br />nhận xét</th>
              <th colSpan={8} style={groupHeader}>Môn học đánh giá bằng nhận xét kết hợp đánh giá bằng điểm số</th>
              <th rowSpan={2} style={headerCell}>Kết quả<br />học tập</th>
              <th rowSpan={2} style={headerCell}>Kết quả<br />rèn<br />luyện</th>
            </tr>
            <tr>
              {HKI_SUMMARY_REVIEW_COLUMNS.map((column) => (
                <th key={`hki-summary-review-head-${column.label}`} style={subjectHeader}>{column.label}</th>
              ))}
              {HKI_SUMMARY_SCORE_COLUMNS.map((column) => (
                <th key={`hki-summary-score-head-${column.label}`} style={subjectHeader}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((student, rowIndex) => {
              const hasStudent = Boolean(student?.fullName);
              const borderBottom = profileRowBorder(rowIndex);
              const academicResult = hasStudent ? getAcademicResult(rowIndex, semester) : '';
              const conductResult = hasStudent ? (getSemesterAbsenceCount(student, semester) < 10 ? 'Tốt' : 'Khá') : '';
              return (
                <tr key={`hki-summary-${rowIndex}`} style={{ height: 26 }}>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{hasStudent ? rowIndex + 1 : ''}</td>
                  <td style={{ ...cellBase, borderBottom }}><div style={nameClamp}>{hasStudent ? titleCaseText(student.fullName) : ''}</div></td>
                  {HKI_SUMMARY_REVIEW_COLUMNS.map((column) => (
                    <td key={`hki-summary-review-${rowIndex}-${column.label}`} style={{ ...cellBase, textAlign: 'center', fontSize: 14.5, borderBottom }}>
                      {hasStudent ? getSummaryReviewDisplay(semester, column, rowIndex) : ''}
                    </td>
                  ))}
                  {HKI_SUMMARY_SCORE_COLUMNS.map((column) => (
                    <td key={`hki-summary-score-${rowIndex}-${column.label}`} style={{ ...cellBase, textAlign: 'center', borderBottom }}>
                      {hasStudent ? getSemesterScoreResult(semester, column.sourcePage, rowIndex, 6) : ''}
                    </td>
                  ))}
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{academicResult}</td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{conductResult}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ width: 230, textAlign: 'center', fontSize: 15.5, fontWeight: 700, lineHeight: 1.45, marginTop: 22, marginLeft: 'auto', marginRight: scoreSheetInsetX + 55 }}>
          <div>Ký xác nhận của<br />giáo viên chủ nhiệm</div>
          <div style={{ height: 64, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeacherSignatureImage url={homeroomTeacherSignatureUrl} alt={`Chu ky ${homeroomTeacherName}`} style={{ height: 54 }} />
          </div>
          <EditableText
            value={customTextOrFallback(`${keyPrefix}:homeroomTeacher`, homeroomTeacherName)}
            onCommit={(next) => commitCustomText(`${keyPrefix}:homeroomTeacher`, homeroomTeacherName, next)}
            style={{ marginTop: 4, minHeight: 24, fontWeight: 700 }}
          />
        </div>
      </div>
    );
  };

  const renderFullYearSummaryPage = () => {
    const rows = Array.from({ length: HKI_SUMMARY_ROW_COUNT }, (_, index) => hkiSummaryStudents[index] || {});
    const pageInnerWidth = pageWidth - pageMargin * 2;
    const tableWidth = pageInnerWidth - (scoreSheetInsetX * 2);
    const fixedWidth = 34 + 220 + (58 * 4) + (62 * 7);
    const colWidths = [34, 220, 58, 58, 58, 58, 62, 62, 62, 62, 62, 62, 62, tableWidth - fixedWidth];
    const rowHeight = 27;
    const cellBase = {
      borderLeft: '1.05px solid #111',
      borderRight: '1.05px solid #111',
      padding: '2px 4px',
      verticalAlign: 'middle',
      fontSize: 14.5,
      lineHeight: 1.05,
      height: rowHeight
    };
    const headerCell = {
      ...cellBase,
      borderTop: '1.35px solid #111',
      borderBottom: '1.35px solid #111',
      textAlign: 'center',
      fontWeight: 700,
      fontSize: 16,
      lineHeight: 1.12,
      whiteSpace: 'pre-line'
    };
    const groupHeader = {
      ...headerCell,
      height: 44,
      fontSize: 16.5
    };
    const subjectHeader = {
      ...headerCell,
      height: 78,
      fontSize: 16,
      borderTop: 0
    };
    const reviewColumns = HKI_SUMMARY_REVIEW_COLUMNS.map(column => (
      column.label === 'HĐTT' ? { ...column, label: 'HĐTT' } : column
    ));
    const scoreColumns = HKI_SUMMARY_SCORE_COLUMNS.filter(column => column.sourcePage !== null || column.label === 'Ngoại\nngữ 1' || column.label === 'Tin học');

    return (
      <div className="scorebook-full-year-summary-page bg-white text-black" style={{ width: pageInnerWidth, height: pageHeight - pageMargin * 2, fontFamily: '"Times New Roman", Times, serif', position: 'relative', boxSizing: 'border-box' }}>
        <div style={{ height: 30, textAlign: 'center', fontSize: 23, fontWeight: 700, lineHeight: '28px' }}>TỔNG HỢP CẢ NĂM HỌC</div>
        <table style={{ width: tableWidth, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif', margin: '0 auto' }}>
          <colgroup>
            {colWidths.map((width, index) => <col key={`full-year-summary-col-${index}`} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={headerCell}>Số<br />TT</th>
              <th rowSpan={2} style={headerCell}>Họ và tên</th>
              <th colSpan={4} style={groupHeader}>Môn học đánh giá bằng<br />nhận xét</th>
              <th colSpan={8} style={groupHeader}>Môn học đánh giá bằng nhận xét kết hợp đánh giá bằng điểm số</th>
            </tr>
            <tr>
              {reviewColumns.map((column) => (
                <th key={`full-year-review-head-${column.label}`} style={subjectHeader}>{column.label}</th>
              ))}
              {scoreColumns.map((column) => (
                <th key={`full-year-score-head-${column.label}`} style={subjectHeader}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((student, rowIndex) => {
              const hasStudent = Boolean(student?.fullName);
              const borderBottom = profileRowBorder(rowIndex);
              return (
                <tr key={`full-year-summary-${rowIndex}`} style={{ height: rowHeight }}>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{hasStudent ? rowIndex + 1 : ''}</td>
                  <td style={{ ...cellBase, borderBottom }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hasStudent ? titleCaseText(student.fullName) : ''}</div>
                  </td>
                  {reviewColumns.map((column) => (
                    <td key={`full-year-review-${rowIndex}-${column.label}`} style={{ ...cellBase, textAlign: 'center', borderBottom }}>
                      {hasStudent ? getFullYearSummaryReviewDisplay(column, rowIndex, scoreColumns) : ''}
                    </td>
                  ))}
                  {scoreColumns.map((column) => (
                    <td key={`full-year-score-${rowIndex}-${column.label}`} style={{ ...cellBase, textAlign: 'center', borderBottom }}>
                      {hasStudent ? getSemesterScoreResult('hkii', column.sourcePage, rowIndex, 7) : ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ width: 230, textAlign: 'center', fontSize: 15.5, fontWeight: 700, lineHeight: 1.45, marginTop: 22, marginLeft: 'auto', marginRight: scoreSheetInsetX + 55 }}>
          <div>Ký xác nhận của<br />giáo viên chủ nhiệm</div>
          <div style={{ height: 64, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeacherSignatureImage url={homeroomTeacherSignatureUrl} alt={`Chu ky ${homeroomTeacherName}`} style={{ height: 54 }} />
          </div>
          <EditableText
            value={customTextOrFallback('fullYearSummary:homeroomTeacher', homeroomTeacherName)}
            onCommit={(next) => commitCustomText('fullYearSummary:homeroomTeacher', homeroomTeacherName, next)}
            style={{ marginTop: 4, minHeight: 24, fontWeight: 700 }}
          />
        </div>
      </div>
    );
  };

  const renderClassificationPage = () => {
    const rows = Array.from({ length: CLASSIFICATION_ROW_COUNT }, (_, index) => classificationStudents[index] || {});
    const pageInnerWidth = pageWidth - pageMargin * 2;
    const classificationInsetX = Math.max(24, scoreSheetInsetX - 10);
    const tableWidth = pageInnerWidth - (classificationInsetX * 2);
    const fixedClassificationWidth = 34 + 172 + (64 * 4) + 48 + 98 + 68 + 126;
    const colWidths = [34, 172, 64, 64, 64, 64, 48, 98, 68, 126, tableWidth - fixedClassificationWidth];
    const gradeNumber = Number(getGradeFromClass(grade) || grade);
    const rowHeight = 27;
    const cellBase = {
      borderLeft: '1.05px solid #111',
      borderRight: '1.05px solid #111',
      padding: '2px 4px',
      verticalAlign: 'middle',
      fontSize: 13.4,
      lineHeight: 1.05,
      height: rowHeight
    };
    const headerCell = {
      ...cellBase,
      borderTop: '1.35px solid #111',
      borderBottom: '1.35px solid #111',
      textAlign: 'center',
      fontWeight: 700,
      fontSize: 14.5,
      lineHeight: 1.12,
      whiteSpace: 'pre-line'
    };
    const groupHeader = {
      ...headerCell,
      height: 44,
      fontSize: 14.5
    };
    const subjectHeader = {
      ...headerCell,
      height: 78,
      fontSize: 14,
      borderTop: 0
    };
    const compactGroupHeader = {
      ...groupHeader,
      padding: '1px 4px',
      fontSize: 12.2,
      lineHeight: 1.05
    };
    const buildRowResult = (student, rowIndex) => {
      const hasStudent = Boolean(student?.fullName);
      const academicResult = hasStudent ? getAcademicResult(rowIndex, 'hkii') : '';
      const absenceCount = hasStudent ? getFullYearAbsenceCount(student) : '';
      const conductResult = hasStudent ? (absenceCount < 20 ? 'Tốt' : 'Khá') : '';
      const promoted = hasStudent && (gradeNumber === 9 || isPassingAcademicResult(academicResult));
      const rewardText = academicResult === 'Khá' ? 'Học sinh tiên tiến' : '';
      return { hasStudent, academicResult, absenceCount, conductResult, promoted, rewardText };
    };
    const rowResults = rows.map(buildRowResult);
    const promotedCount = rowResults.filter(item => item.hasStudent && item.promoted).length;
    const notPromotedCount = rowResults.filter(item => item.hasStudent && !item.promoted).length;
    const summaryText = [
      `Tổng số học sinh: ${allClassStudents.length}`,
      '',
      gradeNumber === 9 ? `Đủ điều kiện xét TN: ${promotedCount}` : `Được lên lớp: ${promotedCount}`,
      'Trong đó ... được lên lớp sau khi học tập, rèn luyện thêm trong hè.',
      '',
      `Không được lên lớp: ${notPromotedCount}`
    ].join('\n');

    return (
      <div className="scorebook-classification-page bg-white text-black" style={{ width: pageInnerWidth, height: pageHeight - pageMargin * 2, fontFamily: '"Times New Roman", Times, serif', position: 'relative', boxSizing: 'border-box' }}>
        <div style={{ height: 30, textAlign: 'center', fontSize: 23, fontWeight: 700, lineHeight: '28px' }}>XẾP LOẠI CẢ NĂM HỌC</div>
        <table style={{ width: tableWidth, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif', margin: '0 auto' }}>
          <colgroup>
            {colWidths.map((width, index) => <col key={`classification-col-${index}`} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={headerCell}>Số<br />TT</th>
              <th rowSpan={2} style={headerCell}>Họ và tên</th>
              <th colSpan={2} style={groupHeader}>Mức đánh giá</th>
              <th colSpan={2} style={compactGroupHeader}>Mức đánh giá sau<br />khi rèn luyện trong kì nghỉ hè;<br />kiểm tra, đánh giá lại</th>
              <th rowSpan={2} style={headerCell}>Tổng<br />số<br />buổi<br />nghỉ<br />học</th>
              <th rowSpan={2} style={headerCell}>Được lên lớp</th>
              <th rowSpan={2} style={headerCell}>Không được<br />lên lớp</th>
              <th rowSpan={2} style={headerCell}>Khen<br />thưởng</th>
              <th rowSpan={2} style={headerCell}>Tổng hợp chung</th>
            </tr>
            <tr>
              <th style={subjectHeader}>Kết quả<br />rèn<br />luyện</th>
              <th style={subjectHeader}>Kết quả<br />học tập</th>
              <th style={subjectHeader}>Kết quả<br />rèn<br />luyện</th>
              <th style={subjectHeader}>Kết quả<br />học tập</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((student, rowIndex) => {
              const result = rowResults[rowIndex];
              const borderBottom = profileRowBorder(rowIndex);
              return (
                <tr key={`classification-${rowIndex}`} style={{ height: rowHeight }}>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{result.hasStudent ? rowIndex + 1 : ''}</td>
                  <td style={{ ...cellBase, borderBottom }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.hasStudent ? titleCaseText(student.fullName) : ''}</div>
                  </td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{result.conductResult}</td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{result.academicResult}</td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }} />
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }} />
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{result.hasStudent ? result.absenceCount : ''}</td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{result.hasStudent && result.promoted ? (gradeNumber === 9 ? 'Đủ ĐK xét Tn' : 'Được lên lớp') : ''}</td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>{result.hasStudent && !result.promoted ? 'Ở lại lớp' : ''}</td>
                  <td style={{ ...cellBase, textAlign: 'center', borderBottom }}>
                    <EditableText
                      value={customText(`classification:r${rowIndex}:reward`, result.rewardText)}
                      onCommit={(next) => commitCustomText(`classification:r${rowIndex}:reward`, result.rewardText, next)}
                      style={{ minHeight: 18 }}
                    />
                  </td>
                  {rowIndex === 0 && (
                    <td rowSpan={CLASSIFICATION_ROW_COUNT} style={{ ...cellBase, borderBottom: '1.35px solid #111', verticalAlign: 'top', padding: 0 }}>
                      <div style={{ padding: '22px 5px 0 5px', whiteSpace: 'pre-line', fontSize: 14.5, lineHeight: 1.25 }}>{summaryText}</div>
                      <div style={{ marginTop: 92, textAlign: 'center', fontWeight: 700, fontSize: 14.2, padding: '0 8px' }}>
                        <div>GIÁO VIÊN CHỦ NHIỆM</div>
                        <div style={{ fontStyle: 'italic', fontWeight: 400 }}>(Ký và ghi rõ họ tên)</div>
                        <div style={{ height: 64, marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <TeacherSignatureImage url={homeroomTeacherSignatureUrl} alt={`Chu ky ${homeroomTeacherName}`} style={{ height: 54 }} />
                        </div>
                        <EditableText
                          value={customTextOrFallback('classification:homeroomTeacher', homeroomTeacherName)}
                          onCommit={(next) => commitCustomText('classification:homeroomTeacher', homeroomTeacherName, next)}
                          style={{ marginTop: 4, minHeight: 22 }}
                        />
                      </div>
                      <div style={{ marginTop: 90, textAlign: 'center', fontWeight: 700, fontSize: 15.5 }}>
                        <div>HIỆU TRƯỞNG</div>
                        <div style={{ fontStyle: 'italic', fontWeight: 400 }}>(Ký và ghi rõ họ tên)</div>
                        <EditableText
                          value={customTextOrFallback('classification:principal', principalName)}
                          onCommit={(next) => commitCustomText('classification:principal', principalName, next)}
                          style={{ marginTop: 92, minHeight: 22 }}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderPrincipalCommentPage = () => {
    const months = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
    const pageInnerWidth = pageWidth - pageMargin * 2;
    const principalCommentInsetX = 38;
    const tableWidth = pageInnerWidth - (principalCommentInsetX * 2);
    const colWidths = [170, 520, tableWidth - 690];
    const headerHeight = 48;
    const rowHeight = Math.floor((pageHeight - pageMargin * 2 - 72 - headerHeight) / months.length);
    const cellBase = {
      border: '1.15px solid #111',
      padding: '4px 8px',
      verticalAlign: 'middle',
      fontSize: 16,
      lineHeight: 1.18
    };
    const headerCell = {
      ...cellBase,
      textAlign: 'center',
      fontWeight: 700,
      height: headerHeight
    };
    const defaultComment = `Cập nhật đầy đủ\nSĩ số : ${allClassStudents.length}\nNam : ${classGenderStats.male} Nữ: ${classGenderStats.female}`;

    return (
      <div className="scorebook-principal-comment-page bg-white text-black" style={{ width: pageInnerWidth, height: pageHeight - pageMargin * 2, fontFamily: '"Times New Roman", Times, serif', position: 'relative', boxSizing: 'border-box' }}>
        <div style={{ height: 72, textAlign: 'center', fontWeight: 700, lineHeight: 1.18 }}>
          <div style={{ fontSize: 24 }}>NHẬN XÉT CỦA HIỆU TRƯỞNG</div>
          <div style={{ fontSize: 22, marginTop: 4 }}>VỀ SỬ DỤNG SỔ THEO DÕI VÀ ĐÁNH GIÁ HỌC SINH</div>
        </div>
        <table style={{ width: tableWidth, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif', margin: '0 auto' }}>
          <colgroup>
            {colWidths.map((width, index) => <col key={`principal-comment-col-${index}`} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={headerCell}>Tháng</th>
              <th style={headerCell}>Nhận xét</th>
              <th style={headerCell}>Ký tên, đóng dấu</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => {
              const commentKey = `principalComment:${month}:comment`;
              const signKey = `principalComment:${month}:sign`;
              const fallback = month === 8 ? '' : defaultComment;
              return (
                <tr key={`principal-comment-${month}`} style={{ height: rowHeight }}>
                  <td style={{ ...cellBase, textAlign: 'center', fontSize: 16 }}>{month}</td>
                  <td style={{ ...cellBase, fontSize: 24, padding: '8px 28px' }}>
                    <EditableText
                      value={customText(commentKey, fallback)}
                      onCommit={(next) => commitCustomText(commentKey, fallback, next)}
                      style={{ minHeight: rowHeight - 18, whiteSpace: 'pre-line' }}
                    />
                  </td>
                  <td style={{ ...cellBase, fontSize: 18 }}>
                    <EditableText
                      value={customText(signKey, '')}
                      onCommit={(next) => commitCustomText(signKey, '', next)}
                      style={{ minHeight: rowHeight - 18, whiteSpace: 'pre-line' }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const transcriptStudentName = (student = selectedTranscriptStudent) => titleCaseText(decodeDisplayText(student?.fullName));
  const transcriptStudentClass = (student = selectedTranscriptStudent) => getPcClassName(decodeDisplayText(student?.className || student?.grade), grade);
  const transcriptRegisterCode = (student = selectedTranscriptStudent) => decodeDisplayText(student?.pcgdCode || student?.registerCode || student?.studentCode || student?.accessCode || '');
  const transcriptStudentPhotoUrl = (student = selectedTranscriptStudent) => {
    const directPhoto = student?.portraitUrl || student?.portraitURL || student?.photoUrl || student?.photoURL || student?.avatarUrl || student?.avatarURL || student?.imageUrl || student?.profileImageUrl || student?.studentPhotoUrl || student?.pictureUrl || student?.portrait || student?.photo || student?.avatar || student?.picture || '';
    const scannedPhoto = Object.entries(student || {}).find(([key, value]) => (
      /photo|portrait|avatar|image|picture|anh|ảnh/i.test(key) && firstUrl(value)
    ))?.[1];
    return normalizeImageUrl(directPhoto || scannedPhoto || '');
  };
  const defaultTranscriptStartDateText = (schoolYearLabel = currentSchoolYear) => {
    const startYear = getSchoolYearStartYear(schoolYearLabel);
    return formatSignatureDateText(nthWeekdayOfMonth(startYear, 9, 2, 2));
  };
  const defaultTranscriptEndDateText = (schoolYearLabel = currentSchoolYear) => {
    const startYear = getSchoolYearStartYear(schoolYearLabel);
    return formatSignatureDateText(lastWeekdayOfMonth(startYear + 1, 5, 4));
  };
  const defaultTranscriptGrade9EndDateText = (schoolYearLabel = currentSchoolYear) => {
    const startYear = getSchoolYearStartYear(schoolYearLabel);
    return formatSignatureDateText(addDaysToDateKey(lastWeekdayOfMonth(startYear + 1, 5, 4), -5));
  };
  const getTranscriptDateFallback = (dateMap = {}, schoolYearLabel = currentSchoolYear, defaultValue = '', preferredSemester = 'hk2') => {
    const key = compactSchoolYearLabel(schoolYearLabel);
    return formatSignatureDateText(decodeSemesterDisplayText(dateMap?.[key] || dateMap?.[schoolYearLabel] || defaultValue, preferredSemester));
  };
  const getTranscriptStartDateText = (schoolYearLabel = currentSchoolYear) => {
    const key = compactSchoolYearLabel(schoolYearLabel);
    const fallback = getTranscriptDateFallback(transcriptStartDates, schoolYearLabel, defaultTranscriptStartDateText(schoolYearLabel), 'hk1');
    return customText(`transcript:date:start:${key}`, fallback);
  };
  const getTranscriptEndDateText = (schoolYearLabel = currentSchoolYear, gradeNumber = grade) => {
    const key = compactSchoolYearLabel(schoolYearLabel);
    const isGrade9 = String(gradeNumber || '').replace(/[^\d]/g, '') === '9';
    const fallback = isGrade9
      ? getTranscriptDateFallback(transcriptGrade9EndDates, schoolYearLabel, defaultTranscriptGrade9EndDateText(schoolYearLabel), 'hk2')
      : getTranscriptDateFallback(transcriptEndDates, schoolYearLabel, defaultTranscriptEndDateText(schoolYearLabel), 'hk2');
    const legacyFallback = isGrade9 ? customText(`transcript:date:end:${key}`, fallback) : fallback;
    return customText(`transcript:date:${isGrade9 ? 'grade9-end' : 'end'}:${key}`, legacyFallback);
  };
  const getTranscriptSignerFallback = (signerMap = {}, schoolYearLabel = currentSchoolYear, preferredSemester = 'hk2') => {
    const key = compactSchoolYearLabel(schoolYearLabel);
    return decodeSemesterDisplayText(signerMap?.[key] || signerMap?.[schoolYearLabel] || principalName || '', preferredSemester).trim();
  };
  const getTranscriptStartSignerText = (schoolYearLabel = currentSchoolYear) => {
    const key = compactSchoolYearLabel(schoolYearLabel);
    return customText(`transcript:signer:start:${key}`, getTranscriptSignerFallback(transcriptStartSigners, schoolYearLabel, 'hk1'));
  };
  const getTranscriptEndSignerText = (schoolYearLabel = currentSchoolYear) => {
    const key = compactSchoolYearLabel(schoolYearLabel);
    return customText(`transcript:signer:end:${key}`, getTranscriptSignerFallback(transcriptEndSigners, schoolYearLabel, 'hk2'));
  };
  const transcriptEditKey = (page, key, student = selectedTranscriptStudent) => `transcript:${student?.id || 'student'}:${page}:${key}`;
  const getTranscriptFirstStartYear = (student = selectedTranscriptStudent) => {
    const codeText = String(student?.pcgdCode || student?.registerCode || student?.studentCode || student?.accessCode || '');
    const codeYear = codeText.match(/20\d{2}/)?.[0]
      || (codeText.match(/^HS(\d{2})/i) ? `20${codeText.match(/^HS(\d{2})/i)[1]}` : '');
    const values = [
      student?.firstSchoolYear,
      student?.entrySchoolYear,
      student?.admissionSchoolYear,
      student?.enrollmentSchoolYear,
      student?.schoolYear,
      student?.admissionYear,
      student?.enrollmentYear,
      student?.startYear,
      codeYear
    ];
    const found = values.find(value => String(value || '').match(/\d{4}/));
    return found ? getSchoolYearStartYear(found) : null;
  };
  const getTranscriptYearEntriesForStudent = (student = selectedTranscriptStudent) => {
    const currentStart = getSchoolYearStartYear(currentSchoolYear);
    const currentGradeNumber = Number(getGradeFromClass(student?.className || grade) || grade || 6);
    const inferredStart = currentStart - Math.max(0, currentGradeNumber - 6);
    const knownStart = getTranscriptFirstStartYear(student);
    const firstStart = Math.max(
      TRANSCRIPT_DIGITAL_START_YEAR,
      Math.min(
        currentStart,
        inferredStart,
        Number.isFinite(knownStart) ? knownStart : currentStart
      )
    );
    return Array.from({ length: Math.max(1, currentStart - firstStart + 1) }, (_, index) => {
      const startYear = firstStart + index;
      return {
        startYear,
        schoolYear: schoolYearLabelFromStart(startYear),
        compactSchoolYear: compactSchoolYearLabel(schoolYearLabelFromStart(startYear)),
        gradeNumber: Math.max(6, Math.min(9, currentGradeNumber - (currentStart - startYear)))
      };
    });
  };
  const transcriptYearEntries = useMemo(() => getTranscriptYearEntriesForStudent(selectedTranscriptStudent), [selectedTranscriptStudent, currentSchoolYear, grade]);
  const sameSchoolYear = (a = '', b = '') => compactSchoolYearLabel(a) === compactSchoolYearLabel(b);
  const getScorebookEditsForYearGrade = (schoolYearLabel = currentSchoolYear, gradeValue = grade) => {
    const schoolYearKey = compactSchoolYearLabel(schoolYearLabel);
    const gradeKey = String(gradeValue || '').trim();
    if (sameSchoolYear(schoolYearLabel, currentSchoolYear) && gradeKey === String(grade)) return edits;
    return scorebookEditsByYearGrade[`${schoolYearKey}__${gradeKey}`]?.edits || {};
  };
  const studentIdentityKey = (student = {}) => {
    const stable = String(student.accessCode || student.studentCode || student.pcgdCode || student.identityCode || '').trim().toUpperCase();
    if (stable) return stable;
    return `${normalizeSortText(student.fullName)}__${String(student.birthDate || '').trim()}`;
  };
  const getTranscriptYearContext = (yearEntry = {}, transcriptStudent = selectedTranscriptStudent) => {
    const selectedKey = studentIdentityKey(transcriptStudent || {});
    const selectedNameBirth = `${normalizeSortText(transcriptStudent?.fullName || '')}__${String(transcriptStudent?.birthDate || '').trim()}`;
    const gradeKey = String(yearEntry.gradeNumber || '');
    const yearStudents = [...(Array.isArray(students) ? students : [])]
      .filter(student => (student.status || 'active') !== 'dropped')
      .filter(student => String(getGradeFromClass(student.className || student.grade || '')) === gradeKey)
      .filter(student => !student.schoolYear || sameSchoolYear(student.schoolYear, yearEntry.schoolYear))
      .sort((a, b) => {
        const classCompare = String(a.className || '').localeCompare(String(b.className || ''), 'vi', { numeric: true, sensitivity: 'base' });
        if (classCompare) return classCompare;
        return getGivenNameSortKey(a.fullName).localeCompare(getGivenNameSortKey(b.fullName), 'vi', { sensitivity: 'base' });
      });
    const matchedStudent = yearStudents.find(student => studentIdentityKey(student) === selectedKey)
      || yearStudents.find(student => `${normalizeSortText(student.fullName)}__${String(student.birthDate || '').trim()}` === selectedNameBirth)
      || null;
    return {
      yearStudents,
      student: matchedStudent,
      rowIndex: matchedStudent ? yearStudents.findIndex(student => student.id === matchedStudent.id) : -1
    };
  };
  const getEditTextFromMap = (map = {}, key, fallback = '') => {
    const normalizedKey = String(key || '');
    const candidates = normalizedKey.startsWith('custom:')
      ? [normalizedKey, normalizedKey.replace(/^custom:/, '')]
      : [`custom:${normalizedKey}`, normalizedKey];
    const foundKey = candidates.find(candidate => Object.prototype.hasOwnProperty.call(map || {}, candidate));
    return decodeDisplayText(foundKey ? map[foundKey] : fallback);
  };
  const getYearScoreInputValue = (yearEntry, semester, pageIndex, rowIndex, scoreIndex) => {
    const yearEdits = getScorebookEditsForYearGrade(yearEntry?.schoolYear, yearEntry?.gradeNumber);
    return getEditTextFromMap(yearEdits, `${semester}Score:${pageIndex}:r${rowIndex}:s${scoreIndex}`, '');
  };
  const getYearSemesterTermAverage = (yearEntry, semester, pageIndex, rowIndex) => {
    const txScores = [0, 1, 2, 3]
      .map(scoreIndex => parseScoreNumber(getYearScoreInputValue(yearEntry, semester, pageIndex, rowIndex, scoreIndex)))
      .filter(value => value !== null);
    const midterm = parseScoreNumber(getYearScoreInputValue(yearEntry, semester, pageIndex, rowIndex, 4));
    const final = parseScoreNumber(getYearScoreInputValue(yearEntry, semester, pageIndex, rowIndex, 5));
    if (!txScores.length || midterm === null || final === null) return '';
    const total = txScores.reduce((sum, value) => sum + value, 0) + (2 * midterm) + (3 * final);
    return formatScoreNumber(total / (txScores.length + 5));
  };
  const getYearSemesterScoreResult = (yearEntry, semester, pageIndex, rowIndex, scoreIndex = semester === 'hkii' ? 7 : 6) => {
    if (pageIndex === null || pageIndex === undefined || rowIndex < 0) return '';
    const saved = getYearScoreInputValue(yearEntry, semester, pageIndex, rowIndex, scoreIndex);
    if (saved !== '') return saved;
    if (scoreIndex === 6) return getYearSemesterTermAverage(yearEntry, semester, pageIndex, rowIndex);
    if (semester === 'hkii' && scoreIndex === 7) {
      const hkiAverage = parseScoreNumber(getYearSemesterScoreResult(yearEntry, 'hki', pageIndex, rowIndex, 6));
      const hkiiAverage = parseScoreNumber(getYearSemesterScoreResult(yearEntry, 'hkii', pageIndex, rowIndex, 6));
      if (hkiAverage === null || hkiiAverage === null) return '';
      return formatScoreNumber((hkiAverage + (2 * hkiiAverage)) / 3);
    }
    return '';
  };
  const getYearSemesterReviewResult = (yearEntry, semester, pageIndex, rowIndex) => {
    if (pageIndex === null || pageIndex === undefined || rowIndex < 0) return '';
    const yearEdits = getScorebookEditsForYearGrade(yearEntry?.schoolYear, yearEntry?.gradeNumber);
    const gradeIndex = semester === 'hkii' ? 7 : 6;
    const saved = getEditTextFromMap(yearEdits, `${semester}Review:${pageIndex}:r${rowIndex}:g${gradeIndex}`, '');
    if (saved || semester !== 'hkii') return saved;
    return getEditTextFromMap(yearEdits, `${semester}Review:${pageIndex}:r${rowIndex}:g6`, '');
  };
  const getYearFullReviewResult = (yearEntry, pageIndex, rowIndex) => {
    if (pageIndex === null || pageIndex === undefined || rowIndex < 0) return '';
    const yearEdits = getScorebookEditsForYearGrade(yearEntry?.schoolYear, yearEntry?.gradeNumber);
    const saved = getEditTextFromMap(yearEdits, `hkiiReview:${pageIndex}:r${rowIndex}:g7`, '');
    if (saved) return saved;
    return getEditTextFromMap(yearEdits, `hkiiReview:${pageIndex}:r${rowIndex}:g6`, '');
  };
  const normalizeTranscriptReviewValue = (value = '', subject = {}) => {
    const text = String(value || '').trim();
    if (text === 'Đ') return 'Đạt';
    if (text) return text;
    return subject.reviewPage === 2 || subject.reviewPage === 3 ? 'Đạt' : '';
  };
  const transcriptSubjectValue = (yearEntry, subject, semester, student = selectedTranscriptStudent) => {
    const context = getTranscriptYearContext(yearEntry, student);
    if (!student || context.rowIndex < 0) return '';
    if (subject.scorePage !== undefined) {
      if (semester === 'hki') return getYearSemesterScoreResult(yearEntry, 'hki', subject.scorePage, context.rowIndex, 6);
      if (semester === 'hkii') return getYearSemesterScoreResult(yearEntry, 'hkii', subject.scorePage, context.rowIndex, 6);
      return getYearSemesterScoreResult(yearEntry, 'hkii', subject.scorePage, context.rowIndex, 7);
    }
    if (subject.reviewPage !== undefined) {
      if (semester === 'hki') return normalizeTranscriptReviewValue(getYearSemesterReviewResult(yearEntry, 'hki', subject.reviewPage, context.rowIndex), subject);
      if (semester === 'hkii') return normalizeTranscriptReviewValue(getYearSemesterReviewResult(yearEntry, 'hkii', subject.reviewPage, context.rowIndex), subject);
      return normalizeTranscriptReviewValue(getYearFullReviewResult(yearEntry, subject.reviewPage, context.rowIndex), subject);
    }
    return '';
  };
  const transcriptSubjectTeacher = (subject, yearEntry) => {
    if (!subject.teacherSubject) return '';
    return getAssignedTeacherName(
      { classSubject: subject.teacherSubject, teacherKeys: [subject.teacherSubject] },
      { schoolYear: yearEntry?.schoolYear, gradeValue: yearEntry?.gradeNumber, preferredSemester: 'hk2' }
    );
  };
  const getTranscriptAcademicResult = (yearEntry, period = 'hkii', student = selectedTranscriptStudent) => {
    const context = getTranscriptYearContext(yearEntry, student);
    if (!context.student || context.rowIndex < 0) return '';
    const semester = period === 'hki' ? 'hki' : 'hkii';
    const scoreIndex = period === 'fullYear' ? 7 : 6;
    const scores = HKI_SUMMARY_SCORE_COLUMNS
      .filter(column => column.academic)
      .map(column => parseScoreNumber(getYearSemesterScoreResult(yearEntry, semester, column.sourcePage, context.rowIndex, scoreIndex)))
      .filter(value => value !== null);
    if (!scores.length) return '';
    if (scores.filter(score => score >= 8).length >= 5 && scores.every(score => score >= 6.5)) return 'Tốt';
    if (scores.filter(score => score >= 6.5).length >= 5 && scores.every(score => score >= 5)) return 'Khá';
    if (scores.filter(score => score >= 5).length >= 5 && scores.every(score => score >= 3.5)) return 'Đạt';
    return 'Chưa đạt';
  };
  const getStudentAttendanceStatusForYear = (student, date, gradeKey) => {
    if (!student?.id) return '';
    const dateKey = toDateKey(date);
    const records = attendanceMap.get(`${dateKey}__${String(gradeKey || '')}`) || {};
    const record = records[student.id] || Object.values(records).find(item => item?.studentId === student.id);
    return record?.status || '';
  };
  const getTranscriptAbsenceCount = (yearEntry, semester = 'full', student = selectedTranscriptStudent) => {
    const context = getTranscriptYearContext(yearEntry, student);
    if (!context.student?.id) return 0;
    const yearStart = getSchoolYearStartYear(yearEntry?.schoolYear || currentSchoolYear);
    const start = semester === 'hkii'
      ? new Date(yearStart + 1, 0, 16)
      : semester === 'hki'
        ? new Date(yearStart, 8, 1)
        : new Date(yearStart, 8, 1);
    const end = semester === 'hkii'
      ? new Date(yearStart + 1, 4, 31)
      : semester === 'hki'
        ? new Date(yearStart + 1, 0, 15)
        : new Date(yearStart + 1, 4, 31);
    let count = 0;
    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const status = getStudentAttendanceStatusForYear(context.student, date, yearEntry?.gradeNumber);
      if (status === 'CP' || status === 'KP') count += 1;
    }
    return count;
  };
  const getTranscriptConductResult = (yearEntry, semester = 'full', student = selectedTranscriptStudent) => {
    const absenceCount = getTranscriptAbsenceCount(yearEntry, semester, student);
    return absenceCount < (semester === 'full' ? 20 : 10) ? 'Tốt' : 'Khá';
  };
  const getTranscriptInnerInsets = (pageNumber = 0) => {
    const baseInset = 19;
    const gutterExtra = 19;
    if (pageNumber > 1 && pageNumber % 2 === 0) return { left: baseInset, right: baseInset + gutterExtra };
    if (pageNumber > 1) return { left: baseInset + gutterExtra, right: baseInset };
    return { left: baseInset, right: baseInset };
  };

  const getTranscriptPagePadding = (pageNumber = 0, top = 34, right = 38, bottom = 34, left = 38) => {
    const insets = getTranscriptInnerInsets(pageNumber);
    return `${top}px ${right + insets.right}px ${bottom}px ${left + insets.left}px`;
  };

  const renderTranscriptPageShell = (children, options = {}) => {
    const hasBorder = options.border !== false;
    const pageNumber = Number(options.pageNumber || 0);
    const shouldNumberPage = pageNumber > 1 && !options.blank;
    const insets = hasBorder || shouldNumberPage ? getTranscriptInnerInsets(pageNumber) : { left: 0, right: 0 };
    const defaultPadding = hasBorder || shouldNumberPage ? getTranscriptPagePadding(pageNumber) : '34px 38px';
    return (
      <div
        className="transcript-page bg-white text-black"
        style={{
          width: transcriptPageWidth,
          height: transcriptPageHeight,
          fontFamily: '"Times New Roman", Times, serif',
          position: 'relative',
          boxSizing: 'border-box',
          padding: options.padding || defaultPadding,
          border: 0,
          overflow: 'hidden'
        }}
      >
        {hasBorder && (
          <div
            style={{
              position: 'absolute',
              left: insets.left,
              right: insets.right,
              top: 0,
              bottom: 0,
              border: '1.4px solid #111',
              pointerEvents: 'none'
            }}
          />
        )}
        {children}
        {shouldNumberPage && (
          <div
            style={{
              position: 'absolute',
              bottom: 9,
              ...(pageNumber % 2 === 0 ? { left: insets.left + 18 } : { right: insets.right + 18 }),
              fontSize: 15,
              fontFamily: '"Times New Roman", Times, serif'
            }}
          >
            {pageNumber}
          </div>
        )}
      </div>
    );
  };

  const renderTranscriptCoverPage = (student = selectedTranscriptStudent) => {
    const coverLeft = 54;
    const coverRight = 28;
    const infoLabel = { fontWeight: 700, fontSize: 16.5, lineHeight: 1.6 };
    const infoValue = { fontWeight: 700, fontStyle: 'italic', fontSize: 16.5, lineHeight: 1.6, textTransform: 'uppercase' };
    return renderTranscriptPageShell((
      <>
        <div style={{ position: 'absolute', left: coverLeft, right: coverRight, top: 41, bottom: 41, border: '1.8px solid #111', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: coverLeft + 5, right: coverRight + 5, top: 46, bottom: 46, border: '1px solid #111', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 64, left: coverLeft, right: coverRight, textAlign: 'center', fontSize: 20, fontWeight: 700 }}>
          BỘ GIÁO DỤC VÀ ĐÀO TẠO
        </div>
        <div style={{ position: 'absolute', top: 101, right: coverRight + 30, width: 82, height: 30, border: '1.1px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, fontWeight: 400 }}>
          Phổ cập
        </div>
        <div style={{ position: 'absolute', top: 405, left: coverLeft, right: coverRight, textAlign: 'center' }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1 }}>{TRANSCRIPT_TEXT.title}</div>
          <div style={{ marginTop: 18, fontSize: 21, fontWeight: 700 }}>{TRANSCRIPT_TEXT.subtitle}</div>
        </div>
        <div style={{ position: 'absolute', top: 760, left: coverLeft + 70, right: coverRight + 70, display: 'grid', gridTemplateColumns: '235px 1fr', columnGap: 18 }}>
          <div style={infoLabel}>
            <div>Họ tên học viên:</div>
            <div>Trung tâm:</div>
            <div>Huyện/Quận/Thị xã/Thành phố:</div>
            <div>Tỉnh/Thành phố:</div>
          </div>
          <div style={infoValue}>
            <EditableText value={customText('transcriptCover:studentName', transcriptStudentName(student))} onCommit={(next) => commitCustomText('transcriptCover:studentName', transcriptStudentName(student), next)} />
            <EditableText value={customText('transcriptCover:center', 'TRƯỜNG THCS NGUYỄN AN NINH')} onCommit={(next) => commitCustomText('transcriptCover:center', 'TRƯỜNG THCS NGUYỄN AN NINH', next)} />
            <EditableText value={customText('transcriptCover:district', 'Phường Trung Mỹ Tây').replace(/^\((.*)\)$/, '$1')} onCommit={(next) => commitCustomText('transcriptCover:district', 'Phường Trung Mỹ Tây', next)} />
            <EditableText value={customText('transcriptCover:province', 'HỒ CHÍ MINH')} onCommit={(next) => commitCustomText('transcriptCover:province', 'HỒ CHÍ MINH', next)} />
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 67, left: coverLeft, right: coverRight, textAlign: 'center', fontSize: 17, fontWeight: 700 }}>
          Số sổ đăng bộ PCGD: {transcriptRegisterCode(student) || '....................'}/THCS
        </div>
      </>
    ), { border: false });
  };

  const renderTranscriptGuidePage = (pageNumber = 0) => renderTranscriptPageShell((
    <>
      <div style={{ textAlign: 'center', fontSize: 25, fontWeight: 700, marginBottom: 22 }}>
        HƯỚNG DẪN SỬ DỤNG HỌC BẠ
      </div>
      <div style={{ borderTop: '2px solid #111', width: 124, margin: '-14px auto 28px auto' }} />
      <div style={{ fontSize: 18.4, lineHeight: 1.28 }}>
        {TRANSCRIPT_GUIDE_SECTIONS.map((section, sectionIndex) => (
          <div key={`transcript-guide-${section.title}`} style={{ marginBottom: sectionIndex === 2 ? 14 : 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 3 }}>{section.title}</div>
            {section.lines.map((line, lineIndex) => (
              <div key={`transcript-guide-line-${section.title}-${lineIndex}`} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', columnGap: 0, marginBottom: 5 }}>
                <span>-</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  ), { border: false, pageNumber });

  const renderTranscriptInfoPage = (transcriptStudent = selectedTranscriptStudent, yearEntries = transcriptYearEntries, pageNumber = 0) => {
    const student = transcriptStudent || {};
    const photoUrl = transcriptStudentPhotoUrl(student);
    const processRows = Array.from({ length: 5 }, (_, index) => yearEntries[index] || null);
    const entrySchoolYear = yearEntries?.[0]?.schoolYear || currentSchoolYear;
    const entrySchoolYearKey = compactSchoolYearLabel(entrySchoolYear);
    const entryDateFallback = getTranscriptDateFallback(transcriptStartDates, entrySchoolYear, defaultTranscriptStartDateText(entrySchoolYear), 'hk1');
    const entryDateText = getTranscriptStartDateText(entrySchoolYear);
    const entrySignerText = getTranscriptStartSignerText(entrySchoolYear);
    const pageInsets = getTranscriptInnerInsets(pageNumber);
    const absoluteLeft = 38 + pageInsets.left;
    const absoluteRight = 38 + pageInsets.right;
    const infoLine = (label, value, extra = null, options = {}) => {
      const displayValue = decodeDisplayText(value);
      return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 11, fontSize: 18.5, lineHeight: 1.16 }}>
          <span style={options.singleLine ? { flex: '0 0 auto', whiteSpace: 'nowrap' } : undefined}>{label}</span>
          <span
            style={{
              fontWeight: 700,
              ...(options.singleLine ? {
                flex: '1 1 auto',
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
                fontSize: fitSingleLineFontSize(displayValue, 18.5, 11.5, options.fitLength || 58),
                lineHeight: 1
              } : {})
            }}
          >
            {displayValue}
          </span>
          {extra}
        </div>
      );
    };
    return renderTranscriptPageShell((
      <>
        <div style={{ textAlign: 'center', fontWeight: 700, lineHeight: 1.22 }}>
          <div style={{ fontSize: 22 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div style={{ fontSize: 19, marginTop: 5 }}>Độc lập - Tự do - Hạnh phúc</div>
          <div style={{ width: 150, borderTop: '1.5px solid #111', margin: '7px auto 0 auto' }} />
        </div>
        <div style={{ position: 'absolute', top: 58, left: 78 + pageInsets.left, width: 132, height: 176, border: '1.2px solid #111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxSizing: 'border-box', padding: 0, overflow: 'hidden', background: '#fff' }}>
          <TranscriptStudentPhoto url={photoUrl} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 34, marginBottom: 38, fontWeight: 700 }}>
          <div style={{ fontSize: 56, lineHeight: 1 }}>{TRANSCRIPT_TEXT.title}</div>
          <div style={{ fontSize: 25, marginTop: 12 }}>{TRANSCRIPT_TEXT.subtitle}</div>
        </div>
        <div style={{ fontSize: 18.5, lineHeight: 1.16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 215px', columnGap: 18 }}>
            {infoLine('H\u1ecd v\u00e0 t\u00ean h\u1ecdc sinh.', transcriptStudentName(student))}
            {infoLine('Gi\u1edbi t\u00ednh.', formatGender(student.gender))}
          </div>
          {infoLine('Ng\u00e0y sinh:', student.birthDate)}
          {infoLine('N\u01a1i sinh:', titleCaseText(student.birthProvince || student.birthPlace || student.province))}
          {infoLine('D\u00e2n t\u1ed9c:', titleCaseText(student.ethnicity || student.ethnic || (student.fullName ? 'Kinh' : '')))}
          {infoLine('\u0110\u1ed1i t\u01b0\u1ee3ng (Con li\u1ec7t s\u0129, con th\u01b0\u01a1ng binh,...):', student.priorityObject || student.policyObject)}
          {infoLine('Ch\u1ed7 \u1edf hi\u1ec7n t\u1ea1i:', studentAddress(student, 58), null, { singleLine: true, fitLength: 58 })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 42 }}>
            {infoLine('H\u1ecd v\u00e0 t\u00ean cha:', titleCaseText(student.fatherName))}
            {infoLine('Ngh\u1ec1 nghi\u1ec7p:', sentenceCaseText(student.fatherJob))}
            {infoLine('H\u1ecd v\u00e0 t\u00ean m\u1eb9:', titleCaseText(student.motherName))}
            {infoLine('Ngh\u1ec1 nghi\u1ec7p:', sentenceCaseText(student.motherJob))}
            {infoLine('H\u1ecd v\u00e0 t\u00ean ng\u01b0\u1eddi gi\u00e1m h\u1ed9:', titleCaseText(student.guardianName))}
            {infoLine('Ngh\u1ec1 nghi\u1ec7p:', sentenceCaseText(student.guardianJob))}
          </div>
        </div>
        <div style={{ position: 'absolute', right: 58 + pageInsets.right, top: 558, width: 330, textAlign: 'center', fontSize: 17.5, lineHeight: 1.28 }}>
          <EditableText value={entryDateText} onCommit={(next) => commitCustomText(`transcript:date:start:${entrySchoolYearKey}`, entryDateFallback, next)} style={{ fontStyle: 'italic' }} />
          <div style={{ fontWeight: 700, fontSize: 22 }}>HIỆU TRƯỞNG</div>
          <div style={{ fontStyle: 'italic' }}>(Ký, ghi rõ họ tên và đóng dấu)</div>
          <div style={{ marginTop: 104, fontWeight: 700, fontSize: 20 }}>{entrySignerText}</div>
        </div>
        <div style={{ position: 'absolute', left: absoluteLeft, right: absoluteRight, bottom: 305, textAlign: 'center', fontSize: 25, fontWeight: 700 }}>
          QUÁ TRÌNH HỌC TẬP
        </div>
        <table style={{ position: 'absolute', left: absoluteLeft, right: absoluteRight, bottom: 28, width: `calc(100% - ${absoluteLeft + absoluteRight}px)`, borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 18.5 }}>
          <colgroup>
            <col style={{ width: 160 }} />
            <col style={{ width: 120 }} />
            <col />
          </colgroup>
          <thead>
            <tr style={{ height: 48 }}>
              {['Năm học', 'Lớp', 'Tên trường, tỉnh/thành phố'].map(header => (
                <th key={header} style={{ border: '1.2px solid #111', fontWeight: 700 }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {processRows.map((row, index) => (
              <tr key={`transcript-process-${index}`} style={{ height: 43 }}>
                <td style={{ border: '1.2px solid #111', textAlign: 'center' }}>{row ? row.compactSchoolYear : '20.. - 20..'}</td>
                <td style={{ border: '1.2px solid #111', textAlign: 'center' }}>{row ? getPcClassName(row.gradeNumber, grade) : ''}</td>
                <td style={{ border: '1.2px solid #111', paddingLeft: 8 }}>{row ? 'THCS Nguyễn An Ninh, Thành phố Hồ Chí Minh' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ), { border: false, pageNumber, padding: getTranscriptPagePadding(pageNumber, 18, 38, 0, 38) });
  };

  const renderTranscriptLearningPage = (yearEntry = transcriptYearEntries[transcriptYearEntries.length - 1], student = selectedTranscriptStudent, pageNumber = 0) => {
    const cell = { border: '1.15px solid #111', padding: '4px 4px', verticalAlign: 'middle', fontSize: 16.8, lineHeight: 1.12 };
    const header = { ...cell, textAlign: 'center', fontWeight: 700 };
    const finalSignerText = getTranscriptEndSignerText(yearEntry?.schoolYear || currentSchoolYear);
    return renderTranscriptPageShell((
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, fontStyle: 'italic', marginBottom: 4 }}>
          <div>Họ và tên: <span>{transcriptStudentName(student)}</span></div>
          <div>Lớp: <span>{getPcClassName(yearEntry?.gradeNumber || transcriptStudentClass(student), grade)}</span></div>
          <div>Năm học: <span>{yearEntry?.compactSchoolYear || compactSchoolYearLabel(currentSchoolYear)}</span></div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif' }}>
          <colgroup>
            <col style={{ width: 174 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 132 }} />
            <col />
          </colgroup>
          <thead>
            <tr style={{ height: 76 }}>
              <th rowSpan={2} style={header}>Môn học/Hoạt động<br />giáo dục</th>
              <th colSpan={3} style={header}>Điểm trung bình môn<br />học hoặc mức đánh giá</th>
              <th rowSpan={2} style={header}>Điểm trung bình<br />môn học hoặc<br />mức đánh giá<br />sau đánh giá lại,<br />rèn luyện thêm<br />trong kì nghỉ hè<br />(nếu có)</th>
              <th rowSpan={2} style={header}>Nhận xét sự tiến bộ, ưu điểm nổi bật, hạn chế chủ yếu (nếu có) và chữ kí của giáo viên môn học</th>
            </tr>
            <tr style={{ height: 60 }}>
              <th style={header}>Học kì<br />I</th>
              <th style={header}>Học kì<br />II</th>
              <th style={header}>Cả năm</th>
            </tr>
          </thead>
          <tbody>
            {TRANSCRIPT_SUBJECTS.map((subject, index) => {
              const teacherFallback = transcriptSubjectTeacher(subject, yearEntry);
              const remarkKey = transcriptEditKey('learning', `${yearEntry?.startYear || 'year'}:subject-${index}-remark`, student);
              const teacherDisplay = customTextOrFallback(remarkKey, teacherFallback);
              const teacherSignatureUrl = getTeacherSignatureUrl(teacherDisplay || teacherFallback);
              return (
                <tr key={`transcript-subject-${subject.label}`} style={{ height: 43 }}>
                  <td style={{ ...cell, textAlign: 'center', whiteSpace: 'pre-line' }}>{subject.label}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{transcriptSubjectValue(yearEntry, subject, 'hki', student)}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{transcriptSubjectValue(yearEntry, subject, 'hkii', student)}</td>
                  <td style={{ ...cell, textAlign: 'center' }}>{transcriptSubjectValue(yearEntry, subject, 'year', student)}</td>
                  <td style={{ ...cell }} />
                  <td style={{ ...cell, padding: 0, fontSize: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', minHeight: 40 }}>
                      <div style={{ borderRight: '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40, padding: '2px 4px' }}>
                        {!transcriptBlankSignatureMode && (
                          <TeacherSignatureImage url={teacherSignatureUrl} alt={`Chu ky ${teacherDisplay || teacherFallback}`} style={{ height: 32 }} />
                        )}
                      </div>
                      <div style={{ minHeight: 40, padding: '3px 5px 2px 6px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <EditableText
                          value={teacherDisplay}
                          onCommit={(next) => commitCustomText(remarkKey, teacherFallback, next)}
                          style={{
                            minHeight: 22,
                            width: '100%',
                            fontSize: fitTeacherSignatureFontSize(teacherDisplay),
                            textAlign: 'left',
                            lineHeight: 1.08,
                            whiteSpace: 'pre-line'
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr style={{ height: 54 }}>
              <td colSpan={6} style={{ ...cell, fontSize: 16.5, lineHeight: 1.18 }}>
                Trong bảng này có sửa chữa ở 0 chỗ, thuộc môn học, hoạt động giáo dục:<br />
                .........................................................
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderLeft: '1.15px solid #111', borderRight: '1.15px solid #111', borderBottom: '1.15px solid #111', height: 206 }}>
          <div style={{ textAlign: 'center', paddingTop: 18, fontSize: 17, fontWeight: 700, position: 'relative' }}>
            <div>Xác nhận của giáo viên chủ nhiệm</div>
            <div style={{ fontStyle: 'italic', fontWeight: 400 }}>(Ký và ghi rõ họ tên)</div>
            <div style={{ position: 'absolute', left: 0, right: 0, top: 82, height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!transcriptBlankSignatureMode && (
                <TeacherSignatureImage url={homeroomTeacherSignatureUrl} alt={`Chu ky ${homeroomTeacherName}`} style={{ height: 82 }} />
              )}
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8 }}>{homeroomTeacherName}</div>
          </div>
          <div style={{ textAlign: 'center', paddingTop: 18, fontSize: 17, fontWeight: 700, position: 'relative' }}>
            <div>Xác nhận của Hiệu trưởng</div>
            <div style={{ fontStyle: 'italic', fontWeight: 400 }}>(Ký, ghi rõ họ tên và đóng dấu)</div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8 }}>{finalSignerText}</div>
          </div>
        </div>
      </>
    ), { border: false, pageNumber, padding: getTranscriptPagePadding(pageNumber, 27, 28, 8, 28) });
  };

  const renderTranscriptAssessmentPage = (yearEntry = transcriptYearEntries[transcriptYearEntries.length - 1], student = selectedTranscriptStudent, pageNumber = 0) => {
    const cell = { border: '1.15px solid #111', padding: '3px 5px', verticalAlign: 'middle', fontSize: 17, lineHeight: 1.08 };
    const header = { ...cell, textAlign: 'center', fontWeight: 700 };
    const transcriptAcademicResult = getTranscriptAcademicResult(yearEntry, 'fullYear', student);
    const transcriptHkiAcademicResult = getTranscriptAcademicResult(yearEntry, 'hki', student);
    const transcriptHkiiAcademicResult = getTranscriptAcademicResult(yearEntry, 'hkii', student);
    const transcriptHkiConductResult = getTranscriptConductResult(yearEntry, 'hki', student);
    const transcriptHkiiConductResult = getTranscriptConductResult(yearEntry, 'hkii', student);
    const transcriptAbsenceTotal = getTranscriptAbsenceCount(yearEntry, 'full', student);
    const transcriptYearConductResult = getTranscriptConductResult(yearEntry, 'full', student);
    const assessmentSchoolYear = yearEntry?.schoolYear || currentSchoolYear;
    const assessmentSchoolYearKey = compactSchoolYearLabel(assessmentSchoolYear);
    const assessmentGradeNumber = Number(String(yearEntry?.gradeNumber || transcriptStudentClass(student) || grade || '').replace(/[^\d]/g, ''));
    const isGrade9Assessment = assessmentGradeNumber === 9;
    const isPassingFullYear = isPassingAcademicResult(transcriptAcademicResult);
    const nextGradeText = assessmentGradeNumber >= 6 && assessmentGradeNumber <= 8 ? `Được lên lớp ${assessmentGradeNumber + 1}` : 'Được lên lớp';
    const promotionText = isPassingFullYear
      ? (isGrade9Assessment ? 'Đủ ĐK xét hoàn thành chương trình THCS' : nextGradeText)
      : '';
    const finalGradeCompletionText = isGrade9Assessment && isPassingFullYear ? 'Hoàn thành chương trình trung học cơ sở' : '';
    const assessmentDateFallback = isGrade9Assessment
      ? getTranscriptDateFallback(transcriptGrade9EndDates, assessmentSchoolYear, defaultTranscriptGrade9EndDateText(assessmentSchoolYear), 'hk2')
      : getTranscriptDateFallback(transcriptEndDates, assessmentSchoolYear, defaultTranscriptEndDateText(assessmentSchoolYear), 'hk2');
    const assessmentDateKey = `transcript:date:${isGrade9Assessment ? 'grade9-end' : 'end'}:${assessmentSchoolYearKey}`;
    const assessmentDateText = getTranscriptEndDateText(assessmentSchoolYear, yearEntry?.gradeNumber);
    const assessmentSignerText = getTranscriptEndSignerText(assessmentSchoolYear);
    const homeroomCommentKey = transcriptEditKey('assessment', `${yearEntry?.startYear || 'year'}:homeroom-comment`, student);
    const homeroomCommentFallback = getHomeroomCommentFallback(student, transcriptAcademicResult, assessmentSchoolYear);
    return renderTranscriptPageShell((
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, fontStyle: 'italic', marginBottom: 4 }}>
          <div>Họ và tên: <span>{transcriptStudentName(student)}</span></div>
          <div>Lớp: <span>{getPcClassName(yearEntry?.gradeNumber || transcriptStudentClass(student), grade)}</span></div>
          <div>Năm học: <span>{yearEntry?.compactSchoolYear || compactSchoolYearLabel(currentSchoolYear)}</span></div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: '"Times New Roman", Times, serif' }}>
          <colgroup>
            <col style={{ width: '17%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '27%' }} />
          </colgroup>
          <tbody>
            <tr style={{ height: 62 }}>
              <td rowSpan={2} style={{ ...header, fontSize: 18.5 }}>HỌC KỲ</td>
              <td colSpan={2} style={header}>Mức đánh giá</td>
              <td rowSpan={2} style={header}>Tổng số<br />buổi<br />nghỉ học<br />cả năm<br />học</td>
              <td colSpan={2} style={header}>Mức đánh giá sau đánh giá lại môn học hoặc rèn luyện trong kì nghỉ hè (nếu có)</td>
              <td rowSpan={5} style={{ ...cell, verticalAlign: 'top', fontSize: 16.3, lineHeight: 1.26, fontWeight: 400, padding: '5px 7px' }}>
                - Được lên lớp:<br />
                <span style={{ fontWeight: isGrade9Assessment ? 700 : 400 }}>{promotionText}</span><br />
                ........................<br />
                - Không được lên lớp:<br />
                ........................<br />
                ........................
              </td>
            </tr>
            <tr style={{ height: 48 }}>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 400 }}>Kết quả<br />rèn luyện</td>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 400 }}>Kết quả<br />học tập</td>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 400 }}>Kết quả<br />rèn luyện</td>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 400 }}>Kết quả<br />học tập</td>
            </tr>
            {[
              ['Học kỳ I', transcriptHkiConductResult, transcriptHkiAcademicResult],
              ['Học kỳ II', transcriptHkiiConductResult, transcriptHkiiAcademicResult],
              ['Cả năm', transcriptYearConductResult, transcriptAcademicResult]
            ].map((row, index) => (
              <tr key={`transcript-assessment-${row[0]}`} style={{ height: 38 }}>
                <td style={{ ...cell, textAlign: 'center' }}>{row[0]}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{row[1]}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{row[2]}</td>
                {index === 0 && <td rowSpan={3} style={{ ...cell, textAlign: 'center', fontSize: 18 }}>{transcriptAbsenceTotal || 'Không'}</td>}
                <td style={{ ...cell }} />
                <td style={{ ...cell }} />
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ borderLeft: '1.15px solid #111', borderRight: '1.15px solid #111', borderBottom: '1.15px solid #111', padding: '8px 5px', fontSize: 16.8, lineHeight: 1.42 }}>
          <div style={{ fontStyle: 'italic' }}>Nếu là lớp cuối cấp ghi Hoàn thành hay không hoàn thành chương trình Trung học cơ sở:</div>
          {finalGradeCompletionText ? <><strong>{finalGradeCompletionText}</strong><br /></> : <>....................................................................................................................<br /></>}
          - Chứng chỉ (nếu có): ................................................................ Loại: ........................<br />
          - Kết quả tham gia các cuộc thi (nếu có): ........................................................................<br />
          ....................................................................................................................<br />
          - Khen thưởng (nếu có): ..........................................................................................
        </div>
        <div style={{ borderLeft: '1.15px solid #111', borderRight: '1.15px solid #111', borderBottom: '1.15px solid #111', height: 112, textAlign: 'center', paddingTop: 16, fontSize: 19, fontWeight: 700 }}>
          KẾT QUẢ RÈN LUYỆN TRONG KÌ NGHỈ HÈ
          <div style={{ marginTop: 14, fontSize: 18, fontStyle: 'italic', fontWeight: 400 }}>(Nếu có)</div>
        </div>
        <div style={{ borderLeft: '1.15px solid #111', borderRight: '1.15px solid #111', borderBottom: '1.15px solid #111', height: 242, textAlign: 'center', paddingTop: 10, fontSize: 19, fontWeight: 700, position: 'relative' }}>
          NHẬN XÉT CỦA GIÁO VIÊN CHỦ NHIỆM
          <div style={{ fontSize: 18, fontStyle: 'italic', fontWeight: 400 }}>(Ký, ghi rõ họ tên)</div>
          <EditableText
            value={customText(homeroomCommentKey, homeroomCommentFallback)}
            onCommit={(next) => commitCustomText(homeroomCommentKey, homeroomCommentFallback, next)}
            style={{ position: 'absolute', left: 36, right: 36, top: 66, bottom: 118, textAlign: 'left', fontWeight: 400, whiteSpace: 'pre-line' }}
          />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {!transcriptBlankSignatureMode && (
              <TeacherSignatureImage url={homeroomTeacherSignatureUrl} alt={`Chu ky ${homeroomTeacherName}`} style={{ height: 48 }} />
            )}
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14 }}>{homeroomTeacherName}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '0.75fr 1.25fr', height: 222, fontSize: 19 }}>
          <div style={{ borderLeft: '1.15px solid #111', borderBottom: '1.15px solid #111', paddingTop: 22, paddingLeft: 4, whiteSpace: 'nowrap', lineHeight: 1.35 }}>
            Đồng ý với nhận xét của GVCN lớp.
          </div>
          <div style={{ borderRight: '1.15px solid #111', borderBottom: '1.15px solid #111', textAlign: 'center', paddingTop: 22, lineHeight: 1.5 }}>
            <div style={{ marginLeft: 24 }}>
              <EditableText
                value={assessmentDateText}
                onCommit={(next) => commitCustomText(assessmentDateKey, assessmentDateFallback, next)}
                style={{ fontStyle: 'italic', fontSize: 17 }}
              />
              <div style={{ fontWeight: 700, fontSize: 20 }}>HIỆU TRƯỞNG</div>
              <div style={{ fontStyle: 'italic', fontSize: 17 }}>(Ký, ghi rõ họ tên và đóng dấu)</div>
              <div style={{ marginTop: 108, fontWeight: 700, fontSize: 21 }}>{assessmentSignerText}</div>
            </div>
          </div>
        </div>
      </>
    ), { border: false, pageNumber, padding: getTranscriptPagePadding(pageNumber, 27, 28, 8, 28) });
  };

  const renderTranscriptBlankPage = () => renderTranscriptPageShell(null, { border: false, padding: 0 });
  const attachTranscriptPageNumbers = (pages = []) => pages.map((page, index) => ({
    ...page,
    pageNumber: page.blank ? null : index + 1
  }));
  const getTranscriptPagesForStudent = (student = selectedTranscriptStudent, selection = null) => {
    const yearEntries = getTranscriptYearEntriesForStudent(student);
    const coverPages = [
      { key: `cover-${student?.id || 'student'}`, label: 'Bìa', student, render: () => renderTranscriptCoverPage(student) },
      { key: `guide-${student?.id || 'student'}`, label: 'Hướng dẫn', student, render: (pageNumber) => renderTranscriptGuidePage(pageNumber) },
      { key: `info-${student?.id || 'student'}`, label: 'Thông tin', student, render: (pageNumber) => renderTranscriptInfoPage(student, yearEntries, pageNumber) }
    ];
    const resultPages = yearEntries.flatMap((yearEntry) => ([
      { key: `learning-${student?.id || 'student'}-${yearEntry.startYear}`, label: `ĐKQHT ${yearEntry.schoolYear}`, student, yearEntry, render: (pageNumber) => renderTranscriptLearningPage(yearEntry, student, pageNumber) },
      { key: `assessment-${student?.id || 'student'}-${yearEntry.startYear}`, label: `ĐGKQGD ${yearEntry.schoolYear}`, student, yearEntry, render: (pageNumber) => renderTranscriptAssessmentPage(yearEntry, student, pageNumber) }
    ]));
    if (!selection) return attachTranscriptPageNumbers([...coverPages, ...resultPages]);
    return attachTranscriptPageNumbers([
      ...(selection.includeCover ? coverPages : []),
      ...(selection.mode === 'year'
        ? resultPages.filter(page => String(page.yearEntry?.schoolYear) === String(selection.year))
        : resultPages)
    ]);
  };
  const getTranscriptVisiblePages = (selection = transcriptPrintSelection) => {
    if (!selection) return selectedTranscriptStudent ? getTranscriptPagesForStudent(selectedTranscriptStudent) : [];
    const selectedIds = Array.isArray(selection.studentIds) && selection.studentIds.length
      ? selection.studentIds
      : [selectedTranscriptStudent?.id].filter(Boolean);
    const selectedStudents = selectedIds
      .map(id => transcriptStudents.find(student => student.id === id))
      .filter(Boolean);
    return selectedStudents.flatMap((student) => {
      const pages = getTranscriptPagesForStudent(student, selection);
      if (selection.duplexBlank && pages.length % 2 === 1) {
        return [
          ...pages,
          { key: `blank-${student.id || student.fullName || pages.length}`, label: 'Trang trắng', student, blank: true, render: renderTranscriptBlankPage }
        ];
      }
      return pages;
    });
  };
  const isTranscriptMode = workspaceMode === 'transcript';
  const transcriptVisiblePages = isTranscriptMode ? getTranscriptVisiblePages() : [];
  const transcriptDraftStudentIds = transcriptPrintStudentIds.filter(id => transcriptStudents.some(student => student.id === id));
  const transcriptDraftPageCount = isTranscriptMode ? getTranscriptVisiblePages({
    includeCover: transcriptPrintDraft.includeCover,
    mode: transcriptPrintDraft.mode,
    year: transcriptPrintDraft.year || transcriptYearEntries[transcriptYearEntries.length - 1]?.schoolYear || currentSchoolYear,
    duplexBlank: transcriptPrintDraft.duplexBlank,
    studentIds: transcriptDraftStudentIds.length ? transcriptDraftStudentIds : [selectedTranscriptStudent?.id].filter(Boolean)
  }).length : 0;
  const boundedPrintPageIndex = Math.min(Math.max(printPageIndex, 0), Math.max(activePageSegments.length - 1, 0));
  const visiblePageSegments = previewMode && printMode === 'workbook'
    ? workbookPageEntries
    : previewMode && printMode === 'page'
    ? [{ ...activePageSegments[boundedPrintPageIndex], originalIndex: boundedPrintPageIndex }]
    : activePageSegments.map((page, index) => ({ ...page, originalIndex: index }));
  const teacherNameOptions = [...new Set((Array.isArray(nanTeachers) ? nanTeachers : [])
    .map(teacher => String(teacher.name || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi'));
  const activeSheetDescription = (() => {
    if (isCoverSheet) return 'Trang bìa tự lấy năm học hệ thống và lớp theo khối đang mở.';
    if (isInnerCoverSheet) return 'Bìa lót tự lấy giáo viên chủ nhiệm và hiệu trưởng từ Cài đặt.';
    if (isProfileSheet) return 'Sơ yếu lý lịch tự lấy dữ liệu học sinh trong database, 40 dòng theo cụm 5 em.';
    if (isAttendanceSheet) return 'Điểm danh chủ nhiệm tự lấy học sinh, tháng 9 đến tháng 5 theo năm học đã cài.';
    if (isSemesterOneSummarySheet) return 'Tổng kết HKI tự lấy điểm từ các trang HKI, tính kết quả học tập và rèn luyện.';
    if (isSemesterTwoSummarySheet) return 'Tổng kết HKII tự lấy điểm từ các trang HKII, tính kết quả học tập và rèn luyện.';
    if (isFullYearSummarySheet) return 'Tổng hợp cả năm tự lấy đánh giá cả năm và ĐTB mcn từ các trang HKII.';
    if (isClassificationSheet) return 'Đánh giá xếp loại tự tính từ Tổng hợp cả năm và điểm danh cả năm.';
    if (isPrincipalCommentSheet) return 'Nhận xét của hiệu trưởng tự lấy sĩ số, nam nữ theo lớp đang mở.';
    if (isGradeSectionCoverSheet) return 'Bìa phần ghi điểm A3 dọc, chữ canh giữa trang.';
    if (isGuideSheet) return 'Trang hướng dẫn đã dàn A3 dọc, bấm vào chữ để sửa nếu cần.';
    return 'Bấm vào ô để sửa trực tiếp.';
  })();

  return (
    <div className="scorebook-workspace-shell fixed inset-x-0 top-[84px] bottom-0 z-[140] bg-slate-100/95 backdrop-blur-md p-2 sm:p-3 print:static print:bg-white print:p-0">
      <style>{`
        @page { size: ${isTranscriptMode ? '210mm 297mm' : '297mm 420mm'}; margin: ${isTranscriptMode ? '0' : '5mm 7mm'}; }
        .scorebook-print-root, .scorebook-print-root table, .scorebook-print-root td, .scorebook-print-root th { font-family: "Times New Roman", Times, serif; }
        @media print {
          body:has(.scorebook-print-root) > :not(#root),
          body:has(.scorebook-print-root) #root > div > :not(:has(.scorebook-print-root)),
          body:has(.scorebook-print-root) #root > div > div:has(.scorebook-print-root) > :not(.scorebook-workspace-shell):not(:has(.scorebook-print-root)) {
            display: none !important;
          }
          body:has(.scorebook-print-root) #root,
          body:has(.scorebook-print-root) #root > div,
          body:has(.scorebook-print-root) #root > div > div:has(.scorebook-print-root),
          body:has(.scorebook-print-root) .scorebook-workspace-shell,
          body:has(.scorebook-print-root) .scorebook-print-root {
            display: block !important;
            visibility: visible !important;
          }
          html, body { width: ${isTranscriptMode ? '210mm' : '283mm'} !important; min-height: ${isTranscriptMode ? '297mm' : '410mm'} !important; margin: 0 !important; padding: 0 !important; background: white !important; overflow: visible !important; }
          .scorebook-workspace-shell { position: static !important; inset: auto !important; width: ${isTranscriptMode ? '210mm' : '283mm'} !important; min-height: ${isTranscriptMode ? '297mm' : '410mm'} !important; margin: 0 !important; padding: 0 !important; background: white !important; overflow: visible !important; }
          .scorebook-print-root { position: static !important; width: ${isTranscriptMode ? '210mm' : '283mm'} !important; min-height: ${isTranscriptMode ? '297mm' : '410mm'} !important; margin: 0 !important; padding: 0 !important; background: white !important; overflow: visible !important; display: block !important; }
          .scorebook-toolbar, .scorebook-tabs { display: none !important; }
          .scorebook-scroll { display: block !important; width: ${isTranscriptMode ? '210mm' : '283mm'} !important; overflow: visible !important; box-shadow: none !important; border: none !important; padding: 0 !important; background: white !important; }
          .scorebook-scroll > div { width: ${isTranscriptMode ? '210mm' : '283mm'} !important; margin: 0 !important; padding: 0 !important; }
          .scorebook-scroll > div > div { width: ${isTranscriptMode ? '210mm' : '283mm'} !important; margin: 0 !important; padding: 0 !important; }
          .scorebook-table { transform-origin: top left; }
          .scorebook-cell { break-inside: avoid; page-break-inside: avoid; }
          .scorebook-axis { display: none !important; }
          .scorebook-page-label { display: none !important; }
          .scorebook-page-frame {
            width: 283mm !important;
            height: 410mm !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            break-after: page;
            page-break-after: always;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            display: block !important;
            box-shadow: none !important;
            border: 0 !important;
          }
          .scorebook-scroll > div > div:last-child .scorebook-page-frame {
            break-after: auto !important;
            page-break-after: auto !important;
          }
          .scorebook-page-frame > * {
            transform: none !important;
            transform-origin: top left !important;
          }
          .transcript-list-panel { display: none !important; }
          .transcript-print-root { display: block !important; width: 210mm !important; margin: 0 !important; padding: 0 !important; }
          .transcript-page-frame {
            width: 210mm !important;
            height: 297mm !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
            break-after: page;
            page-break-after: always;
            box-shadow: none !important;
            border: 0 !important;
          }
          .transcript-print-root > div:last-child .transcript-page-frame {
            break-after: auto !important;
            page-break-after: auto !important;
          }
          .transcript-page {
            width: 210mm !important;
            height: 297mm !important;
          }
        }
        .scorebook-cover-page * { letter-spacing: 0 !important; }
        .scorebook-guide-page * { letter-spacing: 0 !important; }
        .transcript-page * { letter-spacing: 0 !important; }
      `}</style>

      <div className="scorebook-print-root h-full rounded-3xl border border-violet-100 bg-white shadow-2xl overflow-hidden flex flex-col print:h-auto print:rounded-none print:border-0 print:shadow-none">
        <div className="scorebook-toolbar shrink-0 border-b border-slate-200 bg-white/95 px-4 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-violet-900">
              <FileSpreadsheet className="w-5 h-5 text-violet-600" />
              <h2 className="font-black text-lg sm:text-2xl uppercase tracking-tight truncate">
                {isTranscriptMode ? 'Học bạ' : 'Sổ gọi tên ghi điểm'} khối {grade}
              </h2>
            </div>
            <div className="text-xs sm:text-sm font-bold text-slate-500 mt-1">
              Năm học {currentSchoolYear} · {scorebookTemplate.sourceFile} · {lastSavedText}{isDirty ? ' · Có chỉnh sửa chưa lưu' : ''}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setWorkspaceMode('scorebook')} className={`h-11 rounded-xl px-4 text-sm font-black shadow flex items-center gap-2 ${!isTranscriptMode ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-white border border-violet-200 text-violet-700 hover:bg-violet-50'}`}>
              <FileSpreadsheet className="w-4 h-4" /> Sổ gọi tên
            </button>
            <button type="button" onClick={() => { setWorkspaceMode('transcript'); setPreviewMode(false); }} className={`h-11 rounded-xl px-4 text-sm font-black shadow flex items-center gap-2 ${isTranscriptMode ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-white border border-violet-200 text-violet-700 hover:bg-violet-50'}`}>
              <BookOpenText className="w-4 h-4" /> Học bạ
            </button>
            <select
              value={String(grade || '')}
              onChange={(event) => {
                setTranscriptStudentId('');
                setTranscriptStudentSearch('');
                onGradeChange?.(event.target.value);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-violet-700 shadow outline-none focus:border-violet-500"
            >
              {['6', '7', '8', '9'].map(item => (
                <option key={`scorebook-grade-${item}`} value={item}>Khối {item}</option>
              ))}
            </select>
            {isTranscriptMode && (
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => selectTranscriptStudentByIndex(selectedTranscriptStudentIndex - 1)}
                  disabled={!transcriptStudents.length || selectedTranscriptStudentIndex <= 0}
                  title="Học sinh trước"
                  className="h-9 w-9 rounded-lg bg-white text-slate-700 border border-slate-200 flex items-center justify-center hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={transcriptStudentSearch}
                    onChange={(event) => selectTranscriptStudentBySearch(event.target.value)}
                    list={`transcript-student-options-${grade}`}
                    placeholder="Gõ tên học sinh..."
                    className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm font-bold text-slate-700 outline-none focus:border-violet-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => selectTranscriptStudentByIndex(selectedTranscriptStudentIndex + 1)}
                  disabled={!transcriptStudents.length || selectedTranscriptStudentIndex >= transcriptStudents.length - 1}
                  title="Học sinh sau"
                  className="h-9 w-9 rounded-lg bg-white text-slate-700 border border-slate-200 flex items-center justify-center hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="min-w-[46px] px-1 text-center text-xs font-black text-slate-500">
                  {transcriptStudents.length ? `${selectedTranscriptStudentIndex + 1}/${transcriptStudents.length}` : '0/0'}
                </span>
              </div>
            )}
            {!isTranscriptMode && (
              <select
                value={activeSheet.name}
                onChange={(event) => setActiveSheetName(event.target.value)}
                className="h-11 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-violet-500"
              >
                {workbookSheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name}>{sheet.label || sheet.name}</option>
                ))}
              </select>
            )}
            {!isTranscriptMode && (
              <button type="button" onClick={saveScorebook} disabled={isSaving} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                <Save className="w-4 h-4" /> {isSaving ? 'Đang lưu' : 'Lưu'}
              </button>
            )}
            {!isTranscriptMode && (
              <button type="button" onClick={() => setPreviewMode((value) => !value)} className={`h-11 rounded-xl px-4 text-sm font-black shadow flex items-center gap-2 ${previewMode ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-white border border-violet-200 text-violet-700 hover:bg-violet-50'}`}>
                {previewMode ? 'Sửa bảng' : 'Xem trước A3'}
              </button>
            )}
            {!isTranscriptMode && activePageSegments.length > 1 && (
              <select
                value={boundedPrintPageIndex}
                onChange={(event) => setPrintPageIndex(Number(event.target.value) || 0)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-violet-500"
              >
                {activePageSegments.map((_, index) => (
                  <option key={`print-page-option-${index}`} value={index}>Trang {index + 1}</option>
                ))}
              </select>
            )}
            {isTranscriptMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setTranscriptBlankSignatureMode((value) => !value)}
                  title="In bản trắng để giáo viên ký tay"
                  className={`h-11 rounded-xl px-4 text-sm font-black shadow flex items-center gap-2 ${transcriptBlankSignatureMode ? 'bg-slate-800 text-white hover:bg-slate-900' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  Không kèm chữ ký
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTranscriptPrintDraft({
                      includeCover: true,
                      mode: 'all',
                      year: transcriptYearEntries[transcriptYearEntries.length - 1]?.schoolYear || currentSchoolYear,
                      duplexBlank: true
                    });
                    setTranscriptPrintStudentIds((prev) => {
                      const valid = prev.filter(id => transcriptStudents.some(student => student.id === id));
                      return valid.length ? valid : [selectedTranscriptStudent?.id].filter(Boolean);
                    });
                    setShowTranscriptPrintPanel(true);
                  }}
                  className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow hover:bg-emerald-700 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> In học bạ
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => printSheet('page')} className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow hover:bg-emerald-700 flex items-center gap-2">
                  <Download className="w-4 h-4" /> In trang này
                </button>
                <button type="button" onClick={() => printSheet('workbook')} className="h-11 rounded-xl bg-slate-800 px-4 text-sm font-black text-white shadow hover:bg-slate-900 flex items-center gap-2">
                  <Download className="w-4 h-4" /> In tất cả
                </button>
              </>
            )}
            <button type="button" onClick={onClose} title="Đóng" className="h-11 w-11 rounded-full bg-rose-600 text-white shadow-lg flex items-center justify-center hover:bg-rose-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!isTranscriptMode && <div className="scorebook-tabs shrink-0 bg-slate-50 border-b border-slate-200 px-3 py-2 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {workbookSheets.map((sheet) => (
              <button
                key={`tab-${sheet.name}`}
                type="button"
                onClick={() => setActiveSheetName(sheet.name)}
                className={`rounded-full px-3 py-2 text-[11px] font-black transition-colors ${sheet.name === activeSheet.name ? 'bg-violet-600 text-white shadow' : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-200 hover:text-violet-700'}`}
              >
                {sheet.label || sheet.name}
              </button>
            ))}
          </div>
        </div>}

        <datalist id={`scorebook-teacher-names-${grade}`}>
          {teacherNameOptions.map(name => <option key={name} value={name} />)}
        </datalist>
        <datalist id={`transcript-student-options-${grade}`}>
          {transcriptStudents.map((student, index) => (
            <option key={`transcript-option-${student.id || index}`} value={transcriptStudentOptionLabel(student)} />
          ))}
        </datalist>

        {showTranscriptPrintPanel && (
          <div className="scorebook-toolbar fixed inset-0 z-[165] bg-slate-900/40 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white border border-emerald-100 shadow-2xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-xl font-black text-emerald-900 uppercase">In học bạ</div>
                  <div className="text-xs font-bold text-slate-500 mt-1">
                    {transcriptDraftStudentIds.length || 1} học sinh · {transcriptDraftPageCount} trang sẽ in
                  </div>
                </div>
                <button type="button" onClick={() => setShowTranscriptPrintPanel(false)} className="h-10 w-10 rounded-full bg-rose-600 text-white flex items-center justify-center shadow hover:bg-rose-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-950">
                  Đã chọn {transcriptDraftStudentIds.length || 1} học sinh. Muốn đổi danh sách in thì tích trực tiếp ở bảng học sinh bên trái.
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={transcriptPrintDraft.includeCover}
                    onChange={(event) => setTranscriptPrintDraft(prev => ({ ...prev, includeCover: event.target.checked }))}
                    className="h-5 w-5 accent-emerald-600"
                  />
                  In 3 trang đầu: bìa, hướng dẫn, thông tin học sinh
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={transcriptPrintDraft.duplexBlank}
                    onChange={(event) => setTranscriptPrintDraft(prev => ({ ...prev, duplexBlank: event.target.checked }))}
                    className="h-5 w-5 accent-emerald-600"
                  />
                  Chèn trang trắng sau mỗi học sinh nếu số trang bị lẻ để in hai mặt không lẫn bìa
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 font-bold text-slate-700">
                  <input
                    type="radio"
                    name="transcript-print-mode"
                    checked={transcriptPrintDraft.mode === 'all'}
                    onChange={() => setTranscriptPrintDraft(prev => ({ ...prev, mode: 'all' }))}
                    className="h-5 w-5 accent-emerald-600"
                  />
                  In kết quả tất cả các năm
                </label>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <label className="flex items-center gap-3 font-bold text-slate-700">
                    <input
                      type="radio"
                      name="transcript-print-mode"
                      checked={transcriptPrintDraft.mode === 'year'}
                      onChange={() => setTranscriptPrintDraft(prev => ({ ...prev, mode: 'year' }))}
                      className="h-5 w-5 accent-emerald-600"
                    />
                    In kết quả một năm học
                  </label>
                  <select
                    value={transcriptPrintDraft.year || transcriptYearEntries[transcriptYearEntries.length - 1]?.schoolYear || ''}
                    onChange={(event) => setTranscriptPrintDraft(prev => ({ ...prev, year: event.target.value, mode: 'year' }))}
                    className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-emerald-500"
                  >
                    {transcriptYearEntries.map(yearEntry => (
                      <option key={`print-year-${yearEntry.startYear}`} value={yearEntry.schoolYear}>
                        {yearEntry.schoolYear} · lớp {yearEntry.gradeNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-900">
                Gợi ý: in nguyên sổ thì chọn “3 trang đầu” và “tất cả các năm”. Nếu chỉ cần bổ sung năm lẻ, chọn “một năm học” để xuất đúng 2 trang kết quả.
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowTranscriptPrintPanel(false)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 hover:bg-slate-50">Đóng</button>
                <button
                  type="button"
                  onClick={() => {
                    const studentIds = transcriptDraftStudentIds.length ? transcriptDraftStudentIds : [selectedTranscriptStudent?.id].filter(Boolean);
                    if (!studentIds.length) {
                      showNotification?.('Chọn ít nhất một học sinh để in học bạ.', 'error');
                      return;
                    }
                    printTranscript({
                      includeCover: transcriptPrintDraft.includeCover,
                      mode: transcriptPrintDraft.mode,
                      year: transcriptPrintDraft.year || transcriptYearEntries[transcriptYearEntries.length - 1]?.schoolYear || currentSchoolYear,
                      duplexBlank: transcriptPrintDraft.duplexBlank,
                      studentIds
                    });
                  }}
                  className="h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow hover:bg-emerald-700 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Mở cửa sổ in
                </button>
              </div>
            </div>
          </div>
        )}

        {showTeacherPanel && (
          <div className="scorebook-toolbar fixed inset-0 z-[160] bg-slate-900/40 backdrop-blur-sm p-4 flex items-center justify-center">
            <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white border border-blue-100 shadow-2xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div className="text-xl font-black text-blue-900 uppercase">Giáo viên từng lớp - Khối {grade}</div>
                  <div className="text-xs font-bold text-slate-500 mt-1">Điền giáo viên cho năm học {currentSchoolYear}, bấm lưu để chốt cứng theo năm.</div>
                </div>
                <button type="button" onClick={() => setShowTeacherPanel(false)} className="h-10 w-10 rounded-full bg-rose-600 text-white flex items-center justify-center shadow hover:bg-rose-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-xs font-black uppercase text-slate-500">
                      <th className="w-14 px-2">STT</th>
                      <th className="px-2">Môn</th>
                      <th className="px-2">Tên giáo viên</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CLASS_TEACHER_SUBJECTS.map((subject, index) => (
                      <tr key={`scorebook-teacher-${subject}`} className="bg-slate-50">
                        <td className="rounded-l-xl px-2 py-2 font-black text-slate-500">{index + 1}</td>
                        <td className="px-2 py-2 font-black text-slate-800">{subject}</td>
                        <td className="rounded-r-xl px-2 py-2">
                          <input
                            value={Object.prototype.hasOwnProperty.call(teacherPanelDraft || {}, subject) ? (teacherPanelDraft?.[subject] || '') : getClassSubjectTeacherName(subject)}
                            onChange={(event) => setTeacherPanelDraft(prev => ({ ...(prev || {}), [subject]: event.target.value }))}
                            list={`scorebook-teacher-names-${grade}`}
                            placeholder="Gõ hoặc chọn giáo viên..."
                            className="w-full rounded-xl border border-slate-200 bg-white p-2 font-bold outline-none focus:border-blue-400"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowTeacherPanel(false)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 hover:bg-slate-50">Đóng</button>
                <button type="button" onClick={saveTeacherPanel} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow hover:bg-blue-700 flex items-center gap-2">
                  <Save className="w-4 h-4" /> Lưu giáo viên
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={`scorebook-scroll flex-1 overflow-auto p-4 ${previewMode || isTranscriptMode ? 'bg-slate-200' : 'bg-slate-100'}`}>
          {isTranscriptMode ? (
            <div className="flex min-h-full items-start gap-4">
              <div className="transcript-list-panel sticky top-0 flex h-[calc(100vh-190px)] max-h-full min-h-0 w-[360px] shrink-0 self-start flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 shrink-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-black text-slate-900">Danh sách học sinh khối {grade}</div>
                      <div className="text-xs font-bold text-slate-500">Bấm tên để xem, tích ô để chọn in nhiều học sinh.</div>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">
                      {transcriptDraftStudentIds.length} chọn
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTranscriptPrintStudentIds(transcriptStudents.map(student => student.id).filter(Boolean))}
                      className="h-9 rounded-xl bg-emerald-600 px-2 text-xs font-black text-white hover:bg-emerald-700"
                    >
                      Chọn cả lớp
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranscriptPrintStudentIds([])}
                      className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-scroll overscroll-contain rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs font-black uppercase text-slate-500">
                      <tr>
                        <th className="w-10 px-2 py-2 text-center">In</th>
                        <th className="w-10 px-2 py-2 text-center">STT</th>
                        <th className="px-2 py-2 text-left">Họ và tên</th>
                        <th className="w-16 px-2 py-2 text-center">Lớp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transcriptStudents.map((student, index) => {
                        const active = selectedTranscriptStudent?.id === student.id;
                        const checked = transcriptPrintStudentIds.includes(student.id);
                        return (
                          <tr
                            key={`transcript-student-${student.id || index}`}
                            onClick={() => selectTranscriptStudent(student)}
                            className={`cursor-pointer border-t border-slate-100 ${active ? 'bg-violet-600 text-white' : 'bg-white text-slate-700 hover:bg-violet-50'}`}
                          >
                            <td className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  event.stopPropagation();
                                  setTranscriptPrintStudentIds(prev => (
                                    prev.includes(student.id)
                                      ? prev.filter(id => id !== student.id)
                                      : [...prev, student.id].filter(Boolean)
                                  ));
                                }}
                                onClick={(event) => event.stopPropagation()}
                                className="h-4 w-4 accent-emerald-600"
                                title="Chọn in học bạ"
                              />
                            </td>
                            <td className="px-2 py-2 text-center font-black">{index + 1}</td>
                            <td className="px-2 py-2 font-bold">{titleCaseText(student.fullName)}</td>
                            <td className="px-2 py-2 text-center font-bold">{getPcClassName(student.className || student.grade, grade)}</td>
                          </tr>
                        );
                      })}
                      {!transcriptStudents.length && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-sm font-bold text-slate-500">Chưa có học sinh trong khối này.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="transcript-print-root flex-1 space-y-5">
                {selectedTranscriptStudent ? transcriptVisiblePages.map((page, index) => (
                  <div key={`transcript-page-${page.key || index}`} className="transcript-page-frame mx-auto bg-white shadow-2xl border border-slate-300" style={{ width: transcriptPageWidth, height: transcriptPageHeight }}>
                    {page.render(page.pageNumber)}
                  </div>
                )) : (
                  <div className="mx-auto rounded-2xl bg-white p-8 text-center font-bold text-slate-500 shadow">Chọn một học sinh để tạo học bạ.</div>
                )}
              </div>
            </div>
          ) : previewMode ? (
            <div className="space-y-6">
              {visiblePageSegments.map((page, index) => {
                const pageIndex = page.originalIndex ?? index;
                const pageSheet = page.sheet || activeSheet;
                const pageSheetName = pageSheet.name;
                const isCustomPage = page.blank || page.attendance || page.hkiReview || page.hkiScore || page.hkiSummary || page.hkiiReview || page.hkiiScore || page.hkiiSummary || page.fullYearSummary || page.classification || page.principalComment;
                const rows = isCustomPage ? [] : makeRange(page.rowStart, page.rowEnd);
                const cols = isCustomPage ? [] : makeRange(page.colStart, page.colEnd);
                const pageTableWidth = isCustomPage ? 1 : cols.reduce((sum, col) => sum + Math.max(18, Number(columnWidthsBySheet[pageSheet.name]?.[col - 1] ?? pageSheet.colWidths?.[col - 1]) || 72), 0);
                const pageTableHeight = isCustomPage ? 1 : rows.reduce((sum, row) => sum + Math.max(18, Number(pageSheet.rowHeights?.[row - 1]) || 22), 0);
                const pageScale = isCustomPage ? 1 : Math.min(1, (pageWidth - pageMargin * 2) / pageTableWidth, (pageHeight - pageMargin * 2) / Math.max(1, pageTableHeight));
                const displayedPageNumber = page.globalPageNumber ?? (activeSheetGlobalPageOffset + pageIndex + 1);
                return (
                  <div key={`preview-page-${index}`} className="mx-auto">
                    <div className="scorebook-page-label mb-2 text-center text-xs font-black text-slate-500">Trang {displayedPageNumber}{printMode !== 'workbook' ? ` (${pageIndex + 1}/${activePageSegments.length})` : ''}{page.blank ? ' - trắng để in 2 mặt' : ''}</div>
                    <div className="scorebook-page-frame bg-white shadow-2xl border border-slate-300 overflow-hidden" style={{ width: pageWidth, height: pageHeight, padding: pageMargin, position: 'relative' }}>
                      {page.blank ? (
                        <div className="h-full w-full bg-white" />
                      ) : pageSheetName === 'Bia' ? (
                        renderCoverPage()
                      ) : pageSheetName === 'Bia lot' ? (
                        renderInnerCoverPage()
                      ) : pageSheetName === 'So_Yeu_Ly_Lich' ? (
                        renderProfilePage(pageIndex)
                      ) : pageSheetName === 'Diem_Danh_CN' ? (
                        renderAttendancePage(pageIndex)
                      ) : pageSheetName === 'Diem_HKI_MonNX' ? (
                        renderHkiReviewPage(pageIndex)
                      ) : pageSheetName === 'Diem_HKI_MonTinhDiem' ? (
                        renderHkiScorePage(pageIndex)
                      ) : pageSheetName === 'DiemTongKet_HKI' ? (
                        renderHkiSummaryPage('hki')
                      ) : pageSheetName === 'Diem_HKII_MonNX' ? (
                        renderHkiReviewPage(pageIndex, 'hkii')
                      ) : pageSheetName === 'Diem_HKII_MonTinhDiem' ? (
                        renderHkiScorePage(pageIndex, 'hkii')
                      ) : pageSheetName === 'DiemTongKet_HKII' ? (
                        renderHkiSummaryPage('hkii')
                      ) : pageSheetName === 'TongHopCaNam' ? (
                        renderFullYearSummaryPage()
                      ) : pageSheetName === 'DanhGiaXepLoai' ? (
                        renderClassificationPage()
                      ) : pageSheetName === 'NhanXetCuaHT_CaNam' ? (
                        renderPrincipalCommentPage()
                      ) : pageSheetName === 'BiaPhanGhiDiem_HKI' || pageSheetName === 'BiaPhanGhiDiem_HKII' || pageSheetName === 'BiaPhanGhiDiem_CaNam' ? (
                        renderGradeSectionCoverPage(pageSheetName)
                      ) : pageSheetName === 'Huong_Dan' ? (
                        renderGuidePage()
                      ) : (
                        <div style={{ transform: `scale(${pageScale})`, transformOrigin: 'top left', width: pageTableWidth, height: pageTableHeight }}>
                          {renderScorebookTable({ rows, cols, includeHeaders: false, sheet: pageSheet })}
                        </div>
                      )}
                      {displayedPageNumber > 1 && (
                        <div style={{ position: 'absolute', right: 22, bottom: 16, fontFamily: '"Times New Roman", Times, serif', fontSize: 16, color: '#111', lineHeight: 1 }}>
                          {displayedPageNumber}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
          <div
            className={previewMode ? 'mx-auto bg-white shadow-2xl border border-slate-300 overflow-hidden' : 'inline-block min-w-full rounded-2xl bg-white p-4 shadow-sm'}
            style={previewMode ? { width: pageWidth, height: pageHeight, padding: pageMargin } : undefined}
          >
            <div className="mb-3 print:mb-2">
              <div className="text-base font-black text-slate-900">{activeSheet.label || activeSheet.name}</div>
              <div className="text-xs font-bold text-slate-500">
                {activeSheetDescription}
              </div>
            </div>
            {isCoverSheet ? (
              <div className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                {renderCoverPage()}
              </div>
            ) : isInnerCoverSheet ? (
              <div className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                {renderInnerCoverPage()}
              </div>
            ) : isProfileSheet ? (
              <div className="space-y-6">
                {[0, 1].map(pageIndex => (
                  <div key={`profile-edit-${pageIndex}`} className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                    {renderProfilePage(pageIndex)}
                  </div>
                ))}
              </div>
            ) : isAttendanceSheet ? (
              <div className="space-y-6">
                {attendancePageSegments.map((page, pageIndex) => (
                  <div key={`attendance-edit-${pageIndex}`} className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                    {page.blank ? <div className="bg-white" style={{ width: pageWidth - pageMargin * 2, height: pageHeight - pageMargin * 2 }} /> : renderAttendancePage(pageIndex)}
                  </div>
                ))}
              </div>
            ) : isSemesterOneReviewSheet ? (
              <div className="space-y-6">
                {hkiReviewPageSegments.map((page, pageIndex) => (
                  <div key={`hki-review-edit-${pageIndex}`} className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                    {renderHkiReviewPage(pageIndex)}
                  </div>
                ))}
              </div>
            ) : isSemesterOneScoreSheet ? (
              <div className="space-y-6">
                {hkiScorePageSegments.map((page, pageIndex) => (
                  <div key={`hki-score-edit-${pageIndex}`} className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                    {renderHkiScorePage(pageIndex)}
                  </div>
                ))}
              </div>
            ) : isSemesterOneSummarySheet ? (
              <div className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                {renderHkiSummaryPage('hki')}
              </div>
            ) : isSemesterTwoReviewSheet ? (
              <div className="space-y-6">
                {hkiiReviewPageSegments.map((page, pageIndex) => (
                  <div key={`hkii-review-edit-${pageIndex}`} className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                    {renderHkiReviewPage(pageIndex, 'hkii')}
                  </div>
                ))}
              </div>
            ) : isSemesterTwoScoreSheet ? (
              <div className="space-y-6">
                {hkiiScorePageSegments.map((page, pageIndex) => (
                  <div key={`hkii-score-edit-${pageIndex}`} className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                    {renderHkiScorePage(pageIndex, 'hkii')}
                  </div>
                ))}
              </div>
            ) : isSemesterTwoSummarySheet ? (
              <div className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                {renderHkiSummaryPage('hkii')}
              </div>
            ) : isFullYearSummarySheet ? (
              <div className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                {renderFullYearSummaryPage()}
              </div>
            ) : isClassificationSheet ? (
              <div className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                {renderClassificationPage()}
              </div>
            ) : isPrincipalCommentSheet ? (
              <div className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                {renderPrincipalCommentPage()}
              </div>
            ) : isGradeSectionCoverSheet ? (
              <div className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                {renderGradeSectionCoverPage()}
              </div>
            ) : isGuideSheet ? (
              <div className="inline-block bg-white shadow-sm border border-slate-200" style={{ padding: pageMargin }}>
                {renderGuidePage()}
              </div>
            ) : (
            <div style={previewMode ? { transform: `scale(${previewScale})`, transformOrigin: 'top left', width: tableWidth, height: tableHeight } : undefined}>
              <table className="scorebook-table border-collapse bg-white text-slate-900" style={{ width: tableWidth }}>
                <colgroup>
                  {showHeaders && <col className="scorebook-axis" style={{ width: 44 }} />}
                  {colNumbers.map((col) => (
                    <col key={`col-${col}`} style={{ width: activeColWidths[col - 1] }} />
                  ))}
                </colgroup>
                {showHeaders && (
                  <thead className="scorebook-axis">
                    <tr>
                      <th className="scorebook-axis sticky left-0 top-0 z-20 h-7 border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-500" />
                      {colNumbers.map((col) => (
                        <th key={`head-${col}`} className="scorebook-axis sticky top-0 z-10 h-7 border border-slate-300 bg-slate-100 p-0 text-[10px] font-black text-slate-600 relative select-none">
                          <div className="flex h-full items-center justify-center">{columnLabel(col)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {rowNumbers.map((row) => {
                    const rowHeight = Math.max(18, Number(activeSheet.rowHeights?.[row - 1]) || 22);
                    return (
                      <tr key={`row-${row}`} style={{ height: rowHeight }}>
                        {showHeaders && (
                          <th className="scorebook-axis sticky left-0 z-10 border border-slate-300 bg-slate-100 px-1 text-[10px] font-black text-slate-500 text-center select-none" style={{ height: rowHeight }}>
                            {row}
                          </th>
                        )}
                        {colNumbers.map((col) => {
                          const positionKey = `${row}:${col}`;
                          if (sheetMaps.covered.has(positionKey)) return null;
                          const cell = sheetMaps.cellMap.get(positionKey);
                          const merge = sheetMaps.mergeMap.get(positionKey);
                          const originalValue = getCellValue(cell);
                          const editKey = makeCellKey(activeSheet.name, row, col);
                          return (
                            <ScorebookCell
                              key={positionKey}
                              cell={cell}
                              editValue={edits[editKey]}
                              originalValue={originalValue}
                              rowHeight={rowHeight}
                              rowSpan={merge?.rs || 1}
                              colSpan={merge?.cs || 1}
                              onCommit={(nextValue) => commitCell(row, col, originalValue, nextValue)}
                            />
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
