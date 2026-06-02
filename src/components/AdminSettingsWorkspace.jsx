import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, CalendarDays, ClipboardCheck, ClipboardPaste, Download, FileSpreadsheet, FileText, Filter, Pencil, Plus, Save, Trash2, X } from 'lucide-react';

const emptyTeacher = () => ({ name: '', shortName: '', subject: '', grades: [], periods: '', moneyPerPeriod: '' });
const emptyThdTeacher = () => ({ name: '', subject: '', position: 'GV', note: '' });
const THD_CLASS_GRADES = ['6', '7', '8', '9'];
const emptyThdSubject = () => ({ name: '', shortName: '', periods: '', periodsSemester1: '', periodsSemester2: '', grades: THD_CLASS_GRADES });
const DEFAULT_THD_CLASS_COUNT = 5;
const emptyTeachingAssignment = () => ({
  teacherName: '',
  position: 'GV',
  specialty: '',
  assignment: '',
  weeks: '35',
  className: '6PC',
  classCount: '1',
  periodsPerClassWeek: '',
  totalPeriodsPerWeek: '',
  note: '',
  pastedNote: '',
  sourceTotalPeriodsPerWeek: '',
  sourceWeeklyCheckId: '',
  sourcePeriodNote: '',
  sourcePeriodStartDate: '',
  sourcePeriodEndDate: '',
  totalPeriodsAdjustment: '',
  totalPeriodsOverride: '',
  transcriptSigner: false
});
const XLSX_CDN_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

const normalizeClassName = (value = '') => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
const suggestTeacherShortName = (name = '') => {
  const parts = String(name || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  const lastName = parts.at(-1);
  const initials = parts.slice(0, -1)
    .map(part => part.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase())
    .join('');
  return `${initials} ${lastName}`.trim();
};
const normalizeThdSubjectGrades = (value = []) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[,;.\s]+/);
  const grades = source.map(item => String(item || '').replace(/[^\d]/g, '')).filter(grade => THD_CLASS_GRADES.includes(grade));
  return grades.length ? [...new Set(grades)] : THD_CLASS_GRADES;
};
const normalizeTypedAssignmentClassName = (value = '') => {
  const text = normalizeClassName(value).replace(/\/+/g, '/');
  const letterMatch = text.match(/^([6-9])A(\d{1,2})$/);
  return letterMatch ? `${letterMatch[1]}/${Number(letterMatch[2])}` : text;
};

const createDefaultThdClasses = () => Object.fromEntries(
  THD_CLASS_GRADES.map(grade => [
    grade,
    Array.from({ length: DEFAULT_THD_CLASS_COUNT }, (_, index) => `${grade}/${index + 1}`)
  ])
);

const getGradeFromManagedClassName = (className = '') => String(className || '').match(/[1-9]\d*/)?.[0]?.[0] || '';

const isOldDefaultThdClassList = (grade = '', rows = []) => (
  rows.length === DEFAULT_THD_CLASS_COUNT
  && rows.every((className, index) => normalizeClassName(className) === `${grade}A${index + 1}`)
);

const normalizeThdClasses = (value = {}) => {
  const defaults = createDefaultThdClasses();
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(THD_CLASS_GRADES.map(grade => {
    const rows = Array.isArray(source[grade]) ? source[grade] : defaults[grade];
    const cleaned = rows.map(normalizeClassName).filter(Boolean);
    if (isOldDefaultThdClassList(grade, cleaned)) return [grade, defaults[grade]];
    return [grade, cleaned.length ? [...new Set(cleaned)] : defaults[grade]];
  }));
};

const getClassSortParts = (className = '') => {
  const text = normalizeClassName(className);
  const match = text.match(/^(\d+)(.*?)(\d+)$/) || text.match(/^(\d+)(.*)$/);
  return {
    grade: match ? Number(match[1]) : Number(getGradeFromManagedClassName(text) || 0),
    prefix: match ? (match[2] || '') : text,
    number: match && match[3] ? Number(match[3]) : 0,
    text
  };
};

const getNextManagedClassName = (grade = '', existingClasses = []) => {
  const gradeKey = String(grade || '').trim();
  const existing = existingClasses.map(normalizeClassName).filter(Boolean);
  const lastClass = existing[existing.length - 1] || `${gradeKey}/0`;
  const lastParts = getClassSortParts(lastClass);
  const samePatternNumbers = existing
    .map(className => getClassSortParts(className))
    .filter(parts => String(parts.grade) === gradeKey && parts.prefix === lastParts.prefix && parts.number)
    .map(parts => parts.number);
  const nextNumber = samePatternNumbers.length ? Math.max(...samePatternNumbers) + 1 : 1;
  return `${gradeKey}${lastParts.prefix || '/'}${nextNumber}`;
};

const compareManagedClasses = (left, right) => {
  const a = getClassSortParts(left);
  const b = getClassSortParts(right);
  return (a.grade - b.grade)
    || a.prefix.localeCompare(b.prefix, 'vi')
    || (a.number - b.number)
    || a.text.localeCompare(b.text, 'vi', { numeric: true });
};

const normalizeTeacher = (teacher = {}) => ({
  name: String(teacher.name || '').trim(),
  shortName: String(teacher.shortName ?? teacher.abbrev ?? teacher.shortLabel ?? teacher.teacherShortName ?? '').trim(),
  subject: String(teacher.subject || '').trim(),
  grades: Array.isArray(teacher.grades) ? teacher.grades.map(String) : [],
  periods: String(teacher.periods ?? teacher.teachingPeriods ?? teacher.lessonCount ?? '').trim(),
  moneyPerPeriod: String(teacher.moneyPerPeriod ?? teacher.ratePerPeriod ?? teacher.money ?? '').trim()
});

const normalizeThdTeacher = (teacher = {}) => ({
  name: String(teacher.name || teacher.teacherName || '').trim(),
  subject: String(teacher.subject || teacher.specialty || '').trim(),
  position: normalizeTeachingPosition(teacher.position || 'GV'),
  note: String(teacher.note || '').trim()
});

const normalizeThdSubject = (subject = {}) => ({
  name: String(subject.name || subject.subject || '').trim(),
  shortName: String(subject.shortName || subject.abbrev || subject.code || '').trim(),
  periods: normalizePeriods(subject.periods ?? subject.weeklyPeriods ?? subject.lessonCount ?? subject.soTiet ?? ''),
  periodsSemester1: normalizePeriods(subject.periodsSemester1 ?? subject.hk1Periods ?? subject.periodsHk1 ?? subject.periods ?? subject.weeklyPeriods ?? subject.lessonCount ?? subject.soTiet ?? ''),
  periodsSemester2: normalizePeriods(subject.periodsSemester2 ?? subject.hk2Periods ?? subject.periodsHk2 ?? subject.periods ?? subject.weeklyPeriods ?? subject.lessonCount ?? subject.soTiet ?? ''),
  grades: normalizeThdSubjectGrades(subject.grades ?? subject.gradeLevels ?? subject.khoi ?? subject.appliedGrades)
});

const cleanThdSubjectRowsForSave = (rows = []) => rows
  .map(normalizeThdSubject)
  .filter(item => item.name || item.shortName || item.periods || item.periodsSemester1 || item.periodsSemester2);

const cleanThdTeacherRowsForSave = (rows = []) => rows
  .map(normalizeThdTeacher)
  .filter(item => item.name || item.subject || item.note);

const cleanTeacherRowsForSave = (rows = []) => rows
  .map(normalizeTeacher)
  .filter(item => item.name || item.shortName || item.subject || item.periods || item.moneyPerPeriod);

const normalizeTeacherNameKey = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .toLowerCase();

const normalizePeriods = (value = '') => {
  const text = String(value || '').trim();
  const match = text.match(/\d+(?:[.,]\d+)?/);
  return match ? match[0].replace(',', '.') : '';
};

const normalizeSignedPeriods = (value = '') => {
  const text = String(value || '').trim();
  const match = text.match(/-?\d+(?:[.,]\d+)?/);
  return match ? match[0].replace(',', '.') : '';
};

const normalizeMoney = (value = '') => {
  let text = String(value || '').trim().replace(/[^\d.,-]/g, '').replace(/\s+/g, '');
  if (!text) return '';
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, '');
  }
  return text;
};

const formatMoney = (value = '') => {
  const amount = Number(normalizeMoney(value));
  return amount ? amount.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : '';
};

const looksLikePeriods = (value = '') => /^\s*\d+(?:[.,]\d+)?\s*(?:tiết|tiet)?\s*$/i.test(String(value || ''));
const looksLikeMoney = (value = '') => {
  const text = String(value || '').trim();
  const amount = Number(normalizeMoney(text));
  return amount >= 1000 || /[,.]/.test(text) || /(?:đ|vnd|vnđ|dong|tiền|tien)/i.test(text);
};

const splitPasteColumns = (line = '') => String(line || '')
  .split(/\t|\||;| {2,}|,/)
  .map(item => item.trim())
  .filter(Boolean);

const splitMoneyPasteColumns = (line = '') => {
  const text = String(line || '').trim();
  const tabParts = text.split(/\t/).map(item => item.trim()).filter(Boolean);
  if (tabParts.length > 1) return tabParts;
  const separatedParts = text.split(/\||;| {2,}/).map(item => item.trim()).filter(Boolean);
  if (separatedParts.length > 1) return separatedParts;
  const match = text.match(/^(.+?)\s+((?:\d[\d.,\s]*)(?:\s*(?:đ|vnd|vnđ|dong))?)$/i);
  return match ? [match[1].trim(), match[2].trim()] : [text];
};

const isPeriodPasteHeader = (line = '') => {
  const key = normalizeTeacherNameKey(line);
  return key.includes('so tiet') && (key.includes('ten') || key.includes('giao vien') || key.includes('ho ten'));
};

const isMoneyPasteHeader = (line = '') => {
  const key = normalizeTeacherNameKey(line);
  return (key.includes('so tien') || key.includes('tien')) && (key.includes('ten') || key.includes('giao vien') || key.includes('ho ten'));
};

const parsePeriodUpdateLine = (line = '') => {
  const text = String(line || '').trim();
  if (!text) return null;
  const parts = splitPasteColumns(text);
  const maybeStt = /^\d+$/.test(parts[0] || '');
  const payloadParts = maybeStt ? parts.slice(1) : parts;
  if (payloadParts.length === 2 && looksLikePeriods(payloadParts[1])) {
    return { name: payloadParts[0], periods: normalizePeriods(payloadParts[1]) };
  }
  if (parts.length > 1) return null;
  const withoutStt = text.replace(/^\d+[\t\s,;.]+/, '').trim();
  const match = withoutStt.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:tiết|tiet))?$/i);
  if (!match) return null;
  return { name: match[1].trim(), periods: normalizePeriods(match[2]) };
};

const parseMoneyUpdateLine = (line = '') => {
  const text = String(line || '').trim();
  if (!text) return null;
  const parts = splitMoneyPasteColumns(text);
  const maybeStt = /^\d+$/.test(parts[0] || '');
  const payloadParts = maybeStt ? parts.slice(1) : parts;
  if (payloadParts.length === 2 && looksLikeMoney(payloadParts[1])) {
    return { name: payloadParts[0], moneyPerPeriod: normalizeMoney(payloadParts[1]) };
  }
  if (parts.length > 1) return null;
  const withoutStt = text.replace(/^\d+[\t\s,;.]+/, '').trim();
  const match = withoutStt.match(/^(.+?)\s+((?:\d[\d.,\s]*)(?:\s*(?:đ|vnd|vnđ|dong))?)$/i);
  if (!match || !looksLikeMoney(match[2])) return null;
  return { name: match[1].trim(), moneyPerPeriod: normalizeMoney(match[2]) };
};

const parseGrades = (value = '') => String(value || '')
  .split(/[,;.\s]+/)
  .map(item => item.replace(/[^\d]/g, ''))
  .filter(item => ['6', '7', '8', '9'].includes(item));

const NAN_SUBJECT_OPTIONS = [
  'Toán', 'Ngữ Văn', 'GDTC', 'Khoa học tự nhiên', 'Tiếng Anh',
  'Lịch sử & Địa Lý', 'Giáo dục công dân', 'Công nghệ',
  'Tin học', 'HĐTT', 'NT (AN)', 'NT (MT)'
];

const ASSIGNMENT_SUBJECT_OPTIONS = [
  { label: 'KHTN', value: 'KHTN', aliases: ['Khoa học tự nhiên', 'Khoa học Tự nhiên'] },
  { label: 'LS&ĐL', value: 'LS&ĐL', aliases: ['Lịch sử & Địa Lý', 'Lịch sử và địa lý'] },
  { label: 'GDCD', value: 'GDCD', aliases: ['Giáo dục công dân'] },
  { label: 'GDĐP', value: 'GDĐP', aliases: ['Giáo dục địa phương', 'Nội dung giáo dục địa phương'] },
  { label: 'HĐTT', value: 'HĐTT', aliases: ['Hoạt động tập thể'] },
  { label: 'Toán', value: 'Toán', aliases: ['Toán'] },
  { label: 'Văn', value: 'Văn', aliases: ['Ngữ Văn', 'Ngữ văn', 'Văn'] },
  { label: 'C nghệ', value: 'C nghệ', aliases: ['Công nghệ', 'CNGHỆ', 'CNghệ', 'CN nghệ'] },
  { label: 'Chủ nhiệm', value: 'Chủ nhiệm', aliases: ['Chủ nhiệm', 'CN', 'GVCN', 'GV chủ nhiệm', 'Giáo viên chủ nhiệm'] }
];

const THD_CHECK_SUBJECT_OPTIONS = [
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

const DEFAULT_THD_SUBJECTS = [
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

const POSITION_OPTIONS = ['HT', 'PHT', 'TPT', 'TTCM', 'GV'];

const TEACHING_FILTER_OPTIONS = [
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

const normalizeTeachingPosition = (value = 'GV') => {
  const raw = String(value || '').trim();
  const key = normalizeTeacherNameKey(raw);
  if (key === 'ht' || (key.includes('hieu truong') && !key.includes('pho'))) return 'HT';
  if (key === 'pht' || key.includes('pho hieu truong')) return 'PHT';
  if (key === 'tpt' || key.includes('tong phu trach')) return 'TPT';
  if (key === 'ttcm' || key.includes('to truong chuyen mon')) return 'TTCM';
  if (key === 'gv' || key.includes('giao vien')) return 'GV';
  return raw || 'GV';
};
const ASSIGNMENT_CLASSES = ['6PC', '7PC', '8PC', '9PC'];

const expandClassRange = (start, end, classOptions = ASSIGNMENT_CLASSES) => {
  const normalizedOptions = classOptions.map(normalizeClassName).sort(compareManagedClasses);
  const startIndex = normalizedOptions.indexOf(normalizeTypedAssignmentClassName(start));
  const endIndex = normalizedOptions.indexOf(normalizeTypedAssignmentClassName(end));
  if (startIndex < 0 || endIndex < 0) return [];
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  return normalizedOptions.slice(from, to + 1);
};

const getAssignmentClassList = (value = '', classOptions = ASSIGNMENT_CLASSES) => {
  const text = String(value || '').toUpperCase();
  const optionSet = new Set(classOptions.map(normalizeClassName));
  const isLegacyPcOptions = classOptions.length === ASSIGNMENT_CLASSES.length
    && classOptions.every(className => ASSIGNMENT_CLASSES.includes(className));
  if (isLegacyPcOptions) {
    const found = [...text.matchAll(/[6-9]/g)]
      .map(match => `${match[0]}PC`);
    if (found.length) return [...new Set(found)].filter(className => optionSet.has(className));
  }
  const found = [];
  const rangePattern = /(\d+(?:[A-Z]+|\/+)?\d*)\s*(?:-+\s*>|→|–|—|-|đến|den)\s*(\d+(?:[A-Z]+|\/+)?\d*)/gi;
  let rangeMatch = rangePattern.exec(text);
  while (rangeMatch) {
    found.push(...expandClassRange(rangeMatch[1], rangeMatch[2], classOptions));
    rangeMatch = rangePattern.exec(text);
  }
  const withoutRanges = text.replace(rangePattern, ' ');
  withoutRanges
    .split(/[,;()\s]+/)
    .map(normalizeTypedAssignmentClassName)
    .filter(Boolean)
    .forEach(token => {
      if (optionSet.has(token)) found.push(token);
    });
  if (found.length) return [...new Set(found)].filter(className => optionSet.has(className));
  const trimmed = normalizeTypedAssignmentClassName(text);
  return optionSet.has(trimmed) ? [trimmed] : [];
};

const compactClassRangeLabel = (classes = []) => {
  const normalized = [...new Set(classes.map(normalizeClassName).filter(Boolean))].sort(compareManagedClasses);
  if (!normalized.length) return '';
  const ranges = [];
  let start = normalized[0];
  let prev = normalized[0];
  let rangeCount = 1;
  for (let index = 1; index <= normalized.length; index += 1) {
    const current = normalized[index];
    const prevParts = getClassSortParts(prev);
    const currentParts = getClassSortParts(current);
    const isConsecutive = current
      && prevParts.grade === currentParts.grade
      && prevParts.prefix === currentParts.prefix
      && prevParts.number
      && currentParts.number === prevParts.number + 1;
    if (isConsecutive) {
      prev = current;
      rangeCount += 1;
      continue;
    }
    if (rangeCount === 1) ranges.push(start);
    else if (rangeCount === 2) ranges.push(start, prev);
    else ranges.push(`${start}->${prev}`);
    start = current;
    prev = current;
    rangeCount = current ? 1 : 0;
  }
  return ranges.join(', ');
};

const compactAssignmentClassLabel = (classes = [], classOptions = ASSIGNMENT_CLASSES) => {
  const optionSet = new Set(classOptions.map(normalizeClassName));
  const normalized = [...new Set(classes.map(normalizeClassName))].filter(className => optionSet.has(className)).sort(compareManagedClasses);
  if (!normalized.length) return '';
  const isLegacyPcOptions = classOptions.length === ASSIGNMENT_CLASSES.length
    && classOptions.every(className => ASSIGNMENT_CLASSES.includes(className));
  if (!isLegacyPcOptions) return compactClassRangeLabel(normalized);
  if (normalized.length === 1) return normalized[0];
  return `${normalized.map(className => className.replace(/[^\d]/g, '')).join(',')}(PC)`;
};

const normalizeAssignmentSubject = (value = '') => {
  const raw = String(value || '').trim();
  const rawKey = normalizeTeacherNameKey(raw);
  return [...ASSIGNMENT_SUBJECT_OPTIONS, ...THD_CHECK_SUBJECT_OPTIONS].find(option => (
    normalizeTeacherNameKey(option.value) === rawKey
    || normalizeTeacherNameKey(option.label) === rawKey
    || option.aliases.some(alias => normalizeTeacherNameKey(alias) === rawKey)
  ))?.value || raw;
};

const isTechnologyAssignment = (value = '') => {
  const key = normalizeTeacherNameKey(normalizeAssignmentSubject(value) || value).replace(/\s+/g, '');
  return key === 'cnghe' || key === 'congnghe' || key.startsWith('cnghe') || key.startsWith('congnghe');
};

const isHomeroomAssignment = (value = '') => {
  const key = normalizeTeacherNameKey(normalizeAssignmentSubject(value) || value);
  return ['chu nhiem', 'cn', 'gvcn'].includes(key);
};

const canonicalizeTechnologySubject = (subject = {}) => {
  if (!isTechnologyAssignment(subject.shortName || subject.name)) return subject;
  return {
    ...subject,
    shortName: 'C nghệ'
  };
};

const canonicalizeTechnologyText = (value = '') => (isTechnologyAssignment(value) ? 'C nghệ' : value);

const abbreviateTeachingSpecialty = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const rawKey = normalizeTeacherNameKey(raw);
  if (rawKey === 'cong nghe' || rawKey === 'c nghe') return 'Công nghệ';
  const assignmentSubject = normalizeAssignmentSubject(raw);
  if (assignmentSubject && normalizeTeacherNameKey(assignmentSubject) !== rawKey) {
    return assignmentSubject;
  }
  const specialtyMap = [
    { value: 'KHTN', keys: ['khoa hoc tu nhien'] },
    { value: 'LS&ĐL', keys: ['lich su dia ly', 'lich su va dia ly'] },
    { value: 'GDCD', keys: ['giao duc cong dan'] },
    { value: 'GDĐP', keys: ['giao duc dia phuong', 'noi dung giao duc dia phuong'] },
    { value: 'HĐTT', keys: ['hoat dong tap the', 'hoat dong trai nghiem'] },
    { value: 'Văn', keys: ['ngu van', 'van'] },
    { value: 'T.Anh', keys: ['tieng anh', 'anh van'] },
    { value: 'Tin', keys: ['tin hoc'] },
    { value: 'GDTC', keys: ['giao duc the chat', 'gdtc'] },
    { value: 'NT (AN)', keys: ['nt an', 'am nhac', 'nghe thuat am nhac'] },
    { value: 'NT (MT)', keys: ['nt mt', 'mi thuat', 'my thuat', 'nghe thuat mi thuat', 'nghe thuat my thuat'] }
  ];
  return specialtyMap.find(item => item.keys.some(key => rawKey === key || rawKey.includes(key)))?.value || assignmentSubject || raw;
};

const TEACHING_SUBJECT_TONES = [
  { keys: ['tieng anh', 't anh', 'anh van'], input: 'border-emerald-200 bg-emerald-50/80 text-emerald-900 focus:border-emerald-400' },
  { keys: ['hdtn', 'hoat dong trai nghiem', 'tn shl', 'tn cd'], input: 'border-violet-200 bg-violet-50/80 text-violet-900 focus:border-violet-400' },
  { keys: ['gvcn', 'chu nhiem'], input: 'border-orange-200 bg-orange-50/80 text-orange-900 focus:border-orange-400' },
  { keys: ['ttcm', 'to truong chuyen mon'], input: 'border-amber-200 bg-amber-50/80 text-amber-900 focus:border-amber-400' },
  { keys: ['ts10', 'tuyen sinh'], input: 'border-slate-200 bg-slate-50 text-slate-800 focus:border-slate-400' },
  { keys: ['toan'], input: 'border-blue-200 bg-blue-50/80 text-blue-900 focus:border-blue-400' },
  { keys: ['van', 'ngu van'], input: 'border-rose-200 bg-rose-50/80 text-rose-900 focus:border-rose-400' },
  { keys: ['khtn', 'khoa hoc tu nhien'], input: 'border-teal-200 bg-teal-50/80 text-teal-900 focus:border-teal-400' },
  { keys: ['ls dl', 'lich su dia ly', 'lich su va dia ly'], input: 'border-indigo-200 bg-indigo-50/80 text-indigo-900 focus:border-indigo-400' },
  { keys: ['gdcd', 'giao duc cong dan'], input: 'border-yellow-200 bg-yellow-50/80 text-yellow-900 focus:border-yellow-400' },
  { keys: ['gddp', 'giao duc dia phuong'], input: 'border-lime-200 bg-lime-50/80 text-lime-900 focus:border-lime-400' },
  { keys: ['cong nghe', 'c nghe'], input: 'border-cyan-200 bg-cyan-50/80 text-cyan-900 focus:border-cyan-400' },
  { keys: ['tin hoc', 'tin'], input: 'border-sky-200 bg-sky-50/80 text-sky-900 focus:border-sky-400' },
  { keys: ['gdtc', 'giao duc the chat'], input: 'border-green-200 bg-green-50/80 text-green-900 focus:border-green-400' },
  { keys: ['mi thuat', 'my thuat', 'nt mt', 'mt'], input: 'border-pink-200 bg-pink-50/80 text-pink-900 focus:border-pink-400' },
  { keys: ['am nhac', 'nt an'], input: 'border-fuchsia-200 bg-fuchsia-50/80 text-fuchsia-900 focus:border-fuchsia-400' },
  { keys: ['nghi'], input: 'border-red-200 bg-red-50/80 text-red-900 focus:border-red-400' }
];

const TEACHING_SUBJECT_FALLBACK_TONES = [
  'border-slate-200 bg-slate-50 text-slate-800 focus:border-slate-400',
  'border-blue-200 bg-blue-50/70 text-blue-900 focus:border-blue-400',
  'border-emerald-200 bg-emerald-50/70 text-emerald-900 focus:border-emerald-400',
  'border-violet-200 bg-violet-50/70 text-violet-900 focus:border-violet-400',
  'border-amber-200 bg-amber-50/70 text-amber-900 focus:border-amber-400',
  'border-rose-200 bg-rose-50/70 text-rose-900 focus:border-rose-400',
  'border-cyan-200 bg-cyan-50/70 text-cyan-900 focus:border-cyan-400'
];

const getTeachingSubjectToneClass = (value = '') => {
  const displayValue = abbreviateTeachingSpecialty(normalizeAssignmentSubject(value) || value);
  const key = normalizeTeacherNameKey(displayValue || value);
  if (!key) return 'border-slate-200 bg-white text-slate-700 focus:border-cyan-400';
  const matchedTone = TEACHING_SUBJECT_TONES.find(tone => (
    tone.keys.some(toneKey => (
      toneKey.length <= 3
        ? key === toneKey
        : key === toneKey || key.includes(toneKey)
    ))
  ));
  if (matchedTone) return matchedTone.input;
  const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return TEACHING_SUBJECT_FALLBACK_TONES[hash % TEACHING_SUBJECT_FALLBACK_TONES.length];
};

const cleanTeachingTeacherName = (value = '') => String(value || '')
  .replace(new RegExp(`\\s*${TEACHING_CELL_BREAK}\\s*`, 'g'), ' ')
  .replace(/\r?\n/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();

const appendTeachingNote = (current = '', note = '') => {
  const parts = [current, note]
    .flatMap(value => String(value || '').split(/\r?\n/))
    .map(stripPasteCell)
    .filter(Boolean);
  return [...new Set(parts)].join('\n');
};

const getTeachingStatusNote = (value = '') => {
  const notes = String(value || '')
    .split(new RegExp(`\\s*${TEACHING_CELL_BREAK}\\s*|\\r?\\n`, 'g'))
    .map(stripPasteCell)
    .filter(Boolean)
    .map(note => {
      const key = normalizeTeacherNameKey(note);
      if (key.includes('hop dong')) return 'Hợp đồng';
      if (key.includes('con nho') || key.includes('hau san') || key.includes('ho san') || key.includes('nghi viec')) return note;
      return '';
    })
    .filter(Boolean);
  return [...new Set(notes)].join('\n');
};

const cleanTeachingStoredNote = (value = '') => String(value || '')
  .split(/\r?\n/)
  .map(stripPasteCell)
  .filter(Boolean)
  .filter(note => !isIgnoredTeachingPasteNote(note))
  .join('\n');

const normalizeTeachingPastedNote = (value = '') => {
  const text = stripPasteCell(value);
  if (!text) return '';
  if (isTeachingCheckNoteText(text)) return text;
  return getTeachingStatusNote(text);
};

const extractTeachingTeacherNameNote = (value = '') => {
  const notes = [];
  let name = cleanTeachingTeacherName(value).replace(/\(([^)]*hợp đồng[^)]*|[^)]*hop dong[^)]*)\)/giu, (match, note) => {
    notes.push(stripPasteCell(note) || 'Hợp đồng');
    return ' ';
  });
  if (normalizeTeacherNameKey(name).includes('hop dong')) {
    name = name.replace(/[-–—,;:]?\s*hợp đồng/giu, ' ');
    notes.push('Hợp đồng');
  }
  return {
    name: cleanTeachingTeacherName(name),
    note: [...new Set(notes.map(stripPasteCell).filter(Boolean))].join(', ')
  };
};

const extractTeachingContractNote = (value = '') => {
  const notes = [];
  let text = String(value || '').trim().replace(/\(([^)]*hợp đồng[^)]*|[^)]*hop dong[^)]*)\)/giu, (match, note) => {
    notes.push(stripPasteCell(note) || 'Hợp đồng');
    return ' ';
  });
  if (normalizeTeacherNameKey(text).includes('hop dong')) {
    text = text.replace(/[-–—,;:]?\s*hợp đồng/giu, ' ');
    notes.push('Hợp đồng');
  }
  return {
    text: stripPasteCell(text).replace(/\s{2,}/g, ' ').trim(),
    note: [...new Set(notes.map(stripPasteCell).filter(Boolean))].join(', ')
  };
};

const normalizeTeachingAssignment = (row = {}, classOptions = ASSIGNMENT_CLASSES) => {
  const teacherInfo = extractTeachingTeacherNameNote(row.teacherName || row.name || '');
  const assignmentInfo = extractTeachingContractNote(row.assignment || row.assignedSubject || '');
  const normalizedAssignment = canonicalizeTechnologyText(normalizeAssignmentSubject(assignmentInfo.text || ''));
  const specialtyInfo = extractTeachingContractNote(row.specialty || row.subject || '');
  const noteParts = [cleanTeachingStoredNote(row.note ?? ''), teacherInfo.note, specialtyInfo.note, assignmentInfo.note].map(stripPasteCell).filter(Boolean);
  const normalizedSpecialty = specialtyInfo.text
    ? canonicalizeTechnologyText(specialtyInfo.text)
    : (isCoreTeachingSubject(normalizedAssignment) ? normalizedAssignment : '');
  const specialDutyAssignment = isTeachingSpecialDutyAssignment(normalizedAssignment);
  const hasClassInput = Object.prototype.hasOwnProperty.call(row, 'className') || Object.prototype.hasOwnProperty.call(row, 'classAssigned');
  const rawClassInput = String(row.className ?? row.classAssigned ?? '').trim();
  const hasExplicitBlankClass = specialDutyAssignment || (hasClassInput && !rawClassInput);
  const classSource = specialDutyAssignment ? '' : (hasClassInput ? rawClassInput : classOptions[0] ?? '6PC');
  const selectedClasses = getAssignmentClassList(classSource, classOptions);
  const hasUnmatchedExplicitClass = hasClassInput && rawClassInput && !selectedClasses.length;
  return ({
  teacherName: teacherInfo.name,
  position: normalizeTeachingPosition(row.position || 'GV'),
  specialty: normalizedSpecialty,
  assignment: normalizedAssignment,
  weeks: String(row.weeks ?? '').trim(),
  className: compactAssignmentClassLabel(selectedClasses, classOptions) || (hasExplicitBlankClass ? '' : (hasUnmatchedExplicitClass ? rawClassInput : classOptions[0] || '6PC')),
  classCount: String(selectedClasses.length || row.classCount || (hasExplicitBlankClass || hasUnmatchedExplicitClass ? '' : '1')).trim(),
  periodsPerClassWeek: normalizePeriods(row.periodsPerClassWeek ?? row.periodsPerClass ?? row.lessonPerClass ?? ''),
  totalPeriodsPerWeek: normalizePeriods(row.totalPeriodsPerWeek ?? row.totalWeeklyPeriods ?? row.weeklyPeriods ?? ''),
  note: [...new Set(noteParts)].join('\n'),
  pastedNote: normalizeTeachingPastedNote(row.pastedNote ?? row.sourceNote ?? row.aiNote ?? ''),
  sourceTotalPeriodsPerWeek: normalizePeriods(row.sourceTotalPeriodsPerWeek ?? row.sourceTotalWeeklyPeriods ?? ''),
  sourceWeeklyCheckId: String(row.sourceWeeklyCheckId ?? ''),
  sourcePeriodNote: String(row.sourcePeriodNote ?? ''),
  sourcePeriodStartDate: String(row.sourcePeriodStartDate ?? ''),
  sourcePeriodEndDate: String(row.sourcePeriodEndDate ?? ''),
  totalPeriodsAdjustment: normalizeSignedPeriods(row.totalPeriodsAdjustment ?? ''),
  totalPeriodsOverride: normalizePeriods(row.totalPeriodsOverride ?? ''),
  transcriptSigner: Boolean(row.transcriptSigner || row.signTranscript || row.isTranscriptSigner)
  });
};

const isTeachingNumberingArtifact = (row = {}) => {
  const teacherName = String(row.teacherName || '').trim();
  if (!/^\d+$/.test(teacherName)) return false;
  const text = [row.specialty, row.assignment, row.weeks, row.className, row.classCount]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  return !/[A-Za-zÀ-ỹ]/u.test(text);
};

