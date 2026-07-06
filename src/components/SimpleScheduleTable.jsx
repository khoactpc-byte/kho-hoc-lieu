import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { AlertTriangle, BarChart3, ChevronDown, EyeOff, FileSpreadsheet, FileText, HelpCircle, Save, Send, Sparkles, Trash2, Users, X } from 'lucide-react';
import { appId, db } from '../config/firebase';

const BASE_CLASSES = ['6', '7', '8', '9'];
const PERIODS = [1, 2, 3, 4, 5];
const DAYS = [
  { key: '2', label: 'T2' },
  { key: '3', label: 'T3' },
  { key: '4', label: 'T4' },
  { key: '5', label: 'T5' },
  { key: '6', label: 'T6' },
  { key: '7', label: 'T7' }
];
const EXTRA_SUBJECTS = ['Giáo dục địa phương', 'HDTT', 'Chủ nhiệm'];
const OFF_SLOT_VALUE = '__OFF__';
const SCHEDULE_SEMESTERS = [
  { key: 'hk1', label: 'HK1', namePrefix: 'HK1' },
  { key: 'hk2', label: 'HK2', namePrefix: 'HK2' }
];
const REQUIRED_LOADS = [
  { key: 'toan', label: 'Toán', required: 4, paired: true },
  { key: 'van', label: 'Văn', required: 4, paired: true },
  { key: 'khtn', label: 'KHTN', required: 4, paired: true },
  { key: 'lsdl', label: 'LS&ĐL', required: 3, paired: true },
  { key: 'gdcd', label: 'GDCD', required: 1 },
  { key: 'congnghe', label: 'Công nghệ', required: 1 },
  { key: 'gddp', label: 'GDĐP', required: 1 },
  { key: 'hdtt', label: 'HDTT', required: 1 },
  { key: 'cn', label: 'Chủ nhiệm', required: 4, scheduleSlots: 1, weight: 4 }
];
const SINGLE_VISIT_SUBJECT_KEYS = new Set(['gdcd', 'congnghe', 'gddp', 'hdtt']);
const HOMEROOM_PAIR_SUBJECT_KEYS = new Set(['gddp', 'cn']);
const getCurrentTimestamp = () => Date.now();

const defaultRows = () => BASE_CLASSES.map(className => ({
  id: className,
  label: `Lớp ${className}`,
  grades: [className]
}));

const emptyDay = () => Object.fromEntries(PERIODS.map(period => [period, '']));
const emptyRow = () => Object.fromEntries(DAYS.map(day => [day.key, emptyDay()]));
const makeEmptySchedule = (rows = defaultRows()) => Object.fromEntries(rows.map(row => [row.id, emptyRow()]));

const normalizeSchedule = (schedule = {}, rows = defaultRows()) => {
  const next = makeEmptySchedule(rows);
  rows.forEach(row => {
    DAYS.forEach(day => {
      PERIODS.forEach(period => {
        next[row.id][day.key][period] = schedule?.[row.id]?.[day.key]?.[period] || '';
      });
    });
  });
  return next;
};

const sortRows = (rows = []) => [...rows].sort((a, b) => Number(a.grades?.[0] || 0) - Number(b.grades?.[0] || 0));
const removeAccentsLocal = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase();
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
const subjectKey = (value = '') => {
  const subjectText = String(value || '').split(/\s[-–—]\s/)[0] || value;
  const normalized = removeAccentsLocal(subjectText).replace(/[^a-z0-9&]/g, '');
  if (!normalized) return '';
  if (normalized.includes('toan')) return 'toan';
  if (normalized.includes('nguvan') || normalized === 'van' || normalized.startsWith('van')) return 'van';
  if (normalized.includes('khoahoctunhien') || normalized.includes('khtn')) return 'khtn';
  if (normalized.includes('lichsu') || normalized.includes('dialy') || normalized.includes('ls&dl') || normalized.includes('lsdl')) return 'lsdl';
  if (normalized.includes('congdan') || normalized.includes('gdcd')) return 'gdcd';
  if (normalized.includes('congnghe') || normalized.includes('cnghe')) return 'congnghe';
  if (normalized.includes('diaphuong') || normalized.includes('gddp')) return 'gddp';
  if (normalized.includes('hdtt') || normalized.includes('hoatdongtapthe') || normalized.includes('hoatdongtapt')) return 'hdtt';
  if (normalized === 'cn' || normalized.includes('chunhiem')) return 'cn';
  return normalized;
};
const hasTeacherSuffix = (value = '') => /\s[-–—]\s/.test(String(value || ''));
const displayPublicSubject = (value = '') => {
  if (value === OFF_SLOT_VALUE) return 'Nghỉ';
  if (hasTeacherSuffix(value)) return value;
  const key = subjectKey(value);
  if (key === 'gddp') return 'GDĐP';
  if (key === 'hdtt') return 'HĐTT';
  if (key === 'cn') return 'Chủ nhiệm';
  return value || '-';
};
const displayEditorSubject = (value = '') => {
  if (value === OFF_SLOT_VALUE) return 'Nghỉ';
  if (hasTeacherSuffix(value)) return value;
  const key = subjectKey(value);
  if (key === 'gddp') return 'GDĐP';
  if (key === 'hdtt') return 'HĐTT';
  if (key === 'cn') return 'Chủ nhiệm';
  return value || '-';
};
const getScheduleSemesterMeta = (semester = 'hk1') => SCHEDULE_SEMESTERS.find(item => item.key === semester) || SCHEDULE_SEMESTERS[0];
const inferScheduleSemester = (semester = '', name = '') => {
  const direct = String(semester || '').toLowerCase();
  if (direct.includes('2') || direct.includes('ii')) return 'hk2';
  if (direct.includes('1') || direct.includes('i')) return 'hk1';
  const nameKey = removeAccentsLocal(name);
  if (nameKey.includes('hk2') || nameKey.includes('hoc ky 2') || nameKey.includes('hoc ki 2')) return 'hk2';
  return 'hk1';
};
const stripSemesterPrefix = (name = '') => String(name || '').replace(/^\s*(?:\[?\s*)?HK[12](?:\s*\]?)?\s*[-:]\s*/i, '').trim();
const withSemesterPrefix = (name = '', semester = 'hk1') => {
  const prefix = getScheduleSemesterMeta(semester).namePrefix;
  const baseName = stripSemesterPrefix(name) || 'TKB';
  return `${prefix} - ${baseName}`;
};
const defaultScheduleName = (schoolYear = '', semester = 'hk1') => withSemesterPrefix(`TKB ${schoolYear || ''}`.trim(), semester);
const getPrimaryGrade = (row = {}) => {
  const source = row.grades?.[0] || row.id || row.label || '';
  return String(source || '').match(/[6-9]/)?.[0] || '';
};
const getTeacherKeys = (teacherName = '') => String(teacherName || '')
  .split(/[,;/]+/)
  .map(item => removeAccentsLocal(item).replace(/[^a-z0-9]/g, ''))
  .filter(Boolean);
const isLikelyTeacherShortName = (name = '') => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return false;
  const prefix = parts[0].replace(/[^\p{L}\p{N}]/gu, '');
  return prefix.length >= 2 && prefix === prefix.toUpperCase();
};
const getScheduleTeacherLabel = (teacherName = '', teacherShortNameByKey = new Map()) => String(teacherName || '')
  .split(/[,;/]+/)
  .map(name => {
    const cleanName = name.trim();
    if (!cleanName) return '';
    if (isLikelyTeacherShortName(cleanName)) return cleanName;
    const key = removeAccentsLocal(cleanName).replace(/[^a-z0-9]/g, '');
    return teacherShortNameByKey.get(key) || suggestTeacherShortName(cleanName) || cleanName;
  })
  .filter(Boolean)
  .join(', ');
