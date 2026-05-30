import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, CalendarDays, ClipboardCheck, ClipboardPaste, Download, FileSpreadsheet, FileText, Filter, Plus, Save, Trash2, X } from 'lucide-react';

const emptyTeacher = () => ({ name: '', subject: '', grades: [], periods: '', moneyPerPeriod: '' });
const emptyThdTeacher = () => ({ name: '', subject: '', position: 'GV', note: '' });
const emptyThdSubject = () => ({ name: '', shortName: '' });
const THD_CLASS_GRADES = ['6', '7', '8', '9'];
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
  transcriptSigner: false
});

const normalizeClassName = (value = '') => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

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
  shortName: String(subject.shortName || subject.abbrev || subject.code || '').trim()
});

const cleanThdSubjectRowsForSave = (rows = []) => rows
  .map(normalizeThdSubject)
  .filter(item => item.name || item.shortName);

const cleanThdTeacherRowsForSave = (rows = []) => rows
  .map(normalizeThdTeacher)
  .filter(item => item.name || item.subject || item.note);

const cleanTeacherRowsForSave = (rows = []) => rows
  .map(normalizeTeacher)
  .filter(item => item.name || item.subject || item.periods || item.moneyPerPeriod);

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
  { label: 'C nghệ', value: 'C nghệ', aliases: ['Công nghệ'] },
  { label: 'Chủ nhiệm', value: 'Chủ nhiệm', aliases: ['Chủ nhiệm', 'GVCN', 'GV chủ nhiệm', 'Giáo viên chủ nhiệm'] }
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
  { label: 'C nghệ', value: 'C nghệ', aliases: ['Công nghệ'] },
  { label: 'Chủ nhiệm', value: 'Chủ nhiệm', aliases: ['Chủ nhiệm', 'GVCN', 'GV chủ nhiệm', 'Giáo viên chủ nhiệm'] }
];