const stripPasteCell = (value = '') => String(value || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/^'/, '')
  .trim();

const TEACHING_CELL_BREAK = '<LB>';

const splitTeachingPasteColumns = (line = '') => {
  const raw = String(line || '');
  const text = raw.trim();
  if (!text) return [];
  if (raw.includes('\t')) return raw.split('\t').map(stripPasteCell);
  return text
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map(stripPasteCell);
};

const teachingPasteHeaderKey = (value = '') => normalizeTeacherNameKey(value)
  .replace(/\bapp\b/g, '')
  .replace(/\blb\b/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const getTeachingPasteHeaderMap = (headers = []) => {
  const aliases = {
    stt: ['stt', 'so thu tu'],
    teacherName: ['ho va ten', 'ho ten', 'ten giao vien', 'giao vien'],
    position: ['chuc vu'],
    specialty: ['cm giang day', 'chuyen mon giang day', 'chuyen mon'],
    assignment: ['phan cong', 'ten phan cong', 'mon day kiem nhiem', 'mon day'],
    weeks: ['so tuan'],
    className: ['lop duoc phan cong', 'lop day', 'lop pc', 'lop'],
    classCount: ['so lop'],
    periodsPerClassWeek: ['so tiet lop tuan', 'tiet lop tuan', 'tiet moi lop tuan'],
    totalPeriodsPerWeek: ['tong so tiet day', 'tong so tiet tuan', 'tong tiet tuan', 'tong so tiet'],
    extraAssignment: ['cong tac kiem nhiem', 'kiem nhiem'],
    extraTotalPeriodsPerWeek: ['so tiet kiem nhiem tuan', 'tiet kiem nhiem tuan', 'so tiet kiem nhiem'],
    pasteCheck: ['doi chieu du lieu', 'kiem tra dung sai', 'kiem tra cheo', 'kiem tra', 'trang thai'],
    pastedNote: ['ghi chu dan', 'ghi chu code', 'ghi chu ai', 'ghi chu']
  };
  const map = {};
  headers.map(teachingPasteHeaderKey).forEach((header, index) => {
    Object.entries(aliases).forEach(([field, keys]) => {
      if (map[field] !== undefined) return;
      if (keys.some(key => header === key || header.includes(key))) map[field] = index;
    });
  });
  return map;
};

const getTeachingPasteValue = (columns = [], headerMap = {}, field = '', fallbackIndex = -1) => {
  const index = headerMap[field] ?? fallbackIndex;
  return index >= 0 ? stripPasteCell(columns[index] || '') : '';
};

const getTeachingSourceTotalPerWeekValue = (columns = [], headers = [], headerMap = {}) => {
  const headerKeys = headers.map(teachingPasteHeaderKey);
  const preferredIndex = headerKeys.findIndex(header => (
    (header.includes('tong so tiet tuan') || header.includes('tong tiet tuan') || header.includes('tong so tiet tiet tuan'))
    && !header.includes('day')
    && !header.includes('kiem nhiem')
    && !header.includes('tieu chuan')
  ));
  if (preferredIndex >= 0) return getTeachingPasteValue(columns, { totalPeriodsPerWeek: preferredIndex }, 'totalPeriodsPerWeek', -1);
  const columnIValue = getTeachingPasteValue(columns, {}, 'totalPeriodsPerWeek', 8);
  if (columnIValue) return columnIValue;
  const mappedValue = getTeachingPasteValue(columns, headerMap, 'totalPeriodsPerWeek', -1);
  if (mappedValue) return mappedValue;
  return '';
};

const isIgnoredTeachingPasteNote = (value = '') => {
  const key = normalizeTeacherNameKey(value);
  return key.includes('kns')
    || key.includes('stem')
    || key.includes('ki nang song')
    || key.includes('chuyen lop')
    || key.includes('chuyen cn')
    || key.includes('chuyen 8')
    || key.includes('chuyen 9')
    || key.includes('nhom truong');
};

const buildTeachingPastedNote = (checkValue = '', noteValue = '') => {
  const check = stripPasteCell(checkValue);
  const note = stripPasteCell(noteValue);
  if (check) return check;
  if (isIgnoredTeachingPasteNote(note)) return '';
  return getTeachingStatusNote(note);
};

const TEACHING_SPECIAL_DUTIES = [
  { assignment: 'Nghỉ hậu sản', keys: ['hau san', 'ho san', 'nghi hau san', 'nghi ho san'], pattern: /(?:ngh[ỉi]\s+)?h(?:[ậa]u|[ộo])\s*s[ảa]n/iu },
  { assignment: 'Nghỉ việc', keys: ['nghi viec'], pattern: /ngh[ỉĩi]\s*vi[ệe]c/iu },
  { assignment: 'Con nhỏ < 12 tháng', keys: ['con nho'], pattern: /con\s*nh[ỏo]/iu }
];

const isTeachingSpecialDutyAssignment = (value = '') => {
  const key = normalizeTeacherNameKey(value);
  return TEACHING_SPECIAL_DUTIES.some(duty => duty.keys.some(dutyKey => key.includes(dutyKey)));
};

const extractTeachingSpecialDuty = (columns = []) => {
  const scannedCells = columns.slice(0, 15);
  let matchedDuty = null;
  let matchedNote = '';
  for (const cell of scannedCells) {
    const raw = stripPasteCell(cell);
    if (!raw) continue;
    const key = normalizeTeacherNameKey(raw);
    const duty = TEACHING_SPECIAL_DUTIES.find(item => (
      item.keys.some(dutyKey => key.includes(dutyKey))
    ));
    if (!duty) continue;
    matchedDuty = matchedDuty || duty;
    const noteMatch = raw.match(new RegExp(`${duty.pattern.source}\\s*[-:;,.]?\\s*(.*)$`, 'iu'));
    const note = stripPasteCell(noteMatch?.[1] || '');
    if (/\d{1,2}\D+\d{1,2}\D+\d{4}/.test(raw) || /\btừ\b|\btu\b|\bđến\b|\bden\b/iu.test(raw)) {
      matchedNote = raw;
    } else if (note && !matchedNote) {
      matchedNote = note;
    }
  }
  if (matchedDuty) return { assignment: matchedDuty.assignment, note: matchedNote };
  return null;
};

const extractTeacherNameNote = (value = '') => {
  return extractTeachingTeacherNameNote(value);
};

const isTeachingAssignmentHeaderRow = (columns = []) => {
  const headerMap = getTeachingPasteHeaderMap(columns);
  return teachingPasteHeaderKey(columns[0]) === 'stt'
    && headerMap.teacherName !== undefined
    && headerMap.assignment !== undefined
    && headerMap.className !== undefined;
};

const isTeachingAssignmentIndexRow = (columns = [], headerMap = {}) => {
  const fields = ['stt', 'teacherName', 'position', 'specialty', 'assignment', 'weeks', 'className', 'classCount'];
  const values = fields
    .map(field => getTeachingPasteValue(columns, headerMap, field, -1))
    .filter(Boolean);
  if (values.length < 5) return false;
  return values.every((value, index) => String(index + 1) === String(value).trim());
};

const isTeachingAssignmentFooterRow = (columns = []) => {
  const key = teachingPasteHeaderKey(columns.join(' '));
  return key.includes('danh sach co')
    || key.includes('hieu truong')
    || key.includes('pho hieu truong')
    || key.includes('nguoi lap')
    || key.includes('ky ten')
    || key.includes('cong hoa xa hoi')
    || key.includes('uy ban nhan dan');
};

const getTeachingWeeksFromNote = (value = '') => {
  const match = normalizeTeacherNameKey(value).match(/\b(\d+)\s*tuan\b/);
  return match ? String(Number(match[1])) : '';
};

const getDateOverlapDays = (startDate, endDate, rangeStartValue = '', rangeEndValue = '') => {
  const rangeStart = parseDateValue(rangeStartValue);
  const rangeEnd = parseDateValue(rangeEndValue);
  if (!startDate || !endDate || !rangeStart || !rangeEnd || rangeEnd < rangeStart) return 0;
  const overlapStart = startDate > rangeStart ? startDate : rangeStart;
  const overlapEnd = endDate < rangeEnd ? endDate : rangeEnd;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1;
};

const getTeachingPeriodRangeFromDates = (startValue = '', endValue = '', excludedRanges = []) => {
  const startDate = parseDateValue(startValue);
  const endDate = parseDateValue(endValue);
  if (!startDate || !endDate || endDate < startDate) return null;
  const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const excludedDays = excludedRanges.reduce((sum, range) => (
    sum + getDateOverlapDays(startDate, endDate, range.start, range.end)
  ), 0);
  const weeks = String(Math.max(1, Math.ceil(Math.max(1, days - excludedDays) / 7)));
  return {
    periodNote: `${weeks} tuần (từ ngày ${formatDateForNote(dateKeyFromDate(startDate))} đến ngày ${formatDateForNote(dateKeyFromDate(endDate))})`,
    weeks,
    startDate: dateKeyFromDate(startDate),
    endDate: dateKeyFromDate(endDate)
  };
};

const removeTeachingWeeksFromNote = (value = '') => String(value || '')
  .replace(/\b0?\d+\s*(?:tuần|tuan)\b/iu, '')
  .replace(/^[\s:;.,-]+|[\s:;.,-]+$/g, '')
  .trim();

const getTeachingRowPeriodRange = (row = {}) => {
  const explicitStart = parseDateValue(row.sourcePeriodStartDate);
  const explicitEnd = parseDateValue(row.sourcePeriodEndDate);
  if (explicitStart && explicitEnd && explicitEnd >= explicitStart) {
    return {
      start: dateKeyFromDate(explicitStart),
      end: dateKeyFromDate(explicitEnd),
      weeks: Number(normalizePeriods(row.weeks || '')) || 0
    };
  }
  const note = String(row.sourcePeriodNote || row.note || '');
  const matches = [...note.matchAll(/\d{1,2}\D+\d{1,2}\D+\d{4}/g)].map(match => parseDateValue(match[0])).filter(Boolean);
  if (matches.length >= 2 && matches[1] >= matches[0]) {
    return {
      start: dateKeyFromDate(matches[0]),
      end: dateKeyFromDate(matches[1]),
      weeks: Number(normalizePeriods(row.weeks || '')) || 0
    };
  }
  return {
    start: '',
    end: '',
    weeks: Number(normalizePeriods(row.weeks || '')) || 0
  };
};

const getTeachingSpecialDutyExpiryDate = (row = {}) => {
  if (!isTeachingSpecialDutyAssignment(row.assignment)) return '';
  const text = [row.note, row.pastedNote, row.sourcePeriodNote].map(value => String(value || '')).filter(Boolean).join('\n');
  if (!text) return '';
  const dates = [...text.matchAll(/\d{1,2}\D+\d{1,2}\D+\d{4}/g)]
    .map(match => ({ index: match.index ?? 0, date: parseDateValue(match[0]) }))
    .filter(item => item.date);
  if (!dates.length) return '';
  const key = normalizeTeacherNameKey(text);
  if (key.includes('den') || key.includes('toi') || key.includes('het han') || dates.length === 1) {
    return dateKeyFromDate(dates[dates.length - 1].date);
  }
  return '';
};

const getTeachingDateKeyWeeks = (startValue = '', endValue = '') => {
  const start = parseDateValue(startValue);
  const end = parseDateValue(endValue);
  if (!start || !end || end < start) return 0;
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(1, Math.ceil(days / 7));
};

const applyTeachingSpecialDutyExpiryToRange = (row = {}, range = {}) => {
  const expiryKey = getTeachingSpecialDutyExpiryDate(row);
  if (!expiryKey || !range.start || !range.end) return range;
  const rangeStart = parseDateValue(range.start);
  const rangeEnd = parseDateValue(range.end);
  const expiry = parseDateValue(expiryKey);
  if (!rangeStart || !rangeEnd || !expiry) return range;
  if (expiry < rangeStart) {
    return { ...range, end: range.start, weeks: 0, expired: true, expiryDate: expiryKey };
  }
  if (expiry >= rangeEnd) return { ...range, expiryDate: expiryKey };
  const clippedEnd = dateKeyFromDate(expiry);
  return {
    ...range,
    end: clippedEnd,
    weeks: Math.min(Number(range.weeks) || 0, getTeachingDateKeyWeeks(range.start, clippedEnd)),
    expiryDate: expiryKey
  };
};

const buildTeachingExtraSummaryNote = (row = {}) => {
  const periodNote = normalizeTeachingNoteKey(row.sourcePeriodNote || '');
  const extras = [row.note, row.pastedNote]
    .flatMap(value => String(value || '').split(/\r?\n/))
    .map(value => value.trim())
    .filter(Boolean)
    .filter(value => normalizeTeachingNoteKey(value) !== periodNote)
    .filter(value => !isTeachingCheckNoteText(value))
    .filter(value => !getTeachingWeeksFromNote(value));
  return [...new Set(extras)].join('\n');
};

const buildTeachingMergedPeriodNote = (ranges = [], totalWeeks = '') => {
  const valid = ranges
    .filter(range => range.start && range.end)
    .sort((left, right) => String(left.start).localeCompare(String(right.start)));
  const weekText = normalizePeriods(totalWeeks) || String(totalWeeks || '').trim() || '...';
  if (!valid.length) return `${weekText} tuần (từ ngày ......... đến ngày .........)`;
  const merged = [];
  valid.forEach(range => {
    const last = merged[merged.length - 1];
    const start = parseDateValue(range.start);
    const lastEnd = parseDateValue(last?.end);
    if (last && start && lastEnd && start.getTime() <= lastEnd.getTime() + 2 * 86400000) {
      if (parseDateValue(range.end) > lastEnd) last.end = range.end;
      last.weeks += Number(range.weeks) || 0;
      return;
    }
    merged.push({ ...range, weeks: Number(range.weeks) || 0 });
  });
  if (merged.length === 1) {
    return `${weekText} tuần (từ ngày ${formatDateForNote(merged[0].start)} đến ngày ${formatDateForNote(merged[0].end)})`;
  }
  return merged.map(range => {
    const rangeWeeks = normalizePeriods(range.weeks) || weekText;
    return `${rangeWeeks} tuần (từ ngày ${formatDateForNote(range.start)} đến ngày ${formatDateForNote(range.end)})`;
  }).join('\n');
};

const createTeachingBatch = ({ name = '', sourceLabel = '', periodContext = null, rows = [] } = {}) => {
  const startDate = periodContext?.startDate || '';
  const endDate = periodContext?.endDate || '';
  const label = name || (startDate && endDate
    ? `${formatDateForNote(startDate)} - ${formatDateForNote(endDate)}`
    : sourceLabel || `Đợt ${Date.now()}`);
  return {
    id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: label,
    sourceLabel,
    startDate,
    endDate,
    weeks: periodContext?.weeks || '',
    rows
  };
};

const getTeachingBatchLabel = (batch = {}, index = 0) => {
  const prefix = `Đợt ${index + 1}`;
  if (batch.startDate && batch.endDate) return `${prefix}: ${formatDateForNote(batch.startDate)} - ${formatDateForNote(batch.endDate)}`;
  return `${prefix}: ${batch.name || batch.sourceLabel || 'Chưa có ngày'}`;
};

const normalizeTeachingNoteKey = (value = '') => String(value ?? '').replace(/\r\n?/g, '\n').trim();

const compactSamePeriodTeachingRows = (rows = [], classOptions = ASSIGNMENT_CLASSES) => {
  const groups = new Map();
  const orderedKeys = [];
  rows.forEach(row => {
    const classNames = getAssignmentClassList(row.className, classOptions);
    if (!classNames.length) {
      const key = `row-${orderedKeys.length}`;
      orderedKeys.push(key);
      groups.set(key, { ...row, classNames: [] });
      return;
    }
    const key = [
      normalizeTeacherNameKey(row.teacherName),
      normalizeTeachingPosition(row.position),
      normalizeTeacherNameKey(row.specialty),
      normalizeTeacherNameKey(row.assignment),
      normalizePeriods(row.periodsPerClassWeek || ''),
      normalizePeriods(row.totalPeriodsPerWeek || ''),
      normalizePeriods(row.totalPeriodsOverride || ''),
      normalizePeriods(row.weeks || ''),
      normalizeTeachingNoteKey(row.sourcePeriodNote || row.note || ''),
      row.sourcePeriodStartDate || '',
      row.sourcePeriodEndDate || ''
    ].join('|');
    if (!groups.has(key)) {
      orderedKeys.push(key);
      groups.set(key, { ...row, classNames: [] });
    }
    const group = groups.get(key);
    group.classNames.push(...classNames);
    const rowAdjustment = normalizeSignedPeriods(row.totalPeriodsAdjustment || '');
    if (rowAdjustment && !normalizeSignedPeriods(group.totalPeriodsAdjustment || '')) {
      group.totalPeriodsAdjustment = rowAdjustment;
    }
  });
  return orderedKeys.map(key => {
    const row = groups.get(key);
    const classNames = [...new Set(row.classNames || [])].sort(compareManagedClasses);
    if (!classNames.length) return normalizeTeachingAssignment(row, classOptions);
    return normalizeTeachingAssignment({
      ...row,
      className: compactAssignmentClassLabel(classNames, classOptions),
      classCount: String(classNames.length)
    }, classOptions);
  });
};

const THD_CORE_TEACHING_SUBJECT_KEYS = new Set([
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

const getTeachingSubjectSortKey = (value = '') => normalizeTeacherNameKey(
  canonicalizeTechnologyText(normalizeAssignmentSubject(value || '') || value || '')
);

const isCoreTeachingSubject = (value = '') => THD_CORE_TEACHING_SUBJECT_KEYS.has(getTeachingSubjectSortKey(value));

const shouldDropCoreTeachingRowWithoutClass = (row = {}, classOptions = ASSIGNMENT_CLASSES) => {
  const normalizedRow = normalizeTeachingAssignment(row, classOptions);
  const assignment = normalizeAssignmentSubject(normalizedRow.assignment || '') || normalizedRow.assignment || '';
  if (!isCoreTeachingSubject(assignment)) return false;
  return getAssignmentClassList(normalizedRow.className, classOptions).length === 0;
};

const getTeachingSourceWeeklyCheckTotal = (row = {}) => {
  const storedSource = Number(normalizePeriods(row.sourceTotalPeriodsPerWeek || '')) || 0;
  if (storedSource) return storedSource;
  const pastedMatch = String(row.pastedNote || '').match(/file:\s*(\d+(?:[.,]\d+)?)/i);
  return pastedMatch ? Number(normalizePeriods(pastedMatch[1])) || 0 : 0;
};

const isTeachingWeeklyCheckExcludedAssignment = (value = '') => {
  const key = normalizeTeacherNameKey(normalizeAssignmentSubject(value || '') || value || '');
  return key.includes('con nho') || key.includes('hau san') || key.includes('ho san');
};

const getTeachingGeneratedWeeklyCheckTotal = (row = {}, classOptions = ASSIGNMENT_CLASSES) => {
  const normalizedRow = normalizeTeachingAssignment(row, classOptions);
  if (isTeachingWeeklyCheckExcludedAssignment(normalizedRow.assignment)) return 0;
  const classCount = getAssignmentClassList(normalizedRow.className, classOptions).length
    || Number(normalizePeriods(normalizedRow.classCount || ''))
    || 0;
  const perClass = Number(normalizePeriods(normalizedRow.periodsPerClassWeek || '')) || 0;
  if (classCount > 0 && perClass) return classCount * perClass;
  return Number(normalizePeriods(normalizedRow.totalPeriodsPerWeek || '')) || 0;
};

const isTeachingCheckNoteText = (value = '') => {
  const text = String(value || '').trim();
  if (!text) return false;
  const key = normalizeTeacherNameKey(text);
  return (
    key.includes('khop')
    || key.includes('khong khop')
    || /file\s*:/i.test(text)
    || /b(?:a|ả|Ã¡ÂºÂ£)ng\s*:/i.test(text)
    || (text.length <= 40 && /^kh.*p$/i.test(text))
  );
};

const isTeachingPrimarySpecialtyRow = (row = {}) => {
  if (!isCoreTeachingSubject(row.assignment)) return false;
  const specialtyKey = normalizeTeacherNameKey(canonicalizeTechnologyText(abbreviateTeachingSpecialty(row.specialty || '')));
  const assignmentKey = getTeachingSubjectSortKey(row.assignment || '');
  return Boolean(specialtyKey && assignmentKey && specialtyKey === assignmentKey);
};

const getTeachingAssignmentSortRank = (row = {}) => {
  if (isTeachingPrimarySpecialtyRow(row)) return 0;
  if (isCoreTeachingSubject(row.assignment)) return 1;
  return 2;
};

const getTeachingRowStartSortKey = (row = {}) => {
  const range = getTeachingRowPeriodRange(row);
  return range.start || row.sourcePeriodStartDate || '9999-12-31';
};

const compareTeachingRowsInsideTeacher = (left = {}, right = {}, leftIndex = 0, rightIndex = 0) => {
  const leftRank = getTeachingAssignmentSortRank(left);
  const rightRank = getTeachingAssignmentSortRank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  const leftStart = getTeachingRowStartSortKey(left);
  const rightStart = getTeachingRowStartSortKey(right);
  if (leftStart !== rightStart) return leftStart.localeCompare(rightStart);
  const leftAssignment = normalizeAssignmentSubject(left.assignment || '') || left.assignment || '';
  const rightAssignment = normalizeAssignmentSubject(right.assignment || '') || right.assignment || '';
  return leftAssignment.localeCompare(rightAssignment, 'vi') || leftIndex - rightIndex;
};

const groupTeachingRowsByTeacher = (rows = []) => {
  const teacherOrder = new Map();
  rows.forEach(row => {
    const teacherKey = normalizeTeacherNameKey(row.teacherName);
    if (teacherKey && !teacherOrder.has(teacherKey)) teacherOrder.set(teacherKey, teacherOrder.size);
  });
  return rows
    .map((row, index) => {
      const teacherKey = normalizeTeacherNameKey(row.teacherName);
      return {
        row,
        index,
        order: teacherKey && teacherOrder.has(teacherKey) ? teacherOrder.get(teacherKey) : teacherOrder.size + index
      };
    })
    .sort((left, right) => (
      left.order - right.order
      || compareTeachingRowsInsideTeacher(left.row, right.row, left.index, right.index)
      || left.index - right.index
    ))
    .map(item => item.row);
};

const summarizeTeachingBatches = (batches = [], classOptions = ASSIGNMENT_CLASSES) => {
  const summaries = new Map();
  const checkSummaries = new Map();
  const orderedKeys = [];
  batches.forEach((batch, batchIndex) => {
    const batchChecks = new Map();
    const batchRows = Array.isArray(batch.rows) ? batch.rows : [];
    batchRows.forEach(rawRow => {
      const row = normalizeTeachingAssignment(rawRow, classOptions);
      if (shouldDropCoreTeachingRowWithoutClass(row, classOptions)) return;
      const teacherKey = normalizeTeacherNameKey(row.teacherName);
      if (teacherKey) {
        const sourceTotal = getTeachingSourceWeeklyCheckTotal(row);
        const generatedTotal = getTeachingGeneratedWeeklyCheckTotal(row, classOptions);
        const sourceId = row.sourceWeeklyCheckId || `${teacherKey}-${row.assignment}-${row.className}`;
        const check = batchChecks.get(teacherKey) || {
          teacherName: row.teacherName,
          sourceTotal: 0,
          generatedTotal: 0,
          sourceIds: new Set()
        };
        if (sourceTotal && !check.sourceIds.has(sourceId)) {
          check.sourceIds.add(sourceId);
          check.sourceTotal = Math.max(check.sourceTotal, sourceTotal);
        }
        check.generatedTotal += generatedTotal;
        batchChecks.set(teacherKey, check);
      }
      const classes = getAssignmentClassList(row.className, classOptions);
      const splitRows = classes.length > 1
        ? classes.map(className => normalizeTeachingAssignment({
            ...row,
            className,
            classCount: '1'
          }, classOptions))
        : [row];
      splitRows.forEach(item => {
        const className = getAssignmentClassList(item.className, classOptions)[0] || '';
        const assignmentKey = normalizeTeacherNameKey(item.assignment);
        const mergeAcrossTeacherMeta = !className || isHomeroomAssignment(item.assignment) || isCoreTeachingSubject(item.assignment);
        const periodKey = className && !mergeAcrossTeacherMeta
          ? `${normalizePeriods(item.periodsPerClassWeek || '')}|${normalizePeriods(item.totalPeriodsPerWeek || '')}`
          : '';
        const key = [
          normalizeTeacherNameKey(item.teacherName),
          mergeAcrossTeacherMeta ? '' : normalizeTeachingPosition(item.position),
          mergeAcrossTeacherMeta ? '' : normalizeTeacherNameKey(item.specialty),
          assignmentKey,
          className,
          periodKey
        ].join('|');
        if (!summaries.has(key)) {
          orderedKeys.push(key);
          summaries.set(key, {
            ...item,
            className,
            classCount: className ? '1' : '',
            weeks: '0',
            noteRanges: [],
            extraNotes: [],
            pastedNote: '',
            sourceTotalPeriodsPerWeek: '',
            sourceWeeklyCheckId: ''
          });
        }
        const current = summaries.get(key);
        const range = applyTeachingSpecialDutyExpiryToRange(item, getTeachingRowPeriodRange(item));
        const weeks = Number(range.weeks) || 0;
        current.weeks = String(Math.round(((Number(current.weeks) || 0) + weeks) * 10) / 10);
        current.noteRanges.push(range);
        const extraNote = buildTeachingExtraSummaryNote(item);
        if (extraNote) current.extraNotes.push(extraNote);
      });
    });
    batchChecks.forEach((check, teacherKey) => {
      if (!check.sourceTotal) return;
      const current = checkSummaries.get(teacherKey) || {
        teacherName: check.teacherName,
        ok: true,
        mismatchBatchNumbers: []
      };
      const sourceTotal = Math.round(check.sourceTotal * 10) / 10;
      const generatedTotal = Math.round(check.generatedTotal * 10) / 10;
      if (Math.abs(sourceTotal - generatedTotal) >= 0.05) {
        current.ok = false;
        current.mismatchBatchNumbers.push(batchIndex + 1);
      }
      checkSummaries.set(teacherKey, current);
    });
  });
  const rows = orderedKeys.map(key => {
    const row = summaries.get(key);
    const periodNote = buildTeachingMergedPeriodNote(row.noteRanges, row.weeks);
    const extraNote = [...new Set(row.extraNotes.flatMap(note => note.split(/\r?\n/)).map(note => note.trim()).filter(Boolean))].join('\n');
    const fullNote = [periodNote, extraNote].filter(Boolean).join('\n');
    return normalizeTeachingAssignment({
      ...row,
      note: fullNote,
      sourcePeriodNote: periodNote,
      sourcePeriodStartDate: row.noteRanges.map(range => range.start).filter(Boolean).sort()[0] || '',
      sourcePeriodEndDate: row.noteRanges.map(range => range.end).filter(Boolean).sort().slice(-1)[0] || ''
    }, classOptions);
  });
  const checkedTeacherKeys = new Set();
  return groupTeachingRowsByTeacher(compactSamePeriodTeachingRows(rows, classOptions)).map(row => {
    const teacherKey = normalizeTeacherNameKey(row.teacherName);
    const check = checkSummaries.get(teacherKey);
    if (!check || checkedTeacherKeys.has(teacherKey)) return row;
    checkedTeacherKeys.add(teacherKey);
    return {
      ...row,
      pastedNote: check.ok
        ? 'Khớp'
        : `Không khớp đợt ${[...new Set(check.mismatchBatchNumbers)].join(', ')}`
    };
  });
};

const worksheetRowsToTabText = (rows = []) => rows
  .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim()))
  .map(row => row.map(cell => String(cell ?? '').replace(/\r?\n/g, ` ${TEACHING_CELL_BREAK} `).trim()).join('\t'))
  .join('\n');

const isIgnoredTeachingWorkbookSheet = (sheetName = '') => {
  const key = normalizeTeacherNameKey(sheetName);
  return key === 'gddp' || key === 'giao duc dia phuong' || key === 'stem';
};

const loadXlsxLibrary = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('Chỉ đọc Excel trong trình duyệt.'));
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${XLSX_CDN_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.XLSX), { once: true });
      existing.addEventListener('error', () => reject(new Error('Không tải được thư viện đọc Excel.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = XLSX_CDN_URL;
    script.async = true;
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('Không khởi tạo được thư viện đọc Excel.'));
    script.onerror = () => reject(new Error('Không tải được thư viện đọc Excel.'));
    document.head.appendChild(script);
  });
};

const splitTeachingCellLines = (value = '') => String(value || '')
  .split(new RegExp(`\\s*${TEACHING_CELL_BREAK}\\s*|\\r?\\n`, 'g'))
  .map(stripPasteCell)
  .filter(Boolean);

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getThdAssignmentTokens = () => DEFAULT_THD_SUBJECTS
  .flatMap(subject => {
    const base = [subject.shortName, subject.name];
    return normalizeTeacherNameKey(subject.name) === 'chu nhiem' ? [...base, 'CN'] : base;
  })
  .map(stripPasteCell)
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

const splitTeachingListSegments = (value = '') => {
  const segments = [];
  let current = '';
  let depth = 0;
  String(value || '').split('').forEach(char => {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if ((char === ',' || char === ';' || char === '\n') && depth === 0) {
      const segment = stripPasteCell(current);
      if (segment) segments.push(segment);
      current = '';
      return;
    }
    current += char;
  });
  const lastSegment = stripPasteCell(current);
  if (lastSegment) segments.push(lastSegment);
  return segments;
};

const normalizeHdtnAssignment = (text = '') => {
  const key = normalizeTeacherNameKey(text);
  if (!/\b(?:hdtn|hedtn|hoat dong trai nghiem)\b/.test(key)) return '';
  const hasShl = /\bshl\b|sinh hoat lop/.test(key);
  const hasCd = /\bcd\b|chu de/.test(key);
  if (hasShl && hasCd) return 'HĐTN (SHL, CĐ)';
  if (hasShl) return 'HĐTN (SHL)';
  if (hasCd) return 'HĐTN (CĐ)';
  return 'HĐTN';
};

const parseClassSegmentSubject = (segment = '') => {
  const text = stripPasteCell(segment);
  if (!text) return null;
  const textKey = normalizeTeacherNameKey(text);
  const hdtnAssignment = normalizeHdtnAssignment(text);
  if (hdtnAssignment) {
    const classMatch = text.match(/\b([6-9]\s*(?:\/+|A)\s*\d{1,2})\b/iu);
    return {
      assignment: hdtnAssignment,
      className: classMatch ? normalizeTypedAssignmentClassName(classMatch[1]) : ''
    };
  }
  for (const token of getThdAssignmentTokens()) {
    const tokenKey = normalizeTeacherNameKey(token);
    if (tokenKey && textKey === tokenKey) {
      return {
        assignment: normalizeAssignmentSubject(token),
        className: ''
      };
    }
    const match = text.match(new RegExp(`^${escapeRegExp(token)}\\s+(.+)$`, 'iu'));
    if (match) {
      return {
        assignment: normalizeAssignmentSubject(token),
        className: stripPasteCell(match[1])
      };
    }
    if (tokenKey && textKey.startsWith(`${tokenKey} `)) {
      return {
        assignment: normalizeAssignmentSubject(token),
        className: stripPasteCell(text.split(/\s+/).slice(tokenKey.split(/\s+/).length).join(' '))
      };
    }
  }
  return null;
};

const withTeachingClassCount = (row = {}, classOptions = ASSIGNMENT_CLASSES) => {
  const selectedClasses = getAssignmentClassList(row.className, classOptions);
  return {
    ...row,
    classCount: selectedClasses.length ? String(selectedClasses.length) : row.classCount
  };
};

const splitEmbeddedTeachingAssignments = (row = {}, classOptions = ASSIGNMENT_CLASSES) => {
  const classText = String(row.className || '');
  const segments = classText
    .split(new RegExp(`\\s*${TEACHING_CELL_BREAK}\\s*`, 'g'))
    .flatMap(splitTeachingListSegments)
    .map(stripPasteCell)
    .filter(Boolean);
  if (segments.length < 2) {
    const parsedSubject = parseClassSegmentSubject(segments[0] || '');
    if (parsedSubject) {
      return [withTeachingClassCount({
        ...row,
        assignment: parsedSubject.assignment,
        className: parsedSubject.className
      }, classOptions)];
    }
    return [withTeachingClassCount(row, classOptions)];
  }
  const rows = [];
  let currentAssignment = row.assignment;
  let currentClasses = [];
  segments.forEach(segment => {
    const parsedSubject = parseClassSegmentSubject(segment);
    if (parsedSubject) {
      if (currentClasses.length) {
        rows.push(withTeachingClassCount({
          ...row,
          assignment: currentAssignment,
          className: currentClasses.join(', ')
        }, classOptions));
      }
      currentAssignment = parsedSubject.assignment;
      currentClasses = parsedSubject.className ? [parsedSubject.className] : [];
      return;
    }
    currentClasses.push(segment);
  });
  if (currentClasses.length) {
    rows.push(withTeachingClassCount({
      ...row,
      assignment: currentAssignment,
      className: currentClasses.join(', ')
    }, classOptions));
  }
  return rows.length ? rows : [withTeachingClassCount(row, classOptions)];
};

const splitEmbeddedAssignmentSegments = (row = {}, classOptions = ASSIGNMENT_CLASSES) => {
  const assignmentText = String(row.assignment || '');
  const segments = assignmentText
    .split(new RegExp(`\\s*${TEACHING_CELL_BREAK}\\s*`, 'g'))
    .flatMap(splitTeachingListSegments)
    .map(stripPasteCell)
    .filter(Boolean);
  const parsedSegments = segments.map(parseClassSegmentSubject);
  const shouldSplit = parsedSegments.some(Boolean)
    && (segments.length > 1 || parsedSegments.some(parsed => parsed?.className));
  if (!shouldSplit) return [row];
  const rows = segments.map((segment, index) => {
    const parsed = parsedSegments[index];
    if (!parsed) return { ...row, assignment: segment };
    const selectedClasses = getAssignmentClassList(parsed.className, classOptions);
    return {
      ...row,
      assignment: parsed.assignment,
      className: parsed.className || '',
      classCount: selectedClasses.length ? String(selectedClasses.length) : ''
    };
  });
  return rows.length ? rows : [row];
};

const splitTeachingAssignmentRow = (row = {}, classOptions = ASSIGNMENT_CLASSES) => {
  const assignmentLines = splitTeachingCellLines(row.assignment);
  const classLines = splitTeachingCellLines(row.className);
  if (assignmentLines.length > 1 || classLines.length > 1) {
    const lineCount = Math.max(assignmentLines.length, classLines.length);
    const rows = [];
    let lastAssignment = row.assignment;
    for (let index = 0; index < lineCount; index += 1) {
      const assignment = assignmentLines[index] || lastAssignment;
      const className = classLines[index] || '';
      if (assignmentLines[index]) lastAssignment = assignmentLines[index];
      rows.push(...splitEmbeddedTeachingAssignments({
        ...row,
        assignment,
        className
      }, classOptions));
    }
    return rows;
  }
  return splitEmbeddedTeachingAssignments(row, classOptions);
};

const normalizeSplitTeachingAssignmentRows = (row = {}, classOptions = ASSIGNMENT_CLASSES) => (
  splitTeachingAssignmentRow(row, classOptions)
    .flatMap(item => splitEmbeddedAssignmentSegments(item, classOptions))
    .map(item => normalizeTeachingAssignment(item, classOptions))
);

const splitTechnologyAssignmentByGrade = (row = {}, classOptions = ASSIGNMENT_CLASSES) => {
  if (!isTechnologyAssignment(row.assignment)) return [row];
  const selectedClasses = getAssignmentClassList(row.className, classOptions);
  if (selectedClasses.length < 2) return [row];
  const classesByGrade = new Map();
  selectedClasses.forEach(className => {
    const grade = getGradeFromManagedClassName(className);
    if (!grade) return;
    classesByGrade.set(grade, [...(classesByGrade.get(grade) || []), className]);
  });
  if (classesByGrade.size < 2) return [row];
  return [...classesByGrade.entries()]
    .sort(([leftGrade], [rightGrade]) => Number(leftGrade) - Number(rightGrade))
    .map(([, classes]) => ({
      ...row,
      className: compactAssignmentClassLabel(classes, classOptions),
      classCount: String(classes.length),
      periodsPerClassWeek: '',
      totalPeriodsPerWeek: ''
    }));
};

const parseTeachingAssignmentJsonPaste = (text = '', classOptions = ASSIGNMENT_CLASSES, context = {}) => {
  const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end < start) return [];
  const data = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(data)) return [];
  return data.flatMap((teacher) => {
    const assignments = Array.isArray(teacher.phan_cong || teacher.assignments)
      ? (teacher.phan_cong || teacher.assignments)
      : [];
    const originalSum = Number(teacher.kiem_tra_cheo?.tong_tiet_goc || teacher.tong_tiet_goc || 0);
    const parsedSum = assignments.reduce((sum, assignment) => {
      const total = Number(normalizePeriods(assignment.so_tiet || assignment.totalPeriodsPerWeek || assignment.weeklyPeriods || 0)) || 0;
      return sum + total;
    }, 0);
    const jsonCheckNote = originalSum
      ? (parsedSum === originalSum ? `Khớp (${parsedSum}/${originalSum}t)` : `Lệch dữ liệu (Cộng: ${parsedSum}, Gốc: ${originalSum})`)
      : '';
    const teacherInfo = extractTeacherNameNote(teacher.ho_ten || teacher.teacherName || teacher.name || '');
    const assignmentStatusNote = [...new Set(assignments
      .map(assignment => extractTeachingContractNote(assignment.ten_phan_cong || assignment.mon_day_kiem_nhiem || assignment.assignment || '').note)
      .filter(Boolean)
    )].join('\n');
    const teacherName = teacherInfo.name;
    const teacherPosition = teacher.chuc_vu || teacher.position || 'GV';
    const teacherSpecialty = teacher.cm_giang_day || teacher.specialty || teacher.subject || '';
    return assignments.flatMap((assignment) => {
      const assignmentInfo = extractTeachingContractNote(assignment.ten_phan_cong || assignment.mon_day_kiem_nhiem || assignment.assignment || '');
      const className = stripPasteCell(assignment.lop_day || assignment.className || assignment.classes || '');
      const selectedClasses = getAssignmentClassList(className, classOptions);
      const classCount = Number(assignment.so_lop || assignment.classCount || selectedClasses.length || 0);
      const totalWeekly = normalizePeriods(assignment.so_tiet || assignment.totalPeriodsPerWeek || assignment.weeklyPeriods || '');
      const periodsPerClass = selectedClasses.length && totalWeekly
        ? String(Number(totalWeekly) / selectedClasses.length)
        : normalizePeriods(assignment.so_tiet_lop_tuan || assignment.periodsPerClassWeek || '');
      if (!assignmentInfo.text && !className && !totalWeekly && !periodsPerClass) return [];
      return normalizeSplitTeachingAssignmentRows({
        teacherName,
        position: teacherPosition,
        specialty: teacherSpecialty,
        assignment: assignmentInfo.text,
        weeks: context.weeks || assignment.so_tuan || teacher.so_tuan || '35',
        className,
        classCount: classCount || '',
        periodsPerClassWeek: periodsPerClass,
        totalPeriodsPerWeek: totalWeekly,
        note: [teacherInfo.note, assignmentStatusNote, context.periodNote].filter(Boolean).join('\n'),
        pastedNote: buildTeachingPastedNote(jsonCheckNote, assignment.ghi_chu || assignment.note || assignment.pastedNote || ''),
        sourcePeriodNote: context.periodNote || '',
        sourcePeriodStartDate: context.startDate || '',
        sourcePeriodEndDate: context.endDate || ''
      }, classOptions);
    });
  }).filter(row => row.teacherName || row.assignment || row.specialty);
};