const formatScheduleCellValue = (subjectLabel = '', teacherName = '', teacherShortNameByKey = new Map()) => {
  const cleanTeacher = getScheduleTeacherLabel(teacherName, teacherShortNameByKey);
  return cleanTeacher ? `${subjectLabel} - ${cleanTeacher}` : subjectLabel;
};
const compactScheduleCellValue = (value = '', teacherShortNameByKey = new Map(), displaySubject = displayEditorSubject) => {
  const text = String(value || '').trim();
  if (text === OFF_SLOT_VALUE) return OFF_SLOT_VALUE;
  if (!text || !hasTeacherSuffix(text)) return displaySubject(text);
  const [subjectText, ...teacherParts] = text.split(/\s[-–—]\s/);
  const teacherLabel = getScheduleTeacherLabel(teacherParts.join(' - '), teacherShortNameByKey);
  const subjectLabel = displaySubject(subjectText);
  return teacherLabel ? `${subjectLabel} - ${teacherLabel}` : subjectLabel;
};
const getScheduleCellTeacherText = (value = '') => {
  const text = String(value || '').trim();
  if (!text || text === OFF_SLOT_VALUE || !hasTeacherSuffix(text)) return '';
  const [, ...teacherParts] = text.split(/\s[-–—]\s/);
  return teacherParts.join(' - ').trim();
};
const getScheduleCellTeacherKeys = (value = '') => getTeacherKeys(getScheduleCellTeacherText(value));
const compactScheduleForSave = (schedule = {}, rows = defaultRows(), teacherShortNameByKey = new Map()) => {
  const normalized = normalizeSchedule(schedule, rows);
  return Object.fromEntries(rows.map(row => [
    row.id,
    Object.fromEntries(DAYS.map(day => [
      day.key,
      Object.fromEntries(PERIODS.map(period => [
        period,
        compactScheduleCellValue(normalized?.[row.id]?.[day.key]?.[period] || '', teacherShortNameByKey, displayEditorSubject)
      ]))
    ]))
  ]));
};
const getSemesterTeacherName = (value = '', semester = 'hk1') => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const hk1 = String(value.hk1 ?? value.hki ?? value.semester1 ?? value.term1 ?? value.fullYear ?? '').trim();
    const hk2 = String(value.hk2 ?? value.hkii ?? value.semester2 ?? value.term2 ?? value.fullYear ?? '').trim();
    const fallback = String(value.value ?? value.teacherName ?? value.name ?? '').trim();
    const hasSemesterKeys = ['hk1', 'hk2', 'hki', 'hkii', 'semester1', 'semester2', 'term1', 'term2']
      .some(key => Object.prototype.hasOwnProperty.call(value, key));
    if (hasSemesterKeys) return semester === 'hk2' ? (hk2 || fallback) : (hk1 || fallback);
    return fallback;
  }
  return String(value || '').trim();
};
const compactClassLabel = (row = {}) => {
  const grades = row.grades?.length ? row.grades : String(row.id || '').split('&').filter(Boolean);
  return grades.length ? `Lớp\n${grades.join('&')}` : String(row.label || row.id || '').replace(/\s+/, '\n');
};
const compactClassHtml = (row = {}) => compactClassLabel(row).split('\n').join('<br>');
const isBlankScheduleValue = (value = '') => {
  const text = String(value || '').trim();
  return !text || text === '-';
};
const isOffScheduleValue = (value = '') => String(value || '').trim() === OFF_SLOT_VALUE;
const isOpenScheduleValue = (value = '') => isBlankScheduleValue(value) || isOffScheduleValue(value);
const escapeHtml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const makeSafeFileName = (value = 'thoi-khoa-bieu') => removeAccentsLocal(value)
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'thoi-khoa-bieu';
const formatSchoolYearDisplay = (schoolYear = '') => String(schoolYear || '').replace(/\s*-\s*/g, ' - ').trim();
const getSemesterNumber = (semesterLabel = '') => String(semesterLabel || '').match(/\d+/)?.[0] || (removeAccentsLocal(semesterLabel).includes('2') ? '2' : '1');
const getSchoolYearStartYearForSchedule = (schoolYear = '') => Number(String(schoolYear || '').match(/\d{4}/)?.[0] || new Date().getFullYear());
const getScheduleSigningDateText = (schoolYear = '', semesterLabel = '') => {
  const startYear = getSchoolYearStartYearForSchedule(schoolYear);
  const isSemester2 = getSemesterNumber(semesterLabel) === '2';
  const month = isSemester2 ? '01' : '09';
  const year = isSemester2 ? startYear + 1 : startYear;
  return `Ngày 15 tháng ${month} năm ${year}`;
};
const downloadBlobFile = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const getContentVisibleDays = ({ rows = [], visibleDays = [], schedule = {}, periodCount = 5 }) => {
  const selectedDays = DAYS.filter(day => visibleDays.includes(day.key));
  const daysWithContent = selectedDays.filter(day => (
    rows.some(row => PERIODS.slice(0, periodCount).some(period => !isBlankScheduleValue(schedule?.[row.id]?.[day.key]?.[period])))
  ));
  return daysWithContent.length ? daysWithContent.map(day => day.key) : selectedDays.map(day => day.key);
};