const DEFAULT_THD_SUBJECTS = [
  { name: 'Toán', shortName: 'Toán' },
  { name: 'Ngữ văn', shortName: 'Văn' },
  { name: 'Tiếng Anh', shortName: 'Tiếng Anh' },
  { name: 'Khoa học tự nhiên', shortName: 'KHTN' },
  { name: 'Lịch sử và Địa lí', shortName: 'LS&ĐL' },
  { name: 'Công nghệ', shortName: 'C nghệ' },
  { name: 'Tin học', shortName: 'Tin học' },
  { name: 'Giáo dục thể chất', shortName: 'GDTC' },
  { name: 'Giáo dục công dân', shortName: 'GDCD' },
  { name: 'Mĩ thuật', shortName: 'MT' },
  { name: 'Âm nhạc', shortName: 'AN' },
  { name: 'Giáo dục địa phương', shortName: 'GDĐP' },
  { name: 'Chủ nhiệm', shortName: 'GVCN' },
  { name: 'Bí thư Chi đoàn', shortName: 'BTCD' },
  { name: 'Chủ tịch Công đoàn', shortName: 'CTCĐ' },
  { name: 'Hậu sản', shortName: 'Hậu sản' },
  { name: 'Con nhỏ dưới 12 tháng tuổi', shortName: '< 12 tháng tuổi' },
  { name: 'Hoạt động trải nghiệm chủ đề', shortName: 'TN (CĐ)' },
  { name: 'Hoạt động trải nghiệm sinh hoạt lớp', shortName: 'TN (SHL)' },
  { name: 'Hoạt động trải nghiệm SHL và chủ đề', shortName: 'TN (SHL, CĐ)' },
  { name: 'Hoạt động trải nghiệm lớp 7/10 chủ đề', shortName: 'TN 7/10 (CĐ)' },
  { name: 'Hoạt động trải nghiệm lớp 9/2 chủ đề', shortName: 'TN 9/2 (CĐ)' },
  { name: 'Hoạt động trải nghiệm lớp 9/6 chủ đề', shortName: 'TN 9/6 (CĐ)' },
  { name: 'Hoạt động trải nghiệm lớp 9/8 chủ đề', shortName: 'TN 9/8 (CĐ)' },
  { name: 'Nghỉ việc', shortName: 'nghỉ việc' },
  { name: 'Thực hành Hóa', shortName: 'TH HÓA' },
  { name: 'Thực hành Sinh', shortName: 'TH SINH' },
  { name: 'Thực hành Lý', shortName: 'TH LÝ' },
  { name: 'Thực hành Tin 1', shortName: 'TH TIN 1' },
  { name: 'Thực hành Tin 2', shortName: 'TH TIN 2' },
  { name: 'Phụ trách thiết bị', shortName: 'P.TB' },
  { name: 'Thư ký hội đồng', shortName: 'TKHĐ' },
  { name: 'Tuyển sinh 10', shortName: 'TS 10' },
  { name: 'Tuyển sinh 10', shortName: 'TS10' },
  { name: 'Tổ trưởng Công đoàn', shortName: 'TTCĐ' },
  { name: 'Tổ trưởng chuyên môn', shortName: 'TTCM' },
  { name: 'Thanh tra nhân dân', shortName: 'TTND' },
  { name: 'Tư vấn học đường', shortName: 'TVHĐ' },
  { name: 'Trưởng ban Chấp hành Công đoàn', shortName: 'TBCHCĐ' }
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
  const startIndex = normalizedOptions.indexOf(normalizeClassName(start));
  const endIndex = normalizedOptions.indexOf(normalizeClassName(end));
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
  const rangePattern = /(\d+(?:[A-Z]+|\/)?\d*)\s*(?:-+>|→|–|—|-|đến|den)\s*(\d+(?:[A-Z]+|\/)?\d*)/gi;
  let rangeMatch = rangePattern.exec(text);
  while (rangeMatch) {
    found.push(...expandClassRange(rangeMatch[1], rangeMatch[2], classOptions));
    rangeMatch = rangePattern.exec(text);
  }
  const withoutRanges = text.replace(rangePattern, ' ');
  withoutRanges
    .split(/[,;()\s]+/)
    .map(normalizeClassName)
    .filter(Boolean)
    .forEach(token => {
      if (optionSet.has(token)) found.push(token);
    });
  if (found.length) return [...new Set(found)].filter(className => optionSet.has(className));
  const trimmed = text.replace(/\s+/g, '');
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

const normalizeTeachingAssignment = (row = {}, classOptions = ASSIGNMENT_CLASSES) => {
  const hasExplicitBlankClass = Object.prototype.hasOwnProperty.call(row, 'className') && !String(row.className || '').trim();
  const classSource = row.className ?? row.classAssigned ?? classOptions[0] ?? '6PC';
  const selectedClasses = getAssignmentClassList(classSource, classOptions);
  return ({
  teacherName: String(row.teacherName || row.name || '').replace(/\s{2,}/g, ' '),
  position: normalizeTeachingPosition(row.position || 'GV'),
  specialty: String(row.specialty || row.subject || '').trim(),
  assignment: normalizeAssignmentSubject(row.assignment || row.assignedSubject || ''),
  weeks: String(row.weeks ?? '').trim(),
  className: compactAssignmentClassLabel(selectedClasses, classOptions) || (hasExplicitBlankClass ? '' : classOptions[0] || '6PC'),
  classCount: String(selectedClasses.length || row.classCount || (hasExplicitBlankClass ? '' : '1')).trim(),
  periodsPerClassWeek: normalizePeriods(row.periodsPerClassWeek ?? row.periodsPerClass ?? row.lessonPerClass ?? ''),
  totalPeriodsPerWeek: normalizePeriods(row.totalPeriodsPerWeek ?? row.totalWeeklyPeriods ?? row.weeklyPeriods ?? ''),
  note: String(row.note || '').trim(),
  pastedNote: String(row.pastedNote || row.sourceNote || row.aiNote || '').trim(),
  transcriptSigner: Boolean(row.transcriptSigner || row.signTranscript || row.isTranscriptSigner)
  });
};

const stripPasteCell = (value = '') => String(value || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/^'/, '')
  .trim();

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
    totalPeriodsPerWeek: ['tong so tiet tuan', 'tong tiet tuan', 'tong so tiet'],
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

const isIgnoredTeachingPasteNote = (value = '') => {
  const key = normalizeTeacherNameKey(value);
  return key.includes('kns') || key.includes('stem') || key.includes('ki nang song');
};

const buildTeachingPastedNote = (checkValue = '', noteValue = '') => {
  const check = stripPasteCell(checkValue);
  const note = stripPasteCell(noteValue);
  if (check) return check;
  return isIgnoredTeachingPasteNote(note) ? '' : note;
};

const parseTeachingAssignmentJsonPaste = (text = '', classOptions = ASSIGNMENT_CLASSES) => {
  const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end < start) return [];
  const data = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(data)) return [];
  return data.flatMap((teacher, teacherIndex) => {
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
    const teacherName = teacher.ho_ten || teacher.teacherName || teacher.name || '';
    const teacherPosition = teacher.chuc_vu || teacher.position || 'GV';
    const teacherSpecialty = teacher.cm_giang_day || teacher.specialty || teacher.subject || '';
    return assignments.map((assignment) => {
      const className = stripPasteCell(assignment.lop_day || assignment.className || assignment.classes || '');
      const selectedClasses = getAssignmentClassList(className, classOptions);
      const classCount = Number(assignment.so_lop || assignment.classCount || selectedClasses.length || 0);
      const totalWeekly = normalizePeriods(assignment.so_tiet || assignment.totalPeriodsPerWeek || assignment.weeklyPeriods || '');
      const periodsPerClass = selectedClasses.length && totalWeekly
        ? String(Number(totalWeekly) / selectedClasses.length)
        : normalizePeriods(assignment.so_tiet_lop_tuan || assignment.periodsPerClassWeek || '');
      return normalizeTeachingAssignment({
        teacherName,
        position: teacherPosition,
        specialty: teacherSpecialty,
        assignment: assignment.ten_phan_cong || assignment.mon_day_kiem_nhiem || assignment.assignment || '',
        weeks: assignment.so_tuan || teacher.so_tuan || '35',
        className,
        classCount: classCount || '',
        periodsPerClassWeek: periodsPerClass,
        totalPeriodsPerWeek: totalWeekly,
        pastedNote: buildTeachingPastedNote(jsonCheckNote, assignment.ghi_chu || assignment.note || assignment.pastedNote || '')
      }, classOptions);
    });
  }).filter(row => row.teacherName || row.assignment || row.specialty);
};

const parseTeachingAssignmentTablePaste = (text = '', classOptions = ASSIGNMENT_CLASSES) => {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const firstColumns = splitTeachingPasteColumns(lines[0]);
  const firstHeaderMap = getTeachingPasteHeaderMap(firstColumns);
  const hasHeader = teachingPasteHeaderKey(firstColumns[0]) === 'stt' || Object.keys(firstHeaderMap).length >= 2;
  const headerMap = hasHeader ? firstHeaderMap : {};
  const dataLines = hasHeader ? lines.slice(1) : lines;
  let lastTeacher = { teacherName: '', position: 'GV', specialty: '', stt: '' };
  return dataLines.map(line => {
    const columns = splitTeachingPasteColumns(line);
    if (!columns.length) return null;
    const teacherName = getTeachingPasteValue(columns, headerMap, 'teacherName', 1) || lastTeacher.teacherName;
    const position = getTeachingPasteValue(columns, headerMap, 'position', 2) || lastTeacher.position || 'GV';
    const specialty = getTeachingPasteValue(columns, headerMap, 'specialty', 3) || lastTeacher.specialty || '';
    if (getTeachingPasteValue(columns, headerMap, 'teacherName', 1)) {
      lastTeacher = {
        teacherName,
        position,
        specialty,
        stt: getTeachingPasteValue(columns, headerMap, 'stt', 0) || lastTeacher.stt
      };
    }
    const className = getTeachingPasteValue(columns, headerMap, 'className', 6);
    const selectedClasses = getAssignmentClassList(className, classOptions);
    const checkNote = getTeachingPasteValue(columns, headerMap, 'pasteCheck', 10);
    const pastedSourceNote = getTeachingPasteValue(columns, headerMap, 'pastedNote', 11);
    return normalizeTeachingAssignment({
      teacherName,
      position,
      specialty,
      assignment: getTeachingPasteValue(columns, headerMap, 'assignment', 4),
      weeks: getTeachingPasteValue(columns, headerMap, 'weeks', 5) || '35',
      className,
      classCount: getTeachingPasteValue(columns, headerMap, 'classCount', 7) || selectedClasses.length || '',
      periodsPerClassWeek: getTeachingPasteValue(columns, headerMap, 'periodsPerClassWeek', 8),
      totalPeriodsPerWeek: getTeachingPasteValue(columns, headerMap, 'totalPeriodsPerWeek', 9),
      pastedNote: buildTeachingPastedNote(checkNote, pastedSourceNote)
    }, classOptions);
  }).filter(row => row && (row.teacherName || row.assignment || row.specialty));
};

