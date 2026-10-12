import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { saveSchedulePublication, deleteSchedulePublication } from '../services/schedulePublication';
import { inferScheduleSemester } from '../utils/scheduleScope';
import { solveTimetable } from '../utils/timetableSolver';
import { clearSlotsOutsideScheduleSettings, findLessonsOutsideScheduleSettings, getScheduleMaxPeriods, getScheduleTeachingDays, normalizeScheduleDayPeriods } from '../utils/scheduleSettings';
import ScheduleSettingsDialog from './ScheduleSettingsDialog';
import { AlertTriangle, BarChart3, ChevronDown, EyeOff, FileSpreadsheet, FileText, HelpCircle, Loader2, Save, Send, Settings, Sparkles, Trash2, Users, X } from 'lucide-react';
import { appId, db } from '../config/firebase';
import { DEFAULT_SCHOOL_CODE, getSchoolClassTeacherAssignments, getSchoolGrade, normalizeSchoolCode, normalizeSchoolYearKey, SCHOOL_OPTIONS } from '../utils/schoolClasses';
import { belongsToEducationLevel, educationGrades, educationLabel } from '../utils/educationLevels';
import { PRIMARY_SUBJECTS, primarySubjectsForGrade } from '../utils/primaryAcademic';

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

const defaultRows = (classNames = BASE_CLASSES) => (classNames.length ? classNames : BASE_CLASSES).map(className => ({
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

const sortRows = (rows = []) => [...rows].sort((a, b) => (
  Number(a.grades?.[0] || 0) - Number(b.grades?.[0] || 0)
  || String(a.id || '').localeCompare(String(b.id || ''), 'vi', { numeric: true, sensitivity: 'base' })
));
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
const stripSemesterPrefix = (name = '') => String(name || '').replace(/^\s*(?:\[?\s*)?HK[12](?:\s*\]?)?\s*[-:]\s*/i, '').trim();
const withSemesterPrefix = (name = '', semester = 'hk1') => {
  const prefix = getScheduleSemesterMeta(semester).namePrefix;
  const baseName = stripSemesterPrefix(name) || 'TKB';
  return `${prefix} - ${baseName}`;
};
const defaultScheduleName = (schoolYear = '', semester = 'hk1') => withSemesterPrefix(`TKB ${schoolYear || ''}`.trim(), semester);
const getPrimaryGrade = (row = {}) => {
  const source = row.grades?.[0] || row.id || row.label || '';
  return getSchoolGrade(source);
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
const getContentVisibleDays = ({ rows = [], visibleDays = [], schedule = {}, periodCount = 5, dayPeriodCounts }) => {
  const selectedDays = DAYS.filter(day => visibleDays.includes(day.key));
  const daysWithContent = selectedDays.filter(day => (
    rows.some(row => PERIODS.slice(0, dayPeriodCounts?.[day.key] ?? periodCount).some(period => !isBlankScheduleValue(schedule?.[row.id]?.[day.key]?.[period])))
  ));
  return daysWithContent.length ? daysWithContent.map(day => day.key) : selectedDays.map(day => day.key);
};

const makeScheduleNewsHtml = ({ name, rows, visibleDays, schedule, periodCount = 5, dayPeriodCounts }) => {
  const shownDayKeys = getContentVisibleDays({ rows, visibleDays, schedule, periodCount, dayPeriodCounts });
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
      const cells = shownDays.map(day => `<td class="schedule-subject-cell">${displayPublicSubject(period > (dayPeriodCounts?.[day.key] ?? periodCount) ? OFF_SLOT_VALUE : schedule?.[row.id]?.[day.key]?.[period])}</td>`).join('');
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

const makeScheduleExportHtml = ({ name, educationLevel = '', schoolName = 'THCS Nguyễn An Ninh', schoolYear, semesterLabel, rows, visibleDays, schedule, periodCount = 5, dayPeriodCounts, principalName = '', pcResponsibleName = '', includePrintButton = false }) => {
  const shownDays = DAYS.filter(day => visibleDays.includes(day.key));
  const normalized = normalizeSchedule(schedule, rows);
  const semesterNumber = getSemesterNumber(semesterLabel);
  const schoolYearText = formatSchoolYearDisplay(schoolYear);
  const signingDateText = getScheduleSigningDateText(schoolYear, semesterLabel);
  const documentTitle = `THỜI KHÓA BIỂU HỌC KỲ ${semesterNumber} LỚP PHỔ CẬP ${educationLabel(educationLevel) || 'THCS'}`;
  const header = shownDays.map(day => `<th>${escapeHtml(day.label)}</th>`).join('');
  const body = rows.map(row => PERIODS.slice(0, periodCount).map((period, index) => {
    const rowClass = [
      'period-row',
      index === 0 ? 'class-start' : '',
      index === periodCount - 1 ? 'class-end' : ''
    ].filter(Boolean).join(' ');
    const classCell = index === 0 ? `<th rowspan="${periodCount}" class="class-cell">${escapeHtml(row.label || row.id)}</th>` : '';
    const cells = shownDays.map(day => `<td>${escapeHtml(displayPublicSubject(period > (dayPeriodCounts?.[day.key] ?? periodCount) ? OFF_SLOT_VALUE : (normalized?.[row.id]?.[day.key]?.[period] || '')))}</td>`).join('');
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
      <td class="doc-left school-name"><span class="school-line">TRƯỜNG ${escapeHtml(schoolName)}<span class="school-half-line"></span></span></td>
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

export default function SimpleScheduleTable({ educationLevel = '', subjects = [], currentSchoolYear = '', classNames = [], classNamesBySchool = {}, classTeacherAssignments = {}, teachers = [], teachersBySchoolCode = {}, principalName = '', pcResponsibleName = '', user, onClose, showNotification }) {
  const [scheduleSchoolCode, setScheduleSchoolCode] = useState(DEFAULT_SCHOOL_CODE);
  const selectedSchool = SCHOOL_OPTIONS.find(item => item.code === scheduleSchoolCode) || SCHOOL_OPTIONS[0];
  const selectedClassNames = classNamesBySchool?.[scheduleSchoolCode] || classNames;
  const selectedTeachers = teachersBySchoolCode?.[scheduleSchoolCode] || teachers;
  const configuredClassRows = useMemo(() => defaultRows(
    [...new Set((Array.isArray(selectedClassNames) ? selectedClassNames : []).map(item => String(item || '').trim()).filter(Boolean))].filter(className => belongsToEducationLevel({ className }, educationLevel))
      .concat(educationLevel && !selectedClassNames.length ? educationGrades(educationLevel) : [])
  ), [selectedClassNames, educationLevel]);
  const [savedSchedules, setSavedSchedules] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [scheduleSemester, setScheduleSemester] = useState('hk1');
  const [teacherIndependent, setTeacherIndependent] = useState(false);
  const [weeklyLoads, setWeeklyLoads] = useState({});
  const requiredLoads = educationLevel === 'primary' ? [...PRIMARY_SUBJECTS, { label: 'Chủ nhiệm' }].map(item => ({ key: subjectKey(item.label), label: item.label, required: 0 })) : REQUIRED_LOADS;
  const [scheduleName, setScheduleName] = useState(() => defaultScheduleName(currentSchoolYear, 'hk1'));
  const [classRows, setClassRows] = useState(() => configuredClassRows);
  const [visibleDays, setVisibleDays] = useState(DAYS.map(day => day.key));
  const [schedule, setSchedule] = useState(() => makeEmptySchedule(configuredClassRows));
  const scheduleRef = useRef(schedule);
  const editorTableRef = useRef(null);
  const [mergeA, setMergeA] = useState(configuredClassRows[0]?.id || '6');
  const [mergeB, setMergeB] = useState(configuredClassRows[1]?.id || '7');
  const mergeableClassRows = classRows.filter(row => Array.isArray(row.grades) && row.grades.length === 1);
  const [dayPeriodCounts, setDayPeriodCounts] = useState(() => normalizeScheduleDayPeriods());
  const periodCount = getScheduleMaxPeriods(dayPeriodCounts);
  const teachingDays = getScheduleTeachingDays(dayPeriodCounts);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isArranging, setIsArranging] = useState(false);
  const [arrangeReport, setArrangeReport] = useState(null);
  const arrangeControllerRef = useRef(null);
  const arrangeVariantRef = useRef(0);
  const arrangeInputRef = useRef('');
  const saveInFlightRef = useRef(false);
  const loadedScheduleRef = useRef(undefined);
  const draftSaveRef = useRef(null);
  const saveScopeRef = useRef('');
  saveScopeRef.current = `${currentSchoolYear}:${scheduleSchoolCode}:${scheduleSemester}:${activeId}`;
  const previousSchoolCodeRef = useRef(scheduleSchoolCode);

  useEffect(() => () => arrangeControllerRef.current?.abort(), []);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  const applySchedule = (nextScheduleOrUpdater) => {
    const base = scheduleRef.current;
    const next = typeof nextScheduleOrUpdater === 'function' ? nextScheduleOrUpdater(base) : nextScheduleOrUpdater;
    scheduleRef.current = next;
    setSchedule(next);
  };

  useEffect(() => {
    if (activeId) return;
    setClassRows(configuredClassRows);
    applySchedule(prev => normalizeSchedule(prev, configuredClassRows));
    setMergeA(prev => configuredClassRows.some(row => row.id === prev) ? prev : (configuredClassRows[0]?.id || ''));
    setMergeB(prev => configuredClassRows.some(row => row.id === prev) ? prev : (configuredClassRows[1]?.id || configuredClassRows[0]?.id || ''));
  }, [activeId, configuredClassRows]);

  useEffect(() => {
    if (previousSchoolCodeRef.current === scheduleSchoolCode) return;
    previousSchoolCodeRef.current = scheduleSchoolCode;
    loadedScheduleRef.current = undefined;
    draftSaveRef.current = null;
    setActiveId('');
    setClassRows(configuredClassRows);
    setScheduleName(defaultScheduleName(currentSchoolYear, scheduleSemester));
    setVisibleDays(DAYS.map(day => day.key));
    setDayPeriodCounts(normalizeScheduleDayPeriods());
    setShowSettings(false);
    setTeacherIndependent(false);
    setWeeklyLoads({});
    applySchedule(makeEmptySchedule(configuredClassRows));
  }, [configuredClassRows, currentSchoolYear, scheduleSchoolCode, scheduleSemester]);

  const collectScheduleFromVisibleInputs = () => {
    if (!editorTableRef.current) return scheduleRef.current;
    const next = normalizeSchedule(scheduleRef.current, classRows);
    editorTableRef.current.querySelectorAll('select[data-row-id][data-day-key][data-period]').forEach(select => {
      const rowId = select.getAttribute('data-row-id') || '';
      const dayKey = select.getAttribute('data-day-key') || '';
      const period = select.getAttribute('data-period') || '';
      if (!rowId || !dayKey || !period || Number(period) > dayPeriodCounts[dayKey]) return;
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
    const campusSource = source.bySchoolCode?.[scheduleSchoolCode] || source;
    const schoolYearKey = normalizeSchoolYearKey(currentSchoolYear);
    return campusSource.byYear?.[schoolYearKey] || (!campusSource.byYear ? campusSource : {}) || {};
  }, [classTeacherAssignments, currentSchoolYear, scheduleSchoolCode]);

  const teacherShortNameByKey = useMemo(() => {
    const map = new Map();
    (Array.isArray(selectedTeachers) ? selectedTeachers : []).forEach(teacher => {
      const name = String(teacher?.name || '').trim();
      const shortName = String(teacher?.shortName || '').trim();
      if (!name) return;
      const key = removeAccentsLocal(name).replace(/[^a-z0-9]/g, '');
      if (!key) return;
      map.set(key, shortName || suggestTeacherShortName(name));
    });
    return map;
  }, [selectedTeachers]);

  const teacherAssignmentsByClass = useMemo(() => (
    Object.fromEntries([...new Set([...(educationLevel ? educationGrades(educationLevel) : BASE_CLASSES), ...configuredClassRows.map(row => row.id)])].map(className => {
      const gradeAssignments = getSchoolClassTeacherAssignments(classTeacherAssignmentsForYear, className);
      const bySubject = {};
      Object.entries(gradeAssignments).forEach(([subject, assignmentValue]) => {
        const key = subjectKey(subject);
        const teacherName = getSemesterTeacherName(assignmentValue, scheduleSemester);
        if (key && teacherName) bySubject[key] = teacherName;
      });
      return [className, bySubject];
    }))
  ), [classTeacherAssignmentsForYear, configuredClassRows, scheduleSemester, educationLevel]);

  const hasTeacherAssignments = useMemo(() => (
    Object.values(teacherAssignmentsByClass).some(classMap => Object.values(classMap || {}).some(Boolean))
  ), [teacherAssignmentsByClass]);

  arrangeInputRef.current = JSON.stringify([classRows, dayPeriodCounts, teacherIndependent, teacherAssignmentsByClass, selectedTeachers]);

  // The editor stores short names, while assignments usually contain full names.
  // Resolve both to the same identity before checking or reserving a teacher.
  const teacherIdentities = useMemo(() => {
    const aliases = new Map(), labels = new Map();
    const register = (name, shortName) => {
      const [key] = getTeacherKeys(name);
      if (!key) return;
      labels.set(key, name);
      [name, shortName, suggestTeacherShortName(name)].filter(Boolean).forEach(alias => {
        getTeacherKeys(alias).forEach(aliasKey => {
          const matches = aliases.get(aliasKey) || new Set();
          matches.add(key); aliases.set(aliasKey, matches);
        });
      });
    };
    (Array.isArray(selectedTeachers) ? selectedTeachers : []).forEach(teacher => register(teacher.name, teacher.shortName));
    Object.values(teacherAssignmentsByClass).forEach(map => Object.values(map).forEach(value =>
      String(value || '').split(/[,;/]+/).forEach(name => {
        const clean = name.trim();
        if (!aliases.has(getTeacherKeys(clean)[0])) register(clean);
      })));
    return { aliases, labels };
  }, [selectedTeachers, teacherAssignmentsByClass]);
  const resolveTeacherKeys = name => [...new Set(getTeacherKeys(name).flatMap(key => [...(teacherIdentities.aliases.get(key) || [key])]))];
  const getAssignedTeacherForRow = (row, key) => [...new Set((row.grades?.length ? row.grades : [row.id]).flatMap(className => {
    const map = teacherAssignmentsByClass[className] || teacherAssignmentsByClass[getSchoolGrade(className)] || {};
    return String(map[key] || '').split(/[,;/]+/).map(name => name.trim()).filter(Boolean);
  }))].join(', ');
  const findTeacherConflicts = candidate => {
    if (teacherIndependent) return [];
    const occupied = new Map(), conflicts = [];
    classRows.forEach(row => teachingDays.forEach(dayKey => PERIODS.slice(0, dayPeriodCounts[dayKey]).forEach(period => {
      const value = candidate?.[row.id]?.[dayKey]?.[period];
      if (isOpenScheduleValue(value)) return;
      const names = getScheduleCellTeacherText(value) || getAssignedTeacherForRow(row, subjectKey(value));
      resolveTeacherKeys(names).forEach(key => {
        const id = `${key}:${dayKey}:${period}`;
        if (occupied.has(id)) conflicts.push(`${teacherIdentities.labels.get(key) || names}: T${dayKey} tiết ${period}, ${occupied.get(id)} và ${row.label}`);
        else occupied.set(id, row.label);
      });
    })));
    return conflicts;
  };

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

  const getTeacherChoicesForGradeSubject = (className = '', subjectValue = '') => {
    const key = subjectKey(subjectValue);
    if (!className || !key) return [];
    const grade = getPrimaryGrade({ id: className, grades: [className] });
    const gradeAssignments = getSchoolClassTeacherAssignments(classTeacherAssignmentsForYear, className);
    const matchedAssignment = Object.entries(gradeAssignments)
      .find(([subject]) => subjectKey(subject) === key);
    const teacherNames = [];
    const seenTeacherNames = new Set();
    const pushValue = value => pushTeacherNamesFromText(teacherNames, seenTeacherNames, value);
    if (matchedAssignment) {
      const [, assignmentValue] = matchedAssignment;
      if (assignmentValue && typeof assignmentValue === 'object' && !Array.isArray(assignmentValue)) {
        const hk1 = String(assignmentValue.hk1 ?? assignmentValue.hki ?? assignmentValue.semester1 ?? assignmentValue.term1 ?? assignmentValue.fullYear ?? '').trim();
        const hk2 = String(assignmentValue.hk2 ?? assignmentValue.hkii ?? assignmentValue.semester2 ?? assignmentValue.term2 ?? assignmentValue.fullYear ?? '').trim();
        const fallback = String(assignmentValue.value ?? assignmentValue.teacherName ?? assignmentValue.name ?? '').trim();
        const orderedValues = scheduleSemester === 'hk2' ? [hk2, hk1, fallback] : [hk1, hk2, fallback];
        orderedValues.forEach(pushValue);
      } else {
        pushValue(assignmentValue);
      }
    }

    const campusTeachers = (Array.isArray(selectedTeachers) ? selectedTeachers : [])
      .filter(teacher => {
        const teacherGrades = Array.isArray(teacher?.grades) ? teacher.grades.map(String) : [];
        if (teacherGrades.length && !teacherGrades.includes(String(grade))) return false;
        return String(teacher?.subject || '').split(/[,;/+\n]+/)
          .some(subject => subjectKey(subject) === key);
      })
      .map(teacher => String(teacher?.name || '').trim())
      .filter(Boolean);
    if (campusTeachers.length) return [...new Set(campusTeachers)];
    const allCampusTeacherNames = [...new Set((Array.isArray(selectedTeachers) ? selectedTeachers : [])
      .map(teacher => String(teacher?.name || '').trim()).filter(Boolean))];
    if (allCampusTeacherNames.length) return allCampusTeacherNames;
    return teacherNames;
  };

  const getTeacherChoicesForRowSubject = (row = {}, subjectValue = '') => {
    if (teacherIndependent) return [];
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
    if (educationLevel === 'primary') return requiredLoads.map(item => ({ ...item, required: Number(weeklyLoads[grade]?.[item.key]) || 0, scheduleSlots: Number(weeklyLoads[grade]?.[item.key]) || 0, weight: 1 }));
    return requiredLoads.map(item => {
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
    dayKeysOverride = teachingDays,
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
      PERIODS.slice(0, Math.min(periodCountOverride, dayPeriodCounts[day.key] || 0)).forEach(period => {
        const key = subjectKey(normalized?.[targetRow.id]?.[day.key]?.[period]);
        if (key && Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += loadByKey[key]?.weight || 1;
      });
    });
    return counts;
  };

  const buildScheduleValidationErrors = (
    candidateSchedule = schedule,
    rowsOverride = classRows,
    dayKeysOverride = teachingDays,
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
  const scheduleSubjects = useMemo(() => {
    const seen = new Set();
    return [...subjects, ...(educationLevel === 'primary' ? ['Chủ nhiệm'] : EXTRA_SUBJECTS)].filter(Boolean).filter(subject => {
      const key = subjectKey(subject) || String(subject);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [subjects, educationLevel]);

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
    scheduleSubjects.filter(subject => educationLevel !== 'primary' || subject === 'Chủ nhiệm' || primarySubjectsForGrade(getPrimaryGrade(row)).some(item => item.label === subject)).forEach(subject => {
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
    setSavedSchedules([]);
    return onSnapshot(query(schedulesCollection, where('schoolYear', '==', currentSchoolYear)), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.hasPendingWrites) return;
      const items = snapshot.docs
        .map(item => ({ ...item.data(), id: item.id }))
        .filter(item => String(item.schoolYear || '') === String(currentSchoolYear || ''))
        .filter(item => (normalizeSchoolCode(item.schoolCode) || DEFAULT_SCHOOL_CODE) === scheduleSchoolCode)
        .filter(item => !educationLevel || item.educationLevel === educationLevel || (!item.educationLevel && item.classRows?.some(row => (row.grades || [row.id]).some(grade => belongsToEducationLevel({ grade }, educationLevel)))))
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      setSavedSchedules(items);
    }, error => showNotification?.(`Chưa tải được thời khóa biểu: ${error.message}`, 'error'));
  }, [currentSchoolYear, scheduleSchoolCode, schedulesCollection, showNotification, educationLevel]);

  const loadSchedule = (item) => {
    loadedScheduleRef.current = item;
    draftSaveRef.current = null;
    const rows = item.classRows?.length ? item.classRows.filter(row => !educationLevel || (row.grades || [row.id]).every(grade => belongsToEducationLevel({ grade }, educationLevel))) : configuredClassRows;
    const mergeableRows = rows.filter(row => Array.isArray(row.grades) && row.grades.length === 1);
    const nextSemester = inferScheduleSemester(item.semester, item.name);
    setActiveId(item.id || '');
    setScheduleSemester(nextSemester);
    setScheduleName(item.name || defaultScheduleName(currentSchoolYear, nextSemester));
    setClassRows(rows);
    setMergeA(mergeableRows[0]?.id || '');
    setMergeB(mergeableRows[1]?.id || mergeableRows[0]?.id || '');
    const nextDayCounts = normalizeScheduleDayPeriods(item.dayPeriodCounts, item.periodCount, item.visibleDays?.length ? item.visibleDays : undefined);
    const nextTeachingDays = getScheduleTeachingDays(nextDayCounts);
    setDayPeriodCounts(nextDayCounts);
    setShowSettings(false);
    setVisibleDays(item.visibleDays?.length ? item.visibleDays.filter(day => nextTeachingDays.includes(day)) : nextTeachingDays);
    setTeacherIndependent(item.teacherIndependent === true);
    setWeeklyLoads(item.weeklyLoads || {});
    applySchedule(normalizeSchedule(item.schedule || {}, rows));
  };

  const newSchedule = (semester = scheduleSemester) => {
    loadedScheduleRef.current = undefined;
    draftSaveRef.current = null;
    const rows = configuredClassRows;
    setActiveId('');
    setScheduleSemester(semester);
    setScheduleName(withSemesterPrefix(`TKB ${currentSchoolYear || ''} - bản mới`.trim(), semester));
    setClassRows(rows);
    setVisibleDays(DAYS.map(day => day.key));
    setDayPeriodCounts(normalizeScheduleDayPeriods());
    setShowSettings(false);
    setTeacherIndependent(false);
    applySchedule(makeEmptySchedule(rows));
  };

  const changeScheduleSchool = (nextValue) => {
    const nextSchoolCode = normalizeSchoolCode(nextValue) || DEFAULT_SCHOOL_CODE;
    if (nextSchoolCode !== scheduleSchoolCode) setScheduleSchoolCode(nextSchoolCode);
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
    if (arrangeControllerRef.current) return;
    setArrangeReport(null);
    if (period > dayPeriodCounts[dayKey]) return;
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
    if (arrangeControllerRef.current) return;
    setArrangeReport(null);
    if (period > dayPeriodCounts[dayKey]) return;
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
    if (saveInFlightRef.current || arrangeControllerRef.current) return;
    saveInFlightRef.current = true;
    const scope = saveScopeRef.current;
    setIsSaving(true);
    try {
      const latestSchedule = collectScheduleFromVisibleInputs();
      const semesterMeta = getScheduleSemesterMeta(scheduleSemester);
      const desiredName = withSemesterPrefix(scheduleName.trim() || `TKB ${currentSchoolYear}`, scheduleSemester);
      const activeSchedule = loadedScheduleRef.current;
      const shouldForkSchedule = Boolean(activeSchedule && (desiredName !== (activeSchedule.name || activeSchedule.id || '')
        || (educationLevel && activeSchedule.educationLevel !== educationLevel)));
      const now = getCurrentTimestamp();
      const draftKey = `${scope}:${desiredName}`;
      if (draftSaveRef.current?.key !== draftKey) draftSaveRef.current = { key: draftKey, id: `tkb_${scheduleSchoolCode}_${globalThis.crypto.randomUUID()}` };
      const id = activeId && !shouldForkSchedule ? activeId : draftSaveRef.current.id;
      const effectiveStatus = status === 'draft' && activeSchedule?.status === 'published' && !shouldForkSchedule ? 'published' : status;
      const normalized = compactScheduleForSave(latestSchedule, classRows, teacherShortNameByKey);
      if (findLessonsOutsideScheduleSettings(normalized, classRows, dayPeriodCounts).length) {
        throw new Error('Có tiết học nằm ngoài ngày dạy hoặc số tiết đã cài đặt. Hãy kiểm tra Cài đặt trước khi lưu.');
      }
      if (effectiveStatus === 'published') {
        const conflicts = findTeacherConflicts(normalized);
        if (conflicts.length) {
          setArrangeReport({ status: 'error', summary: 'Chưa thể ghim vì giáo viên đang trùng lịch. Bấm Xếp tự động để tìm lại phương án.', details: conflicts });
          showNotification?.('Thời khóa biểu đang trùng giáo viên, chưa thể ghim.', 'error');
          return;
        }
        const errors = buildScheduleValidationErrors(normalized);
        if (errors.length > 0) {
          setValidationErrors(errors);
          showNotification?.('Thời khóa biểu chưa đúng số tiết, chưa thể ghim.', 'error');
          return;
        }
      }
      const selectedVisibleDays = DAYS.map(day => day.key).filter(dayKey => visibleDays.includes(dayKey));
      const savedVisibleDays = effectiveStatus === 'published'
        ? getContentVisibleDays({ rows: classRows, visibleDays: teachingDays, schedule: normalized, periodCount, dayPeriodCounts })
        : selectedVisibleDays;
      const payload = {
        ...(educationLevel ? { educationLevel } : {}),
        name: desiredName,
        semester: scheduleSemester,
        semesterLabel: semesterMeta.label,
        namePrefix: semesterMeta.namePrefix,
        schoolCode: scheduleSchoolCode,
        schoolName: selectedSchool.name,
        schoolYear: currentSchoolYear,
        classRows,
        visibleDays: savedVisibleDays,
        periodCount,
        dayPeriodCounts,
        teacherIndependent,
        ...(educationLevel === 'primary' ? { weeklyLoads } : {}),
        schedule: normalized,
        status: effectiveStatus,
        publishedAt: effectiveStatus === 'published' ? now : null,
        updatedAt: now
      };
      const newsPayload = effectiveStatus === 'published' ? {
        title: `${selectedSchool.name} · THỜI KHÓA BIỂU ${semesterMeta.label}: ${stripSemesterPrefix(payload.name)}`,
        content: makeScheduleNewsHtml({ name: `${selectedSchool.name} · ${payload.name}`, rows: classRows, visibleDays: payload.visibleDays, schedule: normalized, periodCount, dayPeriodCounts }),
        updatedAt: now, authorId: user?.uid || '', type: 'class_schedule', scheduleId: id,
        semester: scheduleSemester, semesterLabel: semesterMeta.label, schoolYear: currentSchoolYear,
        schoolCode: scheduleSchoolCode, schoolName: selectedSchool.name
      } : null;
      await saveSchedulePublication(id, payload, newsPayload, shouldForkSchedule ? undefined : activeSchedule);
      if (saveScopeRef.current === scope) {
        loadedScheduleRef.current = { ...(shouldForkSchedule ? {} : activeSchedule), ...payload, id };
        setActiveId(id);
        setScheduleName(desiredName);
        if (JSON.stringify(collectScheduleFromVisibleInputs()) === JSON.stringify(latestSchedule)) applySchedule(normalized);
      }
      showNotification?.(shouldForkSchedule ? 'Đã lưu thành bản thời khóa biểu mới.' : (effectiveStatus === 'published' ? 'Đã ghim TKB và đưa vào bản tin thường.' : 'Đã lưu thời khóa biểu.'));
    } catch (error) {
      showNotification?.(`Lỗi lưu thời khóa biểu: ${error.message}`, 'error');
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const buildCurrentScheduleExport = () => {
    const latestSchedule = collectScheduleFromVisibleInputs();
    const semesterMeta = getScheduleSemesterMeta(scheduleSemester);
    const name = `${selectedSchool.name} - ${withSemesterPrefix(scheduleName.trim() || `TKB ${currentSchoolYear}`, scheduleSemester)}`;
    return {
      name,
      educationLevel,
      schoolName: selectedSchool.name,
      schoolYear: currentSchoolYear,
      semesterLabel: semesterMeta.label,
      principalName,
      pcResponsibleName,
      rows: classRows,
      visibleDays: teachingDays,
      schedule: compactScheduleForSave(latestSchedule, classRows, teacherShortNameByKey),
      periodCount,
      dayPeriodCounts
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
    if (!activeId || saveInFlightRef.current) return;
    const activeSchedule = loadedScheduleRef.current;
    if (educationLevel && activeSchedule?.classRows?.some(row => row.grades?.some(className => !belongsToEducationLevel({ className }, educationLevel)))) {
      showNotification?.('Bản thời khóa biểu cũ dùng chung cho hai cấp. Hãy lưu bản riêng trước khi xóa để giữ dữ liệu của cấp còn lại.', 'error');
      return;
    }
    const scheduleLabel = activeSchedule?.name || scheduleName || 'bản thời khóa biểu này';
    if (!window.confirm(`Xóa "${scheduleLabel}" cùng bản tin thời khóa biểu liên quan?`)) return;
    const scope = saveScopeRef.current;
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      await deleteSchedulePublication(activeId, activeSchedule);
      if (saveScopeRef.current === scope) newSchedule();
      showNotification?.('Đã xóa thời khóa biểu đã lưu.');
    } catch (error) {
      showNotification?.(`Lỗi xóa thời khóa biểu: ${error.message}`, 'error');
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const toggleDay = (dayKey) => {
    if (!dayPeriodCounts[dayKey]) return;
    setVisibleDays(prev => prev.includes(dayKey) ? prev.filter(key => key !== dayKey) : [...prev, dayKey].sort());
  };

  const applyScheduleSettings = (nextValue, loads) => {
    const nextCounts = normalizeScheduleDayPeriods(nextValue);
    const nextDays = getScheduleTeachingDays(nextCounts);
    if (!nextDays.length) {
      showNotification?.('Cần chọn ít nhất một ngày dạy trong tuần.', 'error');
      return;
    }
    const latest = collectScheduleFromVisibleInputs();
    const affected = findLessonsOutsideScheduleSettings(latest, classRows, nextCounts);
    if (affected.length && !window.confirm(`Có ${affected.length} tiết đã xếp vào thứ nghỉ hoặc vượt số tiết mới. Xóa các tiết này khỏi bản đang soạn để áp dụng cài đặt?`)) return;
    applySchedule(clearSlotsOutsideScheduleSettings(latest, classRows, nextCounts));
    setDayPeriodCounts(nextCounts);
    setVisibleDays(nextDays);
    setValidationErrors([]);
    setShowSettings(false);
    if (educationLevel === 'primary') setWeeklyLoads(loads || {});
  };

  const mergeClasses = () => {
    const mergeableIds = new Set(mergeableClassRows.map(row => row.id));
    if (!mergeA || !mergeB || mergeA === mergeB || !mergeableIds.has(mergeA) || !mergeableIds.has(mergeB)) {
      showNotification?.('Chọn 2 lớp khác nhau để ghép.', 'error');
      return;
    }
    const grades = [mergeA, mergeB].sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true, sensitivity: 'base' }));
    const id = grades.join('&');
    const row = { id, label: `Lớp ${id}`, grades };
    const nextRows = sortRows([...classRows.filter(item => !item.grades?.some(grade => grades.includes(grade))), row]);
    const sourceSchedule = scheduleRef.current[mergeA] || scheduleRef.current[mergeB] || emptyRow();
    setClassRows(nextRows);
    const nextMergeableRows = nextRows.filter(item => Array.isArray(item.grades) && item.grades.length === 1);
    setMergeA(nextMergeableRows[0]?.id || '');
    setMergeB(nextMergeableRows[1]?.id || nextMergeableRows[0]?.id || '');
    applySchedule(prev => normalizeSchedule({ ...prev, [id]: sourceSchedule }, nextRows));
  };

  const resetClasses = () => {
    const rows = configuredClassRows;
    setClassRows(rows);
    setMergeA(rows[0]?.id || '');
    setMergeB(rows[1]?.id || rows[0]?.id || '');
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
          if (period > dayPeriodCounts[dayKey]) acc[period] = current;
          else acc[period] = current || previous;
          return acc;
        }, {})
      }
    }));
  };

  const autoArrangeSchedule = async () => {
    if (arrangeControllerRef.current || isSaving) return;
    if (educationLevel === 'primary' && classRows.some(row => !getRequiredLoadsForRow(row).some(item => item.required > 0))) {
      setShowSettings(true);
      showNotification?.('Nhập số tiết từng môn cho các khối trong Cài đặt trước khi xếp tự động.', 'error');
      return;
    }
    if (!teachingDays.length) {
      showNotification?.('Hãy chọn ít nhất một ngày dạy trong Cài đặt.', 'error'); return;
    }
    if (!teacherIndependent && !hasTeacherAssignments) {
      showNotification?.('Chưa có dữ liệu GV theo lớp. Bật “Không phụ thuộc giáo viên” để xếp theo môn, hoặc vào “GV theo lớp” để lưu phân công trước.', 'error'); return;
    }
    const latest = collectScheduleFromVisibleInputs();
    if (findLessonsOutsideScheduleSettings(latest, classRows, dayPeriodCounts).length) {
      showNotification?.('Có tiết học nằm ngoài giới hạn đã cài đặt. Mở Cài đặt và áp dụng lại trước khi xếp tự động.', 'error'); return;
    }
    const scope = saveScopeRef.current, baseline = JSON.stringify(latest), inputContext = arrangeInputRef.current;
    const rows = classRows.length ? classRows : configuredClassRows;
    const existing = rows.flatMap(row => teachingDays.flatMap(dayKey => PERIODS.slice(0, dayPeriodCounts[dayKey])
      .filter(period => !isBlankScheduleValue(latest[row.id]?.[dayKey]?.[period]))
      .map(period => ({ rowId: row.id, dayKey, period, value: latest[row.id][dayKey][period] }))));
    const totalSlots = teachingDays.reduce((sum, day) => sum + dayPeriodCounts[day], 0);
    const capacityIssues = rows.flatMap(row => {
      const loads = getRequiredLoadsForRow(row), keys = new Set(loads.map(load => load.key));
      const needed = loads.reduce((sum, load) => sum + Number(load.scheduleSlots ?? load.required), 0);
      const blocked = existing.filter(cell => cell.rowId === row.id && (isOffScheduleValue(cell.value) || !keys.has(subjectKey(cell.value)))).length;
      const available = totalSlots - blocked;
      return needed > available ? [`${row.label}: cần ${needed} tiết, chỉ có ${available} ô dùng được (thiếu ${needed - available}).`] : [];
    });
    if (capacityIssues.length) {
      const summary = 'Cài đặt hiện tại không đủ chỗ. Cần điều chỉnh ngày dạy, số tiết hoặc các ô nghỉ trước khi xếp đủ.';
      setArrangeReport({ status: 'error', summary, details: capacityIssues });
      showNotification?.(summary, 'error'); return;
    }
    const makeProblem = (moveExisting, splitPairs) => {
      const next = normalizeSchedule(latest, rows), fixed = [], tasks = [];
      rows.forEach(row => {
        const loads = getRequiredLoadsForRow(row), keys = new Set(loads.map(load => load.key));
        const rowExisting = existing.filter(cell => cell.rowId === row.id);
        rowExisting.forEach(cell => {
          const key = subjectKey(cell.value);
          if (moveExisting && !isOffScheduleValue(cell.value) && keys.has(key)) next[row.id][cell.dayKey][cell.period] = '';
          else fixed.push({ ...cell, teacherKeys: teacherIndependent || isOffScheduleValue(cell.value) ? []
            : resolveTeacherKeys(getScheduleCellTeacherText(cell.value) || getAssignedTeacherForRow(row, key)) });
        });
        loads.forEach(load => {
          const required = Number(load.scheduleSlots ?? load.required);
          const prior = rowExisting.filter(cell => !isOffScheduleValue(cell.value) && subjectKey(cell.value) === load.key);
          const assigned = getAssignedTeacherForRow(row, load.key);
          const units = moveExisting ? prior.slice(0, required).map(cell => ({ value: cell.value,
            teacherKeys: teacherIndependent ? [] : resolveTeacherKeys(getScheduleCellTeacherText(cell.value) || assigned) })) : [];
          const missing = Math.max(0, required - prior.length);
          for (let index = 0; index < missing; index += 1) units.push({ value: formatScheduleCellValue(load.label, teacherIndependent ? '' : assigned, teacherShortNameByKey),
            teacherKeys: teacherIndependent ? [] : resolveTeacherKeys(assigned) });
          const groups = new Map();
          units.forEach(unit => {
            const id = JSON.stringify([unit.value, [...unit.teacherKeys].sort()]);
            const group = groups.get(id) || { ...unit, count: 0 };
            group.count += 1; groups.set(id, group);
          });
          groups.forEach(group => {
            const paired = load.paired && !splitPairs;
            const common = { ...group, rowId: row.id, key: load.key, compactVisit: SINGLE_VISIT_SUBJECT_KEYS.has(load.key),
              pairWithKey: HOMEROOM_PAIR_SUBJECT_KEYS.has(load.key) ? (load.key === 'cn' ? 'gddp' : 'cn') : '' };
            if (paired && group.count >= 2) tasks.push({ ...common, blockLength: 2, count: Math.floor(group.count / 2) });
            const singles = paired ? group.count % 2 : group.count;
            if (singles) tasks.push({ ...common, blockLength: 1, count: singles });
          });
        });
      });
      return { next, fixed, tasks };
    };
    const describeIssue = issue => {
      const teacher = teacherIdentities.labels.get(issue.teacherKey) || issue.teacherKey;
      const row = rows.find(item => item.id === issue.rowId)?.label || issue.rowId;
      if (issue.kind === 'teacherCapacity') return `${teacher}: còn cần ${issue.demand} tiết nhưng chỉ còn ${issue.available} khung giờ, thiếu ${issue.demand - issue.available}. Cần điều chỉnh phân công hoặc thời gian dạy.`;
      if (issue.kind === 'rowCapacity') return `${row}: còn cần ${issue.demand} tiết nhưng chỉ còn ${issue.available} ô trống.`;
      if (issue.kind === 'fixedTeacherConflict') return `${teacher} trùng T${issue.dayKey}, tiết ${issue.period} giữa ${row} và ${issue.otherRowId}.`;
      return `${row}: cần kiểm tra lại ô đã nhập.`;
    };
    const controller = new AbortController();
    const variant = arrangeVariantRef.current++;
    arrangeControllerRef.current = controller;
    setIsArranging(true); setValidationErrors([]);
    setArrangeReport({ status: 'working', summary: 'Đang tìm phương án đủ tiết…', details: [] });
    // First retain every entered cell. Only if that cannot complete the timetable
    // may recognized lessons move; explicit rest cells and other entries stay fixed.
    const canMove = existing.some(cell => !isOffScheduleValue(cell.value) && getRequiredLoadsForRow(rows.find(row => row.id === cell.rowId)).some(load => load.key === subjectKey(cell.value)));
    const phases = [{ move: false, split: false, budget: 1400 }, { move: false, split: true, budget: 1800 },
      ...(canMove ? [{ move: true, split: false, budget: 2200 }, { move: true, split: true, budget: 3500 }] : [])];
    let lastResult;
    try {
      for (const phase of phases) {
        if (controller.signal.aborted) break;
        setArrangeReport({ status: 'working', summary: phase.move ? 'Đang đổi chỗ các tiết để tìm lịch hoàn chỉnh…' : 'Đang xếp và đổi chỗ các tiết mới…', details: [] });
        const problem = makeProblem(phase.move, phase.split);
        const result = await solveTimetable({ rows, tasks: problem.tasks, fixed: problem.fixed, dayPeriodCounts,
          signal: controller.signal, variant, maxDurationMs: phase.budget, maxNodes: 200000 });
        lastResult = result;
        if (result.status !== 'complete') continue;
        result.placements.forEach(placement => placement.periods.forEach(period => { problem.next[placement.rowId][placement.dayKey][period] = placement.value; }));
        if (buildScheduleValidationErrors(problem.next, rows).length || findTeacherConflicts(problem.next).length) continue;
        if (controller.signal.aborted) return;
        if (scope !== saveScopeRef.current || inputContext !== arrangeInputRef.current || baseline !== JSON.stringify(scheduleRef.current)) {
          setArrangeReport({ status: 'warning', summary: 'Dữ liệu đã thay đổi trong lúc xếp. Hãy bấm Xếp tự động lại với dữ liệu mới.', details: [] });
          return;
        }
        const moved = existing.filter(cell => !isOffScheduleValue(cell.value) && problem.next[cell.rowId][cell.dayKey][cell.period] !== cell.value).length;
        const removed = rows.reduce((sum, row) => sum + getRequiredLoadsForRow(row).reduce((count, load) => count + Math.max(0,
          existing.filter(cell => cell.rowId === row.id && subjectKey(cell.value) === load.key).length - Number(load.scheduleSlots ?? load.required)), 0), 0);
        const unassigned = teacherIndependent ? [] : rows.flatMap(row => getRequiredLoadsForRow(row).filter(load => Number(load.scheduleSlots ?? load.required) > 0 && !getAssignedTeacherForRow(row, load.key)
          && teachingDays.some(day => PERIODS.slice(0, dayPeriodCounts[day]).some(period => subjectKey(problem.next[row.id][day][period]) === load.key && !getScheduleCellTeacherText(problem.next[row.id][day][period]))))
          .map(load => `${row.label}: ${load.label} chưa có giáo viên.`));
        const summary = `Đã xếp đủ số tiết${teacherIndependent ? ' theo môn, chưa xét giáo viên' : ''}${moved ? `; đã sắp xếp lại ${moved} ô đã nhập` : existing.length ? `; giữ ${existing.length} ô đã nhập` : ''}.`;
        applySchedule(problem.next); setVisibleDays(teachingDays); setShowStats(true);
        setArrangeReport({ status: unassigned.length ? 'warning' : 'success', summary,
          details: [...(removed ? [`Đã bỏ ${removed} tiết dư so với định mức; các môn đã đủ số tiết quy định.`] : []),
            ...(phase.split ? ['Đã cho phép tách tiết đôi để xếp đủ; ưu tiên giữ các tiết cùng môn liền nhau.'] : []), ...unassigned] });
        showNotification?.(summary + (unassigned.length ? ' Còn môn chưa phân công giáo viên; xem ghi chú dưới thanh công cụ.' : ''));
        return;
      }
      if (controller.signal.aborted) return;
      if (scope !== saveScopeRef.current || inputContext !== arrangeInputRef.current || baseline !== JSON.stringify(scheduleRef.current)) {
        setArrangeReport({ status: 'warning', summary: 'Dữ liệu đã thay đổi trong lúc xếp. Hãy bấm Xếp tự động lại với dữ liệu mới.', details: [] });
        return;
      }
      const details = (lastResult?.issues || []).map(describeIssue);
      const summary = lastResult?.status === 'limit' && !details.length ? 'Chưa tìm được lịch đủ tiết trong lần chạy này. Có thể bấm xếp lại để thử phương án khác.'
        : 'Chưa xếp được lịch đủ tiết với các ràng buộc hiện tại. Bảng đang nhập được giữ nguyên.';
      setArrangeReport({ status: 'error', summary, details: details.length ? details : ['Các ô nghỉ, lịch giáo viên hoặc tiết cố định đang cản nhau. Hãy kiểm tra phân công và Cài đặt.'] });
      showNotification?.(details[0] || summary, 'error');
    } catch (error) {
      if (!controller.signal.aborted) {
        setArrangeReport({ status: 'error', summary: 'Chưa hoàn tất xếp lịch; bảng đang nhập được giữ nguyên.', details: [error.message] });
        showNotification?.('Có lỗi khi xếp thời khóa biểu. Bảng đang nhập được giữ nguyên.', 'error');
      }
    } finally {
      if (arrangeControllerRef.current === controller) { arrangeControllerRef.current = null; setIsArranging(false); }
    }
  };
  const shownDays = DAYS.filter(day => visibleDays.includes(day.key));
  const scheduleDiagnostics = (() => {
    const normalized = normalizeSchedule(schedule, classRows);
    const overSubjectCells = new Map();
    const overLoadWarnings = [];
    const conflictCells = new Map();
    const teacherSlotMap = new Map();
    const activeDayKeys = new Set(teachingDays);

    classRows.forEach(row => {
      const rowLoads = getRequiredLoadsForRow(row);
      const loadByKey = Object.fromEntries(rowLoads.map(item => [item.key, item]));
      const counts = countRowSubjects(row, normalized);

      Object.entries(counts).forEach(([key, actual]) => {
        const load = loadByKey[key];
        if (!load || actual <= load.required) return;

        const teacherNames = new Set();
        DAYS.filter(day => activeDayKeys.has(day.key)).forEach(day => {
          PERIODS.slice(0, dayPeriodCounts[day.key] || 0).forEach(period => {
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
      PERIODS.slice(0, dayPeriodCounts[day.key] || 0).forEach(period => {
        classRows.forEach(row => {
          const value = normalized?.[row.id]?.[day.key]?.[period] || '';
          if (teacherIndependent || isOpenScheduleValue(value)) return;
          const teacherText = getScheduleCellTeacherText(value);
          resolveTeacherKeys(getScheduleCellTeacherText(value) || getAssignedTeacherForRow(row, subjectKey(value))).forEach(teacherKey => {
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
    <div data-arranging={isArranging} className="schedule-editor flex h-full min-h-0 w-full flex-col overflow-hidden rounded border border-slate-200 bg-white text-slate-700">
      <div className="schedule-editor-header shrink-0 border-b border-slate-200 bg-white">
        <div className="schedule-metadata flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
          <h3 className="mr-2 whitespace-nowrap text-sm text-slate-700">Thời khóa biểu</h3>
          <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5">
            <span className="text-[10px] font-normal text-slate-600">Cơ sở</span>
            <select disabled={isArranging} aria-label="Cơ sở thời khóa biểu" value={scheduleSchoolCode} onChange={(event) => changeScheduleSchool(event.target.value)} className="max-w-[190px] bg-transparent text-xs font-normal text-slate-800 outline-none">
              {SCHOOL_OPTIONS.filter(item => item.code !== 'UNKNOWN').map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>
          <select disabled={isArranging} aria-label="Chọn thời khóa biểu" value={activeId} onChange={(event) => {
            if (!event.target.value) {
              newSchedule();
              return;
            }
            const item = savedSchedules.find(scheduleItem => scheduleItem.id === event.target.value);
            if (item) loadSchedule(item);
          }} className="h-9 w-[250px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal text-slate-700 outline-none">
            <option value="">Soạn TKB mới</option>
            {savedSchedules.map(item => (
              <option key={item.id} value={item.id}>
                {item.status === 'published' ? '[Đã ghim] ' : ''}[{getScheduleSemesterMeta(inferScheduleSemester(item.semester, item.name)).label}] {stripSemesterPrefix(item.name || item.id)}
              </option>
            ))}
          </select>
          <input disabled={isArranging} aria-label="Tên thời khóa biểu" value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} className="h-9 w-[240px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal outline-none focus:border-slate-200" placeholder="Tên thời khóa biểu..." />
          <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5">
            <span className="text-[10px] font-normal text-slate-600">Học kỳ</span>
            <select disabled={isArranging} aria-label="Học kỳ thời khóa biểu" value={scheduleSemester} onChange={(event) => changeScheduleSemester(event.target.value)} className="bg-transparent text-xs font-normal text-slate-800 outline-none">
              {SCHEDULE_SEMESTERS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>

          <button type="button" onClick={() => { arrangeControllerRef.current?.abort(); onClose?.(); }} aria-label="Đóng thời khóa biểu" className="schedule-close ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="schedule-main-actions flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-1.5">
            <button type="button" onClick={() => setTeacherIndependent(prev => !prev)} disabled={isSaving || isArranging} aria-pressed={teacherIndependent} title="Bật để xếp theo môn và số tiết khi chưa phân công giáo viên" className={`h-9 rounded-lg border px-3 text-[10px] sm:text-xs font-normal inline-flex items-center justify-center gap-1.5 disabled:opacity-60 ${teacherIndependent ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'}`}>
              <Users className="w-4 h-4" /> Không phụ thuộc giáo viên
            </button>
            <button type="button" onClick={autoArrangeSchedule} disabled={isSaving || isArranging} className="h-9 rounded-lg bg-white px-3 text-white text-[10px] sm:text-xs font-normal inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              {isArranging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Xếp tự động
            </button>
            <button type="button" onClick={deleteActiveSchedule} disabled={!activeId || isSaving || isArranging} className="schedule-delete h-9 rounded-lg bg-rose-50 border border-rose-100 px-2.5 text-rose-600 text-[10px] sm:text-xs font-normal inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
              <Trash2 className="w-4 h-4" /> <span>Xóa</span>
            </button>
            <button type="button" onClick={exportScheduleExcel} disabled={isSaving || isArranging} className="h-9 rounded-lg bg-white border border-slate-200 px-2.5 text-slate-600 text-[10px] sm:text-xs font-normal inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button type="button" onClick={exportSchedulePdf} disabled={isSaving || isArranging} className="h-9 rounded-lg bg-white border border-slate-200 px-2.5 text-slate-600 text-[10px] sm:text-xs font-normal inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <FileText className="w-4 h-4" /> PDF
            </button>
            <button type="button" onClick={() => saveSchedule('draft')} disabled={isSaving || isArranging} className="schedule-primary-action h-9 rounded-lg bg-white px-3 text-white text-[10px] sm:text-xs font-normal inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Save className="w-4 h-4" /> Lưu
            </button>
            <button type="button" onClick={() => saveSchedule('published')} disabled={isSaving || isArranging} className="h-9 rounded-lg bg-blue-600 px-3 text-white text-[10px] sm:text-xs font-normal inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Send className="w-4 h-4" /> <span>Ghim TKB</span>
            </button>

        </div>
        <div className="schedule-options flex flex-wrap items-center gap-1.5 bg-slate-50 px-3 py-1.5">
          <button type="button" aria-label="Cài đặt thời khóa biểu" onClick={() => setShowSettings(true)} disabled={isSaving || isArranging} className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-normal text-blue-700 disabled:opacity-50">
            <Settings className="h-4 w-4" /> Cài đặt
            <span className="font-normal">{teachingDays.length} ngày · {[...new Set(teachingDays.map(day => dayPeriodCounts[day]))].length === 1 ? `${periodCount} tiết/ngày` : 'Tiết theo thứ'}</span>
          </button>

          <details className="relative">
            <summary className="h-9 cursor-pointer list-none rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal text-slate-700 inline-flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-slate-600" />
              Ẩn cột
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{visibleDays.length}/{DAYS.length}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </summary>
            <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              {DAYS.map(day => (
                <label key={day.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-normal text-slate-700 hover:bg-white">
                  <input type="checkbox" checked={visibleDays.includes(day.key)} disabled={isArranging || !dayPeriodCounts[day.key]} onChange={() => toggleDay(day.key)} className="h-4 w-4 accent-indigo-600 disabled:opacity-40" />
                  <span>{day.label}</span>
                  <span className="ml-auto text-[10px] text-slate-400">{!dayPeriodCounts[day.key] ? 'Nghỉ' : (visibleDays.includes(day.key) ? 'Hiện' : 'Ẩn')}</span>
                </label>
              ))}
            </div>
          </details>

          <details className="relative schedule-merge">
            <summary className="schedule-tool"><Users className="h-4 w-4" /> Ghép lớp <ChevronDown className="h-3.5 w-3.5" /></summary>
            <div className="schedule-popover left-0 w-72">
            <p className="mb-2 text-xs text-slate-500">Chọn hai lớp học chung một lịch.</p>
            <div className="flex flex-wrap items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-600" />
            <span className="text-[10px] font-normal text-slate-500">Ghép</span>
            <select disabled={isArranging} aria-label="Lớp ghép thứ nhất" value={mergeA} onChange={(event) => setMergeA(event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-normal outline-none">
              {mergeableClassRows.map(row => <option key={row.id} value={row.id}>{row.label || `Lớp ${row.id}`}</option>)}
            </select>
            <select disabled={isArranging} aria-label="Lớp ghép thứ hai" value={mergeB} onChange={(event) => setMergeB(event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-normal outline-none">
              {mergeableClassRows.map(row => <option key={row.id} value={row.id}>{row.label || `Lớp ${row.id}`}</option>)}
            </select>
            <button type="button" onClick={mergeClasses} disabled={isArranging} className="rounded-md bg-white px-2 py-1 text-[10px] font-normal text-white">Ghép</button>
            <button type="button" onClick={resetClasses} disabled={isArranging} className="rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-normal text-slate-500">Tách</button>
            </div>
            </div>
          </details>

          <details className="relative">
            <summary className="h-9 cursor-pointer list-none rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal text-slate-700 inline-flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600" /> Trợ giúp <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </summary>
            <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal text-slate-600 shadow-xl">
              Bấm “Đổ tiết” để lấp các ô trống tới số tiết đã khai báo. Khi ghép lớp, ví dụ ghép 6 và 7 thì tên hàng sẽ là Lớp 6&7.
              <p className="mt-2">Bật “Không phụ thuộc giáo viên”, rồi bấm “Xếp tự động” để xếp theo môn khi chưa phân công người dạy. Hệ thống ưu tiên giữ các ô đã nhập; nếu bị thiếu tiết, sẽ đổi chỗ các tiết và có thể tách tiết đôi để tìm lịch đủ. Các ô nghỉ luôn được giữ. Tắt chế độ này để chọn giáo viên và kiểm tra trùng lịch.</p>
              <p className="mt-2">Đặt thứ nghỉ và số tiết từng ngày trong “Cài đặt”. Xếp tự động không tự tăng số tiết hoặc mở thứ nghỉ. “Ẩn cột” chỉ dùng để thu gọn cách xem.</p>
            </div>
          </details>

          <button type="button" onClick={() => setShowStats(prev => !prev)} aria-pressed={showStats} className="h-9 rounded-lg bg-white border border-slate-200 px-3 text-slate-600 text-[10px] sm:text-xs font-normal inline-flex items-center justify-center gap-1.5">
            <BarChart3 className="w-4 h-4" /> <span>Kiểm tra tiết</span>
          </button>
        </div>
        {teacherIndependent && <div className="border-t border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600" role="status">Xếp theo môn, chưa kiểm tra trùng lịch giáo viên.</div>}
      </div>

      {arrangeReport && <div role="status" aria-live="polite" className={`shrink-0 max-h-[25%] overflow-auto border-b px-3 py-2 text-xs ${arrangeReport.status === 'error' || arrangeReport.status === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
        <div className="flex items-start justify-between gap-3">
          <p>{arrangeReport.summary}</p>
          {isArranging ? <button type="button" onClick={() => {
            arrangeControllerRef.current?.abort();
            setArrangeReport({ status: 'warning', summary: 'Đã dừng xếp tự động; bảng đang nhập được giữ nguyên.', details: [] });
          }} className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-slate-600">Dừng xếp</button>
            : <button type="button" onClick={() => setArrangeReport(null)} aria-label="Đóng ghi chú xếp lịch" className="shrink-0 text-slate-500"><X className="h-4 w-4" /></button>}
        </div>
        {arrangeReport.details.length > 0 && <details className="mt-1" open={arrangeReport.status === 'error'}>
          <summary className="cursor-pointer">Chi tiết ({arrangeReport.details.length})</summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">{arrangeReport.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>
        </details>}
      </div>}

      {showSettings && <ScheduleSettingsDialog dayPeriodCounts={dayPeriodCounts} weeklyLoads={educationLevel === 'primary' ? weeklyLoads : undefined}
        loadSubjects={educationLevel === 'primary' ? requiredLoads : []} grades={[...new Set(classRows.flatMap(row => row.grades || [row.id]).map(className => getPrimaryGrade({ grades: [className] })))]}
        onApply={applyScheduleSettings} onClose={() => setShowSettings(false)} />}

      {(scheduleDiagnostics.teacherConflictWarnings.length > 0 || scheduleDiagnostics.overLoadWarnings.length > 0) && (
        <div className="border-b border-rose-100 bg-rose-50 px-3 py-2">
          <div className="flex flex-wrap items-start gap-2 text-xs font-normal text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1">
              <div className="font-normal">
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
        <div className="schedule-stats shrink-0 max-h-[35%] overflow-auto border-b border-slate-200 bg-white px-3 py-2">
          <div className="text-xs font-normal text-slate-700 mb-2">Kiểm tra số tiết theo từng hàng lớp - {getScheduleSemesterMeta(scheduleSemester).label}</div>
          <table className="w-full min-w-[900px] text-xs bg-white border border-slate-200">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-1 text-left">Lớp</th>
                {requiredLoads.map(item => <th key={item.key} className="px-2 py-1 text-center">{item.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {classRows.map(row => {
                const rowLoads = getRequiredLoadsForRow(row);
                const counts = countRowSubjects(row, schedule);
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-normal text-slate-700">{row.label}</td>
                    {requiredLoads.map(baseItem => {
                      const item = rowLoads.find(load => load.key === baseItem.key) || baseItem;
                      const actual = counts[item.key] || 0;
                      const ok = actual === item.required;
                      const over = actual > item.required;
                      return (
                        <td key={item.key} className={`px-2 py-1 text-center font-normal ${ok ? 'text-slate-600' : over ? 'text-rose-700 bg-rose-50' : 'text-amber-800 bg-amber-50/50'}`}>
                          {actual}/{item.required}
                          <div className="text-[9px]">{ok ? 'Đủ' : over ? `Dư ${actual - item.required}` : `Thiếu ${item.required - actual}`}</div>
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
          <div className="w-full max-w-3xl max-h-[86vh] overflow-hidden rounded-lg bg-white shadow-2xl border border-rose-100 flex flex-col">
            <div className="px-5 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between gap-3">
              <div>
                <div className="font-normal text-rose-800">Chưa thể xuất bản TKB</div>
                <div className="text-xs font-normal text-rose-600/80 mt-1">Các lớp dưới đây chưa đúng định mức tiết của {getScheduleSemesterMeta(scheduleSemester).label}. Sửa xong hãy xuất bản lại.</div>
              </div>
              <button type="button" onClick={() => setValidationErrors([])} className="w-8 h-8 rounded border border-rose-200 text-rose-700 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full text-sm border border-rose-100 rounded-lg overflow-hidden">
                <thead className="bg-rose-50 text-rose-800 text-xs">
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
                      <td className="p-3 font-normal text-slate-800">{error.rowLabel}</td>
                      <td className="p-3 font-normal text-slate-700">{error.subject}</td>
                      <td className="p-3 text-center font-normal text-slate-700">{error.required}</td>
                      <td className="p-3 text-center font-normal text-slate-700">{error.actual}</td>
                      <td className="p-3 font-normal text-rose-700">{error.actual > error.required ? `Dư ${error.actual - error.required} tiết` : `Thiếu ${error.required - error.actual} tiết`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div ref={editorTableRef} role="region" aria-label="Bảng xếp thời khóa biểu" tabIndex={0} className="schedule-grid-scroll min-h-0 flex-1 overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
        <table style={{ minWidth: 128 + shownDays.length * 142 }} className="schedule-grid w-full table-fixed border-separate border-spacing-0 text-xs">
          <colgroup>
            <col className="w-20" />
            <col className="w-12" />
            {shownDays.map(day => <col key={`col-${day.key}`} />)}
          </colgroup>
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs">
              <th className="px-2 sm:px-2 py-3 text-left w-20 sticky left-0 bg-slate-50 z-30 border-b border-r border-slate-200">Lớp</th>
              <th className="px-3 py-3 text-center w-12 sticky left-20 bg-slate-50 z-30 border-b border-r border-slate-200">Tiết</th>
              {shownDays.map(day => <th key={day.key} className="px-3 py-3 text-center border-b border-r border-slate-200">{day.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {classRows.flatMap(row => [
              ...PERIODS.slice(0, periodCount).map((period, periodIndex) => (
                <tr key={`${row.id}-${period}`} className="border-t border-slate-100">
                  {periodIndex === 0 && (
                    <td rowSpan={periodCount + 1} className="px-2 py-1 sticky left-0 bg-white z-30 align-middle border-b border-r border-slate-200 shadow-[inset_-1px_0_0_#e2e8f0]">
                      <div className="text-slate-700 px-1 py-2 text-center whitespace-normal leading-tight">
                        {row.label}
                      </div>
                    </td>
                  )}
                  <td className="px-2 py-1 sticky left-20 bg-white z-20 text-center align-middle border-b border-r border-slate-200">
                    <span className="hidden sm:inline text-[10px] font-normal text-slate-400">Tiết </span>
                    <span className="font-normal text-slate-500">{period}</span>
                  </td>
                  {shownDays.map(day => {
                    const cellValue = schedule[row.id]?.[day.key]?.[period] || '';
                    const outsideTeachingHours = period > dayPeriodCounts[day.key];
                    const cellIsOff = outsideTeachingHours || isOffScheduleValue(cellValue);
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
                          ? 'border-slate-200 bg-slate-100'
                          : 'border-slate-100';
                    const selectToneClass = conflictIssue
                      ? 'border-rose-400 bg-rose-50 text-rose-800 ring-2 ring-rose-200'
                      : overIssue
                        ? 'border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-amber-200'
                        : cellIsOff
                          ? 'border-slate-200 bg-slate-100 text-slate-400'
                          : 'border-slate-200 bg-white text-slate-800';
                    return (
                      <td key={day.key} className={`px-1.5 py-1 align-middle border-b border-r ${cellToneClass}`}>
                        <div className="flex items-center gap-1.5">
                          <select
                            aria-label={`${row.label}, ${day.label}, tiết ${period}`}
                            data-row-id={row.id}
                            data-day-key={day.key}
                            data-period={period}
                            value={cellIsOff ? OFF_SLOT_VALUE : cellValue}
                            disabled={isArranging || cellIsOff}
                            title={issueTitle || undefined}
                            onChange={(event) => updateCell(row.id, day.key, period, event.target.value)}
                            className={`h-7 min-w-0 flex-1 rounded border px-1.5 py-0 text-xs font-normal focus:outline-none focus:border-blue-400 disabled:cursor-not-allowed ${selectToneClass}`}
                          >
                            <option value="">-</option>
                            <option value={OFF_SLOT_VALUE}>Nghỉ</option>
                            {getScheduleSubjectOptions(cellValue, row).map(subject => (
                              <option key={subject} value={subject}>{compactScheduleCellValue(subject, teacherShortNameByKey)}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={isArranging || outsideTeachingHours}
                            onClick={() => toggleOffSlot(row.id, day.key, period)}
                            aria-label={`${cellIsOff ? 'Mở lại' : 'Nghỉ'} ${row.label}, ${day.label}, tiết ${period}`}
                            title={outsideTeachingHours ? 'Ngoài số tiết đã cài đặt' : (cellIsOff ? 'Mở lại ô này' : 'Cho lớp nghỉ tiết này')}
                            className={`h-7 w-6 shrink-0 rounded border text-[11px] font-normal transition-colors ${cellIsOff ? 'border-slate-300 bg-slate-200 text-slate-600 hover:bg-slate-300' : 'border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600'}`}
                          >
                            X
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              )),
              <tr key={`${row.id}-fill`} className="schedule-fill-row bg-slate-50">
                <td className="px-3 py-2 sticky left-20 bg-slate-50 z-20 text-center align-middle border-b border-r border-slate-200">
                  <span className="text-[10px] font-normal text-slate-400">Đổ</span>
                </td>
                {shownDays.map(day => (
                  <td key={day.key} className="px-1.5 py-1 border-b border-r border-slate-200">
                    <button type="button" aria-label={`Đổ tiết ${row.label}, ${day.label}`} onClick={() => copyDaySubject(row.id, day.key)} disabled={isArranging} className="h-6 w-full rounded text-slate-500 text-[11px] font-normal hover:bg-slate-200 hover:text-slate-800 transition-colors">
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