const makeScheduleNewsHtml = ({ name, rows, visibleDays, schedule, periodCount = 5 }) => {
  const shownDayKeys = getContentVisibleDays({ rows, visibleDays, schedule, periodCount });
  const shownDays = DAYS.filter(day => shownDayKeys.includes(day.key));
  const header = shownDays.map(day => `<th class="schedule-day-head">${day.label}</th>`).join('');
  const body = rows.map(row => {
    return PERIODS.slice(0, periodCount).map((period, index) => {
      const rowClass = [
        'schedule-period-row',
        index === 0 ? 'schedule-class-start' : '',
        index === periodCount - 1 ? 'schedule-class-end' : ''
      ].filter(Boolean).join(' ');
      const classCell = index === 0 ? `<th class="schedule-class-cell" rowspan="${periodCount}">${compactClassHtml(row)}</th>` : '';
      const cells = shownDays.map(day => `<td class="schedule-subject-cell">${displayPublicSubject(schedule?.[row.id]?.[day.key]?.[period])}</td>`).join('');
      return `<tr class="${rowClass}">${classCell}<th class="schedule-period-cell">${period}</th>${cells}</tr>`;
    }).join('');
  }).join('');
  return `<style>
    .schedule-news table{border:2px solid #93c5fd;border-collapse:collapse;width:100%;font-size:14px;table-layout:fixed}
    .schedule-news th,.schedule-news td{border-left:1px solid #dbeafe;border-right:1px solid #dbeafe;border-top:1px dashed #cbd5e1;border-bottom:1px dashed #cbd5e1;padding:6px;text-align:center;word-break:normal;overflow-wrap:anywhere}
    .schedule-news thead th{border:1.5px solid #93c5fd;background:#eff6ff;font-weight:800}
    .schedule-news .schedule-class-head{width:54px}
    .schedule-news .schedule-period-head{width:36px}
    .schedule-news .schedule-class-cell{width:54px;min-width:54px;background:#f8fafc;font-weight:800;line-height:1.2;border:2px solid #93c5fd}
    .schedule-news .schedule-period-cell{width:36px;min-width:36px;background:#f8fafc;font-weight:800}
    .schedule-news .schedule-subject-cell{line-height:1.25}
    .schedule-news tbody tr.schedule-class-start>th,.schedule-news tbody tr.schedule-class-start>td{border-top:2px solid #93c5fd}
    .schedule-news tbody tr.schedule-class-end>th,.schedule-news tbody tr.schedule-class-end>td{border-bottom:2px solid #93c5fd}
    @media (max-width:640px){
      .schedule-news table{font-size:12px}
      .schedule-news th,.schedule-news td{padding:5px!important}
      .schedule-news .schedule-class-head,.schedule-news .schedule-class-cell{width:36px!important;min-width:36px!important}
      .schedule-news .schedule-period-head,.schedule-news .schedule-period-cell{width:28px!important;min-width:28px!important}
      .schedule-news .schedule-subject-cell{line-height:1.18}
    }
  </style><div class="schedule-news"><h2>${name}</h2><p>Thời khóa biểu đã được xuất bản.</p><table><thead><tr><th class="schedule-class-head">Lớp</th><th class="schedule-period-head">Tiết</th>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
};

const makeScheduleExportHtml = ({ name, schoolYear, semesterLabel, rows, visibleDays, schedule, periodCount = 5, principalName = '', pcResponsibleName = '', includePrintButton = false }) => {
  const shownDays = DAYS.filter(day => visibleDays.includes(day.key));
  const normalized = normalizeSchedule(schedule, rows);
  const semesterNumber = getSemesterNumber(semesterLabel);
  const schoolYearText = formatSchoolYearDisplay(schoolYear);
  const signingDateText = getScheduleSigningDateText(schoolYear, semesterLabel);
  const documentTitle = `THỜI KHÓA BIỂU HỌC KỲ ${semesterNumber} LỚP PHỔ CẬP THCS`;
  const header = shownDays.map(day => `<th>${escapeHtml(day.label)}</th>`).join('');
  const body = rows.map(row => PERIODS.slice(0, periodCount).map((period, index) => {
    const rowClass = [
      'period-row',
      index === 0 ? 'class-start' : '',
      index === periodCount - 1 ? 'class-end' : ''
    ].filter(Boolean).join(' ');
    const classCell = index === 0 ? `<th rowspan="${periodCount}" class="class-cell">${escapeHtml(row.label || row.id)}</th>` : '';
    const cells = shownDays.map(day => `<td>${escapeHtml(displayPublicSubject(normalized?.[row.id]?.[day.key]?.[period] || ''))}</td>`).join('');
    return `<tr class="${rowClass}">${classCell}<th class="period-cell">Tiết ${period}</th>${cells}</tr>`;
  }).join('')).join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(name)}</title>
  <style>
    @page { size: A4 landscape; margin: 6mm; }
    body { font-family: "Times New Roman", Times, serif; color: #0f172a; }
    .doc-header { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 5px; font-family: "Times New Roman", Arial, sans-serif; }
    .doc-header td { border: 0; padding: 1px 4px; text-align: center; vertical-align: top; line-height: 1.2; }
    .doc-left { width: 42%; font-size: 13pt; }
    .doc-right { width: 58%; font-size: 13pt; font-weight: 700; }
    .motto { font-size: 14pt; }
    .school-name { font-size: 13pt; font-weight: 800; text-transform: uppercase; }
    .motto-line { display: inline-block; border-bottom: 1.5px solid #111; padding-bottom: 2px; }
    .school-line { display: inline-block; }
    .school-half-line { display: block; width: 50%; margin: 4px auto 0; border-bottom: 1.5px solid #111; }
    .doc-title { margin: 5px 0 0; text-align: center; font-family: "Times New Roman", Arial, sans-serif; font-size: 18px; font-weight: 800; text-transform: uppercase; }
    .doc-year { margin: 0 0 5px; text-align: center; font-family: "Times New Roman", Arial, sans-serif; font-size: 15px; font-weight: 700; text-transform: uppercase; }
    .period-note { margin-top: 5px; width: 100%; border-collapse: collapse; table-layout: fixed; font-family: "Times New Roman", Times, serif; font-size: 12.2pt; page-break-inside: avoid; break-inside: avoid; }
    .period-note td { border: 0; padding: 1px 4px; vertical-align: top; }
    .period-left { width: 42%; line-height: 1.25; }
    .period-middle, .period-right { width: 29%; text-align: center; }
    .sign-date { min-height: 22px; }
    .sign-title { min-height: 24px; font-weight: 800; text-transform: uppercase; margin-top: 4px; }
    .pc-title { text-transform: none; font-weight: 400; }
    .sign-name { min-height: 84px; padding-top: 74px; font-size: 14pt; font-weight: 800; }
    .pc-name { font-weight: 400; }
    .schedule-table { width: 100%; border: 1.5px solid #111827; border-right-width: 2.5px; border-collapse: collapse; table-layout: fixed; font-size: 11.2px; }
    .schedule-table th, .schedule-table td { border-left: 1px solid #1f2937; border-right: 1px solid #1f2937; border-top: 1px dashed #64748b; border-bottom: 1px dashed #64748b; padding: 5px 4px; text-align: center; vertical-align: middle; line-height: 1.18; word-break: normal; overflow-wrap: anywhere; }
    .schedule-table thead th { border: 1px solid #1f2937; background: #dbeafe; font-weight: 800; }
    .schedule-table tbody tr.class-start > th, .schedule-table tbody tr.class-start > td { border-top: 1px solid #1f2937; }
    .schedule-table tbody tr.class-end > th, .schedule-table tbody tr.class-end > td { border-bottom: 1px solid #1f2937; }
    .schedule-table tr > :first-child { border-left: 1.5px solid #111827; }
    .schedule-table tr > :last-child { border-right: 1.5px solid #111827; }
    .schedule-table thead tr:first-child > th { border-top: 1.5px solid #111827; }
    .schedule-table tbody tr:last-child > th, .schedule-table tbody tr:last-child > td { border-bottom: 1.5px solid #111827; }
    .class-cell { width: 70px; background: #eff6ff; font-weight: 800; }
    .period-cell { width: 58px; background: #f8fafc; font-weight: 800; }
    .print-actions { position: sticky; top: 0; z-index: 10; margin: 0 0 12px; display: flex; gap: 8px; background: #fff; padding: 8px 0; }
    .print-actions button { border: 0; border-radius: 10px; background: #2563eb; color: #fff; padding: 9px 14px; font-weight: 800; cursor: pointer; }
    .print-actions .close-btn { background: #ef4444; }
    @media print {
      html, body { margin: 0; padding: 0; overflow: hidden; }
      .print-actions { display: none; }
      .doc-header { margin-bottom: 4px; }
      .doc-title { margin-top: 4px; }
      .doc-year { margin-bottom: 4px; }
      .period-note { margin-top: 4px; }
      .schedule-table th, .schedule-table td { padding-top: 4.7px; padding-bottom: 4.7px; }
    }
  </style>
</head>
<body>
  ${includePrintButton ? '<div class="print-actions"><button onclick="window.print()">In / lưu PDF</button><button class="close-btn" onclick="window.close()">Đóng</button></div>' : ''}
  <table class="doc-header">
    <tr>
      <td class="doc-left">ỦY BAN NHÂN DÂN</td>
      <td class="doc-right">Cộng hòa xã hội chủ nghĩa Việt Nam</td>
    </tr>
    <tr>
      <td class="doc-left">PHƯỜNG TRUNG MỸ TÂY</td>
      <td class="doc-right motto"><span class="motto-line">Độc lập - Tự do - Hạnh phúc</span></td>
    </tr>
    <tr>
      <td class="doc-left school-name"><span class="school-line">TRƯỜNG THCS NGUYỄN AN NINH<span class="school-half-line"></span></span></td>
      <td></td>
    </tr>
  </table>
  <div class="doc-title">${escapeHtml(documentTitle)}</div>
  <div class="doc-year">NĂM HỌC ${escapeHtml(schoolYearText)}</div>
  <table class="schedule-table">
    <thead><tr><th class="class-cell">Lớp</th><th class="period-cell">Tiết</th>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <table class="period-note">
    <tr>
      <td class="period-left">
        <div>Tiết 1 Từ : 18h00 đến 18h45</div>
        <div>Tiết 2 Từ : 18h45 đến 19h30</div>
        <div>Tiết 3 Từ : 19h30 đến 20h15</div>
        <div>Tiết 4 Từ : 20h15 đến 21h00</div>
      </td>
      <td class="period-middle">
        <div class="sign-date">&nbsp;</div>
        <div class="sign-title pc-title">Chuyên trách phổ cập</div>
        <div class="sign-name pc-name">${escapeHtml(pcResponsibleName || '')}</div>
      </td>
      <td class="period-right">
        <div class="sign-date">${escapeHtml(signingDateText)}</div>
        <div class="sign-title">GIÁM ĐỐC</div>
        <div class="sign-name principal-name">${escapeHtml(principalName || '')}</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export default function SimpleScheduleTable({ subjects = [], currentSchoolYear = '', classTeacherAssignments = {}, teachers = [], principalName = '', pcResponsibleName = '', user, onClose, showNotification }) {
  const [savedSchedules, setSavedSchedules] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [scheduleSemester, setScheduleSemester] = useState('hk1');
  const [scheduleName, setScheduleName] = useState(() => defaultScheduleName(currentSchoolYear, 'hk1'));
  const [classRows, setClassRows] = useState(defaultRows);
  const [visibleDays, setVisibleDays] = useState(DAYS.map(day => day.key));
  const [schedule, setSchedule] = useState(() => makeEmptySchedule(defaultRows()));
  const scheduleRef = useRef(schedule);
  const editorTableRef = useRef(null);
  const [mergeA, setMergeA] = useState('6');
  const [mergeB, setMergeB] = useState('7');
  const [periodCount, setPeriodCount] = useState(5);
  const [showStats, setShowStats] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  const applySchedule = (nextScheduleOrUpdater) => {
    const base = scheduleRef.current;
    const next = typeof nextScheduleOrUpdater === 'function' ? nextScheduleOrUpdater(base) : nextScheduleOrUpdater;
    scheduleRef.current = next;
    setSchedule(next);
  };

  const collectScheduleFromVisibleInputs = () => {
    if (!editorTableRef.current) return scheduleRef.current;
    const next = normalizeSchedule(scheduleRef.current, classRows);
    editorTableRef.current.querySelectorAll('select[data-row-id][data-day-key][data-period]').forEach(select => {
      const rowId = select.getAttribute('data-row-id') || '';
      const dayKey = select.getAttribute('data-day-key') || '';
      const period = select.getAttribute('data-period') || '';
      if (!rowId || !dayKey || !period) return;
      if (!next[rowId]) next[rowId] = emptyRow();
      if (!next[rowId][dayKey]) next[rowId][dayKey] = emptyDay();
      next[rowId][dayKey][period] = select.value || '';
    });
    scheduleRef.current = next;
    setSchedule(next);
    return next;
  };

  const classTeacherAssignmentsForYear = useMemo(() => {
    const source = classTeacherAssignments && typeof classTeacherAssignments === 'object' ? classTeacherAssignments : {};
    return source.byYear?.[currentSchoolYear] || (!source.byYear ? source : {}) || {};
  }, [classTeacherAssignments, currentSchoolYear]);

  const teacherShortNameByKey = useMemo(() => {
    const map = new Map();
    (Array.isArray(teachers) ? teachers : []).forEach(teacher => {
      const name = String(teacher?.name || '').trim();
      const shortName = String(teacher?.shortName || '').trim();
      if (!name) return;
      const key = removeAccentsLocal(name).replace(/[^a-z0-9]/g, '');
      if (!key) return;
      map.set(key, shortName || suggestTeacherShortName(name));
    });
    return map;
  }, [teachers]);

  const teacherAssignmentsByGrade = useMemo(() => (
    Object.fromEntries(BASE_CLASSES.map(grade => {
      const gradeAssignments = classTeacherAssignmentsForYear?.[grade] || {};
      const bySubject = {};
      Object.entries(gradeAssignments).forEach(([subject, assignmentValue]) => {
        const key = subjectKey(subject);
        const teacherName = getSemesterTeacherName(assignmentValue, scheduleSemester);
        if (key && teacherName) bySubject[key] = teacherName;
      });
      return [grade, bySubject];
    }))
  ), [classTeacherAssignmentsForYear, scheduleSemester]);

  const hasTeacherAssignments = useMemo(() => (
    Object.values(teacherAssignmentsByGrade).some(gradeMap => Object.values(gradeMap || {}).some(Boolean))
  ), [teacherAssignmentsByGrade]);

  const pushUniqueTeacherName = (teacherNames, seenTeacherNames, teacherName) => {
    const cleanName = String(teacherName || '').trim();
    if (!cleanName) return;
    const key = removeAccentsLocal(cleanName).replace(/[^a-z0-9]/g, '');
    if (!key || seenTeacherNames.has(key)) return;
    seenTeacherNames.add(key);
    teacherNames.push(cleanName);
  };

  const pushTeacherNamesFromText = (teacherNames, seenTeacherNames, value = '') => {
    String(value || '')
      .split(/[,;/]+/)
      .map(item => item.trim())
      .filter(Boolean)
      .forEach(name => pushUniqueTeacherName(teacherNames, seenTeacherNames, name));
  };

  const getTeacherChoicesForGradeSubject = (grade = '', subjectValue = '') => {
    const key = subjectKey(subjectValue);
    if (!grade || !key) return [];
    const gradeAssignments = classTeacherAssignmentsForYear?.[grade] || {};
    const matchedAssignment = Object.entries(gradeAssignments)
      .find(([subject]) => subjectKey(subject) === key);
    if (!matchedAssignment) return [];

    const [, assignmentValue] = matchedAssignment;
    const teacherNames = [];
    const seenTeacherNames = new Set();
    const pushValue = value => pushTeacherNamesFromText(teacherNames, seenTeacherNames, value);

    if (assignmentValue && typeof assignmentValue === 'object' && !Array.isArray(assignmentValue)) {
      const hk1 = String(assignmentValue.hk1 ?? assignmentValue.hki ?? assignmentValue.semester1 ?? assignmentValue.term1 ?? assignmentValue.fullYear ?? '').trim();
      const hk2 = String(assignmentValue.hk2 ?? assignmentValue.hkii ?? assignmentValue.semester2 ?? assignmentValue.term2 ?? assignmentValue.fullYear ?? '').trim();
      const fallback = String(assignmentValue.value ?? assignmentValue.teacherName ?? assignmentValue.name ?? '').trim();
      const orderedValues = scheduleSemester === 'hk2' ? [hk2, hk1, fallback] : [hk1, hk2, fallback];
      orderedValues.forEach(pushValue);
    } else {
      pushValue(assignmentValue);
    }

    return teacherNames;
  };

  const getTeacherChoicesForRowSubject = (row = {}, subjectValue = '') => {
    const grades = row.grades?.length ? row.grades : [getPrimaryGrade(row)].filter(Boolean);
    const teacherNames = [];
    const seenTeacherNames = new Set();
    grades.forEach(grade => {
      getTeacherChoicesForGradeSubject(grade, subjectValue)
        .forEach(name => pushUniqueTeacherName(teacherNames, seenTeacherNames, name));
    });
    return teacherNames;
  };

  const getRequiredLoadsForRow = (row = {}) => {
    const grade = getPrimaryGrade(row);
    return REQUIRED_LOADS.map(item => {
      if (item.key === 'congnghe' && ['8', '9'].includes(grade)) {
        const required = scheduleSemester === 'hk2' ? 2 : 1;
        return { ...item, required, scheduleSlots: required };
      }
      return { ...item, scheduleSlots: item.scheduleSlots ?? item.required, weight: item.weight ?? 1 };
    });
  };

  const countRowSubjects = (
    row,
    candidateSchedule = schedule,
    rowsOverride = classRows,
    dayKeysOverride = visibleDays,
    periodCountOverride = periodCount
  ) => {
    const targetRow = typeof row === 'string'
      ? (rowsOverride.find(item => item.id === row) || { id: row, grades: [row] })
      : row;
    const loads = getRequiredLoadsForRow(targetRow);
    const loadByKey = Object.fromEntries(loads.map(item => [item.key, item]));
    const counts = Object.fromEntries(loads.map(item => [item.key, 0]));
    const normalized = normalizeSchedule(candidateSchedule, rowsOverride);
    DAYS.filter(day => dayKeysOverride.includes(day.key)).forEach(day => {
      PERIODS.slice(0, periodCountOverride).forEach(period => {
        const key = subjectKey(normalized?.[targetRow.id]?.[day.key]?.[period]);
        if (key && Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += loadByKey[key]?.weight || 1;
      });
    });
    return counts;
  };

  const buildScheduleValidationErrors = (
    candidateSchedule = schedule,
    rowsOverride = classRows,
    dayKeysOverride = visibleDays,
    periodCountOverride = periodCount
  ) => {
    const normalized = normalizeSchedule(candidateSchedule, rowsOverride);
    return rowsOverride.flatMap(row => {
      const rowLoads = getRequiredLoadsForRow(row);
      const counts = countRowSubjects(row, normalized, rowsOverride, dayKeysOverride, periodCountOverride);
      return rowLoads
        .map(item => ({ rowLabel: row.label || row.id, subject: item.label, required: item.required, actual: counts[item.key] || 0 }))
        .filter(item => item.actual !== item.required);
    });
  };

  const schedulesCollection = useMemo(() => collection(db, 'artifacts', appId, 'public', 'data', 'class_schedules'), []);
  const newsCollection = useMemo(() => collection(db, 'artifacts', appId, 'public', 'data', 'news'), []);
  const scheduleSubjects = useMemo(() => {
    const seen = new Set();
    return [...subjects, ...EXTRA_SUBJECTS].filter(Boolean).filter(subject => {
      const key = subjectKey(subject) || String(subject);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [subjects]);

  const getScheduleSubjectOptions = (currentValue = '', row = {}) => {
    const options = [];
    const seen = new Set();
    const addOption = (value) => {
      const cleanValue = String(value || '').trim();
      if (cleanValue === OFF_SLOT_VALUE) return;
      if (!cleanValue || seen.has(cleanValue)) return;
      seen.add(cleanValue);
      options.push(cleanValue);
    };

    addOption(currentValue);
    scheduleSubjects.forEach(subject => {
      const subjectLabel = displayEditorSubject(subject);
      const teacherChoices = getTeacherChoicesForRowSubject(row, subject);
      if (teacherChoices.length) {
        teacherChoices.forEach(teacherName => {
          addOption(formatScheduleCellValue(subjectLabel, teacherName, teacherShortNameByKey));
        });
        return;
      }
      addOption(subjectLabel);
    });

    return options;
  };

  useEffect(() => {
    return onSnapshot(schedulesCollection, snapshot => {
      const items = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(item => String(item.schoolYear || '') === String(currentSchoolYear || ''))
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      setSavedSchedules(items);
    });
  }, [currentSchoolYear, schedulesCollection]);

  const loadSchedule = (item) => {
    const rows = item.classRows?.length ? item.classRows : defaultRows();
    const nextSemester = inferScheduleSemester(item.semester, item.name);
    setActiveId(item.id || '');
    setScheduleSemester(nextSemester);
    setScheduleName(item.name || defaultScheduleName(currentSchoolYear, nextSemester));
    setClassRows(rows);
    setVisibleDays(item.visibleDays?.length ? item.visibleDays : DAYS.map(day => day.key));
    setPeriodCount(Math.min(5, Math.max(1, Number(item.periodCount || 5))));
    applySchedule(normalizeSchedule(item.schedule || {}, rows));
  };

  const newSchedule = (semester = scheduleSemester) => {
    const rows = defaultRows();
    setActiveId('');
    setScheduleSemester(semester);
    setScheduleName(withSemesterPrefix(`TKB ${currentSchoolYear || ''} - bản mới`.trim(), semester));
    setClassRows(rows);
    setVisibleDays(DAYS.map(day => day.key));
    setPeriodCount(5);
    applySchedule(makeEmptySchedule(rows));
  };

  const changeScheduleSemester = (nextSemester) => {
    const semester = inferScheduleSemester(nextSemester);
    setScheduleSemester(semester);
    setScheduleName(prev => withSemesterPrefix(prev || defaultScheduleName(currentSchoolYear, semester), semester));
  };

  const resolveScheduleCellValue = (row, value = '') => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text === OFF_SLOT_VALUE) return OFF_SLOT_VALUE;
    if (hasTeacherSuffix(text)) {
      return compactScheduleCellValue(text, teacherShortNameByKey, displayEditorSubject);
    }
    const subjectLabel = displayEditorSubject(text);
    const teacherChoices = getTeacherChoicesForRowSubject(row, text);
    if (teacherChoices.length) {
      return formatScheduleCellValue(subjectLabel, teacherChoices[0], teacherShortNameByKey);
    }
    return subjectLabel;
  };

  const updateCell = (rowId, dayKey, period, value) => {
    const row = classRows.find(item => item.id === rowId) || { id: rowId, grades: [rowId] };
    const nextValue = resolveScheduleCellValue(row, value);
    applySchedule(prev => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || emptyRow()),
        [dayKey]: {
          ...((prev[rowId] || emptyRow())[dayKey] || emptyDay()),
          [period]: nextValue
        }
      }
    }));
  };

  const toggleOffSlot = (rowId, dayKey, period) => {
    applySchedule(prev => {
      const currentValue = prev?.[rowId]?.[dayKey]?.[period] || '';
      return {
        ...prev,
        [rowId]: {
          ...(prev[rowId] || emptyRow()),
          [dayKey]: {
            ...((prev[rowId] || emptyRow())[dayKey] || emptyDay()),
            [period]: isOffScheduleValue(currentValue) ? '' : OFF_SLOT_VALUE
          }
        }
      };
    });
  };

  const saveSchedule = async (status = 'draft') => {
    setIsSaving(true);
    try {
      const latestSchedule = collectScheduleFromVisibleInputs();
      const semesterMeta = getScheduleSemesterMeta(scheduleSemester);
      const desiredName = withSemesterPrefix(scheduleName.trim() || `TKB ${currentSchoolYear}`, scheduleSemester);
      const activeSchedule = savedSchedules.find(item => item.id === activeId);
      const shouldForkSchedule = Boolean(activeSchedule && desiredName !== (activeSchedule.name || activeSchedule.id || ''));
      const now = getCurrentTimestamp();
      const id = activeId && !shouldForkSchedule ? activeId : `tkb_${now}`;
      const effectiveStatus = status === 'draft' && activeSchedule?.status === 'published' && !shouldForkSchedule ? 'published' : status;
      const normalized = compactScheduleForSave(latestSchedule, classRows, teacherShortNameByKey);
      if (effectiveStatus === 'published') {
        const errors = buildScheduleValidationErrors(normalized);
        if (errors.length > 0) {
          setValidationErrors(errors);
          showNotification?.('Thời khóa biểu chưa đúng số tiết, chưa thể ghim.', 'error');
          return;
        }
      }
      const selectedVisibleDays = DAYS.map(day => day.key).filter(dayKey => visibleDays.includes(dayKey));
      const savedVisibleDays = effectiveStatus === 'published'
        ? getContentVisibleDays({ rows: classRows, visibleDays: selectedVisibleDays, schedule: normalized, periodCount })
        : selectedVisibleDays;
      const payload = {
        name: desiredName,
        semester: scheduleSemester,
        semesterLabel: semesterMeta.label,
        namePrefix: semesterMeta.namePrefix,
        schoolYear: currentSchoolYear,
        classRows,
        visibleDays: savedVisibleDays,
        periodCount,
        schedule: normalized,
        status: effectiveStatus,
        publishedAt: effectiveStatus === 'published' ? now : null,
        updatedAt: now
      };
      if (effectiveStatus === 'published') {
        await Promise.all(savedSchedules
          .filter(item => item.id !== id && item.status === 'published' && inferScheduleSemester(item.semester, item.name) === scheduleSemester)
          .map(item => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_schedules', item.id), { status: 'draft', publishedAt: null, updatedAt: now }, { merge: true })));
      }
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_schedules', id), payload, { merge: true });
      if (effectiveStatus === 'published') {
        const title = `THỜI KHÓA BIỂU ${semesterMeta.label}: ${stripSemesterPrefix(payload.name)}`;
        const content = makeScheduleNewsHtml({ name: payload.name, rows: classRows, visibleDays: payload.visibleDays, schedule: normalized, periodCount });
        const newsSnapshot = await getDocs(newsCollection);
        const existingScheduleNews = newsSnapshot.docs.find(item => item.data()?.type === 'class_schedule' && item.data()?.scheduleId === id);
        const baseNewsPayload = {
          title,
          content,
          updatedAt: now,
          authorId: user?.uid || '',
          type: 'class_schedule',
          scheduleId: id,
          semester: scheduleSemester,
          semesterLabel: semesterMeta.label,
          schoolYear: currentSchoolYear
        };
        if (existingScheduleNews) {
          const existingNewsData = existingScheduleNews.data() || {};
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', existingScheduleNews.id), {
            ...baseNewsPayload,
            isPinned: existingNewsData.pinSource === 'manual' ? Boolean(existingNewsData.isPinned) : false,
            pinSource: existingNewsData.pinSource === 'manual' ? 'manual' : 'auto'
          }, { merge: true });
        } else {
          await addDoc(newsCollection, {
            ...baseNewsPayload,
            createdAt: now,
            sortOrder: now,
            isPinned: false,
            pinSource: 'auto',
            isHot: false
          });
        }
      }
      setActiveId(id);
      setScheduleName(desiredName);
      applySchedule(normalized);
      showNotification?.(shouldForkSchedule ? 'Đã lưu thành bản thời khóa biểu mới.' : (effectiveStatus === 'published' ? 'Đã ghim TKB và đưa vào bản tin thường.' : 'Đã lưu thời khóa biểu.'));
    } catch (error) {
      showNotification?.(`Lỗi lưu thời khóa biểu: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const buildCurrentScheduleExport = () => {
    const latestSchedule = collectScheduleFromVisibleInputs();
    const semesterMeta = getScheduleSemesterMeta(scheduleSemester);
    const name = withSemesterPrefix(scheduleName.trim() || `TKB ${currentSchoolYear}`, scheduleSemester);
    const selectedVisibleDays = DAYS.map(day => day.key).filter(dayKey => visibleDays.includes(dayKey));
    return {
      name,
      schoolYear: currentSchoolYear,
      semesterLabel: semesterMeta.label,
      principalName,
      pcResponsibleName,
      rows: classRows,
      visibleDays: selectedVisibleDays,
      schedule: compactScheduleForSave(latestSchedule, classRows, teacherShortNameByKey),
      periodCount
    };
  };

  const exportScheduleExcel = () => {
    const data = buildCurrentScheduleExport();
    const html = makeScheduleExportHtml(data);
    const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
    downloadBlobFile(`${makeSafeFileName(data.name)}.xls`, blob);
    showNotification?.('Đã tải file Excel thời khóa biểu.');
  };

  const exportSchedulePdf = () => {
    const data = buildCurrentScheduleExport();
    const html = makeScheduleExportHtml({ ...data, includePrintButton: true });
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      downloadBlobFile(`${makeSafeFileName(data.name)}-in-pdf.html`, blob);
      showNotification?.('Trình duyệt chặn cửa sổ PDF. App đã tải file in xuống, mở file đó rồi chọn In/Lưu PDF.', 'error');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch {
        showNotification?.('Chưa mở được hộp thoại in PDF.', 'error');
      }
    }, 450);
  };

  const deleteActiveSchedule = async () => {
    if (!activeId) return;
    const activeSchedule = savedSchedules.find(item => item.id === activeId);
    const scheduleLabel = activeSchedule?.name || scheduleName || 'bản thời khóa biểu này';
    if (!window.confirm(`Xóa "${scheduleLabel}"? Bản tin/thông báo liên quan nếu có sẽ được giữ nguyên.`)) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_schedules', activeId));
      newSchedule();
      showNotification?.('Đã xóa thời khóa biểu đã lưu.');
    } catch (error) {
      showNotification?.(`Lỗi xóa thời khóa biểu: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (dayKey) => {
    setVisibleDays(prev => prev.includes(dayKey) ? prev.filter(key => key !== dayKey) : [...prev, dayKey].sort());
  };

  const mergeClasses = () => {
    if (!mergeA || !mergeB || mergeA === mergeB) {
      showNotification?.('Chọn 2 lớp khác nhau để ghép.', 'error');
      return;
    }
    const grades = [mergeA, mergeB].sort((a, b) => Number(a) - Number(b));
    const id = grades.join('&');
    const row = { id, label: `Lớp ${id}`, grades };
    const nextRows = sortRows([...classRows.filter(item => !item.grades?.some(grade => grades.includes(grade))), row]);
    const sourceSchedule = scheduleRef.current[mergeA] || scheduleRef.current[mergeB] || emptyRow();
    setClassRows(nextRows);
    applySchedule(prev => normalizeSchedule({ ...prev, [id]: sourceSchedule }, nextRows));
  };

  const resetClasses = () => {
    const rows = defaultRows();
    setClassRows(rows);
    applySchedule(prev => normalizeSchedule(prev, rows));
  };

  const copyDaySubject = (rowId, dayKey) => {
    applySchedule(prev => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || emptyRow()),
        [dayKey]: PERIODS.reduce((acc, period) => {
          const current = prev[rowId]?.[dayKey]?.[period] || '';
          const previous = isOffScheduleValue(acc[period - 1]) ? '' : (acc[period - 1] || '');
          if (period > periodCount) acc[period] = current;
          else acc[period] = current || previous;
          return acc;
        }, {})
      }
    }));
  };

  const autoArrangeSchedule = () => {
    const baseDayKeys = DAYS.map(day => day.key).filter(dayKey => visibleDays.includes(dayKey));
    if (!baseDayKeys.length) {
      showNotification?.('Hãy chọn ít nhất 1 thứ để xếp thời khóa biểu.', 'error');
      return;
    }
    if (!hasTeacherAssignments) {
      showNotification?.('Chưa có dữ liệu GV theo lớp. Hãy vào “GV theo lớp”, load từ phân công rồi lưu trước.', 'error');
      return;
    }
    const latestSchedule = collectScheduleFromVisibleInputs();
    const hasExistingContent = Object.values(latestSchedule || {}).some(row => (
      DAYS.some(day => PERIODS.some(period => !isBlankScheduleValue(row?.[day.key]?.[period])))
    ));
    const preservedSlotCount = Object.values(latestSchedule || {}).reduce((total, row) => (
      total + DAYS.reduce((dayTotal, day) => (
        dayTotal + PERIODS.filter(period => !isBlankScheduleValue(row?.[day.key]?.[period])).length
      ), 0)
    ), 0);

    const rows = classRows?.length ? classRows : defaultRows();
    const lockedSchedule = normalizeSchedule(latestSchedule, rows);
    const allDayKeys = DAYS.map(day => day.key);
    const getLockedSubjectCounts = (row) => {
      const counts = {};
      DAYS.forEach(day => {
        PERIODS.forEach(period => {
          const value = lockedSchedule?.[row.id]?.[day.key]?.[period] || '';
          if (isOpenScheduleValue(value)) return;
          const key = subjectKey(value);
          if (!key) return;
          counts[key] = (counts[key] || 0) + 1;
        });
      });
      return counts;
    };
    const remainingLoadsByRowId = Object.fromEntries(rows.map(row => {
      const lockedCounts = getLockedSubjectCounts(row);
      const loads = getRequiredLoadsForRow(row).map(load => {
        const requiredSlots = Number(load.scheduleSlots ?? load.required ?? 0);
        const alreadyPlaced = Number(lockedCounts[load.key] || 0);
        return {
          ...load,
          remainingSlots: Math.max(0, requiredSlots - alreadyPlaced),
          alreadyPlaced
        };
      });
      return [row.id, loads];
    }));
    const maxRequiredSlots = Math.max(...rows.map(row => (
      (remainingLoadsByRowId[row.id] || []).reduce((sum, item) => sum + Number(item.remainingSlots || 0), 0)
    )), 0);

    const loadPriorityByKey = Object.fromEntries(REQUIRED_LOADS.map((item, index) => [item.key, index]));
    const rawTasks = rows.flatMap((row, rowIndex) => {
      const grade = getPrimaryGrade(row);
      const teacherMap = teacherAssignmentsByGrade[grade] || {};
      return (remainingLoadsByRowId[row.id] || []).flatMap((load, loadIndex) => {
        const teacherName = teacherMap[load.key] || '';
        const teacherKeys = getTeacherKeys(teacherName);
        const value = formatScheduleCellValue(load.label, teacherName, teacherShortNameByKey);
        const tasks = [];
        let remaining = Number(load.remainingSlots || 0);
        let blockIndex = 0;
        const compactVisit = SINGLE_VISIT_SUBJECT_KEYS.has(load.key) && !load.paired && teacherKeys.length > 0;
        const homeroomPair = HOMEROOM_PAIR_SUBJECT_KEYS.has(load.key);
        while (load.paired && remaining >= 2) {
          tasks.push({ row, rowId: row.id, rowLabel: row.label || row.id, rowIndex, key: load.key, loadIndex, blockIndex, blockLength: 2, teacherName, teacherKeys, value, compactVisit: false, homeroomPair: false });
          blockIndex += 1;
          remaining -= 2;
        }
        while (remaining > 0) {
          tasks.push({ row, rowId: row.id, rowLabel: row.label || row.id, rowIndex, key: load.key, loadIndex, blockIndex, blockLength: 1, teacherName, teacherKeys, value, compactVisit, homeroomPair });
          blockIndex += 1;
          remaining -= 1;
        }
        return tasks;
      });
    });
    const teacherSpread = new Map();
    const teacherDemand = new Map();
    rawTasks.forEach(task => {
      task.teacherKeys.forEach(key => {
        const rowsForTeacher = teacherSpread.get(key) || new Set();
        rowsForTeacher.add(task.rowId);
        teacherSpread.set(key, rowsForTeacher);
        teacherDemand.set(key, (teacherDemand.get(key) || 0) + task.blockLength);
      });
    });
    const tasks = rawTasks.map(task => {
      const spreadScore = task.teacherKeys.reduce((max, key) => Math.max(max, teacherSpread.get(key)?.size || 0), 0);
      const demandScore = task.teacherKeys.reduce((sum, key) => sum + (teacherDemand.get(key) || 0), 0);
      const score = spreadScore * 10000 + demandScore * 100 + Number(task.teacherKeys.length > 0) * 1000 + task.blockLength * 50;
      return { ...task, score };
    });

    const hiddenDayKeys = allDayKeys.filter(dayKey => !baseDayKeys.includes(dayKey));
    const dayKeyPlans = [baseDayKeys];
    hiddenDayKeys.forEach((_, index) => {
      dayKeyPlans.push([...baseDayKeys, ...hiddenDayKeys.slice(0, index + 1)]);
    });
    const attemptConfigs = [];
    const seenConfigs = new Set();
    const addAttemptConfig = (dayKeys, attemptPeriodCount) => {
      const orderedDayKeys = allDayKeys.filter(dayKey => dayKeys.includes(dayKey));
      const hasEnoughOpenSlots = rows.every(row => {
        const requiredSlots = (remainingLoadsByRowId[row.id] || []).reduce((sum, item) => sum + Number(item.remainingSlots || 0), 0);
        const openSlots = orderedDayKeys.reduce((sum, dayKey) => (
          sum + PERIODS.slice(0, attemptPeriodCount).filter(period => isBlankScheduleValue(lockedSchedule?.[row.id]?.[dayKey]?.[period])).length
        ), 0);
        return openSlots >= requiredSlots;
      });
      if (!orderedDayKeys.length || orderedDayKeys.length * attemptPeriodCount < maxRequiredSlots || !hasEnoughOpenSlots) return;
      const configKey = `${orderedDayKeys.join(',')}-${attemptPeriodCount}`;
      if (seenConfigs.has(configKey)) return;
      seenConfigs.add(configKey);
      attemptConfigs.push({ dayKeys: orderedDayKeys, periodCount: attemptPeriodCount });
    };
    dayKeyPlans.forEach(dayKeys => {
      for (let attemptPeriodCount = periodCount; attemptPeriodCount <= PERIODS.length; attemptPeriodCount += 1) {
        addAttemptConfig(dayKeys, attemptPeriodCount);
      }
    });
    if (!attemptConfigs.length) {
      showNotification?.('Số tiết/ngày và số thứ đang chọn không đủ ô để xếp đủ định mức.', 'error');
      return;
    }

    const pairPeriodOrders = [
      [1, 3, 2, 4, 5],
      [3, 1, 4, 2, 5],
      [2, 4, 1, 3, 5],
      [4, 2, 3, 1, 5]
    ];
    const singlePeriodOrders = [
      [1, 2, 3, 4, 5],
      [4, 3, 2, 1, 5],
      [2, 3, 1, 4, 5],
      [3, 2, 4, 1, 5]
    ];

    const arrangeAttempt = ({ dayKeys, periodCount: attemptPeriodCount }, variant = 0) => {
      const next = makeEmptySchedule(rows);
      const teacherBusy = new Map();
      const compactVisitCounts = new Map();
      const markTeacherBusy = (teacherKeys, dayKey, periods) => {
        if (!teacherKeys.length) return;
        periods.forEach(period => {
          const busyKey = `${dayKey}-${period}`;
          const busySet = teacherBusy.get(busyKey) || new Set();
          teacherKeys.forEach(key => busySet.add(key));
          teacherBusy.set(busyKey, busySet);
        });
      };
      rows.forEach(row => {
        DAYS.forEach(day => {
          PERIODS.forEach(period => {
            const lockedValue = lockedSchedule?.[row.id]?.[day.key]?.[period] || '';
            if (isBlankScheduleValue(lockedValue)) return;
            next[row.id][day.key][period] = lockedValue;
            getScheduleCellTeacherKeys(lockedValue).forEach(teacherKey => {
              markTeacherBusy([teacherKey], day.key, [period]);
            });
          });
        });
      });
      let placedSlotCount = 0;

      const isTeacherAvailable = (teacherKeys, dayKey, periods) => (
        !teacherKeys.length || periods.every(period => {
          const busySet = teacherBusy.get(`${dayKey}-${period}`);
          return !busySet || teacherKeys.every(key => !busySet.has(key));
        })
      );
      const isSlotEmpty = (rowId, dayKey, periods) => periods.every(period => isBlankScheduleValue(next?.[rowId]?.[dayKey]?.[period]));
      const countUsedPeriods = (rowId, dayKey) => PERIODS.slice(0, attemptPeriodCount)
        .filter(period => !isOpenScheduleValue(next?.[rowId]?.[dayKey]?.[period]))
        .length;
      const countSubjectOnDay = (rowId, dayKey, key) => PERIODS.slice(0, attemptPeriodCount)
        .filter(period => subjectKey(next?.[rowId]?.[dayKey]?.[period]) === key)
        .length;
      const getHomeroomPairKey = key => {
        if (key === 'gddp') return 'cn';
        if (key === 'cn') return 'gddp';
        return '';
      };
      const getHomeroomPairSlots = (rowId, key) => {
        const pairKey = getHomeroomPairKey(key);
        if (!pairKey) return [];
        return dayKeys.flatMap(dayKey => PERIODS.slice(0, attemptPeriodCount)
          .filter(period => subjectKey(next?.[rowId]?.[dayKey]?.[period]) === pairKey)
          .map(period => ({ dayKey, period })));
      };
      const homeroomPairPenalty = (task, dayKey, periods) => {
        if (!task.homeroomPair) return 0;
        const pairSlots = getHomeroomPairSlots(task.rowId, task.key);
        if (!pairSlots.length) return -15;
        const isAdjacent = pairSlots.some(slot => slot.dayKey === dayKey && periods.some(period => Math.abs(period - slot.period) === 1));
        if (isAdjacent) return -520;
        const isSameDay = pairSlots.some(slot => slot.dayKey === dayKey);
        return isSameDay ? -340 : 360;
      };
      const getTeacherDayCount = (teacherKey, dayKey) => PERIODS.slice(0, attemptPeriodCount)
        .filter(period => teacherBusy.get(`${dayKey}-${period}`)?.has(teacherKey))
        .length;
      const getMaxTeacherDayCount = (teacherKeys, dayKey) => (
        teacherKeys.reduce((max, key) => Math.max(max, getTeacherDayCount(key, dayKey)), 0)
      );
      const hasOpenTeacherDay = (teacherKeys) => (
        teacherKeys.some(key => dayKeys.some(dayKey => getTeacherDayCount(key, dayKey) === 1))
      );
      const compactVisitPenalty = (task, dayKey) => {
        if (!task.compactVisit) return 0;
        const dayCount = getMaxTeacherDayCount(task.teacherKeys, dayKey);
        if (dayCount === 1) return -260;
        if (dayCount === 0 && hasOpenTeacherDay(task.teacherKeys)) return 220;
        if (dayCount >= 2) return 120 + dayCount * 45;
        return 35;
      };
      const rotatedDayKeys = (task) => {
        if (!dayKeys.length) return [];
        const shift = (variant + task.rowIndex + task.loadIndex) % dayKeys.length;
        return [...dayKeys.slice(shift), ...dayKeys.slice(0, shift)];
      };
      const getCandidateSlots = (task) => {
        const dayOrder = rotatedDayKeys(task);
        const periodOrderSource = task.blockLength === 2
          ? pairPeriodOrders[variant % pairPeriodOrders.length]
          : singlePeriodOrders[variant % singlePeriodOrders.length];
        const startPeriods = periodOrderSource.filter(period => period + task.blockLength - 1 <= attemptPeriodCount);
        const candidates = [];
        dayOrder.forEach((dayKey, dayIndex) => {
          startPeriods.forEach(start => {
            const periods = Array.from({ length: task.blockLength }, (_, index) => start + index);
            if (!isSlotEmpty(task.rowId, dayKey, periods)) return;
            if (!isTeacherAvailable(task.teacherKeys, dayKey, periods)) return;
            const sameSubjectCount = countSubjectOnDay(task.rowId, dayKey, task.key);
            const rowDayUsed = countUsedPeriods(task.rowId, dayKey);
            const pairShapePenalty = task.blockLength === 2 && start % 2 !== 1 ? 5 : 0;
            const score = sameSubjectCount * 300 + rowDayUsed * 8 + pairShapePenalty + homeroomPairPenalty(task, dayKey, periods) + compactVisitPenalty(task, dayKey) + dayIndex;
            candidates.push({ dayKey, periods, score });
          });
        });
        return candidates.sort((a, b) => a.score - b.score);
      };
      const markCompactVisit = (task, dayKey, periods) => {
        if (!task.compactVisit) return;
        task.teacherKeys.forEach(key => {
          const visitKey = `${key}-${dayKey}`;
          compactVisitCounts.set(visitKey, (compactVisitCounts.get(visitKey) || 0) + periods.length);
        });
      };

      const orderedTasks = [...tasks].sort((a, b) => (
        b.score - a.score
        || (loadPriorityByKey[a.key] ?? 99) - (loadPriorityByKey[b.key] ?? 99)
        || (variant % 2 === 0 ? a.rowIndex - b.rowIndex : b.rowIndex - a.rowIndex)
        || a.blockIndex - b.blockIndex
      ));
      const unplaced = [];
      orderedTasks.forEach(task => {
        const slot = getCandidateSlots(task)[0];
        if (!slot) {
          unplaced.push(task);
          return;
        }
        slot.periods.forEach(period => {
          next[task.rowId][slot.dayKey][period] = task.value;
        });
        markTeacherBusy(task.teacherKeys, slot.dayKey, slot.periods);
        markCompactVisit(task, slot.dayKey, slot.periods);
        placedSlotCount += slot.periods.length;
      });

      const visitPenalty = [...compactVisitCounts.values()].reduce((sum, count) => {
        if (count === 1) return sum + 60;
        if (count === 2) return sum;
        return sum + Math.abs(count - 2) * 25;
      }, 0);
      const homeroomPairResultPenalty = rows.reduce((sum, row) => {
        const slotsByKey = { gddp: [], cn: [] };
        dayKeys.forEach(dayKey => {
          PERIODS.slice(0, attemptPeriodCount).forEach(period => {
            const key = subjectKey(next?.[row.id]?.[dayKey]?.[period]);
            if (key === 'gddp' || key === 'cn') slotsByKey[key].push({ dayKey, period });
          });
        });
        if (!slotsByKey.gddp.length || !slotsByKey.cn.length) return sum + 30;
        const adjacent = slotsByKey.gddp.some(gddpSlot => slotsByKey.cn.some(cnSlot => (
          gddpSlot.dayKey === cnSlot.dayKey && Math.abs(gddpSlot.period - cnSlot.period) === 1
        )));
        if (adjacent) return sum;
        const sameDay = slotsByKey.gddp.some(gddpSlot => slotsByKey.cn.some(cnSlot => gddpSlot.dayKey === cnSlot.dayKey));
        return sum + (sameDay ? 8 : 45);
      }, 0);
      const validationErrors = buildScheduleValidationErrors(next, rows, dayKeys, attemptPeriodCount);
      return {
        dayKeys,
        periodCount: attemptPeriodCount,
        next,
        placedSlotCount,
        visitPenalty,
        homeroomPairPenalty: homeroomPairResultPenalty,
        unplaced,
        validationErrors,
        success: unplaced.length === 0 && validationErrors.length === 0
      };
    };

    let chosenResult = null;
    let bestResult = null;
    const compareArrangeResults = (left, right) => {
      if (!right) return -1;
      const leftPenalty = left.validationErrors.length * 20 + left.unplaced.length * 50;
      const rightPenalty = right.validationErrors.length * 20 + right.unplaced.length * 50;
      if (leftPenalty !== rightPenalty) return leftPenalty - rightPenalty;
      const leftExtraDays = left.dayKeys.filter(dayKey => !baseDayKeys.includes(dayKey)).length;
      const rightExtraDays = right.dayKeys.filter(dayKey => !baseDayKeys.includes(dayKey)).length;
      if (leftExtraDays !== rightExtraDays) return leftExtraDays - rightExtraDays;
      if (left.periodCount !== right.periodCount) return left.periodCount - right.periodCount;
      if ((left.homeroomPairPenalty || 0) !== (right.homeroomPairPenalty || 0)) return (left.homeroomPairPenalty || 0) - (right.homeroomPairPenalty || 0);
      if ((left.visitPenalty || 0) !== (right.visitPenalty || 0)) return (left.visitPenalty || 0) - (right.visitPenalty || 0);
      return right.placedSlotCount - left.placedSlotCount;
    };
    attemptConfigs.forEach(config => {
      for (let variant = 0; variant < 16; variant += 1) {
        const result = arrangeAttempt(config, variant);
        if (compareArrangeResults(result, bestResult) < 0) {
          bestResult = result;
        }
        if (result.success) {
          if (compareArrangeResults(result, chosenResult) < 0) chosenResult = result;
        }
      }
    });

    const result = chosenResult || bestResult;
    if (!result) {
      showNotification?.('Chưa tạo được phương án xếp tự động.', 'error');
      return;
    }

    setClassRows(rows);
    setMergeA('6');
    setMergeB('7');
    setVisibleDays(result.dayKeys);
    setPeriodCount(result.periodCount);
    applySchedule(result.next);
    setShowStats(true);
    setValidationErrors(result.validationErrors);

    if (result.success) {
      const openedDays = result.dayKeys.filter(dayKey => !baseDayKeys.includes(dayKey)).map(dayKey => DAYS.find(day => day.key === dayKey)?.label || dayKey);
      const detail = [
        result.periodCount !== periodCount ? `${result.periodCount} tiết/ngày` : '',
        openedDays.length ? `mở thêm ${openedDays.join(', ')}` : '',
        hasExistingContent ? `giữ ${preservedSlotCount} ô đã xếp` : ''
      ].filter(Boolean).join(', ');
      showNotification?.(`Đã xếp đủ số tiết${detail ? ` (${detail})` : ''}.`);
      return;
    }

    showNotification?.(`Đã thử ép đủ nhưng còn ${result.validationErrors.length} mục chưa đạt do trùng giáo viên hoặc thiếu chỗ. Tôi đã giữ phương án gần nhất để xem lại.`, 'error');
  };
  const shownDays = DAYS.filter(day => visibleDays.includes(day.key));
  const scheduleDiagnostics = (() => {
    const normalized = normalizeSchedule(schedule, classRows);
    const overSubjectCells = new Map();
    const overLoadWarnings = [];
    const conflictCells = new Map();
    const teacherSlotMap = new Map();
    const activeDayKeys = new Set(visibleDays);

    classRows.forEach(row => {
      const rowLoads = getRequiredLoadsForRow(row);
      const loadByKey = Object.fromEntries(rowLoads.map(item => [item.key, item]));
      const counts = countRowSubjects(row, normalized);

      Object.entries(counts).forEach(([key, actual]) => {
        const load = loadByKey[key];
        if (!load || actual <= load.required) return;

        const teacherNames = new Set();
        DAYS.filter(day => activeDayKeys.has(day.key)).forEach(day => {
          PERIODS.slice(0, periodCount).forEach(period => {
            const value = normalized?.[row.id]?.[day.key]?.[period] || '';
            if (subjectKey(value) !== key) return;
            const teacherText = getScheduleCellTeacherText(value);
            if (teacherText) teacherNames.add(teacherText);
          });
        });

        const message = `${row.label || row.id}: ${load.label} dư ${actual - load.required} tiết${teacherNames.size ? ` (${[...teacherNames].join(', ')})` : ''}`;
        overLoadWarnings.push(message);
        overSubjectCells.set(`${row.id}-${key}`, { message });
      });
    });

    DAYS.filter(day => activeDayKeys.has(day.key)).forEach(day => {
      PERIODS.slice(0, periodCount).forEach(period => {
        classRows.forEach(row => {
          const value = normalized?.[row.id]?.[day.key]?.[period] || '';
          if (isOpenScheduleValue(value)) return;
          const teacherText = getScheduleCellTeacherText(value);
          getScheduleCellTeacherKeys(value).forEach(teacherKey => {
            const mapKey = `${day.key}-${period}-${teacherKey}`;
            const slots = teacherSlotMap.get(mapKey) || [];
            slots.push({ rowId: row.id, rowLabel: row.label || row.id, dayKey: day.key, dayLabel: day.label, period, teacherText, value });
            teacherSlotMap.set(mapKey, slots);
          });
        });
      });
    });

    const teacherConflictWarnings = [];
    teacherSlotMap.forEach(slots => {
      const rowIds = new Set(slots.map(slot => slot.rowId));
      if (rowIds.size <= 1) return;
      const first = slots[0];
      const teacherName = first.teacherText || 'Giáo viên';
      const message = `${teacherName} trùng ${first.dayLabel} tiết ${first.period}: ${slots.map(slot => slot.rowLabel).join(', ')}`;
      teacherConflictWarnings.push(message);
      slots.forEach(slot => {
        conflictCells.set(`${slot.rowId}-${slot.dayKey}-${slot.period}`, { message });
      });
    });

    return { overSubjectCells, overLoadWarnings, conflictCells, teacherConflictWarnings };
  })();

  return (
    <div className="min-h-screen w-full bg-white border-0 sm:border-2 sm:border-emerald-100 sm:shadow-xl overflow-hidden">
      <div className="border-b border-slate-100 bg-white">
        <div className="flex flex-wrap items-center gap-2 bg-emerald-50 px-3 py-2">
          <h3 className="mr-1 text-base sm:text-lg font-black text-emerald-950 uppercase whitespace-nowrap">
            <span className="sm:hidden">TKB</span><span className="hidden sm:inline">Thời khóa biểu</span>
          </h3>
          <select value={activeId} onChange={(event) => {
            if (!event.target.value) {
              newSchedule();
              return;
            }
            const item = savedSchedules.find(scheduleItem => scheduleItem.id === event.target.value);
            if (item) loadSchedule(item);
          }} className="h-9 w-[250px] rounded-lg border border-emerald-100 bg-white px-3 text-xs font-black text-slate-700 outline-none">
            <option value="">Soạn TKB mới</option>
            {savedSchedules.map(item => (
              <option key={item.id} value={item.id}>
                {item.status === 'published' ? '[Đã ghim] ' : ''}[{getScheduleSemesterMeta(inferScheduleSemester(item.semester, item.name)).label}] {stripSemesterPrefix(item.name || item.id)}
              </option>
            ))}
          </select>
          <input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} className="h-9 w-[240px] rounded-lg border border-emerald-100 bg-white px-3 text-xs font-bold outline-none focus:border-emerald-400" placeholder="Tên thời khóa biểu..." />
          <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-100 bg-white px-2.5">
            <span className="text-[10px] font-black uppercase text-emerald-700">Học kỳ</span>
            <select value={scheduleSemester} onChange={(event) => changeScheduleSemester(event.target.value)} className="bg-transparent text-xs font-black text-slate-800 outline-none">
              {SCHEDULE_SEMESTERS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={autoArrangeSchedule} disabled={isSaving} className="h-9 rounded-lg bg-violet-600 px-3 text-white text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Sparkles className="w-4 h-4" /> Xếp tự động
            </button>
            <button type="button" onClick={deleteActiveSchedule} disabled={!activeId || isSaving} className="h-9 rounded-lg bg-rose-50 border border-rose-100 px-2.5 text-rose-600 text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
              <Trash2 className="w-4 h-4" /> <span>Xóa</span>
            </button>
            <button type="button" onClick={exportScheduleExcel} disabled={isSaving} className="h-9 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 text-emerald-700 text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button type="button" onClick={exportSchedulePdf} disabled={isSaving} className="h-9 rounded-lg bg-cyan-50 border border-cyan-100 px-2.5 text-cyan-700 text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <FileText className="w-4 h-4" /> PDF
            </button>
            <button type="button" onClick={() => saveSchedule('draft')} disabled={isSaving} className="h-9 rounded-lg bg-emerald-600 px-3 text-white text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Save className="w-4 h-4" /> Lưu
            </button>
            <button type="button" onClick={() => saveSchedule('published')} disabled={isSaving} className="h-9 rounded-lg bg-blue-600 px-3 text-white text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Send className="w-4 h-4" /> <span>Ghim TKB</span>
            </button>
            <button type="button" onClick={onClose} className="h-9 w-9 rounded-lg bg-white border border-emerald-100 text-slate-500 hover:text-rose-600 inline-flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-2">
          <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
            <span className="text-[10px] font-black uppercase text-slate-500">Tiết/ngày</span>
            <select value={periodCount} onChange={(event) => setPeriodCount(Number(event.target.value))} className="bg-transparent text-xs font-black outline-none">
              {PERIODS.map(period => <option key={period} value={period}>{period}</option>)}
            </select>
          </label>

          <details className="relative">
            <summary className="h-9 cursor-pointer list-none rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 inline-flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-indigo-600" />
              Ẩn cột
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700">{visibleDays.length}/{DAYS.length}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </summary>
            <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              {DAYS.map(day => (
                <label key={day.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50">
                  <input type="checkbox" checked={visibleDays.includes(day.key)} onChange={() => toggleDay(day.key)} className="h-4 w-4 accent-indigo-600" />
                  <span>{day.label}</span>
                  <span className="ml-auto text-[10px] text-slate-400">{visibleDays.includes(day.key) ? 'Hiện' : 'Ẩn'}</span>
                </label>
              ))}
            </div>
          </details>

          <div className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-[10px] font-black uppercase text-slate-500">Ghép</span>
            <select value={mergeA} onChange={(event) => setMergeA(event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black outline-none">
              {BASE_CLASSES.map(item => <option key={item} value={item}>Lớp {item}</option>)}
            </select>
            <select value={mergeB} onChange={(event) => setMergeB(event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black outline-none">
              {BASE_CLASSES.map(item => <option key={item} value={item}>Lớp {item}</option>)}
            </select>
            <button type="button" onClick={mergeClasses} className="rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-black uppercase text-white">Ghép</button>
            <button type="button" onClick={resetClasses} className="rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-black uppercase text-slate-500">Tách</button>
          </div>

          <details className="relative">
            <summary className="h-9 cursor-pointer list-none rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 inline-flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600" /> Trợ giúp <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </summary>
            <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-600 shadow-xl">
              Bấm “Đổ tiết” để lấp các ô trống tới số tiết đã khai báo. Khi ghép lớp, ví dụ ghép 6 và 7 thì tên hàng sẽ là Lớp 6&7.
            </div>
          </details>

          <button type="button" onClick={() => setShowStats(prev => !prev)} className="h-9 rounded-lg bg-amber-50 border border-amber-100 px-3 text-amber-700 text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5">
            <BarChart3 className="w-4 h-4" /> <span className="sm:hidden">Test</span><span className="hidden sm:inline">Kiểm tra tiết</span>
          </button>
        </div>
      </div>

      {(scheduleDiagnostics.teacherConflictWarnings.length > 0 || scheduleDiagnostics.overLoadWarnings.length > 0) && (
        <div className="border-b border-rose-100 bg-rose-50 px-3 py-2">
          <div className="flex flex-wrap items-start gap-2 text-xs font-bold text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1">
              <div className="font-black uppercase">
                Có {scheduleDiagnostics.teacherConflictWarnings.length} trùng giáo viên, {scheduleDiagnostics.overLoadWarnings.length} mục dư tiết
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-rose-700">
                {[...scheduleDiagnostics.teacherConflictWarnings, ...scheduleDiagnostics.overLoadWarnings].slice(0, 4).map((message, index) => (
                  <span key={`${message}-${index}`}>{message}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showStats && (
        <div className="p-3 sm:p-4 bg-amber-50 border-b border-amber-100 overflow-x-auto">
          <div className="text-sm font-black text-amber-900 uppercase mb-3">Kiểm tra số tiết theo từng hàng lớp - {getScheduleSemesterMeta(scheduleSemester).label}</div>
          <table className="w-full min-w-[900px] text-xs bg-white border border-amber-100 rounded-2xl overflow-hidden">
            <thead>
              <tr className="bg-amber-100/70 text-amber-900 uppercase">
                <th className="px-3 py-2 text-left">Lớp</th>
                {REQUIRED_LOADS.map(item => <th key={item.key} className="px-3 py-2 text-center">{item.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {classRows.map(row => {
                const rowLoads = getRequiredLoadsForRow(row);
                const counts = countRowSubjects(row, schedule);
                return (
                  <tr key={row.id} className="border-t border-amber-50">
                    <td className="px-3 py-2 font-black text-slate-700">{row.label}</td>
                    {REQUIRED_LOADS.map(baseItem => {
                      const item = rowLoads.find(load => load.key === baseItem.key) || baseItem;
                      const actual = counts[item.key] || 0;
                      const ok = actual === item.required;
                      const over = actual > item.required;
                      return (
                        <td key={item.key} className={`px-3 py-2 text-center font-black ${ok ? 'text-emerald-700 bg-emerald-50' : over ? 'text-rose-700 bg-rose-50' : 'text-amber-700 bg-amber-50'}`}>
                          {actual}/{item.required}
                          <div className="text-[9px] uppercase">{ok ? 'Đủ' : over ? `Dư ${actual - item.required}` : `Thiếu ${item.required - actual}`}</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="fixed inset-0 z-[160] bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="w-full max-w-3xl max-h-[86vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-rose-100 flex flex-col">
            <div className="px-5 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between gap-3">
              <div>
                <div className="font-black text-rose-800 uppercase">Chưa thể xuất bản TKB</div>
                <div className="text-xs font-bold text-rose-600/80 mt-1">Các lớp dưới đây chưa đúng định mức tiết của {getScheduleSemesterMeta(scheduleSemester).label}. Sửa xong hãy xuất bản lại.</div>
              </div>
              <button type="button" onClick={() => setValidationErrors([])} className="w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full text-sm border border-rose-100 rounded-2xl overflow-hidden">
                <thead className="bg-rose-50 text-rose-800 uppercase text-xs">
                  <tr>
                    <th className="text-left p-3 border-b border-rose-100">Lớp</th>
                    <th className="text-left p-3 border-b border-rose-100">Môn/phần</th>
                    <th className="text-center p-3 border-b border-rose-100">Cần</th>
                    <th className="text-center p-3 border-b border-rose-100">Đang có</th>
                    <th className="text-left p-3 border-b border-rose-100">Lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {validationErrors.map((error, index) => (
                    <tr key={`${error.rowLabel}-${error.subject}-${index}`} className="border-b border-rose-50">
                      <td className="p-3 font-black text-slate-800">{error.rowLabel}</td>
                      <td className="p-3 font-bold text-slate-700">{error.subject}</td>
                      <td className="p-3 text-center font-black text-slate-700">{error.required}</td>
                      <td className="p-3 text-center font-black text-slate-700">{error.actual}</td>
                      <td className="p-3 font-bold text-rose-700">{error.actual > error.required ? `Dư ${error.actual - error.required} tiết` : `Thiếu ${error.required - error.actual} tiết`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div ref={editorTableRef} className="overflow-x-auto">
        <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col className="w-24 sm:w-32" />
            <col className="w-16" />
            {shownDays.map(day => <col key={`col-${day.key}`} className="w-[145px]" />)}
          </colgroup>
          <thead>
            <tr className="bg-slate-50 text-slate-600 uppercase text-xs">
              <th className="px-2 sm:px-4 py-3 text-left w-24 sm:w-32 sticky left-0 bg-slate-50 z-30 border-b border-r border-slate-200">Lớp</th>
              <th className="px-3 py-3 text-center w-16 sticky left-24 sm:left-32 bg-slate-50 z-30 border-b border-r border-slate-200">Tiết</th>
              {shownDays.map(day => <th key={day.key} className="px-3 py-3 text-center w-[145px] border-b border-r border-slate-200">{day.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {classRows.flatMap(row => [
              ...PERIODS.slice(0, periodCount).map((period, periodIndex) => (
                <tr key={`${row.id}-${period}`} className="border-t border-slate-100">
                  {periodIndex === 0 && (
                    <td rowSpan={periodCount + 1} className="px-2 sm:px-4 py-3 sticky left-0 bg-white z-30 align-middle border-b border-r border-slate-200 shadow-[inset_-1px_0_0_#e2e8f0]">
                      <div className="rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-black px-2 sm:px-3 py-3 text-center whitespace-normal leading-tight">
                        {row.label}
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-3 sticky left-24 sm:left-32 bg-white z-20 text-center align-middle border-b border-r border-slate-200">
                    <span className="hidden sm:inline text-[10px] font-black text-slate-400 uppercase">Tiết </span>
                    <span className="font-black text-slate-500">{period}</span>
                  </td>
                  {shownDays.map(day => {
                    const cellValue = schedule[row.id]?.[day.key]?.[period] || '';
                    const cellIsOff = isOffScheduleValue(cellValue);
                    const conflictIssue = scheduleDiagnostics.conflictCells.get(`${row.id}-${day.key}-${period}`);
                    const overIssue = !cellIsOff && !isBlankScheduleValue(cellValue)
                      ? scheduleDiagnostics.overSubjectCells.get(`${row.id}-${subjectKey(cellValue)}`)
                      : null;
                    const issueTitle = [conflictIssue?.message, overIssue?.message].filter(Boolean).join(' | ');
                    const cellToneClass = conflictIssue
                      ? 'border-rose-200 bg-rose-100/80'
                      : overIssue
                        ? 'border-amber-200 bg-amber-50/90'
                        : cellIsOff
                          ? 'border-rose-100 bg-rose-50/60'
                          : 'border-slate-100';
                    const selectToneClass = conflictIssue
                      ? 'border-rose-400 bg-rose-50 text-rose-800 ring-2 ring-rose-200'
                      : overIssue
                        ? 'border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-amber-200'
                        : cellIsOff
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-white text-slate-800';
                    return (
                      <td key={day.key} className={`px-2 py-2 align-middle border-b border-r ${cellToneClass}`}>
                        <div className="flex items-center gap-1.5">
                          <select
                            data-row-id={row.id}
                            data-day-key={day.key}
                            data-period={period}
                            value={cellIsOff ? OFF_SLOT_VALUE : cellValue}
                            disabled={cellIsOff}
                            title={issueTitle || undefined}
                            onChange={(event) => updateCell(row.id, day.key, period, event.target.value)}
                            className={`min-w-0 flex-1 rounded-xl border px-2 py-2 text-xs font-bold focus:outline-none focus:border-emerald-400 disabled:cursor-not-allowed ${selectToneClass}`}
                          >
                            <option value="">-</option>
                            <option value={OFF_SLOT_VALUE}>Nghỉ</option>
                            {getScheduleSubjectOptions(cellValue, row).map(subject => (
                              <option key={subject} value={subject}>{compactScheduleCellValue(subject, teacherShortNameByKey)}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => toggleOffSlot(row.id, day.key, period)}
                            title={cellIsOff ? 'Mở lại ô này' : 'Cho lớp nghỉ tiết này'}
                            className={`h-9 w-9 shrink-0 rounded-xl border text-[11px] font-black transition-all ${cellIsOff ? 'border-rose-300 bg-rose-600 text-white shadow-sm hover:bg-rose-700' : 'border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600'}`}
                          >
                            X
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )),
              <tr key={`${row.id}-fill`} className="border-t border-blue-50 bg-blue-50/30">
                <td className="px-3 py-2 sticky left-24 sm:left-32 bg-blue-50 z-20 text-center align-middle border-b border-r border-blue-100">
                  <span className="text-[10px] font-black text-blue-500 uppercase">Đổ</span>
                </td>
                {shownDays.map(day => (
                  <td key={day.key} className="px-2 py-2 border-b border-r border-blue-100">
                    <button type="button" onClick={() => copyDaySubject(row.id, day.key)} className="w-full rounded-xl bg-white border border-blue-100 text-blue-700 py-2 text-[10px] font-black uppercase shadow-sm hover:bg-blue-600 hover:text-white transition-all">
                      Đổ tiết
                    </button>
                  </td>
                ))}
              </tr>
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}