const parseTeachingAssignmentPaste = (text = '', classOptions = ASSIGNMENT_CLASSES) => {
  const raw = String(text || '').trim();
  if (!raw) return [];
  try {
    const jsonRows = parseTeachingAssignmentJsonPaste(raw, classOptions);
    if (jsonRows.length) return jsonRows;
  } catch (error) {
    // Fall through to table parsing; pasted data may not be JSON.
  }
  return parseTeachingAssignmentTablePaste(raw, classOptions);
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
    hk2End: `${endYear}-05-26`
  };
};

const normalizeTeachingSemesterDates = (dates = {}, schoolYear = '') => {
  const defaults = defaultTeachingSemesterDates(schoolYear);
  return {
    hk1Start: toDateInputValue(dates.hk1Start) || defaults.hk1Start,
    hk1End: toDateInputValue(dates.hk1End) || defaults.hk1End,
    hk2Start: toDateInputValue(dates.hk2Start) || defaults.hk2Start,
    hk2End: toDateInputValue(dates.hk2End) || defaults.hk2End
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
    } catch (error) {
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
  const [thdSpecialtyPasteText, setThdSpecialtyPasteText] = useState('');
  const [showThdSpecialtyPaste, setShowThdSpecialtyPaste] = useState(false);
  const [activeTeacherPickerIndex, setActiveTeacherPickerIndex] = useState(null);
  const [teacherPickerPosition, setTeacherPickerPosition] = useState({ top: 0, left: 0, width: 420 });
  const [activeClassPickerIndex, setActiveClassPickerIndex] = useState(null);
  const [classPickerPosition, setClassPickerPosition] = useState({ top: 0, left: 0, width: 180 });
  const [showTeachingExportMenu, setShowTeachingExportMenu] = useState(false);
  const [showTeachingCheckModal, setShowTeachingCheckModal] = useState(false);
  const [showTeachingMoneyColumns, setShowTeachingMoneyColumns] = useState(true);
  const [teachingFilter, setTeachingFilter] = useState('all');
  const [showTeachingFilterMenu, setShowTeachingFilterMenu] = useState(false);
  const activePanel = initialPanel || 'general';
  const isThdTeachingPanel = activePanel === 'thdTeachingAssignments';
  const isTeachingPanel = activePanel === 'teachingAssignments' || isThdTeachingPanel;
  const showTeachingFinancialColumns = !isThdTeachingPanel && showTeachingMoneyColumns;
  const showTeachingSchoolColumns = !isThdTeachingPanel;

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
    const rows = cleanThdSubjectRowsForSave(Array.isArray(thdSubjects) ? thdSubjects : []);
    setThdSubjectsDraft(rows.length ? rows : DEFAULT_THD_SUBJECTS);
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

  const assignmentValue = (grade, subject) => {
    return assignmentsBySelectedYear?.[grade]?.[subject] ?? '';
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

  const teachingRowsForSelectedYear = useMemo(() => {
    const legacyRows = effectiveSchoolYearKey === LEGACY_ASSIGNMENT_YEAR_KEY && Array.isArray(activeTeachingAssignmentsDraft?.rows)
      ? activeTeachingAssignmentsDraft.rows
      : [];
    const rows = activeTeachingAssignmentsDraft?.byYear?.[effectiveSchoolYearKey] || legacyRows;
    const normalizedRows = (Array.isArray(rows) ? rows : []).map(row => normalizeTeachingAssignment(row, activeAssignmentClasses));
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
  }, [activeAssignmentClasses, activeTeachingAssignmentsDraft, activeTeachingTeachersDraft, effectiveSchoolYearKey, isThdTeachingPanel]);

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
      const dropdownHeight = 150;
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
    const selected = getAssignmentClassList(row.className || activeAssignmentClasses[0] || '6PC', activeAssignmentClasses);
    const nextClasses = selected.includes(className)
      ? selected.filter(item => item !== className)
      : [...selected, className].sort(compareManagedClasses);
    const nextLabel = compactAssignmentClassLabel(nextClasses, activeAssignmentClasses);
    updateTeachingAssignmentRow(index, {
      className: nextLabel,
      classCount: String(nextClasses.length || 1)
    });
  };

  const teachingSemesterDatesForYear = useMemo(() => (
    normalizeTeachingSemesterDates(activeTeachingAssignmentsDraft?.semestersByYear?.[effectiveSchoolYearKey], selectedSchoolYear)
  ), [activeTeachingAssignmentsDraft, effectiveSchoolYearKey, selectedSchoolYear]);

  const updateTeachingSemesterDate = (field, value) => {
    setActiveTeachingAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      const nextDates = {
        ...teachingSemesterDatesForYear,
        [field]: value
      };
      const byYear = { ...(prevObj.byYear || {}) };
      const rows = Array.isArray(byYear[effectiveSchoolYearKey]) ? byYear[effectiveSchoolYearKey] : teachingRowsForSelectedYear;
      byYear[effectiveSchoolYearKey] = rows.map(row => {
        const normalizedRow = normalizeTeachingAssignment(row, activeAssignmentClasses);
        if (!normalizedRow.note || !isGeneratedTeachingNote(normalizedRow.note)) return normalizedRow;
        return { ...normalizedRow, note: getAssignmentNote(normalizedRow, nextDates) };
      });
      return {
        ...prevObj,
        byYear,
        semestersByYear: {
          ...(prevObj.semestersByYear || {}),
          [effectiveSchoolYearKey]: nextDates
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

  const updateTeachingRowsForYear = (updater) => {
    setActiveTeachingAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
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
      if (
        (Object.prototype.hasOwnProperty.call(nextPatch, 'weeks')
          || Object.prototype.hasOwnProperty.call(nextPatch, 'assignment')
          || Object.prototype.hasOwnProperty.call(nextPatch, 'className'))
        && !Object.prototype.hasOwnProperty.call(nextPatch, 'note')
      ) {
        const currentNote = String(row.note || '').trim();
        if (!currentNote || isGeneratedTeachingNote(currentNote)) {
          nextPatch.note = getAssignmentNote({ ...row, ...nextPatch });
        }
      }
      return normalizeTeachingAssignment({ ...row, ...nextPatch }, activeAssignmentClasses);
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

  const addRowsFromTeacherList = () => {
    const normalizedTeachers = activeTeachingTeachersDraft.map(normalizeTeacher).filter(teacher => teacher.name);
    if (!normalizedTeachers.length) {
      showNotification?.('Chưa có danh sách giáo viên chung để nhập nhanh.', 'error');
      return;
    }
    updateTeachingRowsForYear(rows => {
      const existingKeys = new Set(rows.map(row => normalizeTeacherNameKey(row.teacherName)).filter(Boolean));
      const rowsToAdd = normalizedTeachers
        .filter(teacher => !existingKeys.has(normalizeTeacherNameKey(teacher.name)))
        .map(teacher => normalizeTeachingAssignment({
          teacherName: teacher.name,
          position: 'GV',
          specialty: teacher.subject,
          weeks: '35',
          className: activeAssignmentClasses[0] || '6PC',
          classCount: '1'
        }, activeAssignmentClasses));
      const baseRows = rows.length === 1 && !rows[0].teacherName && !rows[0].assignment ? [] : rows;
      return rowsToAdd.length ? [...baseRows, ...rowsToAdd] : rows;
    });
    showNotification?.('Đã đưa danh sách giáo viên chung vào bảng phân công.');
  };

  const applyThdSpecialtyPaste = () => {
    const pastedRows = parseTeachingAssignmentPaste(thdSpecialtyPasteText, activeAssignmentClasses);
    if (!pastedRows.length) {
      showNotification?.('Chua doc duoc du lieu phan cong. Hay dan JSON hoac bang copy tu cong cu boc tach.', 'error');
      return;
    }
    updateTeachingRowsForYear(rows => {
      const baseRows = rows.length === 1 && !rows[0].teacherName && !rows[0].assignment && !rows[0].specialty ? [] : rows;
      return [...baseRows, ...pastedRows];
    });
    setShowThdSpecialtyPaste(false);
    showNotification?.(`Da them ${pastedRows.length} dong phan cong chuyen mon vao cuoi bang.`);
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
      nextYearMap[String(grade)] = Object.fromEntries(yearSubjects.map(subject => [subject, '']));
    });
    const signedRows = teachingRowsForSelectedYear
      .map(row => normalizeTeachingAssignment(row, activeAssignmentClasses))
      .filter(row => row.transcriptSigner && row.teacherName && row.assignment);
    if (!signedRows.length) {
      showNotification?.('Chưa có dòng nào được tích Ký HB trong bảng phân công.', 'error');
      return;
    }
    let loadedCount = 0;
    signedRows.forEach(row => {
      const subject = findClassSubjectForAssignment(row.assignment);
      if (!subject) return;
      getAssignmentClassList(row.className, activeAssignmentClasses).forEach(className => {
        const grade = className.replace(/[^\d]/g, '');
        if (!grades.map(String).includes(grade)) return;
        const currentNames = String(nextYearMap?.[grade]?.[subject] || '')
          .split(/\s*,\s*/)
          .map(item => item.trim())
          .filter(Boolean);
        if (!currentNames.some(name => normalizeTeacherNameKey(name) === normalizeTeacherNameKey(row.teacherName))) {
          currentNames.push(row.teacherName);
          loadedCount += 1;
        }
        nextYearMap[grade] = {
          ...(nextYearMap[grade] || {}),
          [subject]: currentNames.join(', ')
        };
      });
    });
    if (!loadedCount) {
      showNotification?.('Chưa ghép được dòng Ký HB nào vào môn/lớp tương ứng.', 'error');
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
    showNotification?.(`Đã load ${loadedCount} phân công ký học bạ.`);
  };

  const cleanTeachingAssignmentRows = useMemo(
    () => teachingRowsForSelectedYear
      .map(row => {
        const normalizedRow = normalizeTeachingAssignment(row, activeAssignmentClasses);
        return { ...normalizedRow, teacherName: normalizedRow.teacherName.trim() };
      })
      .filter(row => row.teacherName || row.assignment || row.specialty),
    [activeAssignmentClasses, teachingRowsForSelectedYear]
  );

  const buildTeachingAssignmentsForSave = () => {
    const assignmentObj = (teachingAssignmentsDraft && typeof teachingAssignmentsDraft === 'object') ? { ...teachingAssignmentsDraft } : {};
    const existingRows = assignmentObj.byYear?.[effectiveSchoolYearKey] || assignmentObj.rows || [];
    const existingSemesterDates = assignmentObj.semestersByYear?.[effectiveSchoolYearKey];
    const shouldSaveSemesterDates = Boolean(existingSemesterDates) || !sameJson(teachingSemesterDatesForYear, defaultTeachingSemesterDates(selectedSchoolYear));
    if (!cleanTeachingAssignmentRows.length && !existingRows.length && !shouldSaveSemesterDates) return assignmentObj;
    return {
      ...assignmentObj,
      byYear: {
        ...(assignmentObj.byYear || {}),
        [effectiveSchoolYearKey]: cleanTeachingAssignmentRows
      },
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
    const customPeriods = normalizePeriods(row.periodsPerClassWeek || row.periodsPerClass || row.lessonPerClass || '');
    if (customPeriods) return Number(customPeriods);
    const assignment = normalizeAssignmentSubject(row.assignment);
    if (['Văn', 'Toán', 'KHTN', 'LS&ĐL', 'Chủ nhiệm'].includes(assignment)) return 4;
    if (['GDCD', 'GDĐP', 'HĐTT'].includes(assignment)) return 1;
    if (assignment === 'C nghệ') return 1;
    return '';
  };

  const getTotalPeriodsPerWeek = (row = {}) => {
    const customTotal = normalizePeriods(row.totalPeriodsPerWeek || row.totalWeeklyPeriods || row.weeklyPeriods || '');
    if (customTotal && !normalizePeriods(row.periodsPerClassWeek || row.periodsPerClass || row.lessonPerClass || '')) return Number(customTotal);
    const periods = getPeriodsPerClassWeek(row);
    const classCount = Number(String(row.classCount || '1').replace(',', '.')) || 0;
    return typeof periods === 'number' ? periods * classCount : '';
  };

  const getTotalPeriods = (row = {}) => {
    const customTotal = normalizePeriods(row.totalPeriodsPerWeek || row.totalWeeklyPeriods || row.weeklyPeriods || '');
    const periods = getPeriodsPerClassWeek(row);
    const classCount = Number(String(row.classCount || '1').replace(',', '.')) || 0;
    const weeks = Number(String(row.weeks || '').replace(',', '.')) || 0;
    if (customTotal && !normalizePeriods(row.periodsPerClassWeek || row.periodsPerClass || row.lessonPerClass || '')) return Number(customTotal) * weeks;
    if (typeof periods === 'number') return periods * classCount * weeks;
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
    return getTeachingWeekNote(row.weeks, semesterDates);
  };

  useEffect(() => {
    if (!isTeachingPanel) return;
    const currentRows = teachingRowsForSelectedYear.map(row => normalizeTeachingAssignment(row, activeAssignmentClasses));
    const nextRows = currentRows.map(row => {
      if (!row.note || !isGeneratedTeachingNote(row.note)) return row;
      const nextNote = getAssignmentNote(row);
      return row.note === nextNote ? row : { ...row, note: nextNote };
    });
    if (!sameJson(currentRows, nextRows)) {
      updateTeachingRowsForYear(nextRows);
    }
  }, [activeAssignmentClasses, activePanel, isTeachingPanel, teachingRowsForSelectedYear, teachingSemesterDatesForYear]);

  const isLastTeachingRowForTeacher = (rows = [], row = {}, index = 0) => {
    const teacherKey = normalizeTeacherNameKey(row.teacherName);
    if (!teacherKey) return false;
    return rows.findLastIndex(item => normalizeTeacherNameKey(item.teacherName) === teacherKey) === index;
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
    const haystack = normalizeTeacherNameKey([
      row.specialty,
      abbreviateTeachingSpecialty(row.specialty),
      row.assignment,
      normalizeAssignmentSubject(row.assignment)
    ].filter(Boolean).join(' '));
    return keys.some(key => haystack.includes(key));
  };

  const getTeacherPeriodDiff = (row = {}) => {
    const teacherYearTotal = Number(getTeacherTeachingYearTotal(row.teacherName)) || 0;
    return teacherYearTotal - getTeachingRequiredYearTotal(row.position);
  };

  const filteredTeachingTeacherKeys = useMemo(() => {
    if (!isThdTeachingPanel || teachingFilter === 'all') return null;
    const keys = new Set();
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
  }, [isThdTeachingPanel, teachingFilter, teachingRowsForSelectedYear]);

  const visibleTeachingRows = useMemo(() => (
    teachingRowsForSelectedYear
      .map((row, sourceIndex) => ({ row, sourceIndex }))
      .filter(({ row }) => {
        if (!filteredTeachingTeacherKeys) return true;
        return filteredTeachingTeacherKeys.has(normalizeTeacherNameKey(row.teacherName));
      })
  ), [filteredTeachingTeacherKeys, teachingRowsForSelectedYear]);

  const visibleTeachingRowValues = useMemo(() => visibleTeachingRows.map(item => item.row), [visibleTeachingRows]);
  const teachingFilterLabel = TEACHING_FILTER_OPTIONS.find(option => option.value === teachingFilter)?.label || 'Tất cả';
  const teachingCheckSubjectOptions = isThdTeachingPanel ? THD_CHECK_SUBJECT_OPTIONS : ASSIGNMENT_SUBJECT_OPTIONS;

  const getAssignmentClassesFromRow = (row = {}) => {
    return getAssignmentClassList(row.className, activeAssignmentClasses);
  };

  const expectedPeriodsForAssignment = (subject = '', className = '') => {
    const subjectKey = normalizeTeacherNameKey(subject);
    const grade = String(className || '').replace(/[^\d]/g, '');
    if (subjectKey === 'c nghe') return 35;
    if (['tieng anh', 't anh', 'anh van'].includes(subjectKey)) return 105;
    if (['gdtc', 'giao duc the chat'].includes(subjectKey)) return 70;
    if (subjectKey === 'ls dl') return 105;
    if (['van', 'toan', 'khtn', 'chu nhiem'].includes(subjectKey)) return 140;
    return 35;
  };

  const teachingCheckRows = useMemo(() => {
    const rows = teachingRowsForSelectedYear.map(row => normalizeTeachingAssignment(row, activeAssignmentClasses)).filter(row => row.assignment);
    const actualMap = new Map();
    rows.forEach(row => {
      const subject = normalizeAssignmentSubject(row.assignment);
      const classNames = getAssignmentClassesFromRow(row);
      if (!subject || !classNames.length) return;
      const total = Number(getTotalPeriods(row)) || 0;
      const perClassTotal = classNames.length > 1 ? total / classNames.length : total;
      classNames.forEach(className => {
        const key = `${className}|${subject}`;
        const current = actualMap.get(key) || { actual: 0, teachers: new Set() };
        current.actual += perClassTotal;
        if (row.teacherName) current.teachers.add(row.teacherName);
        actualMap.set(key, current);
      });
    });
    return activeAssignmentClasses.flatMap(className => teachingCheckSubjectOptions.map(subjectOption => {
      const expected = expectedPeriodsForAssignment(subjectOption.value, className);
      const found = actualMap.get(`${className}|${subjectOption.value}`);
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
  }, [activeAssignmentClasses, teachingCheckSubjectOptions, teachingRowsForSelectedYear]);

  const teachingCheckSummary = useMemo(() => ({
    ok: teachingCheckRows.filter(row => row.diff === 0).length,
    missing: teachingCheckRows.filter(row => row.diff < 0).length,
    excess: teachingCheckRows.filter(row => row.diff > 0).length
  }), [teachingCheckRows]);

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
        const totalPerWeek = getTotalPeriodsPerWeek(row);
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
        const totalPerWeek = getTotalPeriodsPerWeek(row);
        const totalPeriods = getTotalPeriods(row);
        const teacherMoneyRate = getTeacherMoneyRate(row.teacherName);
        const assignmentMoney = getTeachingAssignmentMoney(row);
        const isContinuationAssignment = rowIndex > 0;
        const leftDataStyle = isContinuationAssignment ? 21 : 15;
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

  const cleanThdSubjectsDraft = useMemo(
    () => cleanThdSubjectRowsForSave(thdSubjectsDraft),
    [thdSubjectsDraft]
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
      rowIndex === index ? normalizeThdSubject({ ...item, ...patch }) : item
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

  const toggleTeacherGrade = (index, grade) => {
    setTeachersDraft(prev => prev.map((item, rowIndex) => {
      if (rowIndex !== index) return item;
      const current = new Set(item.grades || []);
      if (current.has(String(grade))) current.delete(String(grade));
      else current.add(String(grade));
      return { ...item, grades: [...current].sort() };
    }));
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

  const updateAssignment = (grade, subject, value) => {
    setAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      const byYear = { ...(prevObj.byYear || {}) };
      const legacyYearMap = (!prevObj.byYear && effectiveSchoolYearKey === LEGACY_ASSIGNMENT_YEAR_KEY) ? prevObj : {};
      const yearMap = { ...(byYear[effectiveSchoolYearKey] || legacyYearMap) };
      yearMap[grade] = {
        ...(yearMap?.[grade] || {}),
        [subject]: value
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
    <div className="fixed inset-x-0 top-[84px] bottom-0 z-[120] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-2 sm:p-3">
      <div className="w-full max-w-none mx-auto space-y-3">
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

        <div className="space-y-3">
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
                    <textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="Dán từ Excel: STT | Tên giáo viên | Môn | Số tiết | Số tiền. Nếu chỉ dán Tên giáo viên | Số tiết hoặc Tên giáo viên | Số tiền, hệ thống chỉ cập nhật đúng cột đó theo tên đang có." className="w-full min-h-[120px] rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 text-sm font-bold outline-none focus:border-emerald-400" />
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
                      <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold uppercase text-slate-500">
                            <th className="w-10 px-2">STT</th>
                            <th className="px-2">Tên giáo viên</th>
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
                        <Save className="h-4 w-4" /> Lưu thay đổi
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
                    <button type="button" onClick={() => setThdSubjectsDraft(prev => [...prev, emptyThdSubject()])} className="h-8 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100">
                      + Thêm dòng
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm overflow-x-auto">
                  <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase text-slate-500">
                        <th className="w-12 px-2 text-center">STT</th>
                        <th className="px-2">Môn</th>
                        <th className="w-64 px-2">Ghi tắt</th>
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
                      <Save className="h-4 w-4" /> Lưu thay đổi
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
                                  value={className}
                                  onChange={(event) => updateThdClass(grade, index, event.target.value)}
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
              <div className="space-y-2">
                <div className="sticky -top-3 z-40 rounded-xl border border-cyan-100 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="min-w-28">
                      <div className="text-[10px] font-semibold uppercase text-cyan-900">Phân công</div>
                      <div className="text-base font-semibold leading-tight text-cyan-950">{selectedSchoolYear}</div>
                    </div>
                    <div className="flex flex-1 flex-wrap items-center gap-1.5">
                      <div className="min-w-[260px] flex-1 rounded-lg border border-cyan-100 bg-cyan-50/40 px-1.5 py-1">
                        <div className="mb-0.5 text-[10px] font-semibold uppercase text-cyan-900">HK1 - 18 tuần</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="date"
                            value={teachingSemesterDatesForYear.hk1Start}
                            onChange={(event) => updateTeachingSemesterDate('hk1Start', event.target.value)}
                            className="h-7 w-full rounded-md border border-cyan-100 bg-white px-2 text-xs font-normal outline-none focus:border-cyan-400"
                            title="HK1 từ ngày"
                          />
                          <input
                            type="date"
                            value={teachingSemesterDatesForYear.hk1End}
                            onChange={(event) => updateTeachingSemesterDate('hk1End', event.target.value)}
                            className="h-7 w-full rounded-md border border-cyan-100 bg-white px-2 text-xs font-normal outline-none focus:border-cyan-400"
                            title="HK1 đến ngày"
                          />
                        </div>
                      </div>
                      <div className="min-w-[260px] flex-1 rounded-lg border border-cyan-100 bg-cyan-50/40 px-1.5 py-1">
                        <div className="mb-0.5 text-[10px] font-semibold uppercase text-cyan-900">HK2 - 17 tuần</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="date"
                            value={teachingSemesterDatesForYear.hk2Start}
                            onChange={(event) => updateTeachingSemesterDate('hk2Start', event.target.value)}
                            className="h-7 w-full rounded-md border border-cyan-100 bg-white px-2 text-xs font-normal outline-none focus:border-cyan-400"
                            title="HK2 từ ngày"
                          />
                          <input
                            type="date"
                            value={teachingSemesterDatesForYear.hk2End}
                            onChange={(event) => updateTeachingSemesterDate('hk2End', event.target.value)}
                            className="h-7 w-full rounded-md border border-cyan-100 bg-white px-2 text-xs font-normal outline-none focus:border-cyan-400"
                            title="HK2 đến ngày"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="ml-auto flex flex-wrap gap-1.5">
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
                          <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
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
                              <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
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
                          <button type="button" onClick={() => setShowThdSpecialtyPaste(prev => !prev)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                            <ClipboardPaste className="h-4 w-4" /> Dán chuyên môn
                          </button>
                          <button type="button" onClick={addRowsFromTeacherList} className="h-8 rounded-md border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-sky-800 hover:bg-sky-100">
                            Load GV Trần Hưng Đạo
                          </button>
                          <button type="button" onClick={clearTeachingAssignmentsForYear} className="h-8 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                            Xóa hết phân công
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => addTeachingAssignmentRow()} className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        + Thêm GV
                      </button>
                      <button
                        type="button"
                        onClick={saveAll}
                        disabled={!hasChanges}
                        className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${hasChanges ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      >
                        <Save className="w-4 h-4" /> Lưu thay đổi
                      </button>
                    </div>
                  </div>
                </div>

                {isThdTeachingPanel && showThdSpecialtyPaste && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-black uppercase text-emerald-900">Dán chuyên môn Trần Hưng Đạo</div>
                        <div className="text-[11px] font-semibold text-emerald-700">Nhận JSON từ công cụ bóc tách hoặc bảng copy nhanh có các cột STT, Họ tên, Chức vụ, CM giảng dạy, Phân công, Lớp, Số tiết.</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={applyThdSpecialtyPaste} className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
                          Đưa vào bảng
                        </button>
                        <button type="button" onClick={() => setThdSpecialtyPasteText('')} className="h-8 rounded-md border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                          Xóa
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={thdSpecialtyPasteText}
                      onChange={(event) => setThdSpecialtyPasteText(event.target.value)}
                      placeholder="Dán dữ liệu phân công chuyên môn vào đây..."
                      className="h-32 w-full resize-y rounded-xl border border-emerald-100 bg-white p-3 text-xs font-medium text-slate-700 outline-none focus:border-emerald-400"
                    />
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm overflow-x-auto">
                  <table className={`w-full ${isThdTeachingPanel ? 'min-w-[1340px]' : (showTeachingFinancialColumns ? 'min-w-[1540px]' : (showTeachingSchoolColumns ? 'min-w-[1360px]' : 'min-w-[1180px]'))} border-collapse text-xs`}>
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
                        <th className="w-96 border border-slate-200 px-1 py-1">Ghi chú</th>
                        {isThdTeachingPanel && <th className="w-64 border border-slate-200 px-1 py-1">Ghi chú dán</th>}
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
                    </thead>
                    <tbody>
                      {visibleTeachingRows.length === 0 && (
                        <tr>
                          <td colSpan={24} className="border border-slate-200 px-3 py-6 text-center text-sm font-semibold text-slate-500">
                            Không có giáo viên phù hợp với bộ lọc này.
                          </td>
                        </tr>
                      )}
                      {visibleTeachingRows.map(({ row, sourceIndex }, index) => {
                        const periodsPerClassWeek = getPeriodsPerClassWeek(row);
                        const totalPerWeek = getTotalPeriodsPerWeek(row);
                        const totalPeriods = getTotalPeriods(row);
                        const noteText = getAssignmentNote(row);
                        const hasVisibleTeachingRow = Boolean(row.teacherName || row.assignment || row.specialty);
                        const showSummaryRow = hasVisibleTeachingRow
                          ? isLastTeachingRowForTeacher(visibleTeachingRowValues, row, index)
                          : true;
                        const isContinuationRow = index > 0
                          && normalizeTeacherNameKey(row.teacherName)
                          && normalizeTeacherNameKey(row.teacherName) === normalizeTeacherNameKey(visibleTeachingRowValues[index - 1]?.teacherName);
                        const teacherSequenceNumber = isContinuationRow ? '' : getTeachingTeacherSequenceNumber(visibleTeachingRowValues, index);
                        const teacherSuggestions = getTeacherSuggestions(row.teacherName);
                        const currentGroupBounds = teachingGroupBounds(teachingRowsForSelectedYear, sourceIndex);
                        const canMoveTeacherUp = currentGroupBounds.start > 0;
                        const canMoveTeacherDown = currentGroupBounds.end < teachingRowsForSelectedYear.length - 1;
                        const teacherYearTotal = getTeacherTeachingYearTotal(row.teacherName);
                        const teacherSchoolPeriods = getTeacherSchoolPeriods(row.teacherName);
                        const teacherGrandTotal = (Number(teacherYearTotal) || 0) + teacherSchoolPeriods;
                        const teacherMoneyRate = getTeacherMoneyRate(row.teacherName);
                        const assignmentMoney = getTeachingAssignmentMoney(row);
                        const teacherMoneyTotal = getTeacherTeachingMoneyTotal(row.teacherName);
                        const teacherRequiredPeriodsPerWeek = getTeachingRequiredPeriodsPerWeek(row.position);
                        const teacherRequiredYearTotal = getTeachingRequiredYearTotal(row.position);
                        return (
                          <Fragment key={`teaching-assignment-${sourceIndex}`}>
                          <tr className="bg-white hover:bg-cyan-50/40">
                            <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold text-slate-500">{teacherSequenceNumber}</td>
                            <td className="relative border border-slate-200 px-0.5 py-0.5">
                              {isContinuationRow ? <div className="h-7" /> : (
                                <div className="relative">
                                  <input
                                    value={row.teacherName}
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
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { position: event.target.value })}
                                  className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-semibold outline-none focus:border-cyan-400"
                                >
                                  {POSITION_OPTIONS.map(position => <option key={position} value={position}>{position}</option>)}
                                </select>
                              )}
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              {isContinuationRow ? <div className="h-7" /> : (
                                <input
                                  value={abbreviateTeachingSpecialty(row.specialty)}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { specialty: event.target.value })}
                                  list="assignment-specialties"
                                  placeholder="Tự lấy theo GV..."
                                  className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] font-semibold outline-none focus:border-cyan-400"
                                />
                              )}
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              {isThdTeachingPanel ? (
                                <input
                                  value={row.assignment || ''}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { assignment: event.target.value })}
                                  list="thd-assignment-short-names"
                                  placeholder="Nhập môn/phân công..."
                                  className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] font-semibold outline-none focus:border-cyan-400"
                                />
                              ) : (
                                <select
                                  value={row.assignment || ''}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { assignment: event.target.value })}
                                  className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] font-semibold outline-none focus:border-cyan-400"
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
                                onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { weeks: event.target.value })}
                                inputMode="numeric"
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-semibold outline-none focus:border-cyan-400"
                              />
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              <button
                                type="button"
                                onClick={(event) => openClassPicker(sourceIndex, event.currentTarget)}
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-semibold outline-none hover:bg-cyan-50 focus:border-cyan-400"
                              >
                                {row.className || 'Chọn'}
                              </button>
                              {activeClassPickerIndex === sourceIndex && createPortal((
                                <div
                                  className="fixed z-[300] rounded-xl border border-cyan-100 bg-white p-1 shadow-2xl"
                                  style={{
                                    top: `${classPickerPosition.top}px`,
                                    left: `${classPickerPosition.left}px`,
                                    width: `${classPickerPosition.width}px`,
                                    maxWidth: 'calc(100vw - 48px)'
                                  }}
                                >
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
                                  <button type="button" onClick={() => setActiveClassPickerIndex(null)} className="mt-1 w-full rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                                    Đóng
                                  </button>
                                </div>
                              ), document.body)}
                            </td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              <input
                                value={row.classCount}
                                onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { classCount: event.target.value })}
                                inputMode="numeric"
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-semibold outline-none focus:border-cyan-400"
                              />
                            </td>
                            <td className="w-12 min-w-[3.25rem] max-w-[3.25rem] border border-slate-200 px-0.5 py-0.5 text-center font-semibold text-slate-700">
                              {isThdTeachingPanel ? (
                                <input
                                  value={row.periodsPerClassWeek || ''}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { periodsPerClassWeek: event.target.value })}
                                  inputMode="decimal"
                                  placeholder={String(periodsPerClassWeek || '')}
                                  className="h-7 w-full min-w-0 rounded-md border border-slate-200 bg-white px-1 text-center text-[13px] font-semibold outline-none focus:border-cyan-400"
                                />
                              ) : periodsPerClassWeek}
                            </td>
                            <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold text-slate-700">{totalPerWeek}</td>
                            <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold text-slate-700">{totalPeriods}</td>
                            <td className="border border-slate-200 px-0.5 py-0.5">
                              <input
                                value={row.note || ''}
                                onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { note: event.target.value })}
                                onFocus={() => {
                                  if (!row.note && noteText) updateTeachingAssignmentRow(sourceIndex, { note: noteText });
                                }}
                                placeholder={noteText || 'Ghi chú...'}
                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] font-normal outline-none focus:border-cyan-400"
                              />
                            </td>
                            {isThdTeachingPanel && (
                              <td className="border border-slate-200 px-0.5 py-0.5">
                                <input
                                  value={row.pastedNote || ''}
                                  onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { pastedNote: event.target.value })}
                                  placeholder="Ghi chú từ dữ liệu dán..."
                                  className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[13px] font-normal outline-none focus:border-cyan-400"
                                />
                              </td>
                            )}
                            {!isThdTeachingPanel && (
                            <td className="border border-slate-200 px-1 py-0.5 text-center">
                              <input
                                type="checkbox"
                                checked={Boolean(row.transcriptSigner)}
                                onChange={(event) => updateTeachingAssignmentRow(sourceIndex, { transcriptSigner: event.target.checked })}
                                className="h-4 w-4 accent-violet-600"
                                title="Giáo viên ký học bạ cho môn/lớp này"
                              />
                            </td>
                            )}
                            {showTeachingFinancialColumns && (
                              <>
                                <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold text-slate-700">{formatMoney(teacherMoneyRate)}</td>
                                <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold text-slate-700">{formatMoney(assignmentMoney)}</td>
                              </>
                            )}
                            {showTeachingSchoolColumns && (
                              <>
                                <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold text-slate-700">{teacherSchoolPeriods || ''}</td>
                                <td className="border border-slate-200 px-1 py-0.5 text-center font-semibold text-slate-700">{teacherGrandTotal || ''}</td>
                              </>
                            )}
                            <td className="border border-slate-200 px-0.5 py-0.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button type="button" onClick={() => moveTeachingAssignmentGroup(sourceIndex, -1)} disabled={!canMoveTeacherUp} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời giáo viên lên">
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => moveTeachingAssignmentGroup(sourceIndex, 1)} disabled={!canMoveTeacherDown} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời giáo viên xuống">
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => addTeachingAssignmentForSameTeacher(sourceIndex)} className="h-7 w-7 rounded-md border border-cyan-200 bg-white text-cyan-700 font-black hover:bg-cyan-50" title="Thêm phân công cho giáo viên này">+</button>
                                <button type="button" onClick={() => deleteTeachingAssignmentRow(sourceIndex)} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50" title="Xóa dòng">
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
                                    className="h-6 rounded-md border border-rose-200 bg-white px-2 text-[11px] font-black not-italic text-rose-700 hover:bg-rose-50"
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
                          ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="h-[520px]" aria-hidden="true" />
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
                          <th className="px-1">Tên giáo viên</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classSubjects(subjects).map((subject, index) => (
                          <tr key={`${grade}-${subject}`} className="bg-slate-50">
                            <td className="rounded-l-lg px-1 py-1 text-center text-xs font-semibold text-slate-500">{index + 1}</td>
                            <td className="px-1 py-1 text-[11px] font-semibold text-slate-800">{normalizeAssignmentSubject(subject)}</td>
                            <td className="rounded-r-lg px-1 py-1">
                              <input
                                value={assignmentValue(grade, subject)}
                                onChange={(event) => updateAssignment(grade, subject, event.target.value)}
                                list="nan-teacher-names"
                                placeholder="Tên GV..."
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
            {showTeachingCheckModal && createPortal((
              <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/45 p-3">
                <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-3xl border border-amber-100 bg-white shadow-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                    <div>
                      <div className="text-xs font-black uppercase text-amber-700">Kiểm tra phân công 35 tuần</div>
                      <div className="mt-1 text-xl font-black text-slate-900">{selectedSchoolYear}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Đủ: {teachingCheckSummary.ok}</span>
                      <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Thiếu: {teachingCheckSummary.missing}</span>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Dư: {teachingCheckSummary.excess}</span>
                      <button type="button" onClick={() => setShowTeachingCheckModal(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Đóng">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="overflow-auto p-4">
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {activeAssignmentClasses.map(className => {
                        const classRows = teachingCheckRows.filter(row => row.className === className);
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