const parseTeachingAssignmentTablePaste = (text = '', classOptions = ASSIGNMENT_CLASSES, context = {}) => {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const parsedLines = lines.map(line => splitTeachingPasteColumns(line));
  const headerIndex = parsedLines.findIndex(isTeachingAssignmentHeaderRow);
  if (headerIndex < 0) return [];
  const firstColumns = parsedLines[headerIndex];
  const firstHeaderMap = getTeachingPasteHeaderMap(firstColumns);
  const hasHeader = true;
  const headerMap = hasHeader ? firstHeaderMap : {};
  const dataLines = parsedLines.slice(headerIndex + 1);
  const parsedRows = [];
  let currentTeacher = null;
  let sourceRowIndex = 0;
  const flushCurrentTeacher = () => {
    if (!currentTeacher) return;
    const withTeacherNote = (row = {}) => ({
      ...row,
      note: appendTeachingNote(row.note, currentTeacher.note)
    });
    parsedRows.push(...currentTeacher.rows.map(withTeacherNote));
    if (currentTeacher.extraRows?.length) parsedRows.push(...currentTeacher.extraRows.map(withTeacherNote));
    if (currentTeacher.extraRow) parsedRows.push(withTeacherNote(currentTeacher.extraRow));
    currentTeacher = null;
  };
  for (const columns of dataLines) {
    if (!columns.length) continue;
    if (isTeachingAssignmentFooterRow(columns)) {
      flushCurrentTeacher();
      break;
    }
    const rowHeaderMap = getTeachingPasteHeaderMap(columns);
    if (teachingPasteHeaderKey(columns[0]) === 'stt' || Object.keys(rowHeaderMap).length >= 3) continue;
    if (isTeachingAssignmentIndexRow(columns, headerMap)) continue;
    const rawTeacherName = getTeachingPasteValue(columns, headerMap, 'teacherName', 1);
    const teacherInfo = extractTeacherNameNote(rawTeacherName);
    if (teacherInfo.name) {
      flushCurrentTeacher();
      currentTeacher = {
        teacherName: teacherInfo.name,
        position: getTeachingPasteValue(columns, headerMap, 'position', 2) || 'GV',
        specialty: '',
        stt: getTeachingPasteValue(columns, headerMap, 'stt', 0) || '',
        note: teacherInfo.note,
        extraKey: '',
        extraRows: [],
        extraRow: null,
        rows: []
      };
    }
    if (!currentTeacher) continue;
    const teacherName = currentTeacher.teacherName;
    const position = getTeachingPasteValue(columns, headerMap, 'position', 2) || currentTeacher.position || 'GV';
    const assignmentInfo = extractTeachingContractNote(getTeachingPasteValue(columns, headerMap, 'assignment', 4));
    if (assignmentInfo.note) {
      currentTeacher.note = appendTeachingNote(currentTeacher.note, assignmentInfo.note);
    }
    let teacherNote = [currentTeacher.note, context.periodNote].filter(Boolean).join('\n');
    const assignment = assignmentInfo.text;
    const specialDuty = extractTeachingSpecialDuty(columns);
    const assignmentSpecialDuty = extractTeachingSpecialDuty([assignment]);
    const className = getTeachingPasteValue(columns, headerMap, 'className', 6);
    const classSpecialDuty = extractTeachingSpecialDuty([className]);
    const primarySpecialDuty = assignmentSpecialDuty
      ? { assignment: assignmentSpecialDuty.assignment, note: specialDuty?.note || assignmentSpecialDuty.note }
      : (classSpecialDuty
        ? { assignment: classSpecialDuty.assignment, note: specialDuty?.note || classSpecialDuty.note }
        : (!assignment ? specialDuty : null));
    const primaryAssignment = primarySpecialDuty?.assignment || assignment || specialDuty?.assignment || '';
    const primarySpecialtyFallback = isCoreTeachingSubject(primaryAssignment) ? primaryAssignment : '';
    const specialty = getTeachingPasteValue(columns, headerMap, 'specialty', -1) || currentTeacher.specialty || primarySpecialtyFallback || '';
    currentTeacher.position = position;
    if (specialty) currentTeacher.specialty = specialty;
    const selectedClasses = getAssignmentClassList(className, classOptions);
    const checkNote = getTeachingPasteValue(columns, headerMap, 'pasteCheck', 10);
    const pastedSourceNote = getTeachingPasteValue(columns, headerMap, 'pastedNote', 11);
    const pastedStatusNote = getTeachingStatusNote(removeTeachingWeeksFromNote(pastedSourceNote));
    if (pastedStatusNote) {
      currentTeacher.note = appendTeachingNote(currentTeacher.note, pastedStatusNote);
      teacherNote = [currentTeacher.note, context.periodNote].filter(Boolean).join('\n');
    }
    const weeks = context.weeks || getTeachingPasteValue(columns, headerMap, 'weeks', -1) || getTeachingWeeksFromNote(pastedSourceNote) || '35';
    const pastedNote = buildTeachingPastedNote(checkNote, removeTeachingWeeksFromNote(pastedSourceNote));
    const sourceTotalPeriodsPerWeek = getTeachingSourceTotalPerWeekValue(columns, firstColumns, headerMap);
    const sourceWeeklyCheckId = `table-${sourceRowIndex}`;
    const specialDutyBelongsToPrimary = Boolean(primarySpecialDuty);
    const primaryNote = [teacherNote, primarySpecialDuty?.note || ''].filter(Boolean).join('\n');
    const primaryClassName = primarySpecialDuty ? '' : className;
    const primarySelectedClasses = primarySpecialDuty ? [] : selectedClasses;
    sourceRowIndex += 1;
    if (primaryAssignment || className || sourceTotalPeriodsPerWeek) {
      currentTeacher.rows.push(...normalizeSplitTeachingAssignmentRows({
        teacherName,
        position,
        specialty,
        assignment: primaryAssignment,
        weeks,
        className: primaryClassName,
        classCount: primarySpecialDuty ? '' : (getTeachingPasteValue(columns, headerMap, 'classCount', 7) || primarySelectedClasses.length || ''),
        periodsPerClassWeek: primarySpecialDuty ? '' : getTeachingPasteValue(columns, headerMap, 'periodsPerClassWeek', 8),
        totalPeriodsPerWeek: sourceTotalPeriodsPerWeek,
        note: primaryNote,
        pastedNote,
        sourceTotalPeriodsPerWeek,
        sourceWeeklyCheckId,
        sourcePeriodNote: context.periodNote || '',
        sourcePeriodStartDate: context.startDate || '',
        sourcePeriodEndDate: context.endDate || ''
      }, classOptions));
    }
    if (specialDuty && !specialDutyBelongsToPrimary) {
      currentTeacher.rows.push(...normalizeSplitTeachingAssignmentRows({
        teacherName,
        position,
        specialty,
        assignment: specialDuty.assignment,
        weeks,
        className: '',
        classCount: '',
        periodsPerClassWeek: '',
        totalPeriodsPerWeek: '',
        note: [teacherNote, specialDuty.note].filter(Boolean).join('\n'),
        pastedNote,
        sourceTotalPeriodsPerWeek: '',
        sourceWeeklyCheckId: `special-${sourceRowIndex}-${normalizeTeacherNameKey(specialDuty.assignment)}`,
        sourcePeriodNote: context.periodNote || '',
        sourcePeriodStartDate: context.startDate || '',
        sourcePeriodEndDate: context.endDate || ''
      }, classOptions));
    }
    const extraAssignment = getTeachingPasteValue(columns, headerMap, 'extraAssignment', -1);
    const extraTotalPeriods = getTeachingPasteValue(columns, headerMap, 'extraTotalPeriodsPerWeek', -1);
    const hasExtraAssignment = Boolean(stripPasteCell(extraAssignment));
    const hasPositiveExtraPeriods = Number(normalizePeriods(extraTotalPeriods || '')) > 0;
    const shouldUseExtraTotalForCheck = !sourceTotalPeriodsPerWeek;
    const extraKey = normalizeTeacherNameKey(`${extraAssignment}|${extraTotalPeriods}`);
    if ((hasExtraAssignment || hasPositiveExtraPeriods) && currentTeacher.extraKey !== extraKey) {
      currentTeacher.extraKey = extraKey;
      currentTeacher.extraRow = null;
      currentTeacher.extraRows = normalizeSplitTeachingAssignmentRows({
        teacherName,
        position,
        specialty,
        assignment: extraAssignment || specialty,
        weeks,
        className: '',
        classCount: '',
        periodsPerClassWeek: extraTotalPeriods,
        totalPeriodsPerWeek: extraTotalPeriods,
        note: teacherNote,
        pastedNote,
        sourceTotalPeriodsPerWeek: shouldUseExtraTotalForCheck ? extraTotalPeriods : '',
        sourceWeeklyCheckId: `extra-${sourceRowIndex}-${extraKey}`,
        sourcePeriodNote: context.periodNote || '',
        sourcePeriodStartDate: context.startDate || '',
        sourcePeriodEndDate: context.endDate || ''
      }, classOptions);
    }
  }
  flushCurrentTeacher();
  return parsedRows.filter(row => row && (row.teacherName || row.assignment || row.specialty));
};

const parseTeachingAssignmentPaste = (text = '', classOptions = ASSIGNMENT_CLASSES, context = {}) => {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const periodContext = context || {};
  try {
    const jsonRows = parseTeachingAssignmentJsonPaste(raw, classOptions, periodContext);
    if (jsonRows.length) return jsonRows;
  } catch {
    // Fall through to table parsing; pasted data may not be JSON.
  }
  return parseTeachingAssignmentTablePaste(raw, classOptions, periodContext);
};

const classSubjects = (subjects = []) => [...subjects, 'Chủ nhiệm'];

const compactSchoolYearLabel = (schoolYear = '') => String(schoolYear || '').replace(/\s*-\s*/g, '-').trim();
const LEGACY_ASSIGNMENT_YEAR_KEY = compactSchoolYearLabel('2025-2026');
const sameJson = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const getSchoolYearStartYear = (schoolYear = '') => {
  const match = String(schoolYear || '').match(/\d{4}/);
  return match ? Number(match[0]) : new Date().getFullYear();
};

const pad2 = (value) => String(value).padStart(2, '0');
const dateKeyFromDate = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseDateValue = (value = '') => {
  const text = String(value || '').trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  const viMatch = text.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
  if (viMatch) return new Date(Number(viMatch[3]), Number(viMatch[2]) - 1, Number(viMatch[1]));
  return null;
};

const toDateInputValue = (value = '') => {
  const parsed = parseDateValue(value);
  return parsed ? dateKeyFromDate(parsed) : '';
};

const formatDateForNote = (value = '') => {
  const parsed = parseDateValue(value);
  return parsed ? `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}` : '.........';
};

const defaultTeachingSemesterDates = (schoolYear = '') => {
  const startYear = getSchoolYearStartYear(schoolYear);
  const endYear = startYear + 1;
  return {
    hk1Start: `${startYear}-09-05`,
    hk1End: `${endYear}-01-18`,
    hk2Start: `${endYear}-01-19`,
    hk2End: `${endYear}-05-26`,
    tetStart: '',
    tetEnd: '',
    break1Start: '',
    break1End: '',
    break2Start: '',
    break2End: '',
    break3Start: '',
    break3End: '',
    break4Start: '',
    break4End: ''
  };
};

const isDateInSchoolYearYears = (value = '', schoolYear = '') => {
  const parsed = parseDateValue(value);
  if (!parsed) return false;
  const startYear = getSchoolYearStartYear(schoolYear);
  const year = parsed.getFullYear();
  return year === startYear || year === startYear + 1;
};

const normalizeTeachingSemesterDateForSchoolYear = (value = '', schoolYear = '', fallback = '') => {
  const normalized = toDateInputValue(value);
  return normalized && isDateInSchoolYearYears(normalized, schoolYear) ? normalized : fallback;
};

const getTeachingImportYearForMonth = (month = 0, schoolYear = '') => {
  const startYear = getSchoolYearStartYear(schoolYear);
  if (month >= 9 && month <= 12) return startYear;
  if (month >= 1 && month <= 5) return startYear + 1;
  return 0;
};

const normalizeTeachingImportDateInput = (value = '', schoolYear = '', isDeleting = false) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';
  if (isDeleting && digits.length <= 2) return digits;
  if (digits.length < 2) return digits;
  if (digits.length === 2) return `${digits}/`;
  if (digits.length === 4) {
    const month = Number(digits.slice(2, 4));
    const inferredYear = getTeachingImportYearForMonth(month, schoolYear);
    return inferredYear ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${inferredYear}` : `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
  }
  if (digits.length < 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  const month = Number(digits.slice(2, 4));
  const inferredYear = getTeachingImportYearForMonth(month, schoolYear);
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${inferredYear || digits.slice(4)}`;
};

const resolveTeachingImportDate = (value = '', schoolYear = '') => {
  const text = String(value || '').trim();
  const explicitParts = text.match(/^(\d{1,2})\D+(\d{1,2})(?:\D+(\d{4}))?$/);
  if (explicitParts) {
    const day = Number(explicitParts[1]);
    const month = Number(explicitParts[2]);
    const year = explicitParts[3] ? Number(explicitParts[3]) : getTeachingImportYearForMonth(month, schoolYear);
    if (!day || !month || !year || day > 31 || month > 12) return '';
    return dateKeyFromDate(new Date(year, month - 1, day));
  }
  const normalizedInput = normalizeTeachingImportDateInput(text, schoolYear);
  const match = normalizedInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || day > 31 || month > 12) return '';
  return dateKeyFromDate(new Date(year, month - 1, day));
};

const getTeachingImportDateParts = (value = '', schoolYear = '') => {
  const text = String(value || '').trim();
  const parsedDate = parseDateValue(text);
  if (parsedDate) {
    return {
      day: pad2(parsedDate.getDate()),
      month: pad2(parsedDate.getMonth() + 1),
      year: String(parsedDate.getFullYear())
    };
  }
  const match = text.match(/^(\d{1,2})(?:\D+(\d{1,2}))?(?:\D+(\d{4}))?/);
  const day = match?.[1] || '';
  const month = match?.[2] || '';
  const inferredYear = month ? getTeachingImportYearForMonth(Number(month), schoolYear) : '';
  return {
    day,
    month,
    year: match?.[3] || (inferredYear ? String(inferredYear) : '')
  };
};

function TeachingImportDateFields({ value, onChange, title, schoolYear }) {
  const [parts, setParts] = useState(() => getTeachingImportDateParts(value, schoolYear));

  useEffect(() => {
    setParts(getTeachingImportDateParts(value, schoolYear));
  }, [schoolYear, value]);

  const commitParts = (nextParts = parts) => {
    const rawDay = String(nextParts.day || '').replace(/\D/g, '').slice(0, 2);
    const rawMonth = String(nextParts.month || '').replace(/\D/g, '').slice(0, 2);
    const dayNumber = Number(rawDay);
    const monthNumber = Number(rawMonth);
    const day = dayNumber > 0 ? String(Math.min(dayNumber, 31)).padStart(rawDay.length > 1 ? 2 : rawDay.length, '0') : '';
    const month = monthNumber > 0 ? String(Math.min(monthNumber, 12)).padStart(2, '0') : '';
    const year = month ? getTeachingImportYearForMonth(Number(month), schoolYear) : '';
    if (!day) {
      onChange('');
      return;
    }
    onChange(month ? `${day}/${month}/${year || ''}` : day);
    setParts({ day, month, year: year ? String(year) : '' });
  };

  const updatePart = (part, rawValue) => {
    const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 2);
    setParts(prev => {
      const bounded = part === 'month' && Number(digits) > 12
        ? '12'
        : (part === 'day' && Number(digits) > 31 ? '31' : digits);
      const next = { ...prev, [part]: bounded };
      const month = part === 'month' ? bounded : next.month;
      const year = month ? getTeachingImportYearForMonth(Number(month), schoolYear) : '';
      return { ...next, year: year ? String(year) : '' };
    });
  };

  const handleBlur = () => {
    commitParts();
  };

  return (
    <div className="inline-flex h-7 items-center rounded-md border border-indigo-100 bg-white px-1 text-xs font-normal outline-none focus-within:border-indigo-400">
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={parts.day || ''}
        onChange={(event) => updatePart('day', event.target.value)}
        onBlur={handleBlur}
        onFocus={(event) => event.currentTarget.select()}
        placeholder="dd"
        className="h-6 w-7 bg-transparent text-center outline-none"
        title={`${title}: ngày`}
      />
      <span className="text-slate-400">/</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={parts.month || ''}
        onChange={(event) => updatePart('month', event.target.value)}
        onBlur={handleBlur}
        onFocus={(event) => event.currentTarget.select()}
        placeholder="mm"
        className="h-6 w-7 bg-transparent text-center outline-none"
        title={`${title}: tháng`}
      />
      <span className="text-slate-400">/</span>
      <input
        type="text"
        value={parts.year || ''}
        readOnly
        placeholder="yyyy"
        className="h-6 w-12 bg-transparent text-center text-slate-500 outline-none"
        title={`${title}: năm tự lấy theo năm học`}
        tabIndex={-1}
      />
    </div>
  );
}

const normalizeTeachingSemesterDates = (dates = {}, schoolYear = '') => {
  const defaults = defaultTeachingSemesterDates(schoolYear);
  return {
    hk1Start: normalizeTeachingSemesterDateForSchoolYear(dates.hk1Start, schoolYear, defaults.hk1Start),
    hk1End: normalizeTeachingSemesterDateForSchoolYear(dates.hk1End, schoolYear, defaults.hk1End),
    hk2Start: normalizeTeachingSemesterDateForSchoolYear(dates.hk2Start, schoolYear, defaults.hk2Start),
    hk2End: normalizeTeachingSemesterDateForSchoolYear(dates.hk2End, schoolYear, defaults.hk2End),
    tetStart: normalizeTeachingSemesterDateForSchoolYear(dates.tetStart, schoolYear, defaults.tetStart),
    tetEnd: normalizeTeachingSemesterDateForSchoolYear(dates.tetEnd, schoolYear, defaults.tetEnd),
    break1Start: normalizeTeachingSemesterDateForSchoolYear(dates.break1Start || dates.tetStart, schoolYear, defaults.break1Start),
    break1End: normalizeTeachingSemesterDateForSchoolYear(dates.break1End || dates.tetEnd, schoolYear, defaults.break1End),
    break2Start: normalizeTeachingSemesterDateForSchoolYear(dates.break2Start, schoolYear, defaults.break2Start),
    break2End: normalizeTeachingSemesterDateForSchoolYear(dates.break2End, schoolYear, defaults.break2End),
    break3Start: normalizeTeachingSemesterDateForSchoolYear(dates.break3Start, schoolYear, defaults.break3Start),
    break3End: normalizeTeachingSemesterDateForSchoolYear(dates.break3End, schoolYear, defaults.break3End),
    break4Start: normalizeTeachingSemesterDateForSchoolYear(dates.break4Start, schoolYear, defaults.break4Start),
    break4End: normalizeTeachingSemesterDateForSchoolYear(dates.break4End, schoolYear, defaults.break4End)
  };
};

const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const downloadBlobFile = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const printHtmlDocument = (html, onError) => {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);
  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument || frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    document.body.removeChild(frame);
    onError?.();
    return;
  }
  const cleanup = () => {
    window.setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 800);
  };
  const runPrint = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    } catch {
      cleanup();
      onError?.();
    }
  };
  frameWindow.onafterprint = cleanup;
  frame.onload = () => window.setTimeout(runPrint, 250);
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  window.setTimeout(runPrint, 700);
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  bytes.forEach(byte => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
};

const textBytes = (text) => new TextEncoder().encode(text);

const concatBytes = (parts) => {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
};

const uint16le = (value) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
const uint32le = (value) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);

const createZipBlob = (files) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach(file => {
    const nameBytes = textBytes(file.name);
    const dataBytes = textBytes(file.content);
    const checksum = crc32(dataBytes);
    const localHeader = concatBytes([
      uint32le(0x04034b50), uint16le(20), uint16le(0x0800), uint16le(0), uint16le(0), uint16le(0),
      uint32le(checksum), uint32le(dataBytes.length), uint32le(dataBytes.length), uint16le(nameBytes.length), uint16le(0),
      nameBytes
    ]);
    localParts.push(localHeader, dataBytes);
    centralParts.push(concatBytes([
      uint32le(0x02014b50), uint16le(20), uint16le(20), uint16le(0x0800), uint16le(0), uint16le(0), uint16le(0),
      uint32le(checksum), uint32le(dataBytes.length), uint32le(dataBytes.length), uint16le(nameBytes.length), uint16le(0),
      uint16le(0), uint16le(0), uint16le(0), uint32le(0), uint32le(offset), nameBytes
    ]));
    offset += localHeader.length + dataBytes.length;
  });
  const centralDirectory = concatBytes(centralParts);
  const endRecord = concatBytes([
    uint32le(0x06054b50), uint16le(0), uint16le(0), uint16le(files.length), uint16le(files.length),
    uint32le(centralDirectory.length), uint32le(offset), uint16le(0)
  ]);
  return new Blob([concatBytes([...localParts, centralDirectory, endRecord])], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
};

const columnName = (index) => {
  let name = '';
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

const xlsxCell = (row, col, value = '', style = 0) => {
  const ref = `${columnName(col)}${row}`;
  const styleAttr = style ? ` s="${style}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${escapeHtml(value)}</t></is></c>`;
};

const addDaysToDateKey = (dateKey, days) => {
  const date = parseDateValue(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + days);
  return dateKeyFromDate(date);
};

const nthWeekdayOfMonth = (year, month, weekday, nth) => {
  const date = new Date(year, month - 1, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (nth - 1) * 7);
  return dateKeyFromDate(date);
};

const lastWeekdayOfMonth = (year, month, weekday) => {
  const date = new Date(year, month, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return dateKeyFromDate(date);
};

const defaultTranscriptStartDate = (schoolYear = '') => {
  const startYear = getSchoolYearStartYear(schoolYear);
  return nthWeekdayOfMonth(startYear, 9, 2, 2);
};

const defaultTranscriptEndDate = (schoolYear = '') => {
  const startYear = getSchoolYearStartYear(schoolYear);
  return lastWeekdayOfMonth(startYear + 1, 5, 4);
};

const defaultTranscriptGrade9EndDate = (schoolYear = '') => addDaysToDateKey(defaultTranscriptEndDate(schoolYear), -5);

export default function AdminSettingsWorkspace({
  currentSchoolYear,
  adminSchoolYear,
  schoolYears,
  principalName,
  inputYearLocks,
  transcriptStartDates,
  transcriptEndDates,
  transcriptGrade9EndDates,
  transcriptStartSigners,
  transcriptEndSigners,
  nanTeachers,
  thdTeachers = [],
  thdSubjects = [],
  thdClasses,
  classTeacherAssignments,
  teachingAssignments,
  thdTeachingAssignments,
  subjects,
  grades,
  initialPanel = 'general',
  onSaveSetting,
  showNotification
}) {
  const [yearDraft, setYearDraft] = useState(currentSchoolYear || '');
  const [principalDraft, setPrincipalDraft] = useState(principalName || '');
  const [inputLocksDraft, setInputLocksDraft] = useState({});
  const [transcriptStartDatesDraft, setTranscriptStartDatesDraft] = useState({});
  const [transcriptEndDatesDraft, setTranscriptEndDatesDraft] = useState({});
  const [transcriptGrade9EndDatesDraft, setTranscriptGrade9EndDatesDraft] = useState({});
  const [transcriptStartSignersDraft, setTranscriptStartSignersDraft] = useState({});
  const [transcriptEndSignersDraft, setTranscriptEndSignersDraft] = useState({});
  const [teachersDraft, setTeachersDraft] = useState([]);
  const [thdTeachersDraft, setThdTeachersDraft] = useState([]);
  const [thdSubjectsDraft, setThdSubjectsDraft] = useState(() => DEFAULT_THD_SUBJECTS);
  const [thdClassesDraft, setThdClassesDraft] = useState(() => createDefaultThdClasses());
  const [assignmentsDraft, setAssignmentsDraft] = useState({});
  const [teachingAssignmentsDraft, setTeachingAssignmentsDraft] = useState({});
  const [thdTeachingAssignmentsDraft, setThdTeachingAssignmentsDraft] = useState({});
  const [pasteText, setPasteText] = useState('');
  const [showTeacherPaste, setShowTeacherPaste] = useState(false);
  const [thdPasteText, setThdPasteText] = useState('');
  const [showThdTeacherPaste, setShowThdTeacherPaste] = useState(false);
  const [activeTeacherPickerIndex, setActiveTeacherPickerIndex] = useState(null);
  const [teacherPickerPosition, setTeacherPickerPosition] = useState({ top: 0, left: 0, width: 420 });
  const [activeClassPickerIndex, setActiveClassPickerIndex] = useState(null);
  const [classPickerPosition, setClassPickerPosition] = useState({ top: 0, left: 0, width: 180 });
  const [showTeachingExportMenu, setShowTeachingExportMenu] = useState(false);
  const [showTeachingCheckModal, setShowTeachingCheckModal] = useState(false);
  const [showNewTeachersModal, setShowNewTeachersModal] = useState(false);
  const [teachingBatchWeeksDraft, setTeachingBatchWeeksDraft] = useState({});
  const [teachingCheckWeeks, setTeachingCheckWeeks] = useState('35');
  const [teachingCheckResultFilter, setTeachingCheckResultFilter] = useState('all');
  const [selectedTeachingBatchId, setSelectedTeachingBatchId] = useState('summary');
  const [editingTeachingBatchId, setEditingTeachingBatchId] = useState('');
  const [teachingSummaryDirty, setTeachingSummaryDirty] = useState(false);
  const [teachingRenderLimit, setTeachingRenderLimit] = useState(90);
  const [showTeachingTimeSettings, setShowTeachingTimeSettings] = useState(false);
  const [teachingSettingsTab, setTeachingSettingsTab] = useState('time');
  const [showTeachingMoneyColumns, setShowTeachingMoneyColumns] = useState(true);
  const [teachingFilter, setTeachingFilter] = useState('all');
  const [showTeachingFilterMenu, setShowTeachingFilterMenu] = useState(false);
  const [teachingImportStartDate, setTeachingImportStartDate] = useState('');
  const [teachingImportEndDate, setTeachingImportEndDate] = useState('');
  const teachingImportFileRef = useRef(null);
  const teachingAssignmentPanelRef = useRef(null);
  const teachingAssignmentScrollRef = useRef(null);
  const activePanel = initialPanel || 'general';
  const isThdTeachingPanel = activePanel === 'thdTeachingAssignments';
  const isTeachingPanel = activePanel === 'teachingAssignments' || isThdTeachingPanel;
  const showTeachingFinancialColumns = !isThdTeachingPanel && showTeachingMoneyColumns;
  const showTeachingSchoolColumns = !isThdTeachingPanel;

  useEffect(() => {
    if (!isTeachingPanel) return undefined;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, [isTeachingPanel]);

  useEffect(() => {
    if (!isTeachingPanel) return undefined;

    const panelElement = teachingAssignmentPanelRef.current;
    if (!panelElement) return undefined;

    const handleWheel = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-teaching-own-scroll="true"]')) {
        return;
      }

      const scrollElement = teachingAssignmentScrollRef.current;
      if (!scrollElement) return;

      const { deltaX, deltaY } = event;
      if (!deltaX && !deltaY) return;

      if (event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY)) {
        scrollElement.scrollLeft += deltaX || deltaY;
      } else {
        scrollElement.scrollTop += deltaY;
        scrollElement.scrollLeft += deltaX;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    panelElement.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => panelElement.removeEventListener('wheel', handleWheel, { capture: true });
  }, [isTeachingPanel]);

  useEffect(() => {
    setYearDraft(currentSchoolYear || '');
  }, [currentSchoolYear]);

  useEffect(() => {
    setPrincipalDraft(principalName || '');
  }, [principalName]);

  useEffect(() => {
    setInputLocksDraft(inputYearLocks && typeof inputYearLocks === 'object' ? inputYearLocks : {});
  }, [inputYearLocks]);

  useEffect(() => {
    setTranscriptStartDatesDraft(transcriptStartDates && typeof transcriptStartDates === 'object' ? transcriptStartDates : {});
  }, [transcriptStartDates]);

  useEffect(() => {
    setTranscriptEndDatesDraft(transcriptEndDates && typeof transcriptEndDates === 'object' ? transcriptEndDates : {});
  }, [transcriptEndDates]);

  useEffect(() => {
    setTranscriptGrade9EndDatesDraft(transcriptGrade9EndDates && typeof transcriptGrade9EndDates === 'object' ? transcriptGrade9EndDates : {});
  }, [transcriptGrade9EndDates]);

  useEffect(() => {
    setTranscriptStartSignersDraft(transcriptStartSigners && typeof transcriptStartSigners === 'object' ? transcriptStartSigners : {});
  }, [transcriptStartSigners]);

  useEffect(() => {
    setTranscriptEndSignersDraft(transcriptEndSigners && typeof transcriptEndSigners === 'object' ? transcriptEndSigners : {});
  }, [transcriptEndSigners]);

  useEffect(() => {
    const rows = (Array.isArray(nanTeachers) ? nanTeachers : []).map(normalizeTeacher);
    setTeachersDraft(rows.length ? rows : [emptyTeacher()]);
  }, [nanTeachers]);

  useEffect(() => {
    const rows = (Array.isArray(thdTeachers) ? thdTeachers : []).map(normalizeThdTeacher);
    setThdTeachersDraft(rows.length ? rows : [emptyThdTeacher()]);
  }, [thdTeachers]);

  useEffect(() => {
    const rows = cleanThdSubjectRowsForSave(Array.isArray(thdSubjects) ? thdSubjects : []).map(canonicalizeTechnologySubject);
    if (!rows.length) {
      setThdSubjectsDraft(DEFAULT_THD_SUBJECTS);
      return;
    }
    const defaultPeriods = new Map();
    DEFAULT_THD_SUBJECTS.forEach(subject => {
      [subject.name, subject.shortName].forEach(value => {
        const key = normalizeTeacherNameKey(normalizeAssignmentSubject(value) || value);
        if (key && subject.periods) defaultPeriods.set(key, subject.periods);
      });
    });
    setThdSubjectsDraft(rows.map(subject => {
      if (subject.periods) return subject;
      const key = normalizeTeacherNameKey(normalizeAssignmentSubject(subject.shortName || subject.name) || subject.shortName || subject.name);
      return { ...subject, periods: defaultPeriods.get(key) || '' };
    }));
  }, [thdSubjects]);

  useEffect(() => {
    setThdClassesDraft(normalizeThdClasses(thdClasses));
  }, [thdClasses]);

  useEffect(() => {
    setAssignmentsDraft(classTeacherAssignments || {});
  }, [classTeacherAssignments]);

  useEffect(() => {
    setTeachingAssignmentsDraft(teachingAssignments && typeof teachingAssignments === 'object' ? teachingAssignments : {});
  }, [teachingAssignments]);

  useEffect(() => {
    setThdTeachingAssignmentsDraft(thdTeachingAssignments && typeof thdTeachingAssignments === 'object' ? thdTeachingAssignments : {});
  }, [thdTeachingAssignments]);

  useEffect(() => {
    if (activeClassPickerIndex === null) return undefined;
    const closeClassPickerOnOutsideClick = (event) => {
      const target = event.target;
      if (target?.closest?.('[data-class-picker-popup]') || target?.closest?.('[data-class-picker-button]')) return;
      setActiveClassPickerIndex(null);
    };
    document.addEventListener('pointerdown', closeClassPickerOnOutsideClick, true);
    return () => document.removeEventListener('pointerdown', closeClassPickerOnOutsideClick, true);
  }, [activeClassPickerIndex]);

  const teacherNames = useMemo(() => {
    return [...new Set(teachersDraft.map(item => item.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [teachersDraft]);

  const transcriptSignerNames = useMemo(() => {
    return [...new Set([
      principalDraft,
      ...Object.values(transcriptStartSignersDraft || {}),
      ...Object.values(transcriptEndSignersDraft || {}),
      ...teacherNames
    ].map(item => String(item || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [principalDraft, teacherNames, transcriptEndSignersDraft, transcriptStartSignersDraft]);

  const selectedSchoolYear = adminSchoolYear || currentSchoolYear || '';
  const selectedSchoolYearKey = compactSchoolYearLabel(selectedSchoolYear);
  const effectiveSchoolYearKey = selectedSchoolYearKey || compactSchoolYearLabel(currentSchoolYear || '') || 'default';
  const systemSchoolYearKey = compactSchoolYearLabel(yearDraft || currentSchoolYear || '') || 'default';
  const isSystemYearLocked = Boolean(inputLocksDraft?.[systemSchoolYearKey]);

  const assignmentsBySelectedYear = useMemo(() => {
    if (assignmentsDraft?.byYear?.[effectiveSchoolYearKey]) return assignmentsDraft.byYear[effectiveSchoolYearKey];
    if (!assignmentsDraft?.byYear && effectiveSchoolYearKey === LEGACY_ASSIGNMENT_YEAR_KEY) return assignmentsDraft || {};
    return {};
  }, [assignmentsDraft, effectiveSchoolYearKey]);

  const normalizeClassTeacherAssignmentValue = (value = '') => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const hk1 = String(value.hk1 ?? value.hki ?? value.semester1 ?? value.term1 ?? value.fullYear ?? '').trim();
      const hk2 = String(value.hk2 ?? value.hkii ?? value.semester2 ?? value.term2 ?? value.fullYear ?? '').trim();
      const fallback = String(value.value ?? value.teacherName ?? value.name ?? '').trim();
      return {
        hk1: hk1 || fallback,
        hk2: hk2 || fallback
      };
    }
    const text = String(value || '').trim();
    return { hk1: text, hk2: text };
  };

  const assignmentValue = (grade, subject, semester = 'hk1') => {
    const value = normalizeClassTeacherAssignmentValue(assignmentsBySelectedYear?.[grade]?.[subject] ?? '');
    return value[semester] ?? '';
  };

  const thdClassOptions = useMemo(() => (
    THD_CLASS_GRADES.flatMap(grade => (thdClassesDraft?.[grade] || [])).map(normalizeClassName).filter(Boolean).sort(compareManagedClasses)
  ), [thdClassesDraft]);

  const activeAssignmentClasses = isThdTeachingPanel ? thdClassOptions : ASSIGNMENT_CLASSES;
  const activeTeachingAssignmentsDraft = isThdTeachingPanel ? thdTeachingAssignmentsDraft : teachingAssignmentsDraft;
  const setActiveTeachingAssignmentsDraft = isThdTeachingPanel ? setThdTeachingAssignmentsDraft : setTeachingAssignmentsDraft;
  const activeTeachingTeachersDraft = isThdTeachingPanel
    ? thdTeachersDraft.map(teacher => normalizeTeacher({
        name: teacher.name,
        subject: teacher.subject,
        periods: '',
        moneyPerPeriod: ''
      }))
    : teachersDraft;

  const teachingBatchesForSelectedYear = useMemo(() => {
    const rows = activeTeachingAssignmentsDraft?.batchesByYear?.[effectiveSchoolYearKey];
    return Array.isArray(rows) ? rows : [];
  }, [activeTeachingAssignmentsDraft, effectiveSchoolYearKey]);

  const hasTeachingBatches = isThdTeachingPanel && teachingBatchesForSelectedYear.length > 0;
  const activeTeachingBatch = hasTeachingBatches && selectedTeachingBatchId !== 'summary'
    ? teachingBatchesForSelectedYear.find(batch => batch.id === selectedTeachingBatchId)
    : null;
  const isTeachingSummaryView = hasTeachingBatches && selectedTeachingBatchId === 'summary';
  const isEditingMainTeaching = !isThdTeachingPanel && editingTeachingBatchId === 'main';
  const isEditingTeachingSummary = isTeachingSummaryView && editingTeachingBatchId === 'summary';
  const isEditingActiveTeachingBatch = Boolean(activeTeachingBatch && editingTeachingBatchId === activeTeachingBatch.id);
  const canEditTeachingRows = isTeachingSummaryView
    ? isEditingTeachingSummary
    : (!isThdTeachingPanel ? isEditingMainTeaching : (!hasTeachingBatches || isEditingActiveTeachingBatch));
  const previousTeachingBatch = useMemo(() => {
    if (!activeTeachingBatch) return null;
    const index = teachingBatchesForSelectedYear.findIndex(batch => batch.id === activeTeachingBatch.id);
    return index > 0 ? teachingBatchesForSelectedYear[index - 1] : null;
  }, [activeTeachingBatch, teachingBatchesForSelectedYear]);
  const newTeachersComparedToPreviousBatch = useMemo(() => {
    if (!activeTeachingBatch) return [];
    const previousKeys = new Set(
      (previousTeachingBatch?.rows || []).map(row => normalizeTeacherNameKey(row.teacherName)).filter(Boolean)
    );
    return [...new Map(
      (activeTeachingBatch.rows || [])
        .map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
        .filter(row => row.teacherName && !previousKeys.has(normalizeTeacherNameKey(row.teacherName)))
        .map(row => [normalizeTeacherNameKey(row.teacherName), row])
    ).values()].sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'vi'));
  }, [activeAssignmentClasses, activeTeachingBatch, previousTeachingBatch]);
  const teachingRowsForSelectedYear = useMemo(() => {
    if (isThdTeachingPanel && teachingBatchesForSelectedYear.length) {
      const rows = activeTeachingBatch
        ? activeTeachingBatch.rows
        : (activeTeachingAssignmentsDraft?.byYear?.[effectiveSchoolYearKey] || []);
      const normalizedRows = (Array.isArray(rows) ? rows : [])
        .map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
        .filter(row => !isTeachingNumberingArtifact(row))
        .filter(row => !shouldDropCoreTeachingRowWithoutClass(row, activeAssignmentClasses));
      return normalizedRows.length ? normalizedRows : [normalizeTeachingAssignment({
        ...emptyTeachingAssignment(),
        className: activeAssignmentClasses[0] || '6/1'
      }, activeAssignmentClasses)];
    }
    const legacyRows = effectiveSchoolYearKey === LEGACY_ASSIGNMENT_YEAR_KEY && Array.isArray(activeTeachingAssignmentsDraft?.rows)
      ? activeTeachingAssignmentsDraft.rows
      : [];
    const rows = activeTeachingAssignmentsDraft?.byYear?.[effectiveSchoolYearKey] || legacyRows;
    const normalizedRows = (Array.isArray(rows) ? rows : [])
      .map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
      .filter(row => !isTeachingNumberingArtifact(row))
      .filter(row => !isThdTeachingPanel || !shouldDropCoreTeachingRowWithoutClass(row, activeAssignmentClasses));
    if (!normalizedRows.length && isThdTeachingPanel) {
      const teacherRows = activeTeachingTeachersDraft
        .map(normalizeTeacher)
        .filter(teacher => teacher.name)
        .map(teacher => normalizeTeachingAssignment({
          teacherName: teacher.name,
          position: 'GV',
          specialty: teacher.subject,
          weeks: '35',
          className: activeAssignmentClasses[0] || '6/1',
          classCount: '1'
        }, activeAssignmentClasses));
      if (teacherRows.length) return teacherRows;
    }
    return normalizedRows.length
      ? normalizedRows
      : [normalizeTeachingAssignment({
          ...emptyTeachingAssignment(),
          className: isThdTeachingPanel ? (activeAssignmentClasses[0] || '6/1') : '6PC'
        }, activeAssignmentClasses)];
  }, [activeAssignmentClasses, activeTeachingAssignmentsDraft, activeTeachingBatch, activeTeachingTeachersDraft, effectiveSchoolYearKey, isThdTeachingPanel, teachingBatchesForSelectedYear]);

  useEffect(() => {
    if (!hasTeachingBatches) {
      if (selectedTeachingBatchId !== 'summary') setSelectedTeachingBatchId('summary');
      if (isThdTeachingPanel && editingTeachingBatchId) setEditingTeachingBatchId('');
      return;
    }
    if (selectedTeachingBatchId !== 'summary' && !teachingBatchesForSelectedYear.some(batch => batch.id === selectedTeachingBatchId)) {
      setSelectedTeachingBatchId('summary');
      setEditingTeachingBatchId('');
    }
    if (editingTeachingBatchId && !teachingBatchesForSelectedYear.some(batch => batch.id === editingTeachingBatchId)) {
      setEditingTeachingBatchId('');
    }
  }, [editingTeachingBatchId, hasTeachingBatches, isThdTeachingPanel, selectedTeachingBatchId, teachingBatchesForSelectedYear]);

  useEffect(() => {
    if (!isThdTeachingPanel) return;
    if (!activeTeachingBatch) {
      setTeachingImportStartDate('');
      setTeachingImportEndDate('');
      return;
    }
    if (activeTeachingBatch.startDate) setTeachingImportStartDate(activeTeachingBatch.startDate);
    if (activeTeachingBatch.endDate) setTeachingImportEndDate(activeTeachingBatch.endDate);
  }, [activeTeachingBatch, isThdTeachingPanel]);

  const teacherByName = useMemo(() => {
    const map = new Map();
    activeTeachingTeachersDraft.map(normalizeTeacher).forEach(teacher => {
      const key = normalizeTeacherNameKey(teacher.name);
      if (key) map.set(key, teacher);
    });
    return map;
  }, [activeTeachingTeachersDraft]);

  const teacherSearchOptions = useMemo(() => (
    activeTeachingTeachersDraft
      .map(normalizeTeacher)
      .filter(teacher => teacher.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  ), [activeTeachingTeachersDraft]);

  const getTeacherSuggestions = (value = '') => {
    const searchKey = normalizeTeacherNameKey(value);
    const ranked = teacherSearchOptions
      .map(teacher => {
        const nameKey = normalizeTeacherNameKey(teacher.name);
        const subjectKey = normalizeTeacherNameKey(teacher.subject);
        const score = !searchKey
          ? 1
          : (nameKey.startsWith(searchKey) ? 3 : (nameKey.includes(searchKey) || subjectKey.includes(searchKey) ? 2 : 0));
        return { teacher, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.teacher.name.localeCompare(b.teacher.name, 'vi'));
    return ranked.slice(0, 8).map(item => item.teacher);
  };

  const pickTeachingTeacher = (index, teacher) => {
    updateTeachingAssignmentRow(index, {
      teacherName: teacher.name,
      specialty: teacher.subject
    });
    setActiveTeacherPickerIndex(null);
  };

  const openTeacherPicker = (index, inputElement = null) => {
    if (inputElement) {
      const rect = inputElement.getBoundingClientRect();
      const dropdownHeight = 220;
      const openUp = (window.innerHeight - rect.bottom) < 90;
      setTeacherPickerPosition({
        top: openUp ? Math.max(8, rect.top - dropdownHeight - 4) : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 440)),
        width: Math.max(420, rect.width)
      });
    }
    setActiveTeacherPickerIndex(index);
  };

  const openClassPicker = (index, buttonElement = null) => {
    if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      const dropdownHeight = 360;
      const openUp = (window.innerHeight - rect.bottom) < dropdownHeight + 16;
      setClassPickerPosition({
        top: openUp ? Math.max(8, rect.top - dropdownHeight - 4) : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 220)),
        width: Math.max(180, rect.width)
      });
    }
    setActiveClassPickerIndex(current => (current === index ? null : index));
  };

  const toggleTeachingClass = (index, className) => {
    const row = teachingRowsForSelectedYear[index] || {};
    const selected = getAssignmentClassList(row.className, activeAssignmentClasses);
    const nextClasses = selected.includes(className)
      ? selected.filter(item => item !== className)
      : [...selected, className].sort(compareManagedClasses);
    const nextLabel = compactAssignmentClassLabel(nextClasses, activeAssignmentClasses);
    updateTeachingAssignmentRow(index, {
      className: nextLabel,
      classCount: nextClasses.length ? String(nextClasses.length) : ''
    });
  };

  const teachingSemesterDatesForYear = useMemo(() => (
    normalizeTeachingSemesterDates(activeTeachingAssignmentsDraft?.semestersByYear?.[effectiveSchoolYearKey], selectedSchoolYear)
  ), [activeTeachingAssignmentsDraft, effectiveSchoolYearKey, selectedSchoolYear]);
  const teachingDateStartYear = getSchoolYearStartYear(selectedSchoolYear);
  const teachingDateInputMin = `${teachingDateStartYear}-01-01`;
  const teachingDateInputMax = `${teachingDateStartYear + 1}-12-31`;
  const teachingExcludedDateRanges = useMemo(() => (
    [
      { start: teachingSemesterDatesForYear.break1Start || teachingSemesterDatesForYear.tetStart, end: teachingSemesterDatesForYear.break1End || teachingSemesterDatesForYear.tetEnd },
      { start: teachingSemesterDatesForYear.break2Start, end: teachingSemesterDatesForYear.break2End },
      { start: teachingSemesterDatesForYear.break3Start, end: teachingSemesterDatesForYear.break3End },
      { start: teachingSemesterDatesForYear.break4Start, end: teachingSemesterDatesForYear.break4End }
    ].filter(range => range.start && range.end)
  ), [teachingSemesterDatesForYear]);

  const updateTeachingSemesterDate = (field, value) => {
    const normalizedValue = toDateInputValue(value);
    if (normalizedValue && !isDateInSchoolYearYears(normalizedValue, selectedSchoolYear)) {
      showNotification?.(`Ngày chỉ được nằm trong năm ${teachingDateStartYear} hoặc ${teachingDateStartYear + 1}.`);
      return;
    }
    setActiveTeachingAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      return {
        ...prevObj,
        semestersByYear: {
          ...(prevObj.semestersByYear || {}),
          [effectiveSchoolYearKey]: {
            ...teachingSemesterDatesForYear,
            [field]: normalizedValue
          }
        }
      };
    });
  };

  const getTeachingWeekNote = (weeks = '', semesterDates = teachingSemesterDatesForYear) => {
    const rawWeeks = String(weeks || '').trim();
    const weekNumber = Number(rawWeeks.replace(',', '.'));
    const weekLabel = normalizePeriods(rawWeeks) || rawWeeks.replace(/tuần/gi, '').trim() || '...';
    if (weekNumber === 18) {
      return `18 tuần (từ ngày ${formatDateForNote(semesterDates.hk1Start)} đến ngày ${formatDateForNote(semesterDates.hk1End)})`;
    }
    if (weekNumber === 17) {
      return `17 tuần (từ ngày ${formatDateForNote(semesterDates.hk2Start)} đến ngày ${formatDateForNote(semesterDates.hk2End)})`;
    }
    if (weekNumber === 35) {
      return `35 tuần (từ ngày ${formatDateForNote(semesterDates.hk1Start)} đến ngày ${formatDateForNote(semesterDates.hk2End)})`;
    }
    return `${weekLabel} tuần (từ ngày ......... đến ngày .........)`;
  };

  const isGeneratedTeachingNote = (note = '') => {
    const noteKey = normalizeTeacherNameKey(note);
    return (
      (noteKey.includes('tuan') && noteKey.includes('tu') && noteKey.includes('den'))
      || noteKey.includes('hk1')
      || noteKey.includes('hk2')
    );
  };

  const normalizeTeachingNoteText = (value = '') => String(value ?? '').replace(/\r\n?/g, '\n').trim();

  const getTeachingNoteExtra = (note = '', generatedNote = '') => {
    const text = normalizeTeachingNoteText(note);
    const generated = normalizeTeachingNoteText(generatedNote);
    if (!text) return '';
    if (generated && text.startsWith(generated)) {
      return text.slice(generated.length).replace(/^[\s:;.,-]+/, '').trim();
    }
    if (!isGeneratedTeachingNote(text)) return text;
    const generatedEndIndex = text.indexOf(')');
    if (generatedEndIndex >= 0) return text.slice(generatedEndIndex + 1).trim();
    return '';
  };

  const mergeTeachingNote = (generatedNote = '', note = '') => {
    const generated = normalizeTeachingNoteText(generatedNote);
    const text = normalizeTeachingNoteText(note);
    if (
      generated.includes('.........')
      && isGeneratedTeachingNote(text)
      && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text)
    ) {
      return text;
    }
    const extra = getTeachingNoteExtra(note, generated);
    if (!generated) return extra;
    return extra ? `${generated}\n${extra}` : generated;
  };

  const updateTeachingRowsForYear = (updater) => {
    if (isThdTeachingPanel && teachingBatchesForSelectedYear.length && activeTeachingBatch) {
      setTeachingSummaryDirty(true);
    }
    setActiveTeachingAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      if (isThdTeachingPanel && teachingBatchesForSelectedYear.length) {
        if (!activeTeachingBatch) {
          const byYear = { ...(prevObj.byYear || {}) };
          const savedRows = Array.isArray(byYear[effectiveSchoolYearKey]) ? byYear[effectiveSchoolYearKey] : teachingRowsForSelectedYear;
          const currentRows = (Array.isArray(savedRows) ? savedRows : []).map(row => normalizeTeachingAssignment(row, activeAssignmentClasses));
          const nextRows = typeof updater === 'function' ? updater(currentRows) : updater;
          byYear[effectiveSchoolYearKey] = (Array.isArray(nextRows) ? nextRows : []).map(row => normalizeTeachingAssignment(row, activeAssignmentClasses));
          return {
            ...prevObj,
            byYear
          };
        }
        const batchesByYear = { ...(prevObj.batchesByYear || {}) };
        const batches = (Array.isArray(batchesByYear[effectiveSchoolYearKey]) ? batchesByYear[effectiveSchoolYearKey] : teachingBatchesForSelectedYear);
        batchesByYear[effectiveSchoolYearKey] = batches.map(batch => {
          if (batch.id !== activeTeachingBatch.id) return batch;
          const currentRows = (Array.isArray(batch.rows) ? batch.rows : []).map(row => normalizeTeachingAssignment(row, activeAssignmentClasses));
          const nextRows = typeof updater === 'function' ? updater(currentRows) : updater;
          return {
            ...batch,
            rows: (Array.isArray(nextRows) ? nextRows : []).map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
          };
        });
        return {
          ...prevObj,
          batchesByYear
        };
      }
      const byYear = { ...(prevObj.byYear || {}) };
      const savedRows = Array.isArray(byYear[effectiveSchoolYearKey]) ? byYear[effectiveSchoolYearKey] : null;
      const currentRows = ((savedRows && savedRows.length) ? savedRows : teachingRowsForSelectedYear).map(row => normalizeTeachingAssignment(row, activeAssignmentClasses));
      const nextRows = typeof updater === 'function' ? updater(currentRows) : updater;
      byYear[effectiveSchoolYearKey] = (Array.isArray(nextRows) ? nextRows : []).map(row => normalizeTeachingAssignment(row, activeAssignmentClasses));
      return {
        ...prevObj,
        byYear
      };
    });
  };

  const updateTeachingAssignmentRow = (index, patch) => {
    updateTeachingRowsForYear(rows => rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const nextPatch = { ...patch };
      if (Object.prototype.hasOwnProperty.call(nextPatch, 'teacherName')) {
        const teacher = teacherByName.get(normalizeTeacherNameKey(nextPatch.teacherName));
        if (teacher && !Object.prototype.hasOwnProperty.call(nextPatch, 'specialty')) {
          nextPatch.specialty = teacher.subject;
        }
      }
      if (Object.prototype.hasOwnProperty.call(nextPatch, 'note')) {
        nextPatch.note = mergeTeachingNote(getAssignmentNote({ ...row, ...nextPatch }), nextPatch.note);
      }
      if (
        (Object.prototype.hasOwnProperty.call(nextPatch, 'weeks')
          || Object.prototype.hasOwnProperty.call(nextPatch, 'assignment')
          || Object.prototype.hasOwnProperty.call(nextPatch, 'className'))
        && !Object.prototype.hasOwnProperty.call(nextPatch, 'note')
      ) {
        const currentNote = String(row.note || '').trim();
        if (!currentNote || isGeneratedTeachingNote(currentNote)) {
          nextPatch.note = mergeTeachingNote(getAssignmentNote({ ...row, ...nextPatch }), currentNote);
        }
      }
      return applyConfiguredPeriodsToTeachingRow(normalizeTeachingAssignment({ ...row, ...nextPatch }, activeAssignmentClasses));
    }));
  };

  const addTeachingAssignmentRow = (afterIndex = null, seed = null) => {
    updateTeachingRowsForYear(rows => {
      const next = [...rows];
      const insertAt = Number.isInteger(afterIndex) ? afterIndex + 1 : next.length;
      const emptyRow = {
        ...emptyTeachingAssignment(),
        className: isThdTeachingPanel ? (activeAssignmentClasses[0] || '6/1') : '6PC'
      };
      next.splice(insertAt, 0, normalizeTeachingAssignment(seed || emptyRow, activeAssignmentClasses));
      return next;
    });
  };

  const addTeachingAssignmentForSameTeacher = (index) => {
    const current = teachingRowsForSelectedYear[index] || {};
    addTeachingAssignmentRow(index, {
      ...emptyTeachingAssignment(),
      teacherName: current.teacherName || '',
      position: current.position || 'GV',
      specialty: current.specialty || '',
      weeks: current.weeks || '35',
      className: '',
      classCount: ''
    });
  };

  const addTeachingTeacherAfterGroup = (index) => {
    const { end } = teachingGroupBounds(teachingRowsForSelectedYear, index);
    addTeachingAssignmentRow(end, {
      ...emptyTeachingAssignment(),
      className: isThdTeachingPanel ? (activeAssignmentClasses[0] || '6/1') : '6PC'
    });
  };

  const deleteTeachingAssignmentRow = (index) => {
    updateTeachingRowsForYear(rows => {
      const next = rows.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [normalizeTeachingAssignment({
        ...emptyTeachingAssignment(),
        className: isThdTeachingPanel ? (activeAssignmentClasses[0] || '6/1') : '6PC'
      }, activeAssignmentClasses)];
    });
  };

  const deleteTeachingTeacherGroup = (index) => {
    const teacherName = String(teachingRowsForSelectedYear[index]?.teacherName || '').trim() || 'giáo viên này';
    if (!window.confirm(`Xóa hết phân công của ${teacherName}?`)) return;
    updateTeachingRowsForYear(rows => {
      const teacherKey = normalizeTeacherNameKey(rows[index]?.teacherName);
      const next = teacherKey
        ? rows.filter(row => normalizeTeacherNameKey(row.teacherName) !== teacherKey)
        : rows.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [normalizeTeachingAssignment({
        ...emptyTeachingAssignment(),
        className: isThdTeachingPanel ? (activeAssignmentClasses[0] || '6/1') : '6PC'
      }, activeAssignmentClasses)];
    });
    showNotification?.('Đã xóa giáo viên khỏi bảng phân công.');
  };

  const clearTeachingAssignmentsForYear = () => {
    updateTeachingRowsForYear([normalizeTeachingAssignment({
      ...emptyTeachingAssignment(),
      className: isThdTeachingPanel ? (activeAssignmentClasses[0] || '6/1') : '6PC'
    }, activeAssignmentClasses)]);
    showNotification?.('Đã xóa hết phân công trong bảng nháp.');
  };

  const deleteSelectedTeachingBatch = () => {
    if (!isThdTeachingPanel || !activeTeachingBatch) return;
    const batchName = activeTeachingBatch.name || 'đợt này';
    if (!window.confirm(`Xóa ${batchName}?`)) return;
    setActiveTeachingAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      const nextBatches = (Array.isArray(prevObj.batchesByYear?.[effectiveSchoolYearKey])
        ? prevObj.batchesByYear[effectiveSchoolYearKey]
        : teachingBatchesForSelectedYear
      ).filter(batch => batch.id !== activeTeachingBatch.id);
      return {
        ...prevObj,
        batchesByYear: {
          ...(prevObj.batchesByYear || {}),
          [effectiveSchoolYearKey]: nextBatches
        },
        byYear: {
          ...(prevObj.byYear || {}),
          [effectiveSchoolYearKey]: nextBatches.length ? (prevObj.byYear?.[effectiveSchoolYearKey] || []) : []
        }
      };
    });
    setSelectedTeachingBatchId('summary');
    setEditingTeachingBatchId('');
    setTeachingSummaryDirty(teachingBatchesForSelectedYear.length > 1);
    showNotification?.(`Đã xóa ${batchName}.`);
  };

  const updateTeachingSummaryFromBatches = () => {
    if (!isThdTeachingPanel || !teachingBatchesForSelectedYear.length) return;
    const summaryRows = summarizeTeachingBatchesForCurrentYear(teachingBatchesForSelectedYear);
    setActiveTeachingAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      return {
        ...prevObj,
        byYear: {
          ...(prevObj.byYear || {}),
          [effectiveSchoolYearKey]: summaryRows
        }
      };
    });
    setSelectedTeachingBatchId('summary');
    setTeachingSummaryDirty(false);
    showNotification?.(`Đã cập nhật tổng hợp từ ${teachingBatchesForSelectedYear.length} đợt.`);
  };

  const getTeachingBatchWeekNote = (batch = {}, weeks = '') => {
    const weekValue = normalizePeriods(weeks || batch.weeks || '') || String(weeks || batch.weeks || '').trim();
    if (!weekValue || !batch.startDate || !batch.endDate) return '';
    return `${weekValue} tuần (từ ngày ${formatDateForNote(batch.startDate)} đến ngày ${formatDateForNote(batch.endDate)})`;
  };

  const applyWeeksToTeachingBatch = (batch = {}, weeks = '') => {
    const weekValue = normalizePeriods(weeks) || normalizePeriods(batch.weeks) || String(weeks || batch.weeks || '').trim();
    const nextPeriodNote = getTeachingBatchWeekNote(batch, weekValue);
    return {
      ...batch,
      weeks: weekValue,
      rows: (Array.isArray(batch.rows) ? batch.rows : []).map(row => {
        const normalizedRow = normalizeTeachingAssignment(row, activeAssignmentClasses);
        const nextRow = {
          ...normalizedRow,
          weeks: weekValue,
          sourcePeriodNote: nextPeriodNote || normalizedRow.sourcePeriodNote || '',
          sourcePeriodStartDate: batch.startDate || normalizedRow.sourcePeriodStartDate || '',
          sourcePeriodEndDate: batch.endDate || normalizedRow.sourcePeriodEndDate || ''
        };
        if (nextPeriodNote) {
          nextRow.note = mergeTeachingNote(nextPeriodNote, normalizedRow.note || normalizedRow.sourcePeriodNote || '');
        }
        return applyConfiguredPeriodsToTeachingRow(normalizeTeachingAssignment(nextRow, activeAssignmentClasses));
      })
    };
  };

  const openTeachingTimeSettings = () => {
    setTeachingSettingsTab('time');
    setShowTeachingTimeSettings(true);
  };

  const openTeachingWeekSettings = () => {
    const draft = {};
    teachingBatchesForSelectedYear.forEach(batch => {
      draft[batch.id] = normalizePeriods(batch.weeks) || normalizePeriods(batch.rows?.[0]?.weeks || '') || getTeachingWeeksFromNote(batch.name || '') || '1';
    });
    setTeachingBatchWeeksDraft(draft);
    setTeachingSettingsTab('weeks');
    setShowTeachingTimeSettings(true);
  };

  const saveTeachingBatchWeeks = () => {
    if (!isThdTeachingPanel || !teachingBatchesForSelectedYear.length) return;
    let nextBatches = [];
    setActiveTeachingAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      const currentBatches = Array.isArray(prevObj.batchesByYear?.[effectiveSchoolYearKey])
        ? prevObj.batchesByYear[effectiveSchoolYearKey]
        : teachingBatchesForSelectedYear;
      nextBatches = currentBatches.map(batch => {
        const draftWeeks = normalizePeriods(teachingBatchWeeksDraft[batch.id]);
        return applyWeeksToTeachingBatch(batch, draftWeeks || batch.weeks || '1');
      });
      const summaryRows = summarizeTeachingBatchesForCurrentYear(nextBatches);
      return {
        ...prevObj,
        batchesByYear: {
          ...(prevObj.batchesByYear || {}),
          [effectiveSchoolYearKey]: nextBatches
        },
        byYear: {
          ...(prevObj.byYear || {}),
          [effectiveSchoolYearKey]: summaryRows
        }
      };
    });
    setSelectedTeachingBatchId('summary');
    setTeachingSummaryDirty(false);
    setShowTeachingTimeSettings(false);
    showNotification?.(`Đã cập nhật số tuần cho ${teachingBatchesForSelectedYear.length} đợt.`);
  };

  const teachingGroupBounds = (rows = [], index = 0) => {
    const currentKey = normalizeTeacherNameKey(rows[index]?.teacherName);
    if (!currentKey) return { start: index, end: index };
    let start = index;
    let end = index;
    while (start > 0 && normalizeTeacherNameKey(rows[start - 1]?.teacherName) === currentKey) start -= 1;
    while (end < rows.length - 1 && normalizeTeacherNameKey(rows[end + 1]?.teacherName) === currentKey) end += 1;
    return { start, end };
  };

  const moveTeachingAssignmentGroup = (index, direction) => {
    updateTeachingRowsForYear(rows => {
      if (rows.length <= 1) return rows;
      const { start, end } = teachingGroupBounds(rows, index);
      const groupRows = rows.slice(start, end + 1);
      if (direction < 0) {
        if (start <= 0) return rows;
        const prevBounds = teachingGroupBounds(rows, start - 1);
        return [
          ...rows.slice(0, prevBounds.start),
          ...groupRows,
          ...rows.slice(prevBounds.start, start),
          ...rows.slice(end + 1)
        ];
      }
      if (end >= rows.length - 1) return rows;
      const nextBounds = teachingGroupBounds(rows, end + 1);
      return [
        ...rows.slice(0, start),
        ...rows.slice(end + 1, nextBounds.end + 1),
        ...groupRows,
        ...rows.slice(nextBounds.end + 1)
      ];
    });
  };

  const appendParsedTeachingRows = (parsedRows = [], sourceLabel = 'dữ liệu') => {
    if (!parsedRows.length) {
      showNotification?.('Chua doc duoc du lieu phan cong. Hay dan JSON hoac bang copy tu cong cu boc tach.', 'error');
      return;
    }
    const existingTeacherKeys = new Set(
      (isThdTeachingPanel ? [] : teachingRowsForSelectedYear)
        .map(row => normalizeTeacherNameKey(row.teacherName))
        .filter(Boolean)
    );
    const importedTeacherKeys = new Set();
    const filteredRows = [];
    let skippedTeacherCount = 0;
    let index = 0;
    while (index < parsedRows.length) {
      const teacherKey = normalizeTeacherNameKey(parsedRows[index]?.teacherName);
      if (!teacherKey) {
        filteredRows.push(parsedRows[index]);
        index += 1;
        continue;
      }
      let end = index;
      while (
        end + 1 < parsedRows.length
        && normalizeTeacherNameKey(parsedRows[end + 1]?.teacherName) === teacherKey
      ) end += 1;
      if (existingTeacherKeys.has(teacherKey) || importedTeacherKeys.has(teacherKey)) {
        skippedTeacherCount += 1;
      } else {
        importedTeacherKeys.add(teacherKey);
        filteredRows.push(...parsedRows.slice(index, end + 1));
      }
      index = end + 1;
    }
    if (!filteredRows.length) {
      showNotification?.('Không thêm dòng nào vì các giáo viên trong file đã có trong bảng.', 'error');
      return;
    }
    const sortedRows = [];
    const groups = [];
    let groupIndex = 0;
    while (groupIndex < filteredRows.length) {
      const teacherKey = normalizeTeacherNameKey(filteredRows[groupIndex]?.teacherName);
      let end = groupIndex;
      while (
        teacherKey
        && end + 1 < filteredRows.length
        && normalizeTeacherNameKey(filteredRows[end + 1]?.teacherName) === teacherKey
      ) end += 1;
      const groupRows = filteredRows.slice(groupIndex, end + 1);
      const position = normalizeTeachingPosition(groupRows[0]?.position || 'GV');
      const rank = position === 'HT' ? 0 : (position === 'PHT' ? 1 : 2);
      groups.push({ rank, order: groups.length, rows: groupRows });
      groupIndex = end + 1;
    }
    groups
      .sort((left, right) => left.rank - right.rank || left.order - right.order)
      .forEach(group => sortedRows.push(...group.rows));
    const gradeSplitRows = sortedRows.flatMap(row => splitTechnologyAssignmentByGrade(row, activeAssignmentClasses));
    const withConfiguredPeriods = gradeSplitRows
      .map(applyConfiguredPeriodsToTeachingRow)
      .filter(row => !isThdTeachingPanel || !shouldDropCoreTeachingRowWithoutClass(row, activeAssignmentClasses));
    const teacherChecks = new Map();
    withConfiguredPeriods.forEach(row => {
      const teacherKey = normalizeTeacherNameKey(row.teacherName);
      if (!teacherKey) return;
      const current = teacherChecks.get(teacherKey) || {
        sourceTotal: 0,
        generatedTotal: 0,
        sourceIds: new Set()
      };
      const sourceId = row.sourceWeeklyCheckId || `${teacherKey}-${row.assignment}-${row.className}`;
      const sourceTotal = Number(normalizePeriods(row.sourceTotalPeriodsPerWeek || '')) || 0;
      if (sourceTotal && !current.sourceIds.has(sourceId)) {
        current.sourceIds.add(sourceId);
        current.sourceTotal = Math.max(current.sourceTotal, sourceTotal);
      }
      current.generatedTotal += Number(getTeachingGeneratedWeeklyCheckTotal(row, activeAssignmentClasses)) || 0;
      teacherChecks.set(teacherKey, current);
    });
    const checkedTeacherKeys = new Set();
    const rowsWithChecks = withConfiguredPeriods.map(row => {
      const teacherKey = normalizeTeacherNameKey(row.teacherName);
      const check = teacherChecks.get(teacherKey);
      if (!check || !check.sourceTotal || checkedTeacherKeys.has(teacherKey)) {
        return {
          ...row,
          pastedNote: ''
        };
      }
      checkedTeacherKeys.add(teacherKey);
      const sourceTotal = Math.round(check.sourceTotal * 10) / 10;
      const generatedTotal = Math.round(check.generatedTotal * 10) / 10;
      const status = Math.abs(sourceTotal - generatedTotal) < 0.05
        ? 'Khớp'
        : `Không khớp (file: ${sourceTotal}, bảng: ${generatedTotal})`;
      return {
        ...row,
        pastedNote: status
      };
    });
    if (isThdTeachingPanel) {
      const periodContext = getTeachingImportPeriodContext();
      const newBatch = createTeachingBatch({
        sourceLabel,
        periodContext,
        rows: rowsWithChecks
      });
      setTeachingSummaryDirty(true);
      if (activeTeachingBatch) {
        setActiveTeachingAssignmentsDraft(prev => {
          const prevObj = (prev && typeof prev === 'object') ? prev : {};
          const existingBatches = Array.isArray(prevObj.batchesByYear?.[effectiveSchoolYearKey])
            ? prevObj.batchesByYear[effectiveSchoolYearKey]
            : teachingBatchesForSelectedYear;
          const nextBatches = existingBatches.map(batch => (
            batch.id === activeTeachingBatch.id
              ? {
                  ...batch,
                  name: newBatch.name,
                  sourceLabel,
                  startDate: newBatch.startDate,
                  endDate: newBatch.endDate,
                  weeks: newBatch.weeks,
                  rows: rowsWithChecks
                }
              : batch
          ));
          return {
            ...prevObj,
            batchesByYear: {
              ...(prevObj.batchesByYear || {}),
              [effectiveSchoolYearKey]: nextBatches
            },
          };
        });
        setEditingTeachingBatchId('');
        showNotification?.(`Đã thay thế ${activeTeachingBatch.name || 'đợt đang chọn'} bằng dữ liệu mới từ ${sourceLabel}.`);
        return;
      }
      setActiveTeachingAssignmentsDraft(prev => {
        const prevObj = (prev && typeof prev === 'object') ? prev : {};
        const existingBatches = Array.isArray(prevObj.batchesByYear?.[effectiveSchoolYearKey])
          ? prevObj.batchesByYear[effectiveSchoolYearKey]
          : [];
        const legacyRows = (!existingBatches.length && Array.isArray(prevObj.byYear?.[effectiveSchoolYearKey]))
          ? prevObj.byYear[effectiveSchoolYearKey]
              .map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
              .filter(row => row.teacherName || row.assignment || row.specialty)
          : [];
        const legacyBatch = legacyRows.length
          ? [createTeachingBatch({
              name: 'Dữ liệu cũ',
              sourceLabel: 'Dữ liệu cũ',
              rows: legacyRows
            })]
          : [];
        const nextBatches = [...legacyBatch, ...existingBatches, newBatch];
        return {
          ...prevObj,
          batchesByYear: {
            ...(prevObj.batchesByYear || {}),
            [effectiveSchoolYearKey]: nextBatches
          },
        };
      });
      setSelectedTeachingBatchId('summary');
      setEditingTeachingBatchId('');
      setTeachingImportStartDate('');
      setTeachingImportEndDate('');
      showNotification?.(`Đã tạo đợt phân công ${newBatch.name} từ ${sourceLabel}${skippedTeacherCount ? `, bỏ qua ${skippedTeacherCount} giáo viên bị lặp trong file` : ''}.`);
      return;
    }
    updateTeachingRowsForYear(rows => {
      const baseRows = rows.length === 1 && !rows[0].teacherName && !rows[0].assignment && !rows[0].specialty ? [] : rows;
      return [...baseRows, ...rowsWithChecks];
    });
    showNotification?.(`Đã thêm ${filteredRows.length} dòng phân công từ ${sourceLabel}${skippedTeacherCount ? `, bỏ qua ${skippedTeacherCount} giáo viên bị lặp` : ''}.`);
  };

  const getTeachingImportPeriodContext = () => {
    if (activeTeachingBatch) {
      return getTeachingPeriodRangeFromDates(activeTeachingBatch.startDate, activeTeachingBatch.endDate, teachingExcludedDateRanges);
    }
    return getTeachingPeriodRangeFromDates(
      resolveTeachingImportDate(teachingImportStartDate, selectedSchoolYear),
      resolveTeachingImportDate(teachingImportEndDate, selectedSchoolYear),
      teachingExcludedDateRanges
    );
  };
  const canImportTeachingFile = Boolean(getTeachingImportPeriodContext());
  const canUseTeachingImport = canImportTeachingFile && (!activeTeachingBatch || isEditingActiveTeachingBatch);

  const getLiveTeachingCheckNote = (rows = [], row = {}, index = 0) => {
    if (!isThdTeachingPanel) return row.pastedNote || '';
    const teacherKey = normalizeTeacherNameKey(row.teacherName);
    if (!teacherKey) return '';
    const { start, end } = teachingGroupBounds(rows, index);
    if (index !== start) return '';
    const teacherRows = rows.slice(start, end + 1);
    const sourceTotals = teacherRows
      .map(item => {
        const storedSource = Number(normalizePeriods(item.sourceTotalPeriodsPerWeek || '')) || 0;
        if (storedSource) return storedSource;
        const pastedMatch = String(item.pastedNote || '').match(/file:\s*(\d+(?:[.,]\d+)?)/i);
        return pastedMatch ? Number(normalizePeriods(pastedMatch[1])) || 0 : 0;
      })
      .filter(value => value > 0);
    if (!sourceTotals.length) return '';
    const sourceTotal = Math.max(...sourceTotals);
    const generatedTotal = Math.round(teacherRows.reduce((sum, item) => (
      sum + (Number(getTeachingGeneratedWeeklyCheckTotal(item, activeAssignmentClasses)) || 0)
    ), 0) * 10) / 10;
    return Math.abs(sourceTotal - generatedTotal) < 0.05
      ? 'Khớp'
      : `Không khớp (file: ${sourceTotal}, bảng: ${generatedTotal})`;
  };

  const openTeachingImportFilePicker = () => {
    if (activeTeachingBatch && !isEditingActiveTeachingBatch) {
      showNotification?.('Hãy bấm Chỉnh sửa đợt trước khi thay dữ liệu của đợt đang xem.', 'error');
      return;
    }
    if (!getTeachingImportPeriodContext()) {
      showNotification?.('Hãy nhập ngày bắt đầu và ngày kết thúc hợp lệ trước khi thêm dữ liệu.', 'error');
      return;
    }
    teachingImportFileRef.current?.click();
  };

  const readTeachingWorkbookRows = async (file) => {
    const xlsx = await loadXlsxLibrary();
    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: 'array' });
    const importPeriodContext = getTeachingImportPeriodContext();
    const sheetMeta = workbook.Workbook?.Sheets || [];
    return workbook.SheetNames.flatMap((sheetName, sheetIndex) => {
      if (sheetMeta[sheetIndex]?.Hidden) return [];
      if (isIgnoredTeachingWorkbookSheet(sheetName)) return [];
      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
      return parseTeachingAssignmentPaste(worksheetRowsToTabText(rows), activeAssignmentClasses, {
        ...(importPeriodContext || {}),
        schoolYear: selectedSchoolYear
      });
    });
  };

  const handleTeachingImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const importPeriodContext = getTeachingImportPeriodContext();
      if (!importPeriodContext) {
        showNotification?.('Hãy nhập ngày bắt đầu và ngày kết thúc hợp lệ trước khi thêm dữ liệu.', 'error');
        return;
      }
      const fileName = String(file.name || '').toLowerCase();
      const importedRows = fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')
        ? parseTeachingAssignmentPaste(await file.text(), activeAssignmentClasses, {
            ...importPeriodContext,
            schoolYear: selectedSchoolYear
          })
        : await readTeachingWorkbookRows(file);
      appendParsedTeachingRows(importedRows, file.name || 'file Excel');
    } catch (error) {
      showNotification?.(`Khong nhap duoc file: ${error.message || 'loi khong xac dinh'}`, 'error');
    }
  };

  const findClassSubjectForAssignment = (assignment = '') => {
    const assignmentKey = normalizeTeacherNameKey(normalizeAssignmentSubject(assignment));
    return classSubjects(subjects).find(subject => (
      normalizeTeacherNameKey(normalizeAssignmentSubject(subject)) === assignmentKey
    )) || '';
  };

  const loadClassTeachersFromTeachingAssignments = () => {
    const yearSubjects = classSubjects(subjects);
    const nextYearMap = {};
    grades.forEach(grade => {
      nextYearMap[String(grade)] = Object.fromEntries(yearSubjects.map(subject => [subject, { hk1: '', hk2: '' }]));
    });
    const assignmentRows = teachingRowsForSelectedYear
      .map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
      .filter(row => row.teacherName && row.assignment);
    if (!assignmentRows.length) {
      showNotification?.('Chưa có dòng phân công nào có giáo viên và môn để load.', 'error');
      return;
    }
    const touchedKeys = new Set();
    assignmentRows.forEach(row => {
      const subject = findClassSubjectForAssignment(row.assignment);
      if (!subject) return;
      const semester = row.transcriptSigner ? 'hk2' : 'hk1';
      getAssignmentClassList(row.className, activeAssignmentClasses).forEach(className => {
        const grade = className.replace(/[^\d]/g, '');
        if (!grades.map(String).includes(grade)) return;
        const currentValue = normalizeClassTeacherAssignmentValue(nextYearMap?.[grade]?.[subject] || '');
        const currentNames = String(currentValue[semester] || '')
          .split(/\s*,\s*/)
          .map(item => item.trim())
          .filter(Boolean);
        if (!currentNames.some(name => normalizeTeacherNameKey(name) === normalizeTeacherNameKey(row.teacherName))) {
          currentNames.push(row.teacherName);
        }
        nextYearMap[grade] = {
          ...(nextYearMap[grade] || {}),
          [subject]: {
            ...currentValue,
            [semester]: currentNames.join(', ')
          }
        };
        touchedKeys.add(`${grade}|${subject}`);
      });
    });
    touchedKeys.forEach(key => {
      const [grade, subject] = key.split('|');
      const currentValue = normalizeClassTeacherAssignmentValue(nextYearMap?.[grade]?.[subject] || '');
      nextYearMap[grade][subject] = {
        hk1: currentValue.hk1 || currentValue.hk2,
        hk2: currentValue.hk2 || currentValue.hk1
      };
    });
    if (!touchedKeys.size) {
      showNotification?.('Chưa ghép được dòng phân công nào vào môn/lớp tương ứng.', 'error');
      return;
    }
    setAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      return {
        ...prevObj,
        byYear: {
          ...(prevObj.byYear || {}),
          [effectiveSchoolYearKey]: nextYearMap
        }
      };
    });
    showNotification?.(`Đã load ${touchedKeys.size} phân công theo HK1/HK2.`);
  };

  const cleanThdSubjectsDraft = useMemo(
    () => {
      const defaultPeriods = new Map();
      DEFAULT_THD_SUBJECTS.forEach(subject => {
        [subject.name, subject.shortName].forEach(value => {
          const key = normalizeTeacherNameKey(normalizeAssignmentSubject(value) || value);
          if (key && subject.periods) defaultPeriods.set(key, subject.periods);
        });
      });
      return cleanThdSubjectRowsForSave(thdSubjectsDraft).map(canonicalizeTechnologySubject).map(subject => {
        const key = normalizeTeacherNameKey(normalizeAssignmentSubject(subject.shortName || subject.name) || subject.shortName || subject.name);
        const fallback = defaultPeriods.get(key) || '';
        return {
          ...subject,
          periods: subject.periods || fallback,
          periodsSemester1: subject.periodsSemester1 || subject.periods || fallback,
          periodsSemester2: subject.periodsSemester2 || subject.periods || fallback
        };
      });
    },
    [thdSubjectsDraft]
  );

  const thdSubjectPeriodsByKey = useMemo(() => {
    const map = new Map();
    const addPeriodKey = (value, subject) => {
      const raw = String(value || '').trim();
      if (!raw) return;
      [raw, normalizeAssignmentSubject(raw)].forEach(candidate => {
        const key = normalizeTeacherNameKey(candidate || '');
        if (key) map.set(key, [...(map.get(key) || []), subject]);
      });
    };
    cleanThdSubjectsDraft.forEach(subject => {
      const periods = normalizePeriods(subject.periods || subject.periodsSemester1 || subject.periodsSemester2);
      if (!periods && !subject.periodsSemester1 && !subject.periodsSemester2) return;
      const config = normalizeThdSubject(subject);
      [subject.name, subject.shortName].forEach(value => {
        addPeriodKey(value, config);
      });
      const nameKey = normalizeTeacherNameKey(subject.name);
      const shortKey = normalizeTeacherNameKey(subject.shortName);
      if (nameKey === 'chu nhiem' || shortKey === 'gvcn') ['CN', 'GVCN'].forEach(value => addPeriodKey(value, config));
      if (shortKey === 'th hoa') ['P. TH HÓA', 'P TH HÓA'].forEach(value => addPeriodKey(value, config));
      if (shortKey === 'th ly') ['P. TH LÝ', 'P TH LÝ'].forEach(value => addPeriodKey(value, config));
      if (shortKey === 'th sinh') ['P. TH SINH', 'P TH SINH'].forEach(value => addPeriodKey(value, config));
      if (shortKey === 'th tin 1') ['P. TIN 1', 'P TIN 1', 'P. TH TIN 1'].forEach(value => addPeriodKey(value, config));
      if (shortKey === 'th tin 2') ['P. TIN 2', 'P TIN 2', 'P. TH TIN 2'].forEach(value => addPeriodKey(value, config));
      if (shortKey === 'tn shl cd') ['HĐTN(SHL,CĐ)', 'HĐTN (SHL, CĐ)', 'HĐTN SHL CĐ'].forEach(value => addPeriodKey(value, config));
      if (shortKey === 'tn shl') ['HĐTN(SHL)', 'HĐTN (SHL)', 'HĐTN SHL'].forEach(value => addPeriodKey(value, config));
      if (shortKey === 'tn cd') ['HĐTN(CĐ)', 'HĐTN (CĐ)', 'HĐTN CĐ'].forEach(value => addPeriodKey(value, config));
      if (nameKey === 'con nho duoi 12 thang tuoi') ['Con nhỏ', 'Con nhỏ < 12 tháng', 'Con nhỏ < 12 tháng tuổi', 'Con nhỏ dưới 12 tháng'].forEach(value => addPeriodKey(value, config));
      if (nameKey.includes('hau san') || nameKey.includes('ho san') || shortKey.includes('hau san') || shortKey.includes('ho san')) {
        ['Nghỉ hậu sản', 'Nghỉ hộ sản', 'Hậu sản', 'Hộ sản'].forEach(value => addPeriodKey(value, config));
      }
    });
    return map;
  }, [cleanThdSubjectsDraft]);

  const getTeachingRowSemesterKey = (row = {}) => {
    const note = String(row.sourcePeriodNote || row.note || getAssignmentNote(row) || '');
    const dateMatch = note.match(/\d{1,2}\D+\d{1,2}\D+\d{4}/);
    const date = dateMatch ? parseDateValue(dateMatch[0]) : null;
    const hk2Start = parseDateValue(teachingSemesterDatesForYear.hk2Start);
    if (date && hk2Start && date >= hk2Start) return 'periodsSemester2';
    const weekNumber = Number(String(row.weeks || '').replace(',', '.'));
    return weekNumber === 17 ? 'periodsSemester2' : 'periodsSemester1';
  };

  const getConfiguredAssignmentPeriods = (assignment = '', row = {}) => {
    const text = String(assignment || '').trim();
    if (!text) return '';
    const rowGrades = getAssignmentClassList(row.className, activeAssignmentClasses)
      .map(className => getGradeFromManagedClassName(className))
      .filter(Boolean);
    const semesterKey = getTeachingRowSemesterKey(row);
    const getPeriodsFromConfig = (config) => {
      if (!config) return '';
      const subjectGrades = normalizeThdSubjectGrades(config.grades);
      if (rowGrades.length && !rowGrades.some(grade => subjectGrades.includes(grade))) return '';
      return normalizePeriods(config[semesterKey] || config.periods || config.periodsSemester1 || config.periodsSemester2 || '');
    };
    const getPeriodsFromConfigs = (configs = []) => configs
      .slice()
      .sort((left, right) => normalizeThdSubjectGrades(left.grades).length - normalizeThdSubjectGrades(right.grades).length)
      .map(getPeriodsFromConfig)
      .find(Boolean) || '';
    const getDirectPeriods = (value = '') => {
      const rawKey = normalizeTeacherNameKey(value);
      const normalizedKey = normalizeTeacherNameKey(normalizeAssignmentSubject(value) || value);
      const classlessKey = rawKey.replace(/\b[6-9]\s+\d{1,2}\b/g, '').replace(/\s+/g, ' ').trim();
      const keys = [normalizedKey, rawKey, classlessKey];
      if (/^cn\b/.test(rawKey)) keys.push('cn', 'gvcn', 'chu nhiem');
      return keys.map(key => getPeriodsFromConfigs(thdSubjectPeriodsByKey.get(key) || [])).find(Boolean) || '';
    };
    const directPeriods = getDirectPeriods(text);
    if (directPeriods) return directPeriods;
    const parts = splitTeachingListSegments(text)
      .flatMap(part => String(part || '').split(/\s*(?:\+|\r?\n)\s*/))
      .map(stripPasteCell)
      .filter(Boolean);
    if (parts.length > 1) {
      const partPeriods = parts.map(getDirectPeriods).filter(Boolean).map(Number);
      if (partPeriods.length) return String(partPeriods.reduce((sum, value) => sum + value, 0));
    }
    return '';
  };

  const splitTechnologySummaryRowBySemester = (row = {}) => {
    const normalizedRow = normalizeTeachingAssignment(row, activeAssignmentClasses);
    if (!isTechnologyAssignment(normalizedRow.assignment)) return [normalizedRow];
    const classes = getAssignmentClassList(normalizedRow.className, activeAssignmentClasses);
    if (!classes.length) return [normalizedRow];
    const gradeRows = splitTechnologyAssignmentByGrade(normalizedRow, activeAssignmentClasses)
      .map(item => normalizeTeachingAssignment(item, activeAssignmentClasses));
    return gradeRows.flatMap(gradeRow => {
      const grade = getGradeFromManagedClassName(getAssignmentClassList(gradeRow.className, activeAssignmentClasses)[0] || '');
      if (grade !== '8' && grade !== '9') return [gradeRow];
      const applyTechnologyAdjustment = (item, semesterKey = getTeachingRowSemesterKey(item)) => {
        if (grade !== '8' || semesterKey !== 'periodsSemester1') return item;
        const configuredPeriods = normalizePeriods(getConfiguredAssignmentPeriods(item.assignment, item));
        const rowPeriods = normalizePeriods(item.periodsPerClassWeek || item.periodsPerClass || item.lessonPerClass || '');
        if (Number(configuredPeriods || rowPeriods || 0) !== 2) return item;
        return normalizeTeachingAssignment({
          ...item,
          totalPeriodsAdjustment: '-1'
        }, activeAssignmentClasses);
      };
      const range = getTeachingRowPeriodRange(gradeRow);
      const weeks = Number(normalizePeriods(gradeRow.weeks || '')) || 0;
      const hk1End = parseDateValue(teachingSemesterDatesForYear.hk1End);
      const hk2Start = parseDateValue(teachingSemesterDatesForYear.hk2Start);
      const rangeStart = parseDateValue(range.start);
      const rangeEnd = parseDateValue(range.end);
      const coversBothSemesters = weeks >= 30 || (
        rangeStart && rangeEnd && hk1End && hk2Start && rangeStart <= hk1End && rangeEnd >= hk2Start
      );
      if (!coversBothSemesters) return [applyTechnologyAdjustment(gradeRow)];
      const semesterRows = [
        {
          weeks: '18',
          periodKey: 'periodsSemester1',
          startDate: teachingSemesterDatesForYear.hk1Start,
          endDate: teachingSemesterDatesForYear.hk1End
        },
        {
          weeks: '17',
          periodKey: 'periodsSemester2',
          startDate: teachingSemesterDatesForYear.hk2Start,
          endDate: teachingSemesterDatesForYear.hk2End
        }
      ];
      return semesterRows.map(semester => {
        const semesterRow = {
          ...gradeRow,
          weeks: semester.weeks,
          sourcePeriodNote: getTeachingWeekNote(semester.weeks),
          sourcePeriodStartDate: semester.startDate || '',
          sourcePeriodEndDate: semester.endDate || '',
          periodsPerClassWeek: '',
          totalPeriodsPerWeek: '',
          totalPeriodsAdjustment: ''
        };
        const configuredPeriods = normalizePeriods(getConfiguredAssignmentPeriods(semesterRow.assignment, semesterRow));
        return applyTechnologyAdjustment(normalizeTeachingAssignment({
          ...semesterRow,
          periodsPerClassWeek: configuredPeriods || semesterRow.periodsPerClassWeek || '',
          totalPeriodsAdjustment: ''
        }, activeAssignmentClasses), semester.periodKey);
      });
    });
  };

  const splitAndCompactTechnologySummaryRows = (rows = []) => compactSamePeriodTeachingRows(
    (Array.isArray(rows) ? rows : []).flatMap(splitTechnologySummaryRowBySemester),
    activeAssignmentClasses
  );

  const summarizeTeachingBatchesForCurrentYear = (batches = []) => summarizeTeachingBatches(
    (Array.isArray(batches) ? batches : []).map(batch => ({
      ...batch,
      rows: splitAndCompactTechnologySummaryRows(batch.rows)
    })),
    activeAssignmentClasses
  );

  useEffect(() => {
    if (!isThdTeachingPanel || !isTeachingSummaryView) return;
    const rows = activeTeachingAssignmentsDraft?.byYear?.[effectiveSchoolYearKey];
    if (!Array.isArray(rows) || !rows.length) return;
    const currentRows = rows.map(row => normalizeTeachingAssignment(row, activeAssignmentClasses));
    const nextRows = splitAndCompactTechnologySummaryRows(currentRows);
    if (sameJson(currentRows, nextRows)) return;
    setActiveTeachingAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      return {
        ...prevObj,
        byYear: {
          ...(prevObj.byYear || {}),
          [effectiveSchoolYearKey]: nextRows
        }
      };
    });
  }, [activeAssignmentClasses, activeTeachingAssignmentsDraft, effectiveSchoolYearKey, isTeachingSummaryView, isThdTeachingPanel]);

  const applyConfiguredPeriodsToTeachingRow = (row = {}) => {
    if (!isThdTeachingPanel) return row;
    const configuredPeriods = getConfiguredAssignmentPeriods(row.assignment, row);
    if (!configuredPeriods) return row;
    const classCount = getAssignmentClassList(row.className, activeAssignmentClasses).length
      || Number(String(row.classCount || '').replace(',', '.'))
      || 0;
    if (classCount > 0) {
      return {
        ...row,
        periodsPerClassWeek: configuredPeriods,
        totalPeriodsPerWeek: ''
      };
    }
    return {
      ...row,
      periodsPerClassWeek: '',
      totalPeriodsPerWeek: configuredPeriods
    };
  };

  const cleanTeachingAssignmentRows = useMemo(
    () => teachingRowsForSelectedYear
      .map(row => {
        const normalizedRow = normalizeTeachingAssignment(row, activeAssignmentClasses);
        return { ...normalizedRow, teacherName: normalizedRow.teacherName.trim() };
      })
      .filter(row => !isTeachingNumberingArtifact(row))
      .filter(row => !isThdTeachingPanel || !shouldDropCoreTeachingRowWithoutClass(row, activeAssignmentClasses))
      .filter(row => row.teacherName || row.assignment || row.specialty),
    [activeAssignmentClasses, isThdTeachingPanel, teachingRowsForSelectedYear]
  );

  const buildTeachingAssignmentsForSave = () => {
    const assignmentObj = (activeTeachingAssignmentsDraft && typeof activeTeachingAssignmentsDraft === 'object') ? { ...activeTeachingAssignmentsDraft } : {};
    const draftBatches = Array.isArray(assignmentObj.batchesByYear?.[effectiveSchoolYearKey])
      ? assignmentObj.batchesByYear[effectiveSchoolYearKey]
      : teachingBatchesForSelectedYear;
    const batchesForSave = isThdTeachingPanel && teachingBatchesForSelectedYear.length
      ? draftBatches.map(batch => ({
          ...batch,
          rows: (Array.isArray(batch.rows) ? batch.rows : [])
            .map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
            .filter(row => !shouldDropCoreTeachingRowWithoutClass(row, activeAssignmentClasses))
        }))
      : [];
    const storedSummaryRows = Array.isArray(assignmentObj.byYear?.[effectiveSchoolYearKey])
      ? assignmentObj.byYear[effectiveSchoolYearKey]
          .map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
          .filter(row => !isTeachingNumberingArtifact(row))
          .filter(row => !isThdTeachingPanel || !shouldDropCoreTeachingRowWithoutClass(row, activeAssignmentClasses))
      : [];
    const summaryRowsForSave = batchesForSave.length
      ? splitAndCompactTechnologySummaryRows(storedSummaryRows)
      : cleanTeachingAssignmentRows;
    const existingRows = assignmentObj.byYear?.[effectiveSchoolYearKey] || assignmentObj.rows || [];
    const existingSemesterDates = assignmentObj.semestersByYear?.[effectiveSchoolYearKey];
    const shouldSaveSemesterDates = Boolean(existingSemesterDates) || !sameJson(teachingSemesterDatesForYear, defaultTeachingSemesterDates(selectedSchoolYear));
    if (!batchesForSave.length && !summaryRowsForSave.length && !existingRows.length && !shouldSaveSemesterDates) return assignmentObj;
    return {
      ...assignmentObj,
      byYear: {
        ...(assignmentObj.byYear || {}),
        [effectiveSchoolYearKey]: summaryRowsForSave
      },
      ...(batchesForSave.length
        ? {
            batchesByYear: {
              ...(assignmentObj.batchesByYear || {}),
              [effectiveSchoolYearKey]: batchesForSave
            }
          }
        : {}),
      ...(shouldSaveSemesterDates
        ? {
            semestersByYear: {
              ...(assignmentObj.semestersByYear || {}),
              [effectiveSchoolYearKey]: teachingSemesterDatesForYear
            }
          }
        : {})
    };
  };

  const getPeriodsPerClassWeek = (row = {}) => {
    const configuredPeriods = isThdTeachingPanel ? normalizePeriods(getConfiguredAssignmentPeriods(row.assignment, row)) : '';
    if (configuredPeriods && getAssignmentClassList(row.className, activeAssignmentClasses).length) return Number(configuredPeriods);
    const assignment = normalizeAssignmentSubject(row.assignment);
    const assignedClasses = getAssignmentClassList(row.className, activeAssignmentClasses);
    if (!isThdTeachingPanel && isTechnologyAssignment(assignment) && assignedClasses.some(className => ['8', '9'].includes(getGradeFromManagedClassName(className)))) {
      return getTeachingRowSemesterKey(row) === 'periodsSemester2' ? 2 : 1;
    }
    const customPeriods = normalizePeriods(row.periodsPerClassWeek || row.periodsPerClass || row.lessonPerClass || '');
    if (customPeriods) return Number(customPeriods);
    if (assignment === 'LS&ĐL') return 3;
    if (['Văn', 'Toán', 'KHTN', 'Chủ nhiệm'].includes(assignment)) return 4;
    if (['GDCD', 'GDĐP', 'HĐTT'].includes(assignment)) return 1;
    if (assignment === 'C nghệ') return 1;
    return '';
  };

  const getTotalPeriodsPerWeek = (row = {}) => {
    const configuredPeriods = isThdTeachingPanel ? normalizePeriods(getConfiguredAssignmentPeriods(row.assignment, row)) : '';
    if (configuredPeriods && !getAssignmentClassList(row.className, activeAssignmentClasses).length) return Number(configuredPeriods);
    const customTotal = normalizePeriods(row.totalPeriodsPerWeek || row.totalWeeklyPeriods || row.weeklyPeriods || '');
    if (customTotal && !normalizePeriods(row.periodsPerClassWeek || row.periodsPerClass || row.lessonPerClass || '')) return Number(customTotal);
    const periods = getPeriodsPerClassWeek(row);
    const classCount = Number(String(row.classCount || '1').replace(',', '.')) || 0;
    return typeof periods === 'number' ? periods * classCount : '';
  };

  const getVisibleWeeklyPeriods = (row = {}) => {
    if (!isThdTeachingPanel) return getTotalPeriodsPerWeek(row);
    const selectedClasses = getAssignmentClassList(row.className, activeAssignmentClasses);
    const configuredPeriods = normalizePeriods(getConfiguredAssignmentPeriods(row.assignment, row));
    const explicitPeriods = normalizePeriods(row.periodsPerClassWeek || row.periodsPerClass || row.lessonPerClass || '');
    const classCount = selectedClasses.length || Number(String(row.classCount || '').replace(',', '.')) || 0;
    if (classCount > 0) {
      const periods = Number(configuredPeriods || explicitPeriods || 0);
      return periods ? periods * classCount : '';
    }
    const total = Number(configuredPeriods || normalizePeriods(row.totalPeriodsPerWeek || row.totalWeeklyPeriods || row.weeklyPeriods || '') || 0);
    return total || '';
  };

  const getTotalPeriods = (row = {}) => {
    const totalOverride = normalizePeriods(row.totalPeriodsOverride || '');
    if (totalOverride) return Number(totalOverride);
    const customTotal = normalizePeriods(row.totalPeriodsPerWeek || row.totalWeeklyPeriods || row.weeklyPeriods || '');
    const periods = getPeriodsPerClassWeek(row);
    const classCount = getAssignmentClassList(row.className, activeAssignmentClasses).length
      || Number(String(row.classCount || '1').replace(',', '.'))
      || 0;
    const weeks = Number(String(row.weeks || '').replace(',', '.')) || 0;
    const configuredPeriods = isThdTeachingPanel ? normalizePeriods(getConfiguredAssignmentPeriods(row.assignment, row)) : '';
    const adjustment = (Number(normalizeSignedPeriods(row.totalPeriodsAdjustment || '')) || 0) * classCount;
    if (configuredPeriods && !getAssignmentClassList(row.className, activeAssignmentClasses).length) return (Number(configuredPeriods) * weeks) + adjustment;
    if (customTotal && !normalizePeriods(row.periodsPerClassWeek || row.periodsPerClass || row.lessonPerClass || '')) return (Number(customTotal) * weeks) + adjustment;
    if (typeof periods === 'number') return (periods * classCount * weeks) + adjustment;
    return '';
  };

  const getTeachingRequiredPeriodsPerWeek = (position = 'GV') => {
    const normalizedPosition = normalizeTeachingPosition(position);
    if (normalizedPosition === 'HT' || normalizedPosition === 'TPT') return 2;
    if (normalizedPosition === 'PHT') return 4;
    return 19;
  };

  const getTeachingRequiredYearTotal = (position = 'GV') => getTeachingRequiredPeriodsPerWeek(position) * 35;

  const getAssignmentNote = (row = {}, semesterDates = teachingSemesterDatesForYear) => {
    if (row.sourcePeriodNote) return row.sourcePeriodNote;
    return getTeachingWeekNote(row.weeks, semesterDates);
  };

  useEffect(() => {
    if (!isThdTeachingPanel) return;
    if (hasTeachingBatches) return;
    const nextRows = teachingRowsForSelectedYear.map(row => {
      const nextAssignment = row.assignment && isTechnologyAssignment(row.assignment) ? 'C nghệ' : row.assignment;
      const nextSpecialty = row.specialty && isTechnologyAssignment(row.specialty) ? 'C nghệ' : row.specialty;
      if (nextAssignment === row.assignment && nextSpecialty === row.specialty) return row;
      return {
        ...row,
        assignment: nextAssignment,
        specialty: nextSpecialty
      };
    });
    if (!sameJson(teachingRowsForSelectedYear, nextRows)) {
      updateTeachingRowsForYear(nextRows);
    }
  }, [hasTeachingBatches, isThdTeachingPanel, teachingRowsForSelectedYear]);

  useEffect(() => {
    if (!isTeachingPanel) return;
    if (isThdTeachingPanel && hasTeachingBatches) return;
    const currentRows = teachingRowsForSelectedYear.map(row => normalizeTeachingAssignment(row, activeAssignmentClasses));
    const nextRows = currentRows.map(row => {
      if (!row.note || !isGeneratedTeachingNote(row.note)) return row;
      const nextNote = mergeTeachingNote(getAssignmentNote(row), row.note);
      return row.note === nextNote ? row : { ...row, note: nextNote };
    });
    if (!sameJson(currentRows, nextRows)) {
      updateTeachingRowsForYear(nextRows);
    }
  }, [activeAssignmentClasses, activePanel, hasTeachingBatches, isTeachingPanel, isThdTeachingPanel, teachingRowsForSelectedYear, teachingSemesterDatesForYear]);

  const isTeachingGroupEnd = (rows = [], row = {}, index = 0) => {
    const teacherKey = normalizeTeacherNameKey(row.teacherName);
    if (!teacherKey) return false;
    return normalizeTeacherNameKey(rows[index + 1]?.teacherName) !== teacherKey;
  };

  const getTeachingTeacherSequenceNumber = (rows = [], index = 0) => {
    const currentKey = normalizeTeacherNameKey(rows[index]?.teacherName);
    if (!currentKey) return '';
    const seenKeys = [];
    for (let rowIndex = 0; rowIndex <= index; rowIndex += 1) {
      const rowKey = normalizeTeacherNameKey(rows[rowIndex]?.teacherName);
      if (rowKey && !seenKeys.includes(rowKey)) seenKeys.push(rowKey);
    }
    return seenKeys.indexOf(currentKey) + 1;
  };

  const getTeacherTeachingYearTotal = (teacherName = '') => {
    const teacherKey = normalizeTeacherNameKey(teacherName);
    if (!teacherKey) return '';
    return teachingRowsForSelectedYear
      .filter(row => normalizeTeacherNameKey(row.teacherName) === teacherKey)
      .reduce((sum, row) => sum + (Number(getTotalPeriods(row)) || 0), 0);
  };

  const getTeacherSchoolPeriods = (teacherName = '') => {
    const teacher = teacherByName.get(normalizeTeacherNameKey(teacherName));
    return Number(String(teacher?.periods || '').replace(',', '.')) || 0;
  };

  const getTeacherMoneyRate = (teacherName = '') => {
    const teacher = teacherByName.get(normalizeTeacherNameKey(teacherName));
    return Number(normalizeMoney(teacher?.moneyPerPeriod || '')) || 0;
  };

  const getTeachingAssignmentMoney = (row = {}) => {
    const totalPeriods = Number(getTotalPeriods(row)) || 0;
    const rate = getTeacherMoneyRate(row.teacherName);
    return totalPeriods && rate ? totalPeriods * rate : 0;
  };

  const getTeacherTeachingMoneyTotal = (teacherName = '') => {
    const teacherKey = normalizeTeacherNameKey(teacherName);
    if (!teacherKey) return 0;
    return teachingRowsForSelectedYear
      .filter(row => normalizeTeacherNameKey(row.teacherName) === teacherKey)
      .reduce((sum, row) => sum + getTeachingAssignmentMoney(row), 0);
  };

  const teachingTeamFilterKeys = {
    'team-toan': ['toan'],
    'team-van': ['van', 'ngu van'],
    'team-anh': ['t anh', 'tieng anh', 'anh van'],
    'team-khtn': ['khtn', 'khoa hoc tu nhien'],
    'team-khxh': ['ls dl', 'lich su dia ly', 'lich su va dia ly', 'gdcd', 'giao duc cong dan'],
    'team-cam': ['cam', 'cong nghe', 'c nghe', 'mt', 'mi thuat', 'my thuat', 'an', 'am nhac', 'nt an', 'nt mt'],
    'team-tin-gdtc': ['tin', 'tin hoc', 'gdtc', 'giao duc the chat']
  };

  const matchesTeachingTeamFilter = (row = {}, filterValue = '') => {
    const keys = teachingTeamFilterKeys[filterValue] || [];
    if (!keys.length) return true;
    const values = [
      row.specialty,
      abbreviateTeachingSpecialty(row.specialty),
      row.assignment,
      normalizeAssignmentSubject(row.assignment)
    ].map(value => normalizeTeacherNameKey(value)).filter(Boolean);
    return keys.some(key => {
      const normalizedKey = normalizeTeacherNameKey(key);
      return values.some(value => (
        normalizedKey.length <= 3
          ? value === normalizedKey
          : value === normalizedKey || value.includes(normalizedKey)
      ));
    });
  };

  const getTeacherPeriodDiff = (row = {}) => {
    const teacherYearTotal = Number(getTeacherTeachingYearTotal(row.teacherName)) || 0;
    return teacherYearTotal - getTeachingRequiredYearTotal(row.position);
  };

  const getTeacherCheckStatus = (rows = []) => {
    if (rows.some(row => normalizeTeacherNameKey(row.pastedNote).includes('khong khop'))) return 'error';
    if (rows.some(row => normalizeTeacherNameKey(row.pastedNote) === 'khop')) return 'ok';
    const sourceTotals = rows
      .map(getTeachingSourceWeeklyCheckTotal)
      .filter(value => value > 0);
    if (!sourceTotals.length) return '';
    const sourceTotal = Math.max(...sourceTotals);
    const generatedTotal = Math.round(rows.reduce((sum, row) => (
      sum + (Number(getTeachingGeneratedWeeklyCheckTotal(row, activeAssignmentClasses)) || 0)
    ), 0) * 10) / 10;
    return Math.abs(sourceTotal - generatedTotal) >= 0.05 ? 'error' : 'ok';
  };

  const filteredTeachingTeacherKeys = useMemo(() => {
    if (!isThdTeachingPanel || teachingFilter === 'all') return null;
    const keys = new Set();
    if (teachingFilter === 'check-error') {
      const rowsByTeacher = new Map();
      teachingRowsForSelectedYear.forEach(row => {
        const teacherKey = normalizeTeacherNameKey(row.teacherName);
        if (!teacherKey) return;
        const rows = rowsByTeacher.get(teacherKey) || [];
        rows.push(row);
        rowsByTeacher.set(teacherKey, rows);
      });
      rowsByTeacher.forEach((rows, teacherKey) => {
        if (getTeacherCheckStatus(rows) === 'error') keys.add(teacherKey);
      });
      return keys;
    }
    teachingRowsForSelectedYear.forEach(row => {
      const teacherKey = normalizeTeacherNameKey(row.teacherName);
      if (!teacherKey) return;
      if (teachingFilter.startsWith('team-') && matchesTeachingTeamFilter(row, teachingFilter)) {
        keys.add(teacherKey);
      }
      if (teachingFilter === 'surplus' && getTeacherPeriodDiff(row) > 0) {
        keys.add(teacherKey);
      }
      if (teachingFilter === 'deficit' && getTeacherPeriodDiff(row) < 0) {
        keys.add(teacherKey);
      }
    });
    return keys;
  }, [activeAssignmentClasses, isThdTeachingPanel, teachingFilter, teachingRowsForSelectedYear]);

  const visibleTeachingRows = useMemo(() => (
    teachingRowsForSelectedYear
      .map((row, sourceIndex) => ({ row, sourceIndex }))
      .filter(({ row }) => {
        if (!filteredTeachingTeacherKeys) return true;
        return filteredTeachingTeacherKeys.has(normalizeTeacherNameKey(row.teacherName));
      })
  ), [filteredTeachingTeacherKeys, teachingRowsForSelectedYear]);

  const teachingRenderChunk = isThdTeachingPanel ? 90 : 180;

  useEffect(() => {
    setTeachingRenderLimit(teachingRenderChunk);
  }, [activePanel, selectedTeachingBatchId, teachingFilter, teachingRowsForSelectedYear.length, teachingRenderChunk]);

  const loadMoreTeachingRows = useCallback(() => {
    setTeachingRenderLimit(current => Math.min(current + teachingRenderChunk, visibleTeachingRows.length));
  }, [teachingRenderChunk, visibleTeachingRows.length]);

  const handleTeachingAssignmentScroll = useCallback((event) => {
    const target = event.currentTarget;
    if (!target || teachingRenderLimit >= visibleTeachingRows.length) return;
    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom < 700) loadMoreTeachingRows();
  }, [loadMoreTeachingRows, teachingRenderLimit, visibleTeachingRows.length]);

  const isTeachingOverlayOpen = showTeachingTimeSettings || showTeachingCheckModal || showNewTeachersModal;
  const effectiveTeachingRenderLimit = isThdTeachingPanel && isTeachingOverlayOpen
    ? Math.min(teachingRenderLimit, 24)
    : teachingRenderLimit;
  const renderedTeachingRows = useMemo(
    () => visibleTeachingRows.slice(0, effectiveTeachingRenderLimit),
    [effectiveTeachingRenderLimit, visibleTeachingRows]
  );

  const visibleTeachingRowValues = useMemo(() => renderedTeachingRows.map(item => item.row), [renderedTeachingRows]);
  const teachingGroupBoundsBySourceIndex = useMemo(() => {
    const bounds = new Map();
    let index = 0;
    while (index < teachingRowsForSelectedYear.length) {
      const teacherKey = normalizeTeacherNameKey(teachingRowsForSelectedYear[index]?.teacherName);
      let end = index;
      if (teacherKey) {
        while (
          end + 1 < teachingRowsForSelectedYear.length
          && normalizeTeacherNameKey(teachingRowsForSelectedYear[end + 1]?.teacherName) === teacherKey
        ) end += 1;
      }
      for (let rowIndex = index; rowIndex <= end; rowIndex += 1) {
        bounds.set(rowIndex, { start: index, end });
      }
      index = end + 1;
    }
    return bounds;
  }, [teachingRowsForSelectedYear]);

  const visibleTeachingRowMeta = useMemo(() => {
    const rows = visibleTeachingRowValues;
    const meta = rows.map(() => ({
      isContinuation: false,
      isGroupEnd: false,
      liveCheckNote: '',
      checkRowSpan: 1,
      sequenceNumber: ''
    }));
    const seenKeys = [];
    let index = 0;
    while (index < rows.length) {
      const teacherKey = normalizeTeacherNameKey(rows[index]?.teacherName);
      if (!teacherKey) {
        meta[index].isGroupEnd = true;
        index += 1;
        continue;
      }
      const start = index;
      let end = index;
      while (end + 1 < rows.length && normalizeTeacherNameKey(rows[end + 1]?.teacherName) === teacherKey) end += 1;
      if (!seenKeys.includes(teacherKey)) seenKeys.push(teacherKey);
      meta[start].sequenceNumber = seenKeys.indexOf(teacherKey) + 1;
      meta[end].isGroupEnd = true;
      for (let rowIndex = start + 1; rowIndex <= end; rowIndex += 1) {
        meta[rowIndex].isContinuation = true;
      }
      if (isTeachingSummaryView && isThdTeachingPanel) {
        meta[start].checkRowSpan = end - start + 1;
      }
      if (isThdTeachingPanel) {
        const groupRows = rows.slice(start, end + 1);
        const sourceTotals = groupRows
          .map(getTeachingSourceWeeklyCheckTotal)
          .filter(value => value > 0);
        if (sourceTotals.length) {
          const sourceTotal = Math.max(...sourceTotals);
          const generatedTotal = Math.round(groupRows.reduce((sum, item) => (
            sum + (Number(getTeachingGeneratedWeeklyCheckTotal(item, activeAssignmentClasses)) || 0)
          ), 0) * 10) / 10;
          meta[start].liveCheckNote = Math.abs(sourceTotal - generatedTotal) < 0.05
            ? 'Khớp'
            : `Không khớp (file: ${sourceTotal}, bảng: ${generatedTotal})`;
        }
      }
      index = end + 1;
    }
    return meta;
  }, [activeAssignmentClasses, isTeachingSummaryView, isThdTeachingPanel, visibleTeachingRowValues]);

  const teachingTeacherTotalsByKey = useMemo(() => {
    const yearTotals = new Map();
    const moneyTotals = new Map();
    teachingRowsForSelectedYear.forEach(row => {
      const teacherKey = normalizeTeacherNameKey(row.teacherName);
      if (!teacherKey) return;
      const yearTotal = Number(getTotalPeriods(row)) || 0;
      const moneyTotal = yearTotal * getTeacherMoneyRate(row.teacherName);
      yearTotals.set(teacherKey, (yearTotals.get(teacherKey) || 0) + yearTotal);
      moneyTotals.set(teacherKey, (moneyTotals.get(teacherKey) || 0) + moneyTotal);
    });
    return { yearTotals, moneyTotals };
  }, [teachingRowsForSelectedYear, teacherByName, isThdTeachingPanel, activeAssignmentClasses, thdSubjectPeriodsByKey]);

  const teachingFilterLabel = TEACHING_FILTER_OPTIONS.find(option => option.value === teachingFilter)?.label || 'Tất cả';
  const teachingCheckSubjectOptions = isThdTeachingPanel ? THD_CHECK_SUBJECT_OPTIONS : ASSIGNMENT_SUBJECT_OPTIONS;
  const teachingCheckAutoWeeks = useMemo(() => {
    if (!showTeachingCheckModal) return 35;
    const weekValues = teachingRowsForSelectedYear
      .map(row => Number(normalizePeriods(row.weeks || '')) || 0)
      .filter(value => value > 0);
    return weekValues.length ? Math.max(...weekValues) : 35;
  }, [showTeachingCheckModal, teachingRowsForSelectedYear]);
  const teachingCheckWeekCount = Number(normalizePeriods(teachingCheckWeeks)) || 35;

  useEffect(() => {
    if (showTeachingCheckModal) setTeachingCheckWeeks(String(teachingCheckAutoWeeks || 35));
  }, [showTeachingCheckModal, teachingCheckAutoWeeks]);

  useEffect(() => {
    if (!showTeachingCheckModal) setTeachingCheckResultFilter('all');
  }, [showTeachingCheckModal]);

  const getAssignmentClassesFromRow = (row = {}) => {
    return getAssignmentClassList(row.className, activeAssignmentClasses);
  };

  const expectedPeriodsForAssignment = (subject = '', className = '', referenceRow = {}) => {
    const subjectKey = normalizeTeacherNameKey(subject);
    if (isTechnologyAssignment(subject)) {
      const grade = getGradeFromManagedClassName(className);
      if (grade === '8' || grade === '9') return 52;
      if (!isThdTeachingPanel) return 35;
      const configured = Number(normalizePeriods(getConfiguredAssignmentPeriods(subject, {
        ...referenceRow,
        assignment: subject,
        className,
        weeks: teachingCheckWeekCount
      }))) || 0;
      if (configured) return Math.round(configured * teachingCheckWeekCount * 10) / 10;
    }
    let weeklyPeriods = 1;
    if (['tieng anh', 't anh', 'anh van'].includes(subjectKey)) weeklyPeriods = 3;
    else if (['gdtc', 'giao duc the chat'].includes(subjectKey)) weeklyPeriods = 2;
    else if (subjectKey === 'ls dl') weeklyPeriods = 3;
    else if (['van', 'toan', 'khtn', 'chu nhiem'].includes(subjectKey)) weeklyPeriods = 4;
    return Math.round(weeklyPeriods * teachingCheckWeekCount * 10) / 10;
  };

  const teachingCheckRows = useMemo(() => {
    if (!showTeachingCheckModal) return [];
    const rows = teachingRowsForSelectedYear.map(row => normalizeTeachingAssignment(row, activeAssignmentClasses)).filter(row => row.assignment);
    const actualMap = new Map();
    const classReferenceMap = new Map();
    rows.forEach(row => {
      const subject = normalizeAssignmentSubject(row.assignment);
      const classNames = getAssignmentClassesFromRow(row);
      if (!subject || !classNames.length) return;
      const total = Number(getTotalPeriods(row)) || 0;
      const perClassTotal = classNames.length > 1 ? total / classNames.length : total;
      classNames.forEach(className => {
        const key = `${className}|${subject}`;
        if (!classReferenceMap.has(className)) classReferenceMap.set(className, row);
        const current = actualMap.get(key) || { actual: 0, teachers: new Set(), referenceRow: row };
        current.actual += perClassTotal;
        if (row.teacherName) current.teachers.add(row.teacherName);
        actualMap.set(key, current);
      });
    });
    return activeAssignmentClasses.flatMap(className => teachingCheckSubjectOptions.map(subjectOption => {
      const found = actualMap.get(`${className}|${subjectOption.value}`);
      const expected = expectedPeriodsForAssignment(subjectOption.value, className, found?.referenceRow || classReferenceMap.get(className) || {});
      const actual = Math.round((found?.actual || 0) * 10) / 10;
      const diff = Math.round((actual - expected) * 10) / 10;
      return {
        className,
        subject: subjectOption.label,
        expected,
        actual,
        diff,
        teachers: found ? [...found.teachers].join(', ') : ''
      };
    }));
  }, [activeAssignmentClasses, showTeachingCheckModal, teachingCheckSubjectOptions, teachingRowsForSelectedYear, teachingCheckWeekCount, isThdTeachingPanel, thdSubjectPeriodsByKey, teachingSemesterDatesForYear]);

  const teachingCheckSummary = useMemo(() => ({
    ok: teachingCheckRows.filter(row => row.diff === 0).length,
    missing: teachingCheckRows.filter(row => row.diff < 0).length,
    excess: teachingCheckRows.filter(row => row.diff > 0).length
  }), [teachingCheckRows]);

  const teachingCheckRowsForDisplay = useMemo(() => {
    if (teachingCheckResultFilter === 'missing') return teachingCheckRows.filter(row => row.diff < 0);
    if (teachingCheckResultFilter === 'excess') return teachingCheckRows.filter(row => row.diff > 0);
    if (teachingCheckResultFilter === 'ok') return teachingCheckRows.filter(row => row.diff === 0);
    return teachingCheckRows;
  }, [teachingCheckRows, teachingCheckResultFilter]);

  const teachingCheckClassesForDisplay = useMemo(() => (
    activeAssignmentClasses.filter(className => (
      teachingCheckResultFilter === 'all'
        || teachingCheckRowsForDisplay.some(row => row.className === className)
    ))
  ), [activeAssignmentClasses, teachingCheckResultFilter, teachingCheckRowsForDisplay]);

  const setTeachingCheckFilter = (filterValue = 'all') => {
    setTeachingCheckResultFilter(current => (current === filterValue ? 'all' : filterValue));
  };

  const buildTeachingExportGroups = () => {
    const rows = teachingRowsForSelectedYear
      .map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
      .filter(row => row.teacherName || row.assignment || row.specialty);
    const groups = [];
    rows.forEach(row => {
      const rowKey = normalizeTeacherNameKey(row.teacherName);
      const lastGroup = groups[groups.length - 1];
      if (rowKey && lastGroup?.key === rowKey) {
        lastGroup.rows.push(row);
      } else {
        groups.push({
          key: rowKey || `row-${groups.length}`,
          teacherName: row.teacherName,
          rows: [row]
        });
      }
    });
    return groups;
  };

  const buildTeachingExportHtml = () => {
    const groups = buildTeachingExportGroups();
    const startDate = formatDateForNote(teachingSemesterDatesForYear.hk1Start);
    const endDate = formatDateForNote(teachingSemesterDatesForYear.hk2End);
    const endDateObj = parseDateValue(teachingSemesterDatesForYear.hk2End);
    const exportMonth = endDateObj ? endDateObj.getMonth() + 1 : 5;
    const exportYear = endDateObj ? endDateObj.getFullYear() : getSchoolYearStartYear(selectedSchoolYear) + 1;
    const teachingSchoolName = isThdTeachingPanel ? 'TRƯỜNG THCS TRẦN HƯNG ĐẠO' : 'TRƯỜNG THCS NGUYỄN AN NINH';
    const fileTitle = `BẢNG PHÂN CÔNG CÁN BỘ QUẢN LÝ, GIÁO VIÊN DẠY PHỔ CẬP - NĂM HỌC ${selectedSchoolYear}`;
    const subtitle = `(Từ ngày ${startDate} đến ${endDate} - 35 tuần thực học)`;
    const headers = [
      'STT',
      'Họ và tên',
      'Chức vụ',
      'Chuyên môn<br/>giảng dạy',
      'Phân công',
      'Số<br/>tuần',
      'Lớp được phân công',
      'Số lớp',
      'Số<br/>tiết/lớp/<br/>tuần',
      'Tổng số<br/>tiết/tuần',
      'Tổng số tiết',
      'Ghi chú',
      ...(showTeachingFinancialColumns ? ['Số tiền<br/>1 tiết', 'Số tiền'] : [])
    ];
    const totalColumns = headers.length;
    const leftMetaColumns = Math.floor(totalColumns / 2);
    const rightMetaColumns = totalColumns - leftMetaColumns;
    const headerRow = headers.map(title => `<th>${String(title).split('<br/>').map(escapeHtml).join('<br/>')}</th>`).join('');
    const indexRow = headers.map((_, index) => `<td class="index-row">${index + 1}</td>`).join('');
    const bodyRows = groups.flatMap((group, groupIndex) => {
      const teacherTotal = group.rows.reduce((sum, row) => sum + (Number(getTotalPeriods(row)) || 0), 0);
      const rowsHtml = group.rows.map((row, rowIndex) => {
        const periodsPerClassWeek = getPeriodsPerClassWeek(row);
        const totalPerWeek = getVisibleWeeklyPeriods(row);
        const totalPeriods = getTotalPeriods(row);
        const teacherMoneyRate = getTeacherMoneyRate(row.teacherName);
        const assignmentMoney = getTeachingAssignmentMoney(row);
        const lastAssignmentClass = rowIndex === group.rows.length - 1 ? ' last-assignment-row' : '';
        const continuationAssignmentClass = rowIndex > 0 ? ' continuation-assignment-row' : '';
        return `
          <tr class="assignment-row${lastAssignmentClass}${continuationAssignmentClass}">
            <td class="center">${rowIndex === 0 ? groupIndex + 1 : ''}</td>
            <td>${rowIndex === 0 ? escapeHtml(row.teacherName) : ''}</td>
            <td class="center">${rowIndex === 0 ? escapeHtml(row.position || 'GV') : ''}</td>
            <td class="center">${rowIndex === 0 ? escapeHtml(abbreviateTeachingSpecialty(row.specialty)) : ''}</td>
            <td class="center">${escapeHtml(row.assignment)}</td>
            <td class="center">${escapeHtml(row.weeks)}</td>
            <td class="center">${escapeHtml(row.className)}</td>
            <td class="center">${escapeHtml(row.classCount)}</td>
            <td class="center">${escapeHtml(periodsPerClassWeek)}</td>
            <td class="center">${escapeHtml(totalPerWeek)}</td>
            <td class="center">${escapeHtml(totalPeriods)}</td>
            <td>${escapeHtml(row.note)}</td>
            ${showTeachingFinancialColumns ? `<td class="center">${escapeHtml(formatMoney(teacherMoneyRate))}</td><td class="center">${escapeHtml(formatMoney(assignmentMoney))}</td>` : ''}
          </tr>
        `;
      }).join('');
      return [
        rowsHtml,
        `<tr class="summary-row">
          <td></td>
          <td colspan="9">Số tiết dạy phổ cập/năm học</td>
          <td class="center">${escapeHtml(teacherTotal || '')}</td>
          <td></td>
          ${showTeachingFinancialColumns ? `<td></td><td class="center">${escapeHtml(formatMoney(getTeacherTeachingMoneyTotal(group.teacherName)))}</td>` : ''}
        </tr>`
      ];
    }).join('');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(fileTitle)}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm 10mm; }
    body { font-family: "Times New Roman", serif; color: #000; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .meta td { border: none; text-align: center; font-size: 14pt; font-weight: 700; line-height: 1.15; }
    .meta .right-title { font-size: 13pt; }
    .meta .sub { font-size: 12pt; font-weight: 700; text-decoration: underline; }
    .date-row td { border: none; font-size: 12pt; font-style: italic; font-weight: 400; padding: 10px 0 14px; }
    .title-row td { border: none; text-align: center; font-size: 13pt; font-weight: 700; padding: 2px 0; }
    .subtitle-row td { border: none; text-align: center; font-size: 12pt; font-weight: 700; padding: 0 0 8px; }
    .assignment th, .assignment td { border: 0.5pt solid #666; padding: 2px 3px; font-size: 10.5pt; vertical-align: middle; font-weight: 400; }
    .assignment th { height: 44px; text-align: center; font-weight: 700; }
    .assignment td { height: 30px; }
    .center { text-align: center; }
    .index-row { text-align: center; font-style: italic; font-size: 10pt !important; height: 15pt !important; }
    .assignment-row td { border-bottom: 0.75pt dashed #777 !important; }
    .continuation-assignment-row td { border-top: 0 !important; }
    .summary-row td { background: #ffe8a3; border-top: 0 !important; border-bottom: 0.5pt solid #666 !important; font-weight: 700; font-style: italic; height: 18pt !important; }
    .col-stt { width: 10mm; }
    .col-name { width: 48mm; }
    .col-position { width: 13mm; }
    .col-specialty { width: 19mm; }
    .col-assignment { width: 22mm; }
    .col-weeks { width: 13mm; }
    .col-class { width: 25mm; }
    .col-count { width: 13mm; }
    .col-period { width: 17mm; }
    .col-week { width: 17mm; }
    .col-total { width: 17mm; }
    .col-note { width: 64mm; }
    .col-rate { width: 18mm; }
    .col-money { width: 20mm; }
  </style>
</head>
<body>
  <table class="meta">
    <tr>
      <td colspan="${leftMetaColumns}">ỦY BAN NHÂN DÂN PHƯỜNG</td>
      <td colspan="${rightMetaColumns}" class="right-title">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</td>
    </tr>
    <tr>
      <td colspan="${leftMetaColumns}">PHƯỜNG TRUNG MỸ TÂY</td>
      <td colspan="${rightMetaColumns}" class="sub">Độc lập - Tự do - Hạnh phúc</td>
    </tr>
    <tr>
      <td colspan="${leftMetaColumns}">${escapeHtml(teachingSchoolName)}</td>
      <td colspan="${rightMetaColumns}"></td>
    </tr>
    <tr class="date-row">
      <td colspan="${leftMetaColumns}"></td>
      <td colspan="${rightMetaColumns}">Trung Mỹ Tây, ngày ...... tháng ${exportMonth} năm ${exportYear}</td>
    </tr>
    <tr class="title-row"><td colspan="${totalColumns}">${escapeHtml(fileTitle)}</td></tr>
    <tr class="subtitle-row"><td colspan="${totalColumns}">${escapeHtml(subtitle)}</td></tr>
  </table>
  <table class="assignment">
    <colgroup>
      <col class="col-stt" /><col class="col-name" /><col class="col-position" /><col class="col-specialty" />
      <col class="col-assignment" /><col class="col-weeks" /><col class="col-class" /><col class="col-count" />
      <col class="col-period" /><col class="col-week" /><col class="col-total" /><col class="col-note" />${showTeachingFinancialColumns ? '<col class="col-rate" /><col class="col-money" />' : ''}
    </colgroup>
    <thead>
      <tr>${headerRow}</tr>
      <tr>${indexRow}</tr>
    </thead>
    <tbody>${bodyRows || `<tr><td colspan="${totalColumns}" class="center">Chưa có dữ liệu phân công</td></tr>`}</tbody>
  </table>
</body>
</html>`;
  };

  const buildTeachingExportXlsxBlob = () => {
    const groups = buildTeachingExportGroups();
    const startDate = formatDateForNote(teachingSemesterDatesForYear.hk1Start);
    const endDate = formatDateForNote(teachingSemesterDatesForYear.hk2End);
    const endDateObj = parseDateValue(teachingSemesterDatesForYear.hk2End);
    const exportMonth = endDateObj ? endDateObj.getMonth() + 1 : 5;
    const exportYear = endDateObj ? endDateObj.getFullYear() : getSchoolYearStartYear(selectedSchoolYear) + 1;
    const teachingSchoolName = isThdTeachingPanel ? 'TRƯỜNG THCS TRẦN HƯNG ĐẠO' : 'TRƯỜNG THCS NGUYỄN AN NINH';
    const fileTitle = `BẢNG PHÂN CÔNG CÁN BỘ QUẢN LÝ, GIÁO VIÊN DẠY PHỔ CẬP - NĂM HỌC ${selectedSchoolYear}`;
    const subtitle = `(Từ ngày ${startDate} đến ${endDate} - 35 tuần thực học)`;
    const headers = [
      'STT', 'Họ và tên', 'Chức vụ', 'Chuyên môn\ngiảng dạy', 'Phân công', 'Số\ntuần',
      'Lớp được phân công', 'Số lớp', 'Số\ntiết/lớp/\ntuần', 'Tổng số\ntiết/tuần', 'Tổng số tiết', 'Ghi chú',
      ...(showTeachingFinancialColumns ? ['Số tiền\n1 tiết', 'Số tiền'] : [])
    ];
    const endColumn = columnName(headers.length);
    const merges = [`A1:F1`, `G1:${endColumn}1`, `A2:F2`, `G2:${endColumn}2`, `A3:F3`, `G3:${endColumn}3`, 'B4:D4', `G4:${endColumn}4`, `A6:${endColumn}6`, `A7:${endColumn}7`];
    const rows = [];
    const rowXml = (rowIndex, cells, height = null) => {
      const heightAttr = height ? ` ht="${height}" customHeight="1"` : '';
      rows.push(`<row r="${rowIndex}"${heightAttr}>${cells.join('')}</row>`);
    };
    rowXml(1, [xlsxCell(1, 1, 'ỦY BAN NHÂN DÂN PHƯỜNG', 10), xlsxCell(1, 7, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 1)], 18);
    rowXml(2, [xlsxCell(2, 1, 'PHƯỜNG TRUNG MỸ TÂY', 10), xlsxCell(2, 7, 'Độc lập - Tự do - Hạnh phúc', 2)], 18);
    rowXml(3, [xlsxCell(3, 1, teachingSchoolName, 1), xlsxCell(3, 7, '', 0)], 18);
    rowXml(4, [xlsxCell(4, 2, '', 11), xlsxCell(4, 7, `Trung Mỹ Tây, ngày ...... tháng ${exportMonth} năm ${exportYear}`, 3)], 18);
    rowXml(5, [], 18);
    rowXml(6, [xlsxCell(6, 1, fileTitle, 1)], 18);
    rowXml(7, [xlsxCell(7, 1, subtitle, 1)], 18);
    rowXml(9, headers.map((header, index) => xlsxCell(9, index + 1, header, 4)), 44);
    rowXml(10, headers.map((_, index) => xlsxCell(10, index + 1, index + 1, 14)), 15);
    let sheetRow = 11;
    groups.forEach((group, groupIndex) => {
      const teacherTotal = group.rows.reduce((sum, row) => sum + (Number(getTotalPeriods(row)) || 0), 0);
      group.rows.forEach((row, rowIndex) => {
        const periodsPerClassWeek = getPeriodsPerClassWeek(row);
        const totalPerWeek = getVisibleWeeklyPeriods(row);
        const totalPeriods = getTotalPeriods(row);
        const teacherMoneyRate = getTeacherMoneyRate(row.teacherName);
        const assignmentMoney = getTeachingAssignmentMoney(row);
        const isContinuationAssignment = rowIndex > 0;
        const centerDataStyle = isContinuationAssignment ? 22 : 16;
        const nameDataStyle = isContinuationAssignment ? 23 : 18;
        const centerShrinkStyle = isContinuationAssignment ? 24 : 20;
        rowXml(sheetRow, [
          xlsxCell(sheetRow, 1, rowIndex === 0 ? groupIndex + 1 : '', centerDataStyle),
          xlsxCell(sheetRow, 2, rowIndex === 0 ? row.teacherName : '', nameDataStyle),
          xlsxCell(sheetRow, 3, rowIndex === 0 ? (row.position || 'GV') : '', centerDataStyle),
          xlsxCell(sheetRow, 4, rowIndex === 0 ? abbreviateTeachingSpecialty(row.specialty) : '', centerDataStyle),
          xlsxCell(sheetRow, 5, row.assignment, centerDataStyle),
          xlsxCell(sheetRow, 6, Number(row.weeks) || row.weeks, centerDataStyle),
          xlsxCell(sheetRow, 7, row.className, centerShrinkStyle),
          xlsxCell(sheetRow, 8, Number(row.classCount) || row.classCount, centerDataStyle),
          xlsxCell(sheetRow, 9, typeof periodsPerClassWeek === 'number' ? periodsPerClassWeek : periodsPerClassWeek, centerDataStyle),
          xlsxCell(sheetRow, 10, Number(totalPerWeek) || totalPerWeek, centerDataStyle),
          xlsxCell(sheetRow, 11, Number(totalPeriods) || totalPeriods, centerDataStyle),
          xlsxCell(sheetRow, 12, row.note, nameDataStyle),
          ...(showTeachingFinancialColumns
            ? [
                xlsxCell(sheetRow, 13, teacherMoneyRate || '', centerDataStyle),
                xlsxCell(sheetRow, 14, assignmentMoney || '', centerDataStyle)
              ]
            : [])
        ], 21);
        sheetRow += 1;
      });
      merges.push(`B${sheetRow}:J${sheetRow}`);
      rowXml(sheetRow, [
        xlsxCell(sheetRow, 1, '', 8),
        xlsxCell(sheetRow, 2, 'Số tiết dạy phổ cập/năm học', 8),
        ...Array.from({ length: 8 }, (_, offset) => xlsxCell(sheetRow, offset + 3, '', 8)),
        xlsxCell(sheetRow, 11, teacherTotal || '', 9),
        xlsxCell(sheetRow, 12, '', 8),
        ...(showTeachingFinancialColumns
          ? [
              xlsxCell(sheetRow, 13, '', 8),
              xlsxCell(sheetRow, 14, getTeacherTeachingMoneyTotal(group.teacherName) || '', 9)
            ]
          : [])
      ], 18);
      sheetRow += 1;
    });
    if (!groups.length) rowXml(11, [xlsxCell(11, 1, 'Chưa có dữ liệu phân công', 7)], 21);
    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="5" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/>
    <col min="3" max="3" width="7" customWidth="1"/><col min="4" max="4" width="11" customWidth="1"/>
    <col min="5" max="5" width="10" customWidth="1"/><col min="6" max="6" width="7" customWidth="1"/>
    <col min="7" max="7" width="19" customWidth="1"/><col min="8" max="8" width="7" customWidth="1"/>
    <col min="9" max="11" width="9" customWidth="1"/><col min="12" max="12" width="41" customWidth="1"/>${showTeachingFinancialColumns ? '<col min="13" max="14" width="12" customWidth="1"/>' : ''}
  </cols>
  <sheetData>${rows.join('')}</sheetData>
  <mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>
  <pageMargins left="0.3937" right="0.3937" top="0.5906" bottom="0.5906" header="0.3" footer="0.3"/>
  <pageSetup paperSize="9" orientation="landscape" scale="90"/>
</worksheet>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="9">
    <font><sz val="11"/><name val="Times New Roman"/></font>
    <font><b/><sz val="14"/><name val="Times New Roman"/></font>
    <font><b/><u/><sz val="12"/><name val="Times New Roman"/></font>
    <font><i/><sz val="12"/><name val="Times New Roman"/></font>
    <font><b/><sz val="11"/><name val="Times New Roman"/></font>
    <font><b/><i/><sz val="12"/><name val="Times New Roman"/></font>
    <font><sz val="14"/><name val="Times New Roman"/></font>
    <font><sz val="12"/><name val="Times New Roman"/></font>
    <font><i/><sz val="10"/><name val="Times New Roman"/></font>
  </fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE8A3"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="6"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="dashed"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="dashed"><color rgb="FF000000"/></bottom><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="dashed"><color rgb="FF000000"/></top><bottom style="dashed"><color rgb="FF000000"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="25">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="2" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="8" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="4" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="4" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" shrinkToFit="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="4" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" shrinkToFit="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" shrinkToFit="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="4" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" shrinkToFit="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="5" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="5" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="5" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" shrinkToFit="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="0" borderId="5" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" shrinkToFit="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
    return createZipBlob([
      { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Phân công" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/worksheets/sheet1.xml', content: worksheet },
      { name: 'xl/styles.xml', content: styles }
    ]);
  };

  const exportTeachingAssignments = (type) => {
    const safeYear = compactSchoolYearLabel(selectedSchoolYear || 'nam-hoc');
    setShowTeachingExportMenu(false);
    if (type === 'excel') {
      downloadBlobFile(`bang-phan-cong-${safeYear}.xlsx`, buildTeachingExportXlsxBlob());
      return;
    }
    const html = buildTeachingExportHtml();
    printHtmlDocument(html, () => showNotification?.('Chưa mở được hộp thoại in PDF.', 'error'));
  };

  const setYearLockDraft = (year, locked) => {
    const yearKey = compactSchoolYearLabel(year);
    if (!yearKey) return;
    setInputLocksDraft(prev => ({
      ...(prev || {}),
      [yearKey]: Boolean(locked)
    }));
  };

  const cleanTeachersDraft = useMemo(
    () => cleanTeacherRowsForSave(teachersDraft),
    [teachersDraft]
  );

  const cleanThdTeachersDraft = useMemo(
    () => cleanThdTeacherRowsForSave(thdTeachersDraft),
    [thdTeachersDraft]
  );

  const cleanThdClassesDraft = useMemo(
    () => normalizeThdClasses(thdClassesDraft),
    [thdClassesDraft]
  );

  const buildAssignmentsForSave = () => {
    const assignmentsObj = (assignmentsDraft && typeof assignmentsDraft === 'object') ? { ...assignmentsDraft } : {};
    const byYear = { ...(assignmentsObj.byYear || {}) };
    if (!byYear[effectiveSchoolYearKey] && !assignmentsObj.byYear) {
      byYear[effectiveSchoolYearKey] = { ...assignmentsObj };
    } else if (!byYear[effectiveSchoolYearKey]) {
      byYear[effectiveSchoolYearKey] = {};
    }
    return {
      ...assignmentsObj,
      byYear
    };
  };

  const changedSettings = useMemo(() => ({
    schoolYear: String(yearDraft || '') !== String(currentSchoolYear || ''),
    principalName: String(principalDraft || '').trim() !== String(principalName || '').trim(),
    inputYearLocks: !sameJson(inputLocksDraft, inputYearLocks && typeof inputYearLocks === 'object' ? inputYearLocks : {}),
    transcriptStartDates: !sameJson(transcriptStartDatesDraft, transcriptStartDates && typeof transcriptStartDates === 'object' ? transcriptStartDates : {}),
    transcriptEndDates: !sameJson(transcriptEndDatesDraft, transcriptEndDates && typeof transcriptEndDates === 'object' ? transcriptEndDates : {}),
    transcriptGrade9EndDates: !sameJson(transcriptGrade9EndDatesDraft, transcriptGrade9EndDates && typeof transcriptGrade9EndDates === 'object' ? transcriptGrade9EndDates : {}),
    transcriptStartSigners: !sameJson(transcriptStartSignersDraft, transcriptStartSigners && typeof transcriptStartSigners === 'object' ? transcriptStartSigners : {}),
    transcriptEndSigners: !sameJson(transcriptEndSignersDraft, transcriptEndSigners && typeof transcriptEndSigners === 'object' ? transcriptEndSigners : {}),
    nanTeachers: !sameJson(cleanTeachersDraft, cleanTeacherRowsForSave(Array.isArray(nanTeachers) ? nanTeachers : [])),
    thdTeachers: !sameJson(cleanThdTeachersDraft, cleanThdTeacherRowsForSave(Array.isArray(thdTeachers) ? thdTeachers : [])),
    thdSubjects: !sameJson(cleanThdSubjectsDraft, cleanThdSubjectRowsForSave(Array.isArray(thdSubjects) ? thdSubjects : DEFAULT_THD_SUBJECTS)),
    classTeacherAssignments: !sameJson(assignmentsDraft || {}, classTeacherAssignments || {}),
    thdClasses: !sameJson(cleanThdClassesDraft, normalizeThdClasses(thdClasses)),
    teachingAssignments: activePanel === 'teachingAssignments' && !sameJson(buildTeachingAssignmentsForSave(), teachingAssignments && typeof teachingAssignments === 'object' ? teachingAssignments : {}),
    thdTeachingAssignments: activePanel === 'thdTeachingAssignments' && !sameJson(buildTeachingAssignmentsForSave(), thdTeachingAssignments && typeof thdTeachingAssignments === 'object' ? thdTeachingAssignments : {})
  }), [
    activePanel,
    assignmentsDraft,
    classTeacherAssignments,
    cleanThdClassesDraft,
    cleanThdSubjectsDraft,
    cleanThdTeachersDraft,
    cleanTeachersDraft,
    cleanTeachingAssignmentRows,
    currentSchoolYear,
    effectiveSchoolYearKey,
    inputLocksDraft,
    inputYearLocks,
    nanTeachers,
    principalDraft,
    principalName,
    selectedSchoolYear,
    transcriptEndDates,
    transcriptEndDatesDraft,
    transcriptGrade9EndDates,
    transcriptGrade9EndDatesDraft,
    transcriptEndSigners,
    transcriptEndSignersDraft,
    transcriptStartSigners,
    transcriptStartSignersDraft,
    transcriptStartDates,
    transcriptStartDatesDraft,
    teachingAssignments,
    teachingAssignmentsDraft,
    teachingSemesterDatesForYear,
    thdClasses,
    thdSubjects,
    thdTeachers,
    thdTeachingAssignments,
    thdTeachingAssignmentsDraft,
    yearDraft
  ]);

  const hasChanges = Object.values(changedSettings).some(Boolean);

  useEffect(() => {
    if (!changedSettings.nanTeachers || typeof onSaveSetting !== 'function') return undefined;
    const payload = cleanTeachersDraft;
    const timer = window.setTimeout(() => {
      Promise.resolve(onSaveSetting('nanTeachers', payload)).catch(() => {
        showNotification?.('Chưa tự lưu được danh sách giáo viên.', 'error');
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [changedSettings.nanTeachers, cleanTeachersDraft, onSaveSetting, showNotification]);

  const saveTeachersDraftNow = (rows) => {
    if (typeof onSaveSetting !== 'function') return;
    Promise.resolve(onSaveSetting('nanTeachers', cleanTeacherRowsForSave(rows))).catch(() => {
      showNotification?.('Chưa tự lưu được danh sách giáo viên.', 'error');
    });
  };

  const updateTranscriptDateDraft = (type, schoolYear, value) => {
    const key = compactSchoolYearLabel(schoolYear);
    const setter = type === 'start'
      ? setTranscriptStartDatesDraft
      : (type === 'grade9End' ? setTranscriptGrade9EndDatesDraft : setTranscriptEndDatesDraft);
    setter(prev => ({
      ...(prev || {}),
      [key]: value
    }));
  };

  const updateTranscriptSignerDraft = (type, schoolYear, value) => {
    const startIndex = schoolYears.findIndex(year => compactSchoolYearLabel(year) === compactSchoolYearLabel(schoolYear));
    const yearsToUpdate = schoolYears.slice(Math.max(0, startIndex));
    const cleanValue = String(value || '').trim();
    const setter = type === 'start' ? setTranscriptStartSignersDraft : setTranscriptEndSignersDraft;
    setter(prev => {
      const next = { ...(prev || {}) };
      yearsToUpdate.forEach(year => {
        next[compactSchoolYearLabel(year)] = cleanValue;
      });
      return next;
    });
  };

  const updateTeacher = (index, patch) => {
    setTeachersDraft(prev => prev.map((item, rowIndex) => rowIndex === index ? normalizeTeacher({ ...item, ...patch }) : item));
  };

  const updateThdTeacher = (index, patch) => {
    setThdTeachersDraft(prev => prev.map((item, rowIndex) => rowIndex === index ? normalizeThdTeacher({ ...item, ...patch }) : item));
  };

  const deleteThdTeacherRow = (index) => {
    setThdTeachersDraft(prev => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [emptyThdTeacher()];
    });
  };

  const updateThdSubject = (index, patch) => {
    setThdSubjectsDraft(prev => prev.map((item, rowIndex) => (
      rowIndex === index ? { ...item, ...patch } : item
    )));
  };

  const moveThdSubject = (index, direction) => {
    setThdSubjectsDraft(prev => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const deleteThdSubject = (index) => {
    setThdSubjectsDraft(prev => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [emptyThdSubject()];
    });
  };

  const clearAllThdTeachers = () => {
    setThdTeachersDraft([emptyThdTeacher()]);
    setThdPasteText('');
    showNotification?.('Đã xóa tất cả dòng giáo viên Trần Hưng Đạo trong bảng nháp.');
  };

  const updateThdClass = (grade, index, value) => {
    const gradeKey = String(grade || '').trim();
    setThdClassesDraft(prev => {
      const next = normalizeThdClasses(prev);
      next[gradeKey] = (next[gradeKey] || []).map((className, rowIndex) => (
        rowIndex === index ? normalizeClassName(value) : className
      ));
      return next;
    });
  };

  const addThdClass = (grade) => {
    const gradeKey = String(grade || '').trim();
    setThdClassesDraft(prev => {
      const next = normalizeThdClasses(prev);
      const existing = next[gradeKey] || [];
      next[gradeKey] = [...existing, getNextManagedClassName(gradeKey, existing)];
      return next;
    });
  };

  const deleteThdClass = (grade, index) => {
    const gradeKey = String(grade || '').trim();
    setThdClassesDraft(prev => {
      const next = normalizeThdClasses(prev);
      const rows = (next[gradeKey] || []).filter((_, rowIndex) => rowIndex !== index);
      next[gradeKey] = rows.length ? rows : [`${gradeKey}/1`];
      return next;
    });
  };

  const deleteTeacherRow = (index) => {
    setTeachersDraft(prev => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length ? next : [emptyTeacher()];
    });
  };

  const clearAllTeachers = () => {
    const nextTeachers = [emptyTeacher()];
    setTeachersDraft(nextTeachers);
    saveTeachersDraftNow(nextTeachers);
    setPasteText('');
    showNotification?.('Đã xóa tất cả dòng giáo viên trong bảng nháp.');
  };

  const parseTeacherPaste = () => {
    const rows = String(pasteText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!rows.length) {
      showNotification?.('Chưa có danh sách để dán.', 'error');
      return;
    }
    const moneyScan = rows.map(line => ({ line, item: parseMoneyUpdateLine(line) }));
    const moneyUpdates = moneyScan.map(row => row.item).filter(Boolean);
    const unparsedMoneyRows = moneyScan.filter(row => !row.item && !isMoneyPasteHeader(row.line));
    if (moneyUpdates.length > 0) {
      let updatedCount = 0;
      let addedCount = 0;
      const nextTeachers = (teachersDraft.length ? teachersDraft : [emptyTeacher()]).map(normalizeTeacher);
      const indexByName = new Map(nextTeachers.map((teacher, index) => [normalizeTeacherNameKey(teacher.name), index]).filter(([key]) => key));
      moneyUpdates.forEach(item => {
        const nameKey = normalizeTeacherNameKey(item.name);
        if (!nameKey) return;
        const existingIndex = indexByName.get(nameKey);
        if (existingIndex !== undefined) {
          nextTeachers[existingIndex] = normalizeTeacher({ ...nextTeachers[existingIndex], moneyPerPeriod: item.moneyPerPeriod });
          updatedCount += 1;
        } else {
          indexByName.set(nameKey, nextTeachers.length);
          nextTeachers.push(normalizeTeacher({ name: item.name, moneyPerPeriod: item.moneyPerPeriod }));
          addedCount += 1;
        }
      });
      setTeachersDraft(nextTeachers);
      saveTeachersDraftNow(nextTeachers);
      setPasteText('');
      showNotification?.(`Đã cập nhật số tiền cho ${updatedCount} giáo viên${addedCount ? `, thêm ${addedCount} giáo viên mới` : ''}${unparsedMoneyRows.length ? `, bỏ qua ${unparsedMoneyRows.length} dòng không đọc được` : ''}.`);
      return;
    }
    const periodScan = rows.map(line => ({ line, item: parsePeriodUpdateLine(line) }));
    const periodUpdates = periodScan.map(row => row.item).filter(Boolean);
    const unparsedPeriodRows = periodScan.filter(row => !row.item && !isPeriodPasteHeader(row.line));
    if (periodUpdates.length > 0) {
      let updatedCount = 0;
      let addedCount = 0;
      const nextTeachers = (teachersDraft.length ? teachersDraft : [emptyTeacher()]).map(normalizeTeacher);
      const indexByName = new Map(nextTeachers.map((teacher, index) => [normalizeTeacherNameKey(teacher.name), index]).filter(([key]) => key));
      periodUpdates.forEach(item => {
        const nameKey = normalizeTeacherNameKey(item.name);
        if (!nameKey) return;
        const existingIndex = indexByName.get(nameKey);
        if (existingIndex !== undefined) {
          nextTeachers[existingIndex] = normalizeTeacher({ ...nextTeachers[existingIndex], periods: item.periods });
          updatedCount += 1;
        } else {
          indexByName.set(nameKey, nextTeachers.length);
          nextTeachers.push(normalizeTeacher({ name: item.name, periods: item.periods }));
          addedCount += 1;
        }
      });
      setTeachersDraft(nextTeachers);
      saveTeachersDraftNow(nextTeachers);
      setPasteText('');
      showNotification?.(`Đã cập nhật số tiết cho ${updatedCount} giáo viên${addedCount ? `, thêm ${addedCount} giáo viên mới` : ''}${unparsedPeriodRows.length ? `, bỏ qua ${unparsedPeriodRows.length} dòng không đọc được` : ''}.`);
      return;
    }
    const parsed = rows.map((line) => {
      const parts = splitPasteColumns(line);
      const maybeStt = /^\d+$/.test(parts[0] || '');
      const moneyIndex = parts.findIndex((part, index) => index > (maybeStt ? 1 : 0) && looksLikeMoney(part));
      const periodCandidate = parts
        .map((part, index) => ({ part, index }))
        .filter(item => item.index !== moneyIndex)
        .at(-1);
      const periodIndex = periodCandidate
        && ((maybeStt && parts.length >= 5) || (!maybeStt && parts.length >= 4) || ((!maybeStt && parts.length === 2) || (maybeStt && parts.length === 3)))
        && looksLikePeriods(periodCandidate.part)
        ? periodCandidate.index
        : -1;
      const workingParts = parts.filter((_, index) => index !== periodIndex && index !== moneyIndex);
      const name = maybeStt ? (parts[1] || '') : (parts[0] || '');
      const isNamePeriodsOnly = periodIndex >= 0 && ((!maybeStt && parts.length === 2) || (maybeStt && parts.length === 3));
      const subject = isNamePeriodsOnly ? '' : (maybeStt ? (workingParts[2] || '') : (workingParts[1] || ''));
      const gradeText = isNamePeriodsOnly ? '' : (maybeStt ? (workingParts.slice(3).join(' ') || '') : (workingParts.slice(2).join(' ') || ''));
      return normalizeTeacher({
        name,
        subject,
        grades: parseGrades(gradeText),
        periods: periodIndex >= 0 ? normalizePeriods(parts[periodIndex]) : '',
        moneyPerPeriod: moneyIndex >= 0 ? normalizeMoney(parts[moneyIndex]) : ''
      });
    }).filter(item => item.name || item.subject || item.periods || item.moneyPerPeriod);
    const nextTeachers = parsed.length ? parsed : [emptyTeacher()];
    setTeachersDraft(nextTeachers);
    saveTeachersDraftNow(nextTeachers);
    setPasteText('');
    showNotification?.(`Đã dán ${parsed.length} dòng giáo viên.`);
  };

  const parseThdTeacherPaste = () => {
    const rows = String(thdPasteText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!rows.length) {
      showNotification?.('Chưa có danh sách để dán.', 'error');
      return;
    }
    const parsed = rows.map(line => {
      const parts = splitMoneyPasteColumns(line);
      const fallbackParts = parts.length > 1 ? parts : splitPasteColumns(line);
      const cells = fallbackParts.length > 1 ? fallbackParts : [line];
      const maybeStt = /^\d+$/.test(cells[0] || '');
      const payload = maybeStt ? cells.slice(1) : cells;
      return normalizeThdTeacher({
        name: payload[0] || '',
        subject: payload[1] || '',
        position: payload[2] || 'GV',
        note: payload.slice(3).join(' ')
      });
    }).filter(item => item.name || item.subject || item.note);
    const nextTeachers = parsed.length ? parsed : [emptyThdTeacher()];
    setThdTeachersDraft(nextTeachers);
    setThdPasteText('');
    showNotification?.(`Đã dán ${parsed.length} dòng giáo viên Trần Hưng Đạo.`);
  };

  const updateAssignment = (grade, subject, value, semester = 'hk1') => {
    setAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      const byYear = { ...(prevObj.byYear || {}) };
      const legacyYearMap = (!prevObj.byYear && effectiveSchoolYearKey === LEGACY_ASSIGNMENT_YEAR_KEY) ? prevObj : {};
      const yearMap = { ...(byYear[effectiveSchoolYearKey] || legacyYearMap) };
      const currentValue = normalizeClassTeacherAssignmentValue(yearMap?.[grade]?.[subject] ?? '');
      yearMap[grade] = {
        ...(yearMap?.[grade] || {}),
        [subject]: {
          ...currentValue,
          [semester]: value
        }
      };
      byYear[effectiveSchoolYearKey] = yearMap;
      return {
        ...prevObj,
        byYear
      };
    });
  };

  const clearClassTeacherAssignmentsByYear = () => {
    setAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      return {
        ...prevObj,
        byYear: {
          ...(prevObj.byYear || {}),
          [effectiveSchoolYearKey]: {}
        }
      };
    });
    showNotification?.(`Đã xóa phân công giáo viên từng lớp năm ${selectedSchoolYear}.`);
  };

  const clearClassTeacherAssignmentsByGrade = (grade) => {
    const gradeKey = String(grade || '').trim();
    if (!gradeKey) return;
    setAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      const currentYearMap = {
        ...((prevObj.byYear || {})[effectiveSchoolYearKey] || {})
      };
      currentYearMap[gradeKey] = {};
      return {
        ...prevObj,
        byYear: {
          ...(prevObj.byYear || {}),
          [effectiveSchoolYearKey]: currentYearMap
        }
      };
    });
    showNotification?.(`Đã xóa phân công khối ${gradeKey} của năm ${selectedSchoolYear}.`);
  };

  const saveAll = async () => {
    const saveTasks = [];
    if (changedSettings.schoolYear) saveTasks.push(onSaveSetting('schoolYear', yearDraft));
    if (changedSettings.principalName) saveTasks.push(onSaveSetting('principalName', principalDraft.trim()));
    if (changedSettings.inputYearLocks) saveTasks.push(onSaveSetting('inputYearLocks', inputLocksDraft));
    if (changedSettings.transcriptStartDates) saveTasks.push(onSaveSetting('transcriptStartDates', transcriptStartDatesDraft));
    if (changedSettings.transcriptEndDates) saveTasks.push(onSaveSetting('transcriptEndDates', transcriptEndDatesDraft));
    if (changedSettings.transcriptGrade9EndDates) saveTasks.push(onSaveSetting('transcriptGrade9EndDates', transcriptGrade9EndDatesDraft));
    if (changedSettings.transcriptStartSigners) saveTasks.push(onSaveSetting('transcriptStartSigners', transcriptStartSignersDraft));
    if (changedSettings.transcriptEndSigners) saveTasks.push(onSaveSetting('transcriptEndSigners', transcriptEndSignersDraft));
    if (changedSettings.nanTeachers) saveTasks.push(onSaveSetting('nanTeachers', cleanTeachersDraft));
    if (changedSettings.thdTeachers) saveTasks.push(onSaveSetting('thdTeachers', cleanThdTeachersDraft));
    if (changedSettings.thdSubjects) saveTasks.push(onSaveSetting('thdSubjects', cleanThdSubjectsDraft));
    if (changedSettings.thdClasses) saveTasks.push(onSaveSetting('thdClasses', cleanThdClassesDraft));
    if (changedSettings.classTeacherAssignments) saveTasks.push(onSaveSetting('classTeacherAssignments', buildAssignmentsForSave()));
    if (changedSettings.teachingAssignments) saveTasks.push(onSaveSetting('teachingAssignments', buildTeachingAssignmentsForSave()));
    if (changedSettings.thdTeachingAssignments) saveTasks.push(onSaveSetting('thdTeachingAssignments', buildTeachingAssignmentsForSave()));
    if (!saveTasks.length) {
      showNotification?.('Không có thay đổi để lưu.');
      return;
    }
    await Promise.all(saveTasks);
    showNotification?.('Đã lưu cài đặt.');
  };

  return (
    <div
      className={`fixed inset-x-0 ${isTeachingPanel ? 'top-[84px]' : 'top-[84px]'} bottom-0 z-[120] bg-slate-100/95 backdrop-blur-md ${isTeachingPanel ? 'overflow-hidden p-0' : 'overflow-y-auto p-2 sm:p-3'}`}
    >
      <div className={`w-full max-w-none mx-auto ${isTeachingPanel ? 'absolute inset-0 flex min-h-0 flex-col overflow-hidden' : 'space-y-3'}`}>
        <datalist id="nan-teacher-names">
          {teacherNames.map(name => <option key={name} value={name} />)}
        </datalist>
        <datalist id="nan-subjects">
          {NAN_SUBJECT_OPTIONS.map(subject => <option key={subject} value={subject} />)}
        </datalist>
        <datalist id="thd-assignment-short-names">
          {cleanThdSubjectsDraft.map((subject, index) => (
            <option key={`thd-assignment-short-${index}-${subject.shortName}`} value={subject.shortName || subject.name} />
          ))}
        </datalist>
        <datalist id="transcript-signer-names">
          {transcriptSignerNames.map(name => <option key={name} value={name} />)}
        </datalist>
        <datalist id="assignment-specialties">
          {[...new Set(activeTeachingTeachersDraft.map(teacher => normalizeTeacher(teacher).subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')).map(subject => <option key={subject} value={subject} />)}
        </datalist>

        <div className={isTeachingPanel ? 'min-h-0 flex-1 overflow-hidden' : 'space-y-3'}>
            {activePanel === 'general' && (
              <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-xs font-black uppercase text-blue-900 mb-2">Năm học hệ thống</div>
                    <select value={yearDraft} onChange={(event) => setYearDraft(event.target.value)} className="w-full bg-white border border-blue-200 p-3 rounded-xl focus:outline-none focus:border-blue-500 font-black text-sm shadow-sm">
                      {schoolYears.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-xs font-black uppercase text-blue-900 mb-2">Họ tên hiệu trưởng</div>
                    <input value={principalDraft} onChange={(event) => setPrincipalDraft(event.target.value)} placeholder="Nhập họ tên hiệu trưởng..." className="w-full bg-white border border-blue-200 p-3 rounded-xl focus:outline-none focus:border-blue-500 font-black text-sm shadow-sm" />
                  </label>
                  <label className={`md:col-span-2 flex items-start gap-3 rounded-2xl border p-4 cursor-pointer ${isSystemYearLocked ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <input
                      type="checkbox"
                      checked={isSystemYearLocked}
                      onChange={(event) => setInputLocksDraft(prev => ({
                        ...(prev || {}),
                        [systemSchoolYearKey]: event.target.checked
                      }))}
                      className="mt-1 w-5 h-5 accent-rose-600"
                    />
                    <span>
                      <span className={`block text-sm font-black uppercase ${isSystemYearLocked ? 'text-rose-800' : 'text-emerald-800'}`}>
                        Khóa nhập liệu năm {yearDraft || currentSchoolYear}
                      </span>
                      <span className={`block text-xs font-bold mt-1 ${isSystemYearLocked ? 'text-rose-700' : 'text-emerald-700'}`}>
                        Khi tích khóa, học sinh vẫn vào xem bài và gửi chỉnh sửa hồ sơ; hệ thống chỉ khóa nộp bài/làm bài kiểm tra, ghi điểm và phát đề cho năm này. Bỏ tích rồi bấm Lưu để mở lại.
                      </span>
                    </span>
                  </label>
                  <div className="md:col-span-2 rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                    <div className="mb-3 flex items-center gap-2 font-black uppercase text-amber-900">
                      <CalendarDays className="w-5 h-5" /> Ngày ký học bạ theo năm học
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-amber-100 bg-white">
                      <table className="w-full min-w-[1480px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-amber-50 text-left text-[11px] font-black uppercase text-amber-900">
                            <th className="w-36 border-b border-amber-100 px-3 py-2">Năm học</th>
                            <th className="border-b border-amber-100 px-3 py-2">Ngày ký đầu năm, trang 3</th>
                            <th className="border-b border-amber-100 px-3 py-2">Người ký đầu năm</th>
                            <th className="border-b border-amber-100 px-3 py-2">Ngày ký cuối năm</th>
                            <th className="border-b border-amber-100 px-3 py-2">Ngày ký lớp 9</th>
                            <th className="border-b border-amber-100 px-3 py-2">Người ký cuối năm</th>
                            <th className="w-36 border-b border-amber-100 px-3 py-2">Khóa năm</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schoolYears.map((year) => {
                            const yearKey = compactSchoolYearLabel(year);
                            const isYearLocked = Boolean(inputLocksDraft?.[yearKey]);
                            return (
                              <tr key={`transcript-date-${yearKey}`} className="border-b border-amber-50 last:border-b-0">
                                <td className="px-3 py-2 font-black text-slate-700">{year}</td>
                                <td className="px-3 py-2">
                                  <input
                                    type="date"
                                    value={toDateInputValue(transcriptStartDatesDraft?.[yearKey]) || defaultTranscriptStartDate(year)}
                                    onChange={(event) => updateTranscriptDateDraft('start', year, event.target.value)}
                                    className="w-full rounded-xl border border-amber-100 bg-white p-2 font-bold outline-none focus:border-amber-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    value={transcriptStartSignersDraft?.[yearKey] ?? principalDraft}
                                    onChange={(event) => updateTranscriptSignerDraft('start', year, event.target.value)}
                                    list="transcript-signer-names"
                                    placeholder="Người ký đầu năm..."
                                    className="w-full rounded-xl border border-amber-100 bg-white p-2 font-bold outline-none focus:border-amber-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="date"
                                    value={toDateInputValue(transcriptEndDatesDraft?.[yearKey]) || defaultTranscriptEndDate(year)}
                                    onChange={(event) => updateTranscriptDateDraft('end', year, event.target.value)}
                                    className="w-full rounded-xl border border-amber-100 bg-white p-2 font-bold outline-none focus:border-amber-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="date"
                                    value={toDateInputValue(transcriptGrade9EndDatesDraft?.[yearKey]) || defaultTranscriptGrade9EndDate(year)}
                                    onChange={(event) => updateTranscriptDateDraft('grade9End', year, event.target.value)}
                                    className="w-full rounded-xl border border-amber-100 bg-white p-2 font-bold outline-none focus:border-amber-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    value={transcriptEndSignersDraft?.[yearKey] ?? principalDraft}
                                    onChange={(event) => updateTranscriptSignerDraft('end', year, event.target.value)}
                                    list="transcript-signer-names"
                                    placeholder="Người ký cuối năm..."
                                    className="w-full rounded-xl border border-amber-100 bg-white p-2 font-bold outline-none focus:border-amber-400"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    type="button"
                                    onClick={() => setYearLockDraft(year, !isYearLocked)}
                                    className={`w-full rounded-xl border px-3 py-2 text-xs font-black uppercase transition-colors ${isYearLocked ? 'border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                  >
                                    {isYearLocked ? 'Đang khóa' : 'Đang mở'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 text-xs font-bold text-amber-800">
                      Mặc định: đầu năm là thứ 3 tuần thứ 2 tháng 9; cuối năm là thứ 5 tuần cuối tháng 5 năm sau; lớp 9 sớm hơn 5 ngày. Khi nhập người ký ở một năm, các năm phía sau tự nhận cùng người ký để đổi hiệu trưởng theo mốc thời gian.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePanel === 'teachers' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setShowTeacherPaste(prev => !prev)} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow hover:bg-emerald-700 inline-flex items-center gap-2">
                    <ClipboardPaste className="w-5 h-5" /> {showTeacherPaste ? 'Ẩn khung dán' : 'Dán danh sách'}
                  </button>
                  <button type="button" onClick={clearAllTeachers} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 hover:bg-rose-100 inline-flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Xóa tất cả
                  </button>
                </div>

                {showTeacherPaste && (
                  <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 font-black text-emerald-900 uppercase mb-3">
                      <ClipboardPaste className="w-5 h-5" /> Dán danh sách giáo viên NAN
                    </div>
                    <textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="Dán từ Excel: STT | Tên giáo viên | Môn | Số tiết | Số tiền. Cột ghi tắt có thể nhập trực tiếp trong bảng. Nếu chỉ dán Tên giáo viên | Số tiết hoặc Tên giáo viên | Số tiền, hệ thống chỉ cập nhật đúng cột đó theo tên đang có." className="w-full min-h-[120px] rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 text-sm font-bold outline-none focus:border-emerald-400" />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={parseTeacherPaste} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow hover:bg-emerald-700">Đưa vào bảng</button>
                      <button type="button" onClick={() => { setPasteText(''); setShowTeacherPaste(false); }} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">Đóng</button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {[
                    { offset: 0, rows: teachersDraft.slice(0, Math.ceil(teachersDraft.length / 2)) },
                    { offset: Math.ceil(teachersDraft.length / 2), rows: teachersDraft.slice(Math.ceil(teachersDraft.length / 2)) }
                  ].map((group, groupIndex) => (
                    <div key={`nan-teacher-col-${groupIndex}`} className={`${groupIndex === 1 && !group.rows.length ? 'hidden xl:block' : ''} rounded-2xl border border-slate-200 bg-white p-3 shadow-sm overflow-x-auto`}>
                      <table className="w-full min-w-[860px] border-separate border-spacing-y-1 text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold uppercase text-slate-500">
                            <th className="w-10 px-2">STT</th>
                            <th className="px-2">Tên giáo viên</th>
                            <th className="w-32 px-2">Ghi tắt</th>
                            <th className="w-44 px-2">Môn</th>
                            <th className="w-20 px-2 text-center">Số tiết</th>
                            <th className="w-28 px-2 text-center">Số tiền</th>
                            <th className="w-12 px-2 text-center">Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((teacher, rowIndex) => {
                            const index = rowIndex + group.offset;
                            return (
                              <tr key={`teacher-${index}`} className="bg-slate-50">
                                <td className="rounded-l-lg px-2 py-1.5 text-center text-slate-500">{index + 1}</td>
                                <td className="px-2 py-1.5"><input value={teacher.name} onChange={(event) => updateTeacher(index, { name: event.target.value })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-blue-400" /></td>
                                <td className="px-2 py-1.5"><input value={teacher.shortName || ''} onChange={(event) => updateTeacher(index, { shortName: event.target.value })} placeholder={suggestTeacherShortName(teacher.name) || 'TM Triết'} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-blue-400" /></td>
                                <td className="px-2 py-1.5"><input value={teacher.subject} onChange={(event) => updateTeacher(index, { subject: event.target.value })} list="nan-subjects" placeholder="VD: Toán" className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-blue-400" /></td>
                                <td className="px-2 py-1.5"><input value={teacher.periods || ''} onChange={(event) => updateTeacher(index, { periods: event.target.value })} inputMode="decimal" placeholder="19" className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-center font-normal outline-none focus:border-blue-400" /></td>
                                <td className="px-2 py-1.5"><input value={teacher.moneyPerPeriod || ''} onChange={(event) => updateTeacher(index, { moneyPerPeriod: normalizeMoney(event.target.value) })} inputMode="numeric" placeholder="50000" className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-center font-normal outline-none focus:border-blue-400" /></td>
                                <td className="rounded-r-lg px-2 py-1.5 text-center">
                                  <button type="button" onClick={() => deleteTeacherRow(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50" title="Xóa dòng">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setTeachersDraft(prev => [...prev, emptyTeacher()])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">+ Thêm giáo viên</button>
              </div>
            )}

            {activePanel === 'thdTeachers' && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-sky-900">Trần Hưng Đạo</div>
                      <div className="text-lg font-semibold text-sky-950">Danh sách giáo viên riêng</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setShowThdTeacherPaste(prev => !prev)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white shadow hover:bg-sky-700">
                        <ClipboardPaste className="h-4 w-4" /> {showThdTeacherPaste ? 'Ẩn khung dán' : 'Dán danh sách'}
                      </button>
                      <button type="button" onClick={clearAllThdTeachers} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                        <Trash2 className="h-4 w-4" /> Xóa tất cả
                      </button>
                      <button
                        type="button"
                        onClick={saveAll}
                        disabled={!hasChanges}
                        className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${hasChanges ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      >
                        <Save className="h-4 w-4" /> Lưu
                      </button>
                    </div>
                  </div>
                </div>
                {showThdTeacherPaste && (
                  <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase text-sky-900">
                      <ClipboardPaste className="h-4 w-4" /> Dán danh sách giáo viên Trần Hưng Đạo
                    </div>
                    <textarea
                      value={thdPasteText}
                      onChange={(event) => setThdPasteText(event.target.value)}
                      placeholder="Dán từ Excel: STT | Họ và tên | Chuyên môn | Chức vụ | Ghi chú. Nếu chỉ có Họ và tên | Chuyên môn cũng được."
                      className="min-h-[110px] w-full rounded-xl border border-sky-100 bg-sky-50/40 p-3 text-sm font-normal outline-none focus:border-sky-400"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={parseThdTeacherPaste} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-sky-700">Đưa vào bảng</button>
                      <button type="button" onClick={() => { setThdPasteText(''); setShowThdTeacherPaste(false); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Đóng</button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {[
                    { offset: 0, rows: thdTeachersDraft.slice(0, Math.ceil(thdTeachersDraft.length / 2)) },
                    { offset: Math.ceil(thdTeachersDraft.length / 2), rows: thdTeachersDraft.slice(Math.ceil(thdTeachersDraft.length / 2)) }
                  ].map((group, groupIndex) => (
                    <div key={`thd-teacher-col-${groupIndex}`} className={`${groupIndex === 1 && !group.rows.length ? 'hidden xl:block' : ''} rounded-2xl border border-slate-200 bg-white p-3 shadow-sm overflow-x-auto`}>
                      <table className="w-full min-w-[680px] border-separate border-spacing-y-1 text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold uppercase text-slate-500">
                            <th className="w-10 px-2">STT</th>
                            <th className="px-2">Họ và tên</th>
                            <th className="w-40 px-2">Chuyên môn</th>
                            <th className="w-20 px-2">CV</th>
                            <th className="w-48 px-2">Ghi chú</th>
                            <th className="w-12 px-2 text-center">Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((teacher, rowIndex) => {
                            const index = rowIndex + group.offset;
                            return (
                              <tr key={`thd-teacher-${index}`} className="bg-slate-50">
                                <td className="rounded-l-lg px-2 py-1.5 text-center text-slate-500">{index + 1}</td>
                                <td className="px-2 py-1.5">
                                  <input value={teacher.name} onChange={(event) => updateThdTeacher(index, { name: event.target.value })} placeholder="Nhập tên giáo viên..." className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-sky-400" />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input value={teacher.subject} onChange={(event) => updateThdTeacher(index, { subject: event.target.value })} placeholder="VD: Toán" className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-sky-400" />
                                </td>
                                <td className="px-2 py-1.5">
                                  <select value={teacher.position || 'GV'} onChange={(event) => updateThdTeacher(index, { position: event.target.value })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-center font-normal outline-none focus:border-sky-400">
                                    {POSITION_OPTIONS.map(position => <option key={position} value={position}>{position}</option>)}
                                  </select>
                                </td>
                                <td className="px-2 py-1.5">
                                  <input value={teacher.note} onChange={(event) => updateThdTeacher(index, { note: event.target.value })} placeholder="Ghi chú..." className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-sky-400" />
                                </td>
                                <td className="rounded-r-lg px-2 py-1.5 text-center">
                                  <button type="button" onClick={() => deleteThdTeacherRow(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50" title="Xóa dòng">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setThdTeachersDraft(prev => [...prev, emptyThdTeacher()])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  + Thêm GV
                </button>
              </div>
            )}

            {activePanel === 'thdSubjects' && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-sky-900">Trần Hưng Đạo</div>
                      <div className="text-lg font-semibold text-sky-950">Các môn học</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => setThdSubjectsDraft(prev => [...prev, emptyThdSubject()])} className="h-8 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100">
                        + Thêm dòng
                      </button>
                      <button
                        type="button"
                        onClick={saveAll}
                        disabled={!hasChanges}
                        className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${hasChanges ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      >
                        <Save className="h-4 w-4" /> Lưu
                      </button>
                    </div>
                  </div>
                </div>
                <div className="max-h-[calc(100vh-9.5rem)] overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <table className="w-full min-w-[1080px] border-separate border-spacing-y-1 text-sm">
                    <thead className="sticky top-[4.75rem] z-30 shadow-sm">
                      <tr className="text-left text-[11px] font-semibold uppercase text-slate-500">
                        <th className="w-12 px-2 text-center">STT</th>
                        <th className="px-2">Môn</th>
                        <th className="w-64 px-2">Ghi tắt</th>
                        <th className="w-24 px-2 text-center">HK1</th>
                        <th className="w-24 px-2 text-center">HK2</th>
                        <th className="w-48 px-2 text-center">Khối áp dụng</th>
                        <th className="w-32 px-2 text-center">Dòng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {thdSubjectsDraft.map((subject, index) => (
                        <tr key={`thd-subject-${index}`} className="bg-slate-50">
                          <td className="rounded-l-lg px-2 py-1.5 text-center text-slate-500">{index + 1}</td>
                          <td className="px-2 py-1.5">
                            <input
                              value={subject.name}
                              onChange={(event) => updateThdSubject(index, { name: event.target.value })}
                              placeholder="Tên môn đầy đủ..."
                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-sky-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={subject.shortName}
                              onChange={(event) => updateThdSubject(index, { shortName: event.target.value })}
                              placeholder="Ghi tắt dùng ở phân công..."
                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-semibold outline-none focus:border-sky-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={subject.periodsSemester1 || subject.periods || ''}
                              onChange={(event) => updateThdSubject(index, { periodsSemester1: event.target.value, periods: event.target.value })}
                              inputMode="decimal"
                              placeholder="4"
                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-center font-semibold outline-none focus:border-sky-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={subject.periodsSemester2 || subject.periods || ''}
                              onChange={(event) => updateThdSubject(index, { periodsSemester2: event.target.value })}
                              inputMode="decimal"
                              placeholder="4"
                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-center font-semibold outline-none focus:border-sky-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-wrap justify-center gap-1">
                              {THD_CLASS_GRADES.map(grade => {
                                const subjectGrades = normalizeThdSubjectGrades(subject.grades);
                                const checked = subjectGrades.includes(grade);
                                return (
                                  <button
                                    type="button"
                                    key={`thd-subject-grade-${index}-${grade}`}
                                    onClick={() => {
                                      const current = normalizeThdSubjectGrades(subject.grades);
                                      const next = checked ? current.filter(item => item !== grade) : [...current, grade];
                                      updateThdSubject(index, { grades: next.length ? next : THD_CLASS_GRADES });
                                    }}
                                    className={`h-7 rounded-md border px-2 text-xs font-semibold ${checked ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-500'}`}
                                  >
                                    {grade}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="rounded-r-lg px-2 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" onClick={() => moveThdSubject(index, -1)} disabled={index === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời lên">
                                <ArrowUp className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => moveThdSubject(index, 1)} disabled={index === thdSubjectsDraft.length - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời xuống">
                                <ArrowDown className="h-4 w-4" />
                              </button>
                              <button type="button" onClick={() => deleteThdSubject(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50" title="Xóa dòng">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activePanel === 'thdClasses' && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-sky-900">Trần Hưng Đạo</div>
                      <div className="text-lg font-semibold text-sky-950">Danh sách lớp</div>
                    </div>
                    <button
                      type="button"
                      onClick={saveAll}
                      disabled={!hasChanges}
                      className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${hasChanges ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      <Save className="h-4 w-4" /> Lưu
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {THD_CLASS_GRADES.map(grade => (
                    <div key={`thd-class-grade-${grade}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="mb-2 text-sm font-semibold uppercase text-sky-900">Khối {grade}</div>
                      <table className="w-full border-separate border-spacing-y-1 text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold uppercase text-slate-500">
                            <th className="w-10 px-2">STT</th>
                            <th className="px-2">Tên lớp</th>
                            <th className="w-10 px-2 text-center">Xóa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(thdClassesDraft?.[grade] || []).map((className, index) => (
                            <tr key={`thd-class-${grade}-${index}`} className="bg-slate-50">
                              <td className="rounded-l-lg px-2 py-1.5 text-center text-slate-500">{index + 1}</td>
                              <td className="px-2 py-1.5">
                                <input
                                  key={`thd-class-input-${grade}-${index}-${className}`}
                                  defaultValue={className}
                                  onBlur={(event) => updateThdClass(grade, index, event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') event.currentTarget.blur();
                                  }}
                                  className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-semibold outline-none focus:border-sky-400"
                                />
                              </td>
                              <td className="rounded-r-lg px-2 py-1.5 text-center">
                                <button type="button" onClick={() => deleteThdClass(grade, index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50" title="Xóa lớp">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button type="button" onClick={() => addThdClass(grade)} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100">
                        <Plus className="h-4 w-4" /> Thêm lớp
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isTeachingPanel && (
              <div ref={teachingAssignmentPanelRef} className="teaching-assignment-panel grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden px-0 pb-0 pt-0">
                <div className="relative z-[260] flex-none rounded-b-none rounded-t-none border-x border-b border-cyan-100 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="min-w-28">
                      <div className="text-[10px] font-semibold uppercase text-cyan-900">Phân công</div>
                      <div className="text-base font-semibold leading-tight text-cyan-950">{selectedSchoolYear}</div>
                    </div>
                    {isThdTeachingPanel && (
                      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-indigo-100 bg-indigo-50/60 px-1.5 py-1">
                        <input
                          ref={teachingImportFileRef}
                          type="file"
                          accept=".xlsx,.xls,.csv,.tsv,.txt"
                          onChange={handleTeachingImportFile}
                          className="hidden"
                        />
                        {!activeTeachingBatch && (
                          <>
                            <TeachingImportDateFields
                              value={teachingImportStartDate}
                              onChange={setTeachingImportStartDate}
                              title="Ngày bắt đầu nhập file"
                              schoolYear={selectedSchoolYear}
                            />
                            <span className="text-xs font-semibold text-indigo-700">đến</span>
                            <TeachingImportDateFields
                              value={teachingImportEndDate}
                              onChange={setTeachingImportEndDate}
                              title="Ngày kết thúc nhập file"
                              schoolYear={selectedSchoolYear}
                            />
                          </>
                        )}
                        <button type="button" onClick={openTeachingImportFilePicker} disabled={!canUseTeachingImport} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40">
                          <FileSpreadsheet className="h-4 w-4" /> Thêm dữ liệu
                        </button>
                      </div>
                    )}
                    {hasTeachingBatches && (
                      <label className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700">
                        <span>Xem</span>
                        <select
                          value={selectedTeachingBatchId}
                          onChange={(event) => {
                            setSelectedTeachingBatchId(event.target.value);
                            setEditingTeachingBatchId('');
                          }}
                          className="h-6 min-w-56 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-cyan-400"
                        >
                          <option value="summary">Tổng hợp ({teachingBatchesForSelectedYear.length} đợt)</option>
                          {teachingBatchesForSelectedYear.map((batch, index) => (
                            <option key={batch.id} value={batch.id}>
                              {getTeachingBatchLabel(batch, index)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {isTeachingSummaryView && (
                      <button
                        type="button"
                        onClick={updateTeachingSummaryFromBatches}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
                          teachingSummaryDirty
                            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
                        }`}
                      >
                        <ClipboardCheck className="h-4 w-4" /> Cập nhật{teachingSummaryDirty ? ' *' : ''}
                      </button>
                    )}
                    {isTeachingSummaryView && (
                      <button
                        type="button"
                        onClick={() => setEditingTeachingBatchId(isEditingTeachingSummary ? '' : 'summary')}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
                          isEditingTeachingSummary
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Pencil className="h-4 w-4" /> Chỉnh sửa
                      </button>
                    )}
                    {activeTeachingBatch && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingTeachingBatchId(isEditingActiveTeachingBatch ? '' : activeTeachingBatch.id)}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
                            isEditingActiveTeachingBatch
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Pencil className="h-4 w-4" /> {isEditingActiveTeachingBatch ? 'Đang chỉnh sửa' : 'Chỉnh sửa'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNewTeachersModal(true)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                        >
                          GV mới: {newTeachersComparedToPreviousBatch.length}
                        </button>
                        <button
                          type="button"
                          onClick={deleteSelectedTeachingBatch}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-4 w-4" /> Xóa đợt
                        </button>
                      </>
                    )}
                    <div className="ml-auto flex flex-wrap gap-1.5">
                      {isTeachingPanel && (
                        <button
                          type="button"
                          onClick={openTeachingTimeSettings}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                        >
                          <CalendarDays className="h-4 w-4" /> Cài đặt
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowTeachingCheckModal(true)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        <ClipboardCheck className="h-4 w-4" /> Kiểm tra
                      </button>
                      {!isThdTeachingPanel && (
                        <button
                          type="button"
                          onClick={() => setEditingTeachingBatchId(isEditingMainTeaching ? '' : 'main')}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
                            isEditingMainTeaching
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Pencil className="h-4 w-4" /> {isEditingMainTeaching ? 'Đang chỉnh sửa' : 'Chỉnh sửa'}
                        </button>
                      )}
                      {!isThdTeachingPanel && (
                        <button
                          type="button"
                          onClick={() => setShowTeachingMoneyColumns(prev => !prev)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {showTeachingMoneyColumns ? 'Ẩn tiền' : 'Hiện tiền'}
                        </button>
                      )}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowTeachingExportMenu(prev => !prev)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-200 bg-white px-2.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50"
                        >
                          <Download className="h-4 w-4" /> Xuất file
                        </button>
                        {showTeachingExportMenu && (
                          <div className="absolute right-0 top-full z-[300] mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                            <button
                              type="button"
                              onClick={() => exportTeachingAssignments('excel')}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                            >
                              <FileSpreadsheet className="h-4 w-4" /> Excel
                            </button>
                            <button
                              type="button"
                              onClick={() => exportTeachingAssignments('pdf')}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <FileText className="h-4 w-4" /> PDF
                            </button>
                          </div>
                        )}
                      </div>
                      {isThdTeachingPanel && (
                        <>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowTeachingFilterMenu(prev => !prev)}
                              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
                                teachingFilter === 'all'
                                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                  : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
                              }`}
                            >
                              <Filter className="h-4 w-4" /> Lọc: {teachingFilterLabel}
                            </button>
                            {showTeachingFilterMenu && (
                              <div className="absolute right-0 top-full z-[300] mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                                {TEACHING_FILTER_OPTIONS.map(option => (
                                  <button
                                    type="button"
                                    key={option.value}
                                    onClick={() => {
                                      setTeachingFilter(option.value);
                                      setShowTeachingFilterMenu(false);
                                    }}
                                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                                      teachingFilter === option.value
                                        ? 'bg-violet-50 text-violet-800'
                                        : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button type="button" onClick={clearTeachingAssignmentsForYear} disabled={!canEditTeachingRows} className="h-8 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40">
                            Xóa bảng
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={saveAll}
                        disabled={!hasChanges}
                        className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${hasChanges ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      >
                        <Save className="w-4 h-4" /> Lưu
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  ref={teachingAssignmentScrollRef}
                  onScroll={handleTeachingAssignmentScroll}
                  className="teaching-assignment-scroll overflow-auto rounded-b-none rounded-t-none border-x border-b border-slate-200 bg-white px-2 pb-2 pt-0 shadow-sm"
                >
                  <table className={`teaching-assignment-table w-full ${isThdTeachingPanel ? 'min-w-[1340px]' : (showTeachingFinancialColumns ? 'min-w-[1540px]' : (showTeachingSchoolColumns ? 'min-w-[1360px]' : 'min-w-[1180px]'))} border-collapse text-xs`}>
                    <thead>
                      <tr className="bg-slate-100 text-left text-[11px] font-black uppercase text-slate-600">
                        <th className="w-10 border border-slate-200 px-1 py-1 text-center">STT</th>
                        <th className="w-52 border border-slate-200 px-1 py-1">Họ và tên</th>
                        <th className="w-20 border border-slate-200 px-1 py-1 text-center">Chức vụ</th>
                        <th className={`${isThdTeachingPanel ? 'w-28' : 'w-40'} border border-slate-200 px-1 py-1`}>Chuyên môn</th>
                        <th className={`${isThdTeachingPanel ? 'w-40' : 'w-28'} border border-slate-200 px-1 py-1`}>Phân công</th>
                        <th className="w-14 border border-slate-200 px-1 py-1 text-center">Số tuần</th>
                        <th className={`${isThdTeachingPanel ? 'w-56' : 'w-28'} border border-slate-200 px-1 py-1 text-center`}>{isThdTeachingPanel ? 'Lớp' : 'Lớp PC'}</th>
                        <th className="w-10 border border-slate-200 px-1 py-1 text-center">Số lớp</th>
                        <th className="w-12 min-w-[3.25rem] max-w-[3.25rem] border border-slate-200 px-0.5 py-1 text-center leading-tight">
                          Tiết/lớp<br />tuần
                        </th>
                        <th className="w-12 border border-slate-200 px-1 py-1 text-center">Tiết/tuần</th>
                        <th className="w-12 border border-slate-200 px-1 py-1 text-center">Tổng tiết</th>
                        <th className={`${isThdTeachingPanel ? 'w-[36rem]' : 'w-96'} border border-slate-200 px-1 py-1`}>Ghi chú</th>
                        {isThdTeachingPanel && <th className="w-40 border border-slate-200 px-1 py-1">Kiểm tra</th>}
                        {!isThdTeachingPanel && (
                        <th className="w-16 border border-slate-200 px-1 py-1 text-center">Ký HB</th>
                        )}
                        {showTeachingFinancialColumns && (
                          <>
                            <th className="w-24 border border-slate-200 px-1 py-1 text-center">Số tiền 1 tiết</th>
                            <th className="w-24 border border-slate-200 px-1 py-1 text-center">Số tiền</th>
                          </>
                        )}
                        {showTeachingSchoolColumns && (
                          <>
                            <th className="w-16 border border-slate-200 px-1 py-1 text-center">Tiết ở trường</th>
                            <th className="w-16 border border-slate-200 px-1 py-1 text-center">Tổng cộng</th>
                          </>
                        )}
                        <th className="w-28 border border-slate-200 px-1 py-1 text-center">Dòng</th>
                      </tr>
                      <tr className="bg-slate-50 text-center text-[10px] font-semibold text-slate-400">
                        {Array.from({
                          length: 12
                            + (isThdTeachingPanel ? 1 : 0)
                            + (!isThdTeachingPanel ? 1 : 0)
                            + (showTeachingFinancialColumns ? 2 : 0)
                            + (showTeachingSchoolColumns ? 2 : 0)
                            + 1
                        }, (_, columnIndex) => (
                          <th key={`teaching-column-number-${columnIndex}`} className="border border-slate-200 px-1 py-0.5">
                            {columnIndex + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTeachingRows.length === 0 && (
                        <tr>
                          <td colSpan={24} className="border border-slate-200 px-3 py-6 text-center text-sm font-semibold text-slate-500">
                            Không có giáo viên phù hợp với bộ lọc này.
                          </td>
                        </tr>
                      )}
                      {renderedTeachingRows.map(({ row, sourceIndex }, index) => {
                        const rowMeta = visibleTeachingRowMeta[index] || {};
                        const teacherKey = normalizeTeacherNameKey(row.teacherName);
                        const periodsPerClassWeek = getPeriodsPerClassWeek(row);
                        const totalPerWeek = getVisibleWeeklyPeriods(row);
                        const totalPeriods = getTotalPeriods(row);
                        const noteText = getAssignmentNote(row);
                        const noteInputValue = row.note ? mergeTeachingNote(noteText, row.note) : noteText;
                        const liveCheckNote = isThdTeachingPanel ? (rowMeta.liveCheckNote || row.pastedNote || '') : (row.pastedNote || '');
                        const hasVisibleTeachingRow = Boolean(row.teacherName || row.assignment || row.specialty);
                        const showSummaryRow = hasVisibleTeachingRow ? rowMeta.isGroupEnd : true;
                        const isContinuationRow = rowMeta.isContinuation;
                        const teacherSequenceNumber = isContinuationRow ? '' : rowMeta.sequenceNumber;
                        const teacherSuggestions = activeTeacherPickerIndex === sourceIndex ? getTeacherSuggestions(row.teacherName) : [];
                        const currentGroupBounds = teachingGroupBoundsBySourceIndex.get(sourceIndex) || { start: sourceIndex, end: sourceIndex };
                        const canMoveTeacherUp = currentGroupBounds.start > 0;
                        const canMoveTeacherDown = currentGroupBounds.end < teachingRowsForSelectedYear.length - 1;
                        const teacherYearTotal = teacherKey ? (teachingTeacherTotalsByKey.yearTotals.get(teacherKey) || '') : '';
                        const teacherSchoolPeriods = getTeacherSchoolPeriods(row.teacherName);
                        const teacherGrandTotal = (Number(teacherYearTotal) || 0) + teacherSchoolPeriods;
                        const teacherMoneyRate = getTeacherMoneyRate(row.teacherName);
                        const assignmentMoney = getTeachingAssignmentMoney(row);
                        const teacherMoneyTotal = teacherKey ? (teachingTeacherTotalsByKey.moneyTotals.get(teacherKey) || 0) : 0;
                        const teacherRequiredPeriodsPerWeek = getTeachingRequiredPeriodsPerWeek(row.position);
                        const teacherRequiredYearTotal = getTeachingRequiredYearTotal(row.position);
                        const specialtyToneClass = getTeachingSubjectToneClass(row.specialty);
                        const assignmentToneClass = getTeachingSubjectToneClass(row.assignment);
                        const configuredPeriods = isThdTeachingPanel ? normalizePeriods(getConfiguredAssignmentPeriods(row.assignment, row)) : '';
                        const hasAssignedClasses = getAssignmentClassList(row.className, activeAssignmentClasses).length > 0;
                        const periodInputValue = configuredPeriods && hasAssignedClasses ? configuredPeriods : (row.periodsPerClassWeek || '');
                        return (
                          <Fragment key={`teaching-assignment-${sourceIndex}`}>
                          <tr className="bg-white hover:bg-cyan-50/40">
                            <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold text-slate-500">{teacherSequenceNumber}</td>
                            <td className="relative border border-slate-200 px-0.5 py-0.5">
                              {isContinuationRow ? <div className="h-7" /> : (
                                <div className="relative">
                                  <input
                                    value={row.teacherName}
                                    disabled={!canEditTeachingRows}
                                    onFocus={(event) => openTeacherPicker(sourceIndex, event.currentTarget)}
                                    onBlur={() => window.setTimeout(() => setActiveTeacherPickerIndex(current => (current === sourceIndex ? null : current)), 140)}
                                    onChange={(event) => {
                                      openTeacherPicker(sourceIndex, event.currentTarget);
                                      updateTeachingAssignmentRow(sourceIndex, { teacherName: event.target.value });
                                    }}
                                    placeholder="Gõ tên không dấu..."
                                    className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] font-semibold outline-none focus:border-cyan-400"
                                  />
                                  {activeTeacherPickerIndex === sourceIndex && teacherSuggestions.length > 0 && createPortal((
                              <div
                                data-teaching-own-scroll="true"
                                className="fixed z-[300] max-h-[220px] overflow-y-auto rounded-xl border border-cyan-100 bg-white p-1 shadow-2xl"
                                      style={{
                                        top: `${teacherPickerPosition.top}px`,
                                        left: `${teacherPickerPosition.left}px`,
                                        width: `${teacherPickerPosition.width}px`,
                                        maxWidth: 'calc(100vw - 48px)'
                                      }}
                                    >
                                      {teacherSuggestions.map(teacher => (
                                        <button
                                          type="button"
                                          key={`teacher-pick-${sourceIndex}-${teacher.name}`}
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            pickTeachingTeacher(sourceIndex, teacher);
                                          }}
                                          className="block w-full rounded-lg px-3 py-2 text-left hover:bg-cyan-50"
                                        >
                                          <div className="text-sm font-semibold text-slate-800">{teacher.name}</div>
                                          {teacher.subject && <div className="text-[11px] font-medium text-slate-500">{teacher.subject}</div>}
                                        </button>
                                      ))}
                                    </div>
                                  ), document.body)}
                                </div>
                              )}
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              {isContinuationRow ? <div className="h-7" /> : (
                                <select
                                  value={row.position || 'GV'}
                                  disabled={!canEditTeachingRows}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { position: event.target.value })}
                                  className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none focus:border-cyan-400"
                                >
                                  {POSITION_OPTIONS.map(position => <option key={position} value={position}>{position}</option>)}
                                </select>
                              )}
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              {isContinuationRow ? <div className="h-7" /> : (
                                <input
                                  value={abbreviateTeachingSpecialty(row.specialty)}
                                  disabled={!canEditTeachingRows}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { specialty: event.target.value })}
                                  list="assignment-specialties"
                                  placeholder="Tự lấy theo GV..."
                                  className={`h-7 w-full rounded-md border px-2 text-[13px] font-normal outline-none transition-colors ${specialtyToneClass}`}
                                />
                              )}
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              {isThdTeachingPanel ? (
                                <input
                                  value={row.assignment || ''}
                                  disabled={!canEditTeachingRows}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { assignment: event.target.value })}
                                  list="thd-assignment-short-names"
                                  placeholder="Nhập môn/phân công..."
                                  className={`h-7 w-full rounded-md border px-2 text-[13px] font-normal outline-none transition-colors ${assignmentToneClass}`}
                                />
                              ) : (
                                <select
                                  value={row.assignment || ''}
                                  disabled={!canEditTeachingRows}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { assignment: event.target.value })}
                                  className={`h-7 w-full rounded-md border px-2 text-[13px] font-normal outline-none transition-colors ${assignmentToneClass}`}
                                >
                                  <option value="">Chọn</option>
                                  {ASSIGNMENT_SUBJECT_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              <input
                                value={row.weeks}
                                disabled={!canEditTeachingRows}
                                onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { weeks: event.target.value })}
                                inputMode="numeric"
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none focus:border-cyan-400"
                              />
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              <button
                                type="button"
                                data-class-picker-button
                                disabled={!canEditTeachingRows}
                                onClick={(event) => openClassPicker(sourceIndex, event.currentTarget)}
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none hover:bg-cyan-50 focus:border-cyan-400 disabled:opacity-60"
                              >
                                {row.className || 'Chọn'}
                              </button>
                              {activeClassPickerIndex === sourceIndex && createPortal((
                                <div
                                  data-class-picker-popup
                                  className="fixed z-[300] overflow-hidden rounded-xl border border-cyan-100 bg-white shadow-2xl"
                                  style={{
                                    top: `${classPickerPosition.top}px`,
                                    left: `${classPickerPosition.left}px`,
                                    width: `${classPickerPosition.width}px`,
                                    maxWidth: 'calc(100vw - 48px)',
                                    maxHeight: '360px'
                                  }}
                                >
                                  <div className="flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2">
                                    <span className="text-xs font-semibold uppercase text-slate-500">Chọn lớp</span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveClassPickerIndex(null)}
                                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                                      title="Đóng"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <div data-teaching-own-scroll="true" className="max-h-[310px] overflow-y-auto p-1 overscroll-contain">
                                    {activeAssignmentClasses.map(className => {
                                      const checked = getAssignmentClassList(row.className, activeAssignmentClasses).includes(className);
                                      return (
                                        <label key={`class-pick-${sourceIndex}-${className}`} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-cyan-50">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleTeachingClass(sourceIndex, className)}
                                            className="h-4 w-4 accent-cyan-600"
                                          />
                                          <span>{className}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              ), document.body)}
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              <input
                                value={row.classCount}
                                disabled={!canEditTeachingRows}
                                onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { classCount: event.target.value })}
                                inputMode="numeric"
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none focus:border-cyan-400"
                              />
                            </td>
                            <td className="w-12 min-w-[3.25rem] max-w-[3.25rem] border border-slate-200 px-0.5 py-0.5 text-center font-normal text-slate-700">
                              {isThdTeachingPanel ? (
                                <input
                                  value={periodInputValue}
                                  disabled={!canEditTeachingRows}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { periodsPerClassWeek: event.target.value })}
                                  inputMode="decimal"
                                  placeholder={String(periodsPerClassWeek || '')}
                                  className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-normal outline-none focus:border-cyan-400"
                                />
                              ) : periodsPerClassWeek}
                            </td>
                            <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{totalPerWeek}</td>
                            <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{totalPeriods}</td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              <textarea
                                key={`teaching-note-${sourceIndex}-${noteInputValue}`}
                                defaultValue={noteInputValue}
                                disabled={!canEditTeachingRows}
                                onBlur={(event) => updateTeachingAssignmentRow(sourceIndex, { note: mergeTeachingNote(noteText, event.target.value) })}
                                onFocus={(event) => {
                                  if (!event.currentTarget.value && noteText) event.currentTarget.value = noteText;
                                  const end = event.currentTarget.value.length;
                                  event.currentTarget.setSelectionRange(end, end);
                                }}
                                rows={Math.max(1, String(noteInputValue || noteText || '').split('\n').length)}
                                placeholder={noteText || 'Ghi chú...'}
                                className="min-h-7 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] font-normal leading-snug outline-none focus:border-cyan-400"
                              />
                            </td>
                            {isThdTeachingPanel && (!isTeachingSummaryView || !isContinuationRow) && (
                              <td rowSpan={isTeachingSummaryView ? rowMeta.checkRowSpan : undefined} className="border border-slate-200 px-0.5 py-0.5 align-top">
                                <div
                                  key={`teaching-pasted-note-${sourceIndex}-${liveCheckNote || ''}`}
                                  className="min-h-7 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-normal leading-snug text-slate-500"
                                >
                                  {liveCheckNote || ''}
                                </div>
                              </td>
                            )}
                            {!isThdTeachingPanel && (
                            <td className="border border-slate-200 px-1 py-0.5 text-center">
                              <input
                                type="checkbox"
                                checked={Boolean(row.transcriptSigner)}
                                disabled={!canEditTeachingRows}
                                onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { transcriptSigner: event.target.checked })}
                                className="h-4 w-4 accent-violet-600"
                                title="Giáo viên ký học bạ cho môn/lớp này"
                              />
                            </td>
                            )}
                            {showTeachingFinancialColumns && (
                              <>
                                <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{formatMoney(teacherMoneyRate)}</td>
                                <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{formatMoney(assignmentMoney)}</td>
                              </>
                            )}
                            {showTeachingSchoolColumns && (
                              <>
                                <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{teacherSchoolPeriods || ''}</td>
                                <td className="border border-slate-200 px-1 py-0.5 text-center font-normal text-slate-700">{teacherGrandTotal || ''}</td>
                              </>
                            )}
                            <td className="border border-slate-200 px-0.5 py-0.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button type="button" onClick={() => moveTeachingAssignmentGroup(sourceIndex, -1)} disabled={!canEditTeachingRows || !canMoveTeacherUp} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời giáo viên lên">
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => moveTeachingAssignmentGroup(sourceIndex, 1)} disabled={!canEditTeachingRows || !canMoveTeacherDown} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời giáo viên xuống">
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => addTeachingAssignmentForSameTeacher(sourceIndex)} disabled={!canEditTeachingRows} className="h-7 w-7 rounded-md border border-cyan-200 bg-white text-cyan-700 font-black hover:bg-cyan-50 disabled:opacity-30" title="Thêm phân công cho giáo viên này">+</button>
                                <button type="button" onClick={() => deleteTeachingAssignmentRow(sourceIndex)} disabled={!canEditTeachingRows} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-30" title="Xóa dòng">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {showSummaryRow && (isThdTeachingPanel ? (
                            <>
                              <tr className="bg-amber-100">
                                <td colSpan={10} className="border border-amber-300 px-2 py-0.5 text-[13px] font-normal italic text-amber-950">
                                  Số tiết/năm học
                                </td>
                                <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-normal italic text-amber-950">
                                  {teacherYearTotal || ''}
                                </td>
                                <td className="border border-amber-300 px-1 py-0.5" />
                                <td className="border border-amber-300 px-1 py-0.5" />
                                <td className="border border-amber-300 px-1 py-0.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => deleteTeachingTeacherGroup(sourceIndex)}
                                    disabled={!canEditTeachingRows}
                                    className="h-6 rounded-md border border-rose-200 bg-white px-2 text-[11px] font-black not-italic text-rose-700 hover:bg-rose-50 disabled:opacity-30"
                                  >
                                    Xóa GV
                                  </button>
                                </td>
                              </tr>
                              <tr className="bg-amber-100">
                                <td colSpan={10} className="border border-amber-300 px-2 py-0.5 text-[13px] font-normal italic text-amber-950">
                                  Số tiết nghĩa vụ/năm học
                                </td>
                                <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-normal italic text-amber-950">
                                  {teacherRequiredYearTotal}
                                </td>
                                <td className="border border-amber-300 px-1 py-0.5" />
                                <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-normal italic text-amber-950">
                                  {teacherRequiredPeriodsPerWeek} tiết/tuần
                                </td>
                                <td className="border border-amber-300 px-1 py-0.5" />
                              </tr>
                              <tr className="bg-amber-100">
                                <td colSpan={10} className="border border-amber-300 px-2 py-0.5 text-[13px] font-black italic text-red-600">
                                  Số tiết dư giờ/năm học
                                </td>
                                <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-red-600">
                                  {(Number(teacherYearTotal) || 0) - teacherRequiredYearTotal}
                                </td>
                                <td className="border border-amber-300 px-1 py-0.5" />
                                <td className="border border-amber-300 px-1 py-0.5" />
                                <td className="border border-amber-300 px-1 py-0.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => addTeachingTeacherAfterGroup(sourceIndex)}
                                    className="h-6 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-black not-italic text-amber-800 hover:bg-amber-50"
                                  >
                                    + Thêm GV
                                  </button>
                                </td>
                              </tr>
                            </>
                          ) : (
                            <tr className="bg-amber-100">
                              <td colSpan={10} className="border border-amber-300 px-2 py-0.5 text-[13px] font-black italic text-amber-950">
                                Số tiết dạy phổ cập/năm học
                              </td>
                              <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-amber-950">
                                {teacherYearTotal || ''}
                              </td>
                              <td className="border border-amber-300 px-1 py-0.5" />
                              <td className="border border-amber-300 px-1 py-0.5" />
                              {showTeachingFinancialColumns && (
                                <>
                                  <td className="border border-amber-300 px-1 py-0.5" />
                                  <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-amber-950">
                                    {formatMoney(teacherMoneyTotal)}
                                  </td>
                                </>
                              )}
                              {showTeachingSchoolColumns && (
                                <>
                                  <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-amber-950">
                                    {teacherSchoolPeriods || ''}
                                  </td>
                                  <td className="border border-amber-300 px-1 py-0.5 text-center text-[13px] font-black italic text-amber-950">
                                    {teacherGrandTotal || ''}
                                  </td>
                                </>
                              )}
                              <td className="border border-amber-300 px-1 py-0.5 text-center">
                                <div className="grid grid-cols-2 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => deleteTeachingTeacherGroup(sourceIndex)}
                                    disabled={!canEditTeachingRows}
                                    className="inline-flex h-7 min-w-0 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-30"
                                    title="Xóa GV"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => addTeachingTeacherAfterGroup(sourceIndex)}
                                    disabled={!canEditTeachingRows}
                                    className="h-7 min-w-0 rounded-md border border-cyan-200 bg-cyan-50 text-base font-black leading-none text-cyan-700 hover:bg-cyan-100 disabled:opacity-30"
                                    title="Thêm GV"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          </Fragment>
                        );
                      })}
                      {visibleTeachingRows.length > renderedTeachingRows.length && (
                        <tr>
                          <td colSpan={24} className="border border-slate-200 px-3 py-3 text-center text-xs font-semibold text-slate-500">
                            <button
                              type="button"
                              onClick={loadMoreTeachingRows}
                              className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 font-black text-sky-700 hover:bg-sky-100"
                            >
                              Tải thêm dòng {renderedTeachingRows.length}/{visibleTeachingRows.length}
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activePanel === 'classTeachers' && (
              <div className="space-y-2">
                <div className="rounded-2xl border border-violet-100 bg-white px-3 py-2 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase text-violet-900">Năm học phân công</div>
                      <div className="text-lg font-semibold leading-tight text-violet-950">{selectedSchoolYear}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={saveAll}
                        disabled={!hasChanges}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${hasChanges ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}
                      >
                        <Save className="h-4 w-4" /> Lưu
                      </button>
                      <button
                        type="button"
                        onClick={loadClassTeachersFromTeachingAssignments}
                        className="h-8 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                      >
                        Load từ phân công
                      </button>
                      <button type="button" onClick={clearClassTeacherAssignmentsByYear} className="h-8 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                        Xóa hết năm này
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {grades.map(grade => (
                    <div key={`class-${grade}`} className="rounded-2xl border border-violet-100 bg-white p-2 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold uppercase text-violet-900">Khối {grade}</div>
                      <button
                        type="button"
                        onClick={() => clearClassTeacherAssignmentsByGrade(grade)}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold uppercase text-rose-700 hover:bg-rose-100"
                      >
                        Xóa
                      </button>
                    </div>
                    <table className="w-full border-separate border-spacing-y-1">
                      <thead>
                        <tr className="text-left text-[10px] font-semibold uppercase text-slate-500">
                          <th className="w-7 px-1">STT</th>
                          <th className="w-24 px-1">Môn</th>
                          <th className="px-1">HK1</th>
                          <th className="px-1">HK2</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classSubjects(subjects).map((subject, index) => (
                          <tr key={`${grade}-${subject}`} className="bg-slate-50">
                            <td className="rounded-l-lg px-1 py-1 text-center text-xs font-semibold text-slate-500">{index + 1}</td>
                            <td className="px-1 py-1 text-[11px] font-semibold text-slate-800">{normalizeAssignmentSubject(subject)}</td>
                            <td className="px-1 py-1">
                              <input
                                value={assignmentValue(grade, subject, 'hk1')}
                                onChange={(event) => updateAssignment(grade, subject, event.target.value, 'hk1')}
                                list="nan-teacher-names"
                                placeholder="GV HK1..."
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold outline-none focus:border-violet-400"
                              />
                            </td>
                            <td className="rounded-r-lg px-1 py-1">
                              <input
                                value={assignmentValue(grade, subject, 'hk2')}
                                onChange={(event) => updateAssignment(grade, subject, event.target.value, 'hk2')}
                                list="nan-teacher-names"
                                placeholder="GV HK2..."
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold outline-none focus:border-violet-400"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  ))}
                </div>
            </div>
            )}
            {showTeachingTimeSettings && createPortal((
              <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/45 p-3">
                <div className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-3xl border border-indigo-100 bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-100 p-4">
                    <div>
                      <div className="text-xs font-black uppercase text-indigo-700">Cài đặt phân công</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{selectedSchoolYear}</div>
                    </div>
                    <button type="button" onClick={() => setShowTeachingTimeSettings(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Đóng">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setTeachingSettingsTab('time')}
                      className={`h-9 rounded-xl px-4 text-sm font-black ${teachingSettingsTab === 'time' ? 'bg-indigo-600 text-white shadow' : 'border border-indigo-100 bg-white text-indigo-700 hover:bg-indigo-50'}`}
                    >
                      Cài đặt thời gian
                    </button>
                    {isThdTeachingPanel && hasTeachingBatches && (
                      <button
                        type="button"
                        onClick={() => {
                          if (teachingSettingsTab !== 'weeks') openTeachingWeekSettings();
                        }}
                        className={`h-9 rounded-xl px-4 text-sm font-black ${teachingSettingsTab === 'weeks' ? 'bg-sky-600 text-white shadow' : 'border border-sky-100 bg-white text-sky-700 hover:bg-sky-50'}`}
                      >
                        Cài đặt số tuần
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto p-4">
                    {teachingSettingsTab === 'weeks' && isThdTeachingPanel && hasTeachingBatches ? (
                      <table className="w-full min-w-[680px] border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-100 text-left text-xs font-black uppercase text-slate-600">
                            <th className="w-14 border border-slate-200 px-3 py-2 text-center">STT</th>
                            <th className="border border-slate-200 px-3 py-2">Đợt</th>
                            <th className="w-44 border border-slate-200 px-3 py-2 text-center">Ngày áp dụng</th>
                            <th className="w-28 border border-slate-200 px-3 py-2 text-center">Số tuần</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teachingBatchesForSelectedYear.map((batch, index) => (
                            <tr key={`teaching-batch-week-${batch.id}`} className="bg-white">
                              <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-500">{index + 1}</td>
                              <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800">{batch.name || `Đợt ${index + 1}`}</td>
                              <td className="border border-slate-200 px-3 py-2 text-center text-slate-700">
                                {batch.startDate && batch.endDate ? `${formatDateForNote(batch.startDate)} - ${formatDateForNote(batch.endDate)}` : 'Chưa có ngày'}
                              </td>
                              <td className="border border-slate-200 px-3 py-2">
                                <input
                                  value={teachingBatchWeeksDraft[batch.id] ?? ''}
                                  onChange={(event) => {
                                    const value = event.target.value.replace(/[^\d.,]/g, '').slice(0, 5);
                                    setTeachingBatchWeeksDraft(prev => ({ ...prev, [batch.id]: value }));
                                  }}
                                  onBlur={() => {
                                    setTeachingBatchWeeksDraft(prev => ({
                                      ...prev,
                                      [batch.id]: normalizePeriods(prev[batch.id]) || normalizePeriods(batch.weeks) || '1'
                                    }));
                                  }}
                                  inputMode="decimal"
                                  className="h-9 w-full rounded-xl border border-sky-100 bg-white px-3 text-center font-black text-slate-800 outline-none focus:border-sky-400"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {[
                          ['hk1Start', 'HK1 bắt đầu'],
                          ['hk1End', 'HK1 kết thúc'],
                          ['hk2Start', 'HK2 bắt đầu'],
                          ['hk2End', 'HK2 kết thúc'],
                          ['break1Start', 'Nghỉ 1 bắt đầu'],
                          ['break1End', 'Nghỉ 1 kết thúc'],
                          ['break2Start', 'Nghỉ 2 bắt đầu'],
                          ['break2End', 'Nghỉ 2 kết thúc'],
                          ['break3Start', 'Nghỉ 3 bắt đầu'],
                          ['break3End', 'Nghỉ 3 kết thúc'],
                          ['break4Start', 'Nghỉ 4 bắt đầu'],
                          ['break4End', 'Nghỉ 4 kết thúc']
                        ].map(([field, label]) => (
                          <label key={`teaching-semester-date-${field}`} className="block">
                            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{label}</div>
                            <input
                              type="date"
                              value={teachingSemesterDatesForYear[field] || ''}
                              min={teachingDateInputMin}
                              max={teachingDateInputMax}
                              onChange={(event) => updateTeachingSemesterDate(field, event.target.value)}
                              className="h-10 w-full rounded-xl border border-indigo-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400"
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
                    <button type="button" onClick={() => setShowTeachingTimeSettings(false)} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      Đóng
                    </button>
                    <button type="button" onClick={() => { if (teachingSettingsTab === 'weeks' && isThdTeachingPanel && hasTeachingBatches) saveTeachingBatchWeeks(); else { setShowTeachingTimeSettings(false); saveAll(); } }} className="h-9 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
                      Lưu
                    </button>
                  </div>
                </div>
              </div>
            ), document.body)}
            {showNewTeachersModal && createPortal((
              <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/45 p-3">
                <div className="flex max-h-[82vh] w-full max-w-2xl flex-col rounded-3xl border border-amber-100 bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-100 p-4">
                    <div>
                      <div className="text-xs font-black uppercase text-amber-700">Giáo viên mới so với đợt trước</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{activeTeachingBatch?.name || ''}</div>
                    </div>
                    <button type="button" onClick={() => setShowNewTeachersModal(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Đóng">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="overflow-auto p-4">
                    {!previousTeachingBatch && (
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                        Đây là đợt đầu tiên nên chưa có đợt trước để đối chiếu.
                      </div>
                    )}
                    {previousTeachingBatch && !newTeachersComparedToPreviousBatch.length && (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                        Không có giáo viên mới so với đợt trước.
                      </div>
                    )}
                    {newTeachersComparedToPreviousBatch.length > 0 && (
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
                            <th className="w-12 border border-slate-200 px-2 py-2 text-center">STT</th>
                            <th className="border border-slate-200 px-2 py-2">Họ và tên</th>
                            <th className="w-28 border border-slate-200 px-2 py-2">Chuyên môn</th>
                            <th className="w-28 border border-slate-200 px-2 py-2">Chức vụ</th>
                            <th className="w-40 border border-slate-200 px-2 py-2">Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody>
                          {newTeachersComparedToPreviousBatch.map((row, index) => (
                            <tr key={`new-teacher-${normalizeTeacherNameKey(row.teacherName)}`} className="bg-white">
                              <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-500">{index + 1}</td>
                              <td className="border border-slate-200 px-2 py-1.5 font-semibold text-slate-800">{row.teacherName}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.specialty}</td>
                              <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.position}</td>
                              <td className="whitespace-pre-wrap border border-slate-200 px-2 py-1.5 text-slate-600">{row.note || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            ), document.body)}
            {showTeachingCheckModal && createPortal((
              <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/45 p-3">
                <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-3xl border border-amber-100 bg-white shadow-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                    <div>
                      <div className="text-xs font-black uppercase text-amber-700">Kiểm tra phân công</div>
                      <div className="mt-1 text-xl font-black text-slate-900">{selectedSchoolYear}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                      <label className="flex h-9 items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 text-amber-800">
                        <span>Tuần</span>
                        <input
                          value={teachingCheckWeeks}
                          onChange={(event) => setTeachingCheckWeeks(event.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
                          onBlur={() => {
                            if (!normalizePeriods(teachingCheckWeeks)) setTeachingCheckWeeks('35');
                          }}
                          className="h-7 w-14 rounded-lg border border-amber-200 bg-white px-2 text-center text-sm font-black text-slate-800 outline-none focus:border-amber-400"
                        />
                      </label>
                      <button type="button" onClick={() => setTeachingCheckFilter('all')} className={`rounded-full px-3 py-1 transition-colors ${teachingCheckResultFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                        Tất cả: {teachingCheckRows.length}
                      </button>
                      <button type="button" onClick={() => setTeachingCheckFilter('ok')} className={`rounded-full px-3 py-1 transition-colors ${teachingCheckResultFilter === 'ok' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                        Đủ: {teachingCheckSummary.ok}
                      </button>
                      <button type="button" onClick={() => setTeachingCheckFilter('missing')} className={`rounded-full px-3 py-1 transition-colors ${teachingCheckResultFilter === 'missing' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}>
                        Thiếu: {teachingCheckSummary.missing}
                      </button>
                      <button type="button" onClick={() => setTeachingCheckFilter('excess')} className={`rounded-full px-3 py-1 transition-colors ${teachingCheckResultFilter === 'excess' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                        Dư: {teachingCheckSummary.excess}
                      </button>
                      <button type="button" onClick={() => setShowTeachingCheckModal(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Đóng">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="overflow-auto p-4">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {teachingCheckClassesForDisplay.map(className => {
                        const classRows = teachingCheckRowsForDisplay.filter(row => row.className === className);
                        return (
                          <div key={`teaching-check-${className}`} className="overflow-hidden rounded-2xl border border-slate-200">
                            <div className="bg-slate-100 px-3 py-2 text-sm font-black text-slate-800">{className}</div>
                            <table className="w-full border-collapse text-sm">
                              <thead>
                                <tr className="bg-slate-50 text-left text-[11px] font-black uppercase text-slate-500">
                                  <th className="border border-slate-200 px-2 py-2">Môn</th>
                                  <th className="w-20 border border-slate-200 px-2 py-2 text-center">Cần</th>
                                  <th className="w-20 border border-slate-200 px-2 py-2 text-center">Có</th>
                                  <th className="w-24 border border-slate-200 px-2 py-2 text-center">Kết quả</th>
                                  <th className="border border-slate-200 px-2 py-2">GV</th>
                                </tr>
                              </thead>
                              <tbody>
                                {classRows.map(row => {
                                  const statusClass = row.diff === 0
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : (row.diff < 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700');
                                  const statusText = row.diff === 0 ? 'Đủ' : (row.diff < 0 ? `Thiếu ${Math.abs(row.diff)}` : `Dư ${row.diff}`);
                                  return (
                                    <tr key={`${row.className}-${row.subject}`} className="bg-white">
                                      <td className="border border-slate-200 px-2 py-1.5 font-semibold text-slate-800">{row.subject}</td>
                                      <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{row.expected}</td>
                                      <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{row.actual || ''}</td>
                                      <td className="border border-slate-200 px-2 py-1.5 text-center">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-black ${statusClass}`}>{statusText}</span>
                                      </td>
                                      <td className="border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600">{row.teachers || '-'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                      {teachingCheckClassesForDisplay.length === 0 && (
                        <div className="xl:col-span-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                          Không có lớp/môn phù hợp với bộ lọc này.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ), document.body)}
          </div>
      </div>
    </div>
  );
}
