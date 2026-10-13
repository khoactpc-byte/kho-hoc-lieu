import { requestPrivateApi } from '../services/serverQuizClient';
import { SCOPED_AUTH_ENABLED } from '../services/scopedIdentity';
import { saveAttendanceEntry } from '../services/attendance';
import { attendanceDocumentId } from '../utils/classNormalization';
import ClassMonitorAttendance from './ClassMonitorAttendance';
import AttendanceCopyButton from './AttendanceCopyButton';
import { useAttendanceEdits } from '../hooks/useAttendanceEdits';
import { applyAttendanceEntry, attendanceCellKey, buildAttendanceSummary } from '../utils/attendance';
import { copyTextSafely } from '../utils/clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  Save,
  Users,
  X
} from 'lucide-react';
import { appId, db } from '../config/firebase';
import { compareSchoolClassNames, DEFAULT_SCHOOL_CODE, getSchoolGrade, getSchoolName, getStudentSchoolCode, normalizeSchoolClassName, normalizeSchoolCode } from '../utils/schoolClasses';

const DAYS = [
  { key: '2', label: 'Thứ 2' },
  { key: '3', label: 'Thứ 3' },
  { key: '4', label: 'Thứ 4' },
  { key: '5', label: 'Thứ 5' },
  { key: '6', label: 'Thứ 6' }
];

const DEFAULT_CLASSES = ['6', '7', '8', '9'];
const ATTENDANCE_STATUS = [
  { key: '', label: 'Học', tone: 'slate' },
  { key: 'CP', label: 'CP', hint: 'Có phép', tone: 'amber' },
  { key: 'KP', label: 'KP', hint: 'Không phép', tone: 'rose' }
];

const pad2 = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const parseYearStart = (schoolYear = '') => Number(String(schoolYear).match(/\d{4}/)?.[0]) || new Date().getFullYear();
const getClassName = (student = {}) => normalizeSchoolClassName(student.className || student.grade || '');
const extractDriveFileId = (url = '') => {
  const match = String(url || '').match(/\/file\/d\/([a-zA-Z0-9_-]+)|[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? (match[1] || match[2]) : '';
};
const getPreviewImageUrl = (url = '') => {
  const firstUrl = String(url || '').split(/\s*,\s*|\n+/).map(item => item.trim()).filter(Boolean)[0] || '';
  const id = extractDriveFileId(firstUrl);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w700` : firstUrl;
};
const getDriveEmbedUrl = (url = '') => {
  const firstUrl = String(url || '').split(/\s*,\s*|\n+/).map(item => item.trim()).filter(Boolean)[0] || '';
  const id = extractDriveFileId(firstUrl);
  return id ? `https://drive.google.com/file/d/${id}/preview` : '';
};
const getInitials = (fullName = '') => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1].slice(0, 1).toUpperCase() : 'HS';
};
const splitVietnameseName = (fullName = '') => {
  const parts = String(fullName || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return { family: '', given: '' };
  return {
    family: parts.slice(0, -1).join(' '),
    given: parts[parts.length - 1]
  };
};
const compareVietnameseStudentName = (a = {}, b = {}) => {
  const nameA = splitVietnameseName(a.fullName || '');
  const nameB = splitVietnameseName(b.fullName || '');
  return nameA.given.localeCompare(nameB.given, 'vi', { sensitivity: 'base' })
    || nameA.family.localeCompare(nameB.family, 'vi', { sensitivity: 'base' })
    || String(a.fullName || '').localeCompare(String(b.fullName || ''), 'vi', { sensitivity: 'base' });
};
const getGivenNameOnly = (fullName = '') => splitVietnameseName(fullName).given || String(fullName || '').trim() || '(Chưa có tên)';
const getClassFilterLabel = (className = '') => {
  const normalized = normalizeSchoolClassName(className);
  const grade = getSchoolGrade(normalized);
  return normalized === grade ? `Khối ${grade}` : `Lớp ${normalized}`;
};

const makeDefaultSlots = (classNames = DEFAULT_CLASSES) => Object.fromEntries(
  (classNames.length ? classNames : DEFAULT_CLASSES).map(className => [
    className,
    Object.fromEntries(DAYS.map(day => [day.key, '']))
  ])
);

const monthOptionsForSchoolYear = (schoolYear) => {
  const startYear = parseYearStart(schoolYear);
  return [9, 10, 11, 12, 1, 2, 3, 4, 5].map(month => ({
    month,
    year: month >= 9 ? startYear : startYear + 1,
    label: `Tháng ${month}/${month >= 9 ? startYear : startYear + 1}`
  }));
};

const getWeekDates = (anchorDate) => {
  const start = new Date(anchorDate);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return DAYS.map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const getInitialMonth = (months = []) => {
  const today = new Date();
  return months.find(item => item.year === today.getFullYear() && item.month === today.getMonth() + 1) || months[0];
};

const getDayKeyFromDate = (date) => String(date.getDay() || 7);
const getShortDayLabel = (date) => {
  const day = date.getDay();
  if (day === 0) return 'CN';
  return `T${day + 1}`;
};
const formatShortDate = (date) => `${date.getDate()}/${date.getMonth() + 1}`;
const formatVietnamDateKey = (dateKey = '') => {
  const [year, month, day] = String(dateKey || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : dateKey;
};
const makeMonthDates = (monthInfo) => {
  if (!monthInfo) return [];
  const total = new Date(monthInfo.year, monthInfo.month, 0).getDate();
  return Array.from({ length: total }, (_, index) => new Date(monthInfo.year, monthInfo.month - 1, index + 1))
    .filter(date => {
      const day = date.getDay();
      return day >= 1 && day <= 5;
    });
};

const filterDatesBySchedule = (dates = [], timetable = {}, className = '') => {
  const classSlots = timetable.slots?.[className] || {};
  const scheduledDates = dates.filter(date => classSlots[getDayKeyFromDate(date)]);
  return scheduledDates.length ? scheduledDates : dates;
};

const getFirstSchoolDateInWeek = (date, timetable = {}, className = '') => {
  const visibleDates = filterDatesBySchedule(getWeekDates(date), timetable, className);
  return visibleDates[0] || date;
};

const normalizeStudents = (students = [], className = '', schoolYear = '') => students
  .filter(student => (student.status || 'active') !== 'dropped')
  .filter(student => !schoolYear || String(student.schoolYear || schoolYear) === String(schoolYear))
  .filter(student => !className || getClassName(student) === String(className))
  .sort(compareVietnameseStudentName);

const uniqueClassesFrom = (students = [], timetable = {}, configuredClasses = []) => {
  const classes = new Set([
    ...(configuredClasses || []),
    ...(timetable.classOrder || []),
    ...students.map(getClassName).filter(Boolean)
  ]);
  if (!classes.size) DEFAULT_CLASSES.forEach(className => classes.add(className));
  return [...classes].sort(compareSchoolClassNames);
};

function AttendanceAvatar({ student = {} }) {
  const [fallbackMode, setFallbackMode] = useState(false);
  const mainUrl = String(student.portraitUrl || '').split(/\s*,\s*|\n+/).map(item => item.trim()).filter(Boolean)[0] || '';
  const embedUrl = getDriveEmbedUrl(mainUrl);

  if (!mainUrl) return getInitials(student.fullName);
  if (fallbackMode && embedUrl) {
    return <iframe title={student.fullName || 'Học sinh'} src={embedUrl} className="w-full h-full border-0 bg-white pointer-events-none" loading="lazy" />;
  }
  if (fallbackMode) return getInitials(student.fullName);
  return (
    <img
      src={getPreviewImageUrl(mainUrl)}
      alt={student.fullName || 'Học sinh'}
      className="w-full h-full object-contain"
      loading="lazy"
      decoding="async"
      onError={() => setFallbackMode(true)}
    />
  );
}

function AdminAttendanceStaticTable({ currentSchoolYear = '', students = [], classOptions = [], user, onClose, onOpenDatabase, showNotification }) {
  const today = new Date();
  const months = monthOptionsForSchoolYear(currentSchoolYear);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [activeGradeFilter, setActiveGradeFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => getInitialMonth(months) || { month: today.getMonth() + 1, year: today.getFullYear(), label: `Tháng ${today.getMonth() + 1}/${today.getFullYear()}` });
  const [reportMode, setReportMode] = useState('month');
  const [attendanceDocs, setAttendanceDocs] = useState([]);
  const [attendanceLoadedYear, setAttendanceLoadedYear] = useState('');
  const [saveError, setSaveError] = useState('');
  const [summaryDate, setSummaryDate] = useState('');
  const { changes, updateEntry } = useAttendanceEdits(currentSchoolYear);
  const [showAttendanceStats, setShowAttendanceStats] = useState(false);
  const [showPortraits, setShowPortraits] = useState(false);
  useEffect(() => {
    const dates = makeMonthDates(selectedMonth);
    const todayKey = toDateKey(new Date());
    const monthPrefix = `${selectedMonth.year}-${pad2(selectedMonth.month)}-`;
    setSummaryDate(previous => previous.startsWith(monthPrefix) ? previous
      : dates.some(date => toDateKey(date) === todayKey) ? todayKey : dates[0] ? toDateKey(dates[0]) : '');
  }, [selectedMonth]);
  const days = useMemo(() => reportMode === 'month' ? makeMonthDates(selectedMonth) : [], [reportMode, selectedMonth]);
  const reportMonths = useMemo(() => {
    if (reportMode === 'hk1') return months.filter(item => [9, 10, 11, 12, 1].includes(item.month));
    if (reportMode === 'hk2') return months.filter(item => [2, 3, 4, 5].includes(item.month));
    if (reportMode === 'year') return months;
    return [selectedMonth];
  }, [months, reportMode, selectedMonth]);
  const classFilters = uniqueClassesFrom(students, {}, classOptions);
  const gradeFilters = [...new Set(classFilters.map(getSchoolGrade).filter(Boolean))]
    .sort((left, right) => Number(left) - Number(right));
  const activeGradeClasses = activeGradeFilter
    ? classFilters.filter(className => getSchoolGrade(className) === activeGradeFilter)
    : [];
  useEffect(() => {
    setActiveGradeFilter('');
    setSelectedClasses([]);
    setSelectedMonth(getInitialMonth(monthOptionsForSchoolYear(currentSchoolYear)));
  }, [currentSchoolYear]);
  const rows = normalizeStudents(students, '', currentSchoolYear)
    .filter(student => selectedClasses.length === 0 || selectedClasses.includes(getClassName(student)))
    .sort((a, b) => compareSchoolClassNames(getClassName(a), getClassName(b)) || compareVietnameseStudentName(a, b));
  const attendanceMap = useMemo(() => {
    const map = new Map();
    attendanceDocs.forEach(item => {
      map.set(`${item.date}__${item.className}`, item.records || {});
    });
    changes.forEach(({ input, status }) => {
      const key = `${input.date}__${input.className}`;
      const records = map.get(key) || {};
      map.set(key, { ...records, [input.student.id]: { ...records[input.student.id], status } });
    });
    return map;
  }, [attendanceDocs, changes]);
  const rowsWithStats = useMemo(() => rows.map(student => {
    const className = getClassName(student);
    const statuses = Object.fromEntries(days.map(date => {
      const dateKey = toDateKey(date);
      const status = attendanceMap.get(`${dateKey}__${className}`)?.[student.id]?.status || '';
      return [dateKey, status];
    }));
    const monthStats = Object.fromEntries(reportMonths.map(monthInfo => {
      const monthStatuses = makeMonthDates(monthInfo).map(date => {
        const dateKey = toDateKey(date);
        return attendanceMap.get(`${dateKey}__${className}`)?.[student.id]?.status || '';
      });
      return [`${monthInfo.year}-${monthInfo.month}`, {
        cp: monthStatuses.filter(status => status === 'CP').length,
        kp: monthStatuses.filter(status => status === 'KP').length
      }];
    }));
    const cp = Object.values(monthStats).reduce((sum, item) => sum + item.cp, 0);
    const kp = Object.values(monthStats).reduce((sum, item) => sum + item.kp, 0);
    const nameParts = splitVietnameseName(student.fullName || '');
    return { student, className, nameParts, statuses, monthStats, cp, kp };
  }), [rows, days, reportMonths, attendanceMap]);
  const monthSummary = useMemo(() => {
    const base = Object.fromEntries(classFilters.map(className => [className, { className, students: 0, cp: 0, kp: 0, total: 0 }]));
    rowsWithStats.forEach(row => {
      const key = row.className || '-';
      if (!base[key]) base[key] = { className: key, students: 0, cp: 0, kp: 0, total: 0 };
      base[key].students += 1;
      base[key].cp += row.cp;
      base[key].kp += row.kp;
      base[key].total += row.cp + row.kp;
    });
    return Object.values(base).filter(item => selectedClasses.length === 0 || selectedClasses.includes(item.className));
  }, [classFilters, rowsWithStats, selectedClasses]);

  useEffect(() => {
    const ref = query(collection(db, 'artifacts', appId, 'public', 'data', 'class_attendance'), where('schoolYear', '==', currentSchoolYear));
    setAttendanceDocs([]);
    setAttendanceLoadedYear('');
    setSaveError('');
    return onSnapshot(ref, snapshot => {
      setAttendanceDocs(snapshot.docs
        .map(item => ({ ...item.data(), id: item.id }))
        .filter(item => String(item.schoolYear || '') === String(currentSchoolYear || '')));
      setAttendanceLoadedYear(currentSchoolYear);
    });
  }, [currentSchoolYear]);

  const selectAllClasses = () => {
    setActiveGradeFilter('');
    setSelectedClasses([]);
  };

  const selectGrade = (grade) => {
    const classes = classFilters.filter(className => getSchoolGrade(className) === grade);
    setActiveGradeFilter(grade);
    setSelectedClasses(classes);
  };

  const selectSingleClass = (className) => {
    setActiveGradeFilter(getSchoolGrade(className));
    setSelectedClasses([className]);
  };

  const cycleAttendance = (row, date) => {
    if (attendanceLoadedYear !== currentSchoolYear) { showNotification?.('Đang tải điểm danh. Vui lòng thử lại sau.', 'error'); return; }
    const dateKey = toDateKey(date);
    const className = row.className;
    setSaveError('');
    setSummaryDate(dateKey);
    try {
      const documentId = attendanceDocumentId(attendanceDocs, { schoolYear: currentSchoolYear, schoolCode: getStudentSchoolCode(row.student), className, date: dateKey });
      updateEntry({ documentId, student: row.student, cycle: true,
        expectedEntry: attendanceMap.get(dateKey + '__' + className)?.[row.student.id], schoolYear: currentSchoolYear,
        schoolCode: getStudentSchoolCode(row.student), className, date: dateKey, authorId: user?.uid }, {
        onCommit: (entry, input) => setAttendanceDocs(previous => applyAttendanceEntry(previous, input, entry)),
        onError: error => { setSaveError('Lỗi lưu điểm danh: ' + error.message); showNotification?.('Lỗi lưu điểm danh: ' + error.message, 'error'); }
      });
    } catch (error) { setSaveError('Lỗi lưu điểm danh: ' + error.message); }
  };

  const summaryGroups = new Map();
  rows.forEach(student => {
    const className = getClassName(student), schoolCode = getStudentSchoolCode(student);
    const key = `${schoolCode}/${className}`;
    if (!summaryGroups.has(key)) summaryGroups.set(key, { className, schoolName: getSchoolName(schoolCode),
      students: [], records: attendanceMap.get(`${summaryDate}__${className}`) || {} });
    summaryGroups.get(key).students.push(student);
  });
  const summary = buildAttendanceSummary({ date: summaryDate, schoolYear: currentSchoolYear, groups: [...summaryGroups.values()] });

  const exportPdf = () => {
    const reportLabel = reportMode === 'hk1' ? 'HỌC KỲ 1' : reportMode === 'hk2' ? 'HỌC KỲ 2' : reportMode === 'year' ? 'CẢ NĂM' : selectedMonth.label.toUpperCase();
    const title = `ĐIỂM DANH ${reportLabel} - ${currentSchoolYear}`;
    const visibleRows = rowsWithStats.map(row => `
      <tr>
        <td>${row.nameParts.family}</td>
        <td>${row.nameParts.given}</td>
        <td style="text-align:center">${row.className}</td>
        ${reportMode === 'month'
          ? days.map(date => `<td style="text-align:center">${row.statuses[toDateKey(date)] || ''}</td>`).join('')
          : reportMonths.map(monthInfo => {
              const key = `${monthInfo.year}-${monthInfo.month}`;
              return `<td style="text-align:center">${row.monthStats[key]?.cp || 0}</td><td style="text-align:center">${row.monthStats[key]?.kp || 0}</td>`;
            }).join('')}
        <td style="text-align:center">${row.cp}</td>
        <td style="text-align:center">${row.kp}</td>
        <td style="text-align:center">${row.cp + row.kp}</td>
      </tr>
    `).join('');
    const detailHeaders = reportMode === 'month'
      ? days.map(date => `<th>${formatShortDate(date)}<br><small>${getShortDayLabel(date)}</small></th>`).join('')
      : reportMonths.map(monthInfo => `<th>T${monthInfo.month} CP</th><th>T${monthInfo.month} KP</th>`).join('');
    const printHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body{font-family:Arial,sans-serif;padding:24px;color:#0f172a} h1{text-align:center;font-size:20px;margin:0 0 16px}
      table{width:100%;border-collapse:collapse;font-size:11px} th,td{border:1px solid #94a3b8;padding:6px} th{background:#e0f2fe}
      tr:nth-child(even) td{background:#f8fafc}.sum{margin-top:18px}
      @media print{button{display:none} body{padding:0}}
    </style></head><body><button onclick="window.print()" style="margin-bottom:12px;padding:10px 14px;font-weight:bold">In / lưu PDF</button><h1>${title}</h1><table><thead><tr><th>Họ và đệm</th><th>Tên</th><th>Lớp</th>${detailHeaders}<th>CP</th><th>KP</th><th>Tổng</th></tr></thead><tbody>${visibleRows}</tbody></table><script>setTimeout(function(){window.focus();window.print();},450);</script></body></html>`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      const blob = new Blob([printHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
      showNotification?.('Trình duyệt chặn cửa sổ in PDF, app đã tải bản in xuống. Mở file đó rồi chọn In/Lưu PDF.', 'error');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
  };

  return (
    <div className="attendance-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-[13px] font-normal sm:rounded-lg sm:border sm:border-slate-200">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-sky-600" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-slate-800">Điểm danh học sinh</h2>
            <p className="text-xs text-slate-500">{currentSchoolYear || 'Năm học'} · {rowsWithStats.length} học sinh</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <AttendanceCopyButton message={summary} disabled={attendanceLoadedYear !== currentSchoolYear || changes.size > 0 || !rows.length || !summaryDate} className="attendance-tool-button" />
          {onOpenDatabase && <button type="button" title="Mở danh sách học sinh" aria-label="Mở danh sách học sinh" onClick={onOpenDatabase} className="attendance-tool-button">
            <Users className="h-4 w-4" /><span className="hidden sm:inline">Học sinh</span>
          </button>}
          <button type="button" title="Thống kê" aria-label="Thống kê điểm danh" aria-pressed={showAttendanceStats} onClick={() => setShowAttendanceStats(prev => !prev)} className={'attendance-tool-button ' + (showAttendanceStats ? 'border-sky-300 bg-sky-50 text-sky-700' : '')}>
            <Users className="h-4 w-4" /><span className="hidden sm:inline">Thống kê</span>
          </button>
          <button type="button" title="Xuất PDF" aria-label="Xuất PDF điểm danh" disabled={changes.size > 0} onClick={exportPdf} className="attendance-tool-button text-sky-700">
            <Download className="h-4 w-4" /><span className="hidden sm:inline">Xuất PDF</span>
          </button>
          <button type="button" title={changes.size ? 'Đang lưu điểm danh' : 'Đóng'} disabled={changes.size > 0} aria-label="Đóng điểm danh" onClick={onClose} className="attendance-tool-button hover:text-rose-600"><X className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="shrink-0 border-b border-slate-200 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1" aria-label="Lọc khối">
            <button type="button" onClick={selectAllClasses} aria-pressed={!activeGradeFilter && selectedClasses.length === 0} className="attendance-filter-button">Tất cả</button>
            {gradeFilters.map(grade => <button key={grade} type="button" onClick={() => selectGrade(grade)} aria-pressed={activeGradeFilter === grade} className="attendance-filter-button">Khối {grade}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <label className="inline-flex items-center gap-2 text-xs text-slate-500">Ngày báo cáo
              <input type="date" aria-label="Ngày báo cáo Zalo" value={summaryDate} min={`${parseYearStart(currentSchoolYear)}-09-01`} max={`${parseYearStart(currentSchoolYear) + 1}-05-31`}
                onChange={event => {
                  const value = event.target.value;
                  if (!value || value < `${parseYearStart(currentSchoolYear)}-09-01` || value > `${parseYearStart(currentSchoolYear) + 1}-05-31`) return;
                  const [year, month] = value.split('-').map(Number);
                  const found = months.find(item => item.year === year && item.month === month);
                  if (found && (selectedMonth.year !== year || selectedMonth.month !== month)) { setSelectedMonth(found); setReportMode('month'); }
                  setSummaryDate(value);
                }} className="h-8 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700" />
            </label>
            <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
              <input type="checkbox" checked={showPortraits} onChange={event => setShowPortraits(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />Hiện ảnh
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-500">
              Thời gian
              <select aria-label="Thời gian điểm danh" value={reportMode === 'month' ? selectedMonth.year + '-' + selectedMonth.month : reportMode} onChange={event => {
                if (['hk1', 'hk2', 'year'].includes(event.target.value)) { setReportMode(event.target.value); return; }
                const [year, month] = event.target.value.split('-').map(Number);
                const found = months.find(item => item.year === year && item.month === month);
                if (found) { setSelectedMonth(found); setReportMode('month'); }
              }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700">
                {months.map(month => <option key={month.year + '-' + month.month} value={month.year + '-' + month.month}>{month.label}</option>)}
                <option value="hk1">Học kỳ 1</option><option value="hk2">Học kỳ 2</option><option value="year">Cả năm</option>
              </select>
            </label>
          </div>
        </div>
        {saveError && <p role="alert" className="attendance-save-error">{saveError}</p>}
        {activeGradeFilter && activeGradeClasses.length > 1 && <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2" aria-label="Lọc lớp">
          <span className="mr-1 text-xs text-slate-500">Lớp</span>
          <button type="button" onClick={() => selectGrade(activeGradeFilter)} aria-pressed={selectedClasses.length === activeGradeClasses.length && activeGradeClasses.every(className => selectedClasses.includes(className))} className="attendance-filter-button">Cả khối {activeGradeFilter}</button>
          {activeGradeClasses.map(className => <button key={className} type="button" onClick={() => selectSingleClass(className)} aria-pressed={selectedClasses.length === 1 && selectedClasses[0] === className} className="attendance-filter-button">
            {normalizeSchoolClassName(className) === activeGradeFilter ? 'Chưa chia lớp' : className}
          </button>)}
        </div>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <div className="attendance-table-scroll min-h-0 flex-1 overflow-auto overscroll-contain rounded-md border border-slate-200">
          <table className={'attendance-table min-w-full table-fixed border-separate border-spacing-0 text-xs ' + (showPortraits ? 'attendance-with-portraits' : '')} style={{ width: 'calc(var(--attendance-name-width) + var(--attendance-class-width) + ' + ((reportMode === 'month' ? days.length * 42 : reportMonths.length * 96) + 144) + 'px)' }}>
            <colgroup>
              <col style={{ width: 'var(--attendance-name-width)' }} /><col style={{ width: 'var(--attendance-class-width)' }} />
              {reportMode === 'month' ? days.map(date => <col key={toDateKey(date)} style={{ width: 42 }} />) : reportMonths.map(month => <React.Fragment key={month.year + '-' + month.month}><col style={{ width: 48 }} /><col style={{ width: 48 }} /></React.Fragment>)}
              <col style={{ width: 48 }} /><col style={{ width: 48 }} /><col style={{ width: 48 }} />
            </colgroup>
            <thead className="sticky top-0 z-30">
              <tr>
                <th rowSpan={reportMode === 'month' ? 1 : 2} className="attendance-name-cell text-left">Họ và tên</th>
                <th rowSpan={reportMode === 'month' ? 1 : 2} className="attendance-class-cell">Lớp</th>
                {reportMode === 'month' ? days.map(date => <th key={toDateKey(date)}><span className="block">{formatShortDate(date)}</span><span className="block text-[10px] text-sky-100">{getShortDayLabel(date)}</span></th>) : reportMonths.map(month => <th key={month.year + '-' + month.month} colSpan={2}>Tháng {month.month}</th>)}
                <th rowSpan={reportMode === 'month' ? 1 : 2} title="Có phép">CP</th><th rowSpan={reportMode === 'month' ? 1 : 2} title="Không phép">KP</th><th rowSpan={reportMode === 'month' ? 1 : 2}>Tổng</th>
              </tr>
              {reportMode !== 'month' && <tr>{reportMonths.map(month => <React.Fragment key={month.year + '-' + month.month}><th>CP</th><th>KP</th></React.Fragment>)}</tr>}
            </thead>
            <tbody>
              {!rowsWithStats.length ? <tr><td colSpan={(reportMode === 'month' ? days.length : reportMonths.length * 2) + 5} className="py-8 text-center text-slate-400">Chưa có học sinh trong khối đang chọn.</td></tr> : rowsWithStats.map((row, rowIndex) => <tr key={row.student.id || row.student.fullName + '-' + row.student.birthDate} className={rowIndex % 2 ? 'bg-slate-50' : 'bg-white'}>
                <td className="attendance-name-cell" title={row.student.fullName + (row.student.accessCode ? ' · ' + row.student.accessCode : '')}>
                  <div className="flex min-w-0 items-center gap-2">
                    {showPortraits && <div className="h-8 w-7 shrink-0 overflow-hidden rounded border border-slate-200 bg-white text-center text-sky-700"><AttendanceAvatar student={row.student} /></div>}
                    <div className="min-w-0"><div className="truncate text-slate-700">{row.student.fullName || '(Chưa có tên)'}</div>{showPortraits && <div className="truncate text-[10px] text-slate-400">{row.student.accessCode || ''}</div>}</div>
                  </div>
                </td>
                <td className="attendance-class-cell text-slate-600">{row.className || '-'}</td>
                {reportMode === 'month' ? days.map(date => {
                  const status = row.statuses[toDateKey(date)] || '';
                  const busy = changes.has(attendanceCellKey({ schoolYear: currentSchoolYear, schoolCode: getStudentSchoolCode(row.student), className: row.className, date: toDateKey(date), student: row.student }));
                  return <td key={toDateKey(date)} className="p-0 text-center"><button type="button" onClick={() => cycleAttendance(row, date)} disabled={attendanceLoadedYear !== currentSchoolYear} aria-busy={busy} aria-label={row.student.fullName + ', ' + formatVietnamDateKey(toDateKey(date)) + ': ' + (status === 'CP' ? 'Có phép' : status === 'KP' ? 'Không phép' : 'Đi học')} title={busy ? 'Đang lưu điểm danh' : 'Nhấn để đổi: đi học → có phép → không phép'} className={'attendance-day-button ' + (status === 'CP' ? 'bg-amber-50 text-amber-700' : status === 'KP' ? 'bg-rose-50 text-rose-700' : 'text-slate-300')}>{status || '-'}</button></td>;
                }) : reportMonths.map(month => {
                  const stats = row.monthStats[month.year + '-' + month.month] || { cp: 0, kp: 0 };
                  return <React.Fragment key={month.year + '-' + month.month}><td className="text-center text-amber-700">{stats.cp}</td><td className="text-center text-rose-700">{stats.kp}</td></React.Fragment>;
                })}
                <td className="text-center text-amber-700">{row.cp}</td><td className="text-center text-rose-700">{row.kp}</td><td className="text-center text-slate-700">{row.cp + row.kp}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {showAttendanceStats && <section className="max-h-[35%] shrink-0 overflow-auto rounded-md border border-slate-200" aria-label="Thống kê điểm danh">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">Thống kê {reportMode === 'month' ? selectedMonth.label : reportMode === 'hk1' ? 'học kỳ 1' : reportMode === 'hk2' ? 'học kỳ 2' : 'cả năm'}</div>
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 text-slate-500"><th className="px-3 py-1.5 text-left font-normal">Lớp</th><th className="font-normal">Học sinh</th><th className="font-normal">CP</th><th className="font-normal">KP</th><th className="font-normal">Tổng vắng</th></tr></thead>
            <tbody>{monthSummary.map(item => <tr key={item.className} className="border-t border-slate-100"><td className="px-3 py-1.5">{getClassFilterLabel(item.className)}</td><td className="text-center">{item.students}</td><td className="text-center text-amber-700">{item.cp}</td><td className="text-center text-rose-700">{item.kp}</td><td className="text-center">{item.total}</td></tr>)}</tbody>
            <tfoot><tr className="border-t border-slate-200 bg-slate-50"><td className="px-3 py-1.5">Tổng</td><td className="text-center">{monthSummary.reduce((sum, item) => sum + item.students, 0)}</td><td className="text-center text-amber-700">{monthSummary.reduce((sum, item) => sum + item.cp, 0)}</td><td className="text-center text-rose-700">{monthSummary.reduce((sum, item) => sum + item.kp, 0)}</td><td className="text-center">{monthSummary.reduce((sum, item) => sum + item.total, 0)}</td></tr></tfoot>
          </table>
        </section>}
        <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-slate-500"><span><span className="text-amber-700">CP</span>: Có phép</span><span><span className="text-rose-700">KP</span>: Không phép</span><span>Nhấn ô để đổi: đi học → CP → KP.</span>{changes.size > 0 && <span role="status">Đang lưu {changes.size} ô…</span>}</div>
      </div>
    </div>
  );
}

export default function ClassOpsManager(props) {
  const mode = props.mode || 'admin';
  const initialView = props.initialView || 'attendance';
  if (mode === 'monitor') return <ClassMonitorAttendance {...props} />;
  if (mode === 'admin' && initialView === 'attendance') {
    return <AdminAttendanceStaticTable
      currentSchoolYear={props.currentSchoolYear}
      students={props.students}
      classOptions={props.classOptions}
      user={props.user}
      onClose={props.onClose}
      onOpenDatabase={props.onOpenDatabase}
      showNotification={props.showNotification}
    />;
  }
  return <InteractiveClassOpsManager {...props} />;
}

function InteractiveClassOpsManager({
  mode = 'admin',
  initialView = 'attendance',
  currentSchoolYear,
  schoolCode = '',
  user,
  students = [],
  classOptions = [],
  currentStudent = null,
  subjects = [],
  onClose,
  showNotification
}) {
  const isAdmin = mode === 'admin';
  const activeView = isAdmin && initialView === 'schedule' ? 'schedule' : 'attendance';
  const studentSchoolCode = getStudentSchoolCode(currentStudent || {});
  const activeSchoolCode = normalizeSchoolCode(schoolCode) || (studentSchoolCode === 'UNKNOWN' ? DEFAULT_SCHOOL_CODE : studentSchoolCode);
  const monitorClass = getClassName(currentStudent);
  const configuredClasses = useMemo(() => {
    const rows = [...new Set((Array.isArray(classOptions) ? classOptions : []).map(item => normalizeSchoolClassName(item)).filter(Boolean))];
    return rows.length ? rows.sort(compareSchoolClassNames) : DEFAULT_CLASSES;
  }, [classOptions]);
  const months = useMemo(() => monthOptionsForSchoolYear(currentSchoolYear), [currentSchoolYear]);
  const [monitorStudents, setMonitorStudents] = useState([]);
  const [timetable, setTimetable] = useState({ classOrder: configuredClasses, slots: makeDefaultSlots(configuredClasses) });
  const [isSavingTimetable, setIsSavingTimetable] = useState(false);
  const [activeClass, setActiveClass] = useState(monitorClass || configuredClasses[0]);
  const [selectedMonth, setSelectedMonth] = useState(() => getInitialMonth(months));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(getFirstSchoolDateInWeek(new Date())));
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [records, setRecords] = useState({});
  const [attendanceDocs, setAttendanceDocs] = useState([]);
  const [attendanceLoadedYear, setAttendanceLoadedYear] = useState('');
  const attendanceSavesRef = useRef(new Set());
  const [statsClass, setStatsClass] = useState('all');
  const [mobileStatsMode, setMobileStatsMode] = useState('week');
  const [profilePreviewStudent, setProfilePreviewStudent] = useState(null);

  useEffect(() => {
    if (monitorClass) setActiveClass(monitorClass);
  }, [monitorClass]);

  useEffect(() => {
    setSelectedMonth(getInitialMonth(months));
  }, [months]);

  useEffect(() => {
    if (!selectedMonth) return;
    const today = new Date();
    if (selectedMonth.year === today.getFullYear() && selectedMonth.month === today.getMonth() + 1) {
      setWeekAnchor(today);
      setSelectedDate(toDateKey(getFirstSchoolDateInWeek(today, timetable, activeClass)));
      return;
    }
    const firstOfMonth = new Date(selectedMonth.year, selectedMonth.month - 1, 1);
    setWeekAnchor(firstOfMonth);
    setSelectedDate(toDateKey(getFirstSchoolDateInWeek(firstOfMonth, timetable, activeClass)));
  }, [selectedMonth, activeClass, timetable]);

  useEffect(() => {
    if (!SCOPED_AUTH_ENABLED || isAdmin) return undefined;
    const controller = new AbortController(); let busy = false;
    const load = async () => { if (busy) return; busy=true; try { const data = await requestPrivateApi('data','classOps',{}, {signal:controller.signal}); if (!controller.signal.aborted) { setMonitorStudents(data.students);setAttendanceDocs(data.attendance);setTimetable(data.timetable);setRecords(data.attendance.find(item=>item.date===selectedDate)?.records||{}); } } catch(error) { if(!controller.signal.aborted) showNotification?.(error.message,'error'); } finally {busy=false;} };
    void load();const timer=setInterval(()=>{void load();},15000);return()=>{controller.abort();clearInterval(timer);};
  }, [isAdmin, selectedDate, currentSchoolYear, showNotification]);
  useEffect(() => {
    if (SCOPED_AUTH_ENABLED && !isAdmin) return undefined;
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'class_timetables', `${currentSchoolYear}_${activeSchoolCode}`);
    let active = true;
    const applyTimetable = (data = {}) => {
      if (!active) return;
      const classOrder = data.classOrder?.length ? data.classOrder : configuredClasses;
      setTimetable({
        classOrder,
        slots: { ...makeDefaultSlots(classOrder), ...(data.slots || {}) }
      });
    };
    const unsubscribe = onSnapshot(ref, snapshot => {
      if (snapshot.exists()) {
        applyTimetable(snapshot.data());
        return;
      }
      if (activeSchoolCode === DEFAULT_SCHOOL_CODE) {
        getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_timetables', currentSchoolYear))
          .then(legacySnapshot => applyTimetable(legacySnapshot.exists() ? legacySnapshot.data() : {}))
          .catch(() => applyTimetable());
        return;
      }
      applyTimetable();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activeSchoolCode, configuredClasses, currentSchoolYear, isAdmin]);

  useEffect(() => {
    if (SCOPED_AUTH_ENABLED && !isAdmin) return undefined;
    setRecords(attendanceDocs.find(item => item.schoolYear === currentSchoolYear && item.date === selectedDate
      && item.className === activeClass && getStudentSchoolCode(item) === activeSchoolCode)?.records || {});
  }, [activeClass, activeSchoolCode, attendanceDocs, currentSchoolYear, selectedDate, isAdmin]);

  useEffect(() => {
    if (SCOPED_AUTH_ENABLED && !isAdmin) return undefined;
    const ref = query(collection(db, 'artifacts', appId, 'public', 'data', 'class_attendance'), where('schoolYear', '==', currentSchoolYear));
    setAttendanceDocs([]);
    setAttendanceLoadedYear('');
    return onSnapshot(ref, snapshot => {
      setAttendanceDocs(snapshot.docs
        .map(item => ({ ...item.data(), id: item.id }))
        .filter(item => String(item.schoolYear || '') === String(currentSchoolYear || '')));
      setAttendanceLoadedYear(currentSchoolYear);
    });
  }, [currentSchoolYear, isAdmin]);

  const classStudents = useMemo(() => normalizeStudents(SCOPED_AUTH_ENABLED && !isAdmin ? monitorStudents : students, activeClass, currentSchoolYear), [students, monitorStudents, isAdmin, activeClass, currentSchoolYear]);
  const classFilters = useMemo(() => uniqueClassesFrom(students, timetable, configuredClasses), [configuredClasses, students, timetable]);
  const monthDays = useMemo(() => {
    if (!selectedMonth) return [];
    const weekdays = makeMonthDates(selectedMonth);
    return filterDatesBySchedule(weekdays, timetable, activeClass);
  }, [selectedMonth, timetable, activeClass]);
  const weekDates = useMemo(() => filterDatesBySchedule(getWeekDates(weekAnchor), timetable, activeClass), [weekAnchor, timetable, activeClass]);
  const statsMonthDays = useMemo(() => {
    const weekdays = makeMonthDates(selectedMonth);
    return statsClass === 'all' ? weekdays : filterDatesBySchedule(weekdays, timetable, statsClass);
  }, [selectedMonth, statsClass, timetable]);
  const statsWeekDates = useMemo(() => {
    const dates = getWeekDates(weekAnchor);
    return statsClass === 'all' ? dates : filterDatesBySchedule(dates, timetable, statsClass);
  }, [weekAnchor, statsClass, timetable]);
  const statsDates = mobileStatsMode === 'week' ? statsWeekDates : statsMonthDays;
  const weekRangeLabel = useMemo(() => {
    const fullWeek = getWeekDates(weekAnchor);
    const first = fullWeek[0];
    const last = fullWeek[fullWeek.length - 1];
    return `${formatShortDate(first)} - ${formatShortDate(last)}/${last.getFullYear()}`;
  }, [weekAnchor]);

  const attendanceMap = useMemo(() => {
    const map = new Map();
    attendanceDocs.forEach(item => {
      map.set(`${item.date}__${item.className}`, item.records || {});
    });
    return map;
  }, [attendanceDocs]);

  const statsStudents = useMemo(() => {
    return normalizeStudents(students, statsClass === 'all' ? '' : statsClass, currentSchoolYear);
  }, [students, statsClass, currentSchoolYear]);

  const getStatsStatus = useCallback((student, date) => {
    const dateKey = toDateKey(date);
    const className = getClassName(student);
    const dayRecords = attendanceMap.get(`${dateKey}__${className}`);
    if (!dayRecords) return null;
    return dayRecords[student.id]?.status || '';
  }, [attendanceMap]);

  const statsRows = useMemo(() => statsStudents.map(student => {
    const statuses = Object.fromEntries(statsMonthDays.map(date => [toDateKey(date), getStatsStatus(student, date)]));
    const cp = Object.values(statuses).filter(status => status === 'CP').length;
    const kp = Object.values(statuses).filter(status => status === 'KP').length;
    return { student, statuses, cp, kp, totalAbsent: cp + kp };
  }), [statsStudents, statsMonthDays, getStatsStatus]);

  const mobileStatsRows = useMemo(() => statsStudents.map(student => {
    const statuses = Object.fromEntries(statsDates.map(date => [toDateKey(date), getStatsStatus(student, date)]));
    const cp = Object.values(statuses).filter(status => status === 'CP').length;
    const kp = Object.values(statuses).filter(status => status === 'KP').length;
    return { student, statuses, cp, kp, totalAbsent: cp + kp };
  }), [statsStudents, statsDates, getStatsStatus]);

  const statsMonthTotals = useMemo(() => statsRows.reduce((acc, row) => ({
    cp: acc.cp + row.cp,
    kp: acc.kp + row.kp,
    absent: acc.absent + row.totalAbsent
  }), { cp: 0, kp: 0, absent: 0 }), [statsRows]);

  const statsMobileTotals = useMemo(() => {
    return mobileStatsRows.reduce((acc, row) => ({
      cp: acc.cp + row.cp,
      kp: acc.kp + row.kp,
      absent: acc.absent + row.totalAbsent
    }), { cp: 0, kp: 0, absent: 0 });
  }, [mobileStatsRows]);

  useEffect(() => {
    if (!monthDays.length) return;
    if (!monthDays.some(date => toDateKey(date) === selectedDate)) {
      setSelectedDate(toDateKey(monthDays[0]));
    }
  }, [monthDays, selectedDate]);

  const moveAttendanceWeek = (offset) => {
    const next = new Date(weekAnchor);
    next.setDate(next.getDate() + offset * 7);
    setWeekAnchor(next);
    const nextDates = filterDatesBySchedule(getWeekDates(next), timetable, activeClass);
    if (nextDates[0]) setSelectedDate(toDateKey(nextDates[0]));
  };

  const saveTimetable = async (next = timetable) => {
    setIsSavingTimetable(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_timetables', `${currentSchoolYear}_${activeSchoolCode}`), {
        schoolYear: currentSchoolYear,
        schoolCode: activeSchoolCode,
        schoolName: getSchoolName(activeSchoolCode),
        classOrder: next.classOrder,
        slots: next.slots,
        updatedAt: Date.now(),
        updatedBy: user?.uid || ''
      }, { merge: true });
      showNotification?.('Đã lưu thời khóa biểu.');
    } catch (error) {
      showNotification?.(`Lỗi lưu thời khóa biểu: ${error.message}`, 'error');
    } finally {
      setIsSavingTimetable(false);
    }
  };

  const updateSlot = (className, dayKey, subject) => {
    setTimetable(prev => ({
      ...prev,
      slots: {
        ...prev.slots,
        [className]: {
          ...(prev.slots?.[className] || {}),
          [dayKey]: subject
        }
      }
    }));
  };

  const moveClass = (index, direction) => {
    setTimetable(prev => {
      const order = [...(prev.classOrder || configuredClasses)];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= order.length) return prev;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...prev, classOrder: order };
    });
  };

  const updateAttendance = async (student, status, dateKey = selectedDate) => {
    if (!(SCOPED_AUTH_ENABLED && !isAdmin) && attendanceLoadedYear !== currentSchoolYear) { showNotification?.('Đang tải điểm danh. Vui lòng thử lại sau.', 'error'); return; }
    const documentId = attendanceDocumentId(attendanceDocs, { schoolYear: currentSchoolYear, schoolCode: activeSchoolCode, className: activeClass, date: dateKey });
    const key = documentId + '/' + student.id;
    if (attendanceSavesRef.current.has(key)) return;
    attendanceSavesRef.current.add(key);
    const currentRecords = dateKey === selectedDate ? records : (attendanceMap.get(dateKey + '__' + activeClass) || {});
    try {
      await saveAttendanceEntry({ documentId, student, status, expectedEntry: currentRecords[student.id],
        schoolYear: currentSchoolYear, schoolCode: activeSchoolCode, className: activeClass, date: dateKey,
        authorId: user?.uid || currentStudent?.id });
    } catch (error) { showNotification?.('Lỗi lưu điểm danh: ' + error.message, 'error'); }
    finally { attendanceSavesRef.current.delete(key); }
  };

  const statusClass = (statusKey, currentStatus) => {
    if (statusKey !== currentStatus) return 'bg-white text-slate-500 border-slate-200';
    if (statusKey === 'CP') return 'bg-amber-500 text-white border-amber-500';
    if (statusKey === 'KP') return 'bg-rose-600 text-white border-rose-600';
    return 'bg-emerald-600 text-white border-emerald-600';
  };

  const attendanceCellClass = (status) => {
    if (status === 'CP') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (status === 'KP') return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  };

  const buildZaloAttendanceMessage = (dateKey) => {
    const dayRecords = {
      ...(attendanceMap.get(`${dateKey}__${activeClass}`) || {}),
      ...(dateKey === selectedDate ? records : {})
    };
    const cp = [];
    const kp = [];
    classStudents.forEach(student => {
      const status = dayRecords[student.id]?.status || '';
      if (status === 'CP') cp.push(getGivenNameOnly(student.fullName));
      if (status === 'KP') kp.push(getGivenNameOnly(student.fullName));
    });
    return [
      `ĐIỂM DANH LỚP ${activeClass} - ${formatVietnamDateKey(dateKey)}`,
      `CP: ${cp.length ? cp.join(', ') : 'Không có'}`,
      `KP: ${kp.length ? kp.join(', ') : 'Không có'}`,
      `Tổng vắng: ${cp.length + kp.length} (CP ${cp.length}, KP ${kp.length})`
    ].join('\n');
  };

  const copyZaloAttendanceMessage = async (dateKey) => {
    const copied = await copyTextSafely(buildZaloAttendanceMessage(dateKey));
    showNotification?.(copied ? 'Đã copy tin điểm danh để dán vào nhóm Zalo.' : 'Chưa copy được tin Zalo, thầy thử bấm lại nhé.', copied ? 'success' : 'error');
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-none mx-auto min-h-[92vh] sm:min-h-0 sm:max-h-[92vh] overflow-hidden flex flex-col">
      <div className="px-4 sm:px-6 py-4 border-b bg-indigo-50/70 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 uppercase flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-indigo-600" /> {activeView === 'schedule' ? 'Thời khóa biểu' : (isAdmin ? 'Điểm danh học sinh' : 'Điểm danh lớp')}
          </h2>
          <p className="text-xs font-bold text-indigo-700/75 truncate">
            {activeView === 'schedule' ? 'Xếp lịch theo lớp, môn học và các ngày trong tuần.' : (isAdmin ? 'Quản lý điểm danh theo tháng trên máy tính, theo tuần trên điện thoại.' : `Cán sự lớp ${activeClass || ''} điểm danh CP/KP theo từng buổi.`)}
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-500 hover:bg-rose-600 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 bg-slate-50/70">
        {isAdmin && activeView === 'schedule' && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-black text-slate-900 uppercase">Bảng thời khóa biểu</h3>
                <p className="text-xs text-slate-500 font-bold">Dùng nút lên/xuống để kéo các lớp học ghép sát nhau.</p>
              </div>
              <button type="button" onClick={() => saveTimetable()} disabled={isSavingTimetable} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase flex items-center justify-center gap-2 disabled:opacity-60">
                <Save className="w-4 h-4" /> Lưu lịch
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <th className="px-3 py-3 text-left w-36">Lớp</th>
                    {DAYS.map(day => <th key={day.key} className="px-3 py-3 text-left">{day.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(timetable.classOrder || configuredClasses).map((className, index) => (
                    <tr key={className} className="border-t border-slate-100">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl px-3 py-2 font-black">Lớp {className}</div>
                          <button type="button" onClick={() => moveClass(index, -1)} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600"><ArrowUp className="w-4 h-4" /></button>
                          <button type="button" onClick={() => moveClass(index, 1)} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-600"><ArrowDown className="w-4 h-4" /></button>
                        </div>
                      </td>
                      {DAYS.map(day => (
                        <td key={day.key} className="px-3 py-3">
                          <select value={timetable.slots?.[className]?.[day.key] || ''} onChange={(e) => updateSlot(className, day.key, e.target.value)} className="w-full min-w-[130px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-slate-700 focus:outline-none focus:border-indigo-400">
                            <option value="">-</option>
                            {subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeView === 'attendance' && isAdmin && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-900 uppercase flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-indigo-600" /> Bảng tháng điểm danh
                </h3>
                <p className="text-xs text-slate-500 font-bold">Tạm thời load danh sách trước, CP/KP sẽ hiện khi đã có dữ liệu điểm danh.</p>
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2">
                <select value={statsClass} onChange={(event) => setStatsClass(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black">
                  <option value="all">Tất cả khối</option>
                  {classFilters.map(className => <option key={className} value={className}>{getClassFilterLabel(className)}</option>)}
                </select>
                <select value={`${selectedMonth?.year || ''}-${selectedMonth?.month || ''}`} onChange={(event) => {
                  const [year, month] = event.target.value.split('-').map(Number);
                  const found = months.find(item => item.year === year && item.month === month);
                  setSelectedMonth(found);
                }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black">
                  {months.map(month => <option key={`${month.year}-${month.month}`} value={`${month.year}-${month.month}`}>{month.label}</option>)}
                </select>
              </div>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 border border-blue-100">{statsStudents.length} học sinh</span>
              <span className="rounded-full bg-amber-50 text-amber-700 px-3 py-1 border border-amber-100">CP: Có phép</span>
              <span className="rounded-full bg-rose-50 text-rose-700 px-3 py-1 border border-rose-100">KP: Không phép</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase">
                    <th className="px-3 py-3 text-left sticky left-0 bg-slate-50 z-10 min-w-[220px]">Học sinh</th>
                    <th className="px-2 py-3 text-center min-w-[64px]">Lớp</th>
                    {statsMonthDays.map(date => (
                      <th key={toDateKey(date)} className="px-2 py-3 text-center min-w-[54px]">
                        <span className="block">{formatShortDate(date)}</span>
                        <span className="block text-[9px] text-slate-400">{getShortDayLabel(date)}</span>
                      </th>
                    ))}
                    <th className="px-2 py-3 text-center min-w-[60px]">CP</th>
                    <th className="px-2 py-3 text-center min-w-[60px]">KP</th>
                  </tr>
                </thead>
                <tbody>
                  {statsRows.length === 0 ? (
                    <tr><td colSpan={statsMonthDays.length + 4} className="px-4 py-8 text-center font-bold text-slate-400">Chưa có học sinh để hiển thị.</td></tr>
                  ) : statsRows.map(row => (
                    <tr key={row.student.id} className="border-t border-slate-100 bg-white">
                      <td className="px-3 py-2 sticky left-0 bg-white z-10">
                        <div className="font-black text-slate-800">{row.student.fullName || '(Chưa có tên)'}</div>
                        <div className="text-[10px] font-bold text-slate-400">{row.student.accessCode || ''}</div>
                      </td>
                      <td className="px-2 py-2 text-center font-black text-slate-600">{getClassName(row.student)}</td>
                      {statsMonthDays.map(date => {
                        const status = row.statuses[toDateKey(date)];
                        return (
                          <td key={toDateKey(date)} className="px-1 py-1 text-center">
                            <span className={`inline-flex min-w-8 justify-center rounded-lg border px-2 py-1 font-black ${status === 'CP' ? 'bg-amber-50 text-amber-700 border-amber-200' : status === 'KP' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                              {status || '-'}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-black text-amber-700">{row.cp}</td>
                      <td className="px-2 py-2 text-center font-black text-rose-700">{row.kp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeView === 'attendance' && !isAdmin && (
        <>
        {isAdmin && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-white flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-900 uppercase flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-indigo-600" /> Thống kê điểm danh
                </h3>
                <p className="text-xs text-slate-500 font-bold">Máy tính xem theo tháng; điện thoại có thể đổi nhanh tuần/tháng.</p>
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2">
                <select value={statsClass} onChange={(event) => setStatsClass(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black">
                  <option value="all">Tất cả khối</option>
                  {classFilters.map(className => <option key={className} value={className}>{getClassFilterLabel(className)}</option>)}
                </select>
                <select value={`${selectedMonth?.year || ''}-${selectedMonth?.month || ''}`} onChange={(event) => {
                  const [year, month] = event.target.value.split('-').map(Number);
                  const found = months.find(item => item.year === year && item.month === month);
                  setSelectedMonth(found);
                }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black">
                  {months.map(month => <option key={`${month.year}-${month.month}`} value={`${month.year}-${month.month}`}>{month.label}</option>)}
                </select>
                <div className="md:hidden col-span-2 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <button type="button" onClick={() => setMobileStatsMode('week')} className={`py-2 rounded-lg text-xs font-black uppercase ${mobileStatsMode === 'week' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}>Tuần</button>
                  <button type="button" onClick={() => setMobileStatsMode('month')} className={`py-2 rounded-lg text-xs font-black uppercase ${mobileStatsMode === 'month' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}>Tháng</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 p-3 sm:p-4 border-b border-slate-100 bg-slate-50/70">
              <div className="rounded-2xl bg-blue-50 border border-blue-100 px-3 py-2">
                <div className="text-xl font-black text-blue-700">{statsStudents.length}</div>
                <div className="text-[10px] font-black uppercase text-blue-600">Học sinh</div>
              </div>
              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-3 py-2">
                <div className="text-xl font-black text-amber-700">
                  <span className="hidden md:inline">{statsMonthTotals.cp}</span>
                  <span className="md:hidden">{statsMobileTotals.cp}</span>
                </div>
                <div className="text-[10px] font-black uppercase text-amber-600">Có phép</div>
              </div>
              <div className="rounded-2xl bg-rose-50 border border-rose-100 px-3 py-2">
                <div className="text-xl font-black text-rose-700">
                  <span className="hidden md:inline">{statsMonthTotals.kp}</span>
                  <span className="md:hidden">{statsMobileTotals.kp}</span>
                </div>
                <div className="text-[10px] font-black uppercase text-rose-600">Không phép</div>
              </div>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[1100px] text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase">
                    <th className="px-3 py-3 text-left sticky left-0 bg-slate-50 z-10 min-w-[220px]">Học sinh</th>
                    <th className="px-2 py-3 text-center min-w-[64px]">Lớp</th>
                    {statsMonthDays.map(date => (
                      <th key={toDateKey(date)} className="px-2 py-3 text-center min-w-[54px]">
                        <span className="block">{formatShortDate(date)}</span>
                        <span className="block text-[9px] text-slate-400">{getShortDayLabel(date)}</span>
                      </th>
                    ))}
                    <th className="px-2 py-3 text-center min-w-[60px]">CP</th>
                    <th className="px-2 py-3 text-center min-w-[60px]">KP</th>
                  </tr>
                </thead>
                <tbody>
                  {statsRows.length === 0 ? (
                    <tr><td colSpan={statsMonthDays.length + 4} className="px-4 py-8 text-center font-bold text-slate-400">Chưa có học sinh để thống kê.</td></tr>
                  ) : statsRows.map(row => (
                    <tr key={row.student.id} className={`border-t border-slate-100 ${row.totalAbsent ? 'bg-amber-50/20' : 'bg-white'}`}>
                      <td className="px-3 py-2 sticky left-0 bg-inherit z-10">
                        <div className="font-black text-slate-800">{row.student.fullName || '(Chưa có tên)'}</div>
                        <div className="text-[10px] font-bold text-slate-400">{row.student.accessCode || ''}</div>
                      </td>
                      <td className="px-2 py-2 text-center font-black text-slate-600">{getClassName(row.student)}</td>
                      {statsMonthDays.map(date => {
                        const status = row.statuses[toDateKey(date)];
                        return (
                          <td key={toDateKey(date)} className="px-1 py-1 text-center">
                            <span className={`inline-flex min-w-8 justify-center rounded-lg border px-2 py-1 font-black ${status === null ? 'bg-slate-50 text-slate-300 border-slate-100' : attendanceCellClass(status)}`}>
                              {status === null ? '-' : (status || '✓')}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-black text-amber-700">{row.cp}</td>
                      <td className="px-2 py-2 text-center font-black text-rose-700">{row.kp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden p-3 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setWeekAnchor(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; })} className="p-2 rounded-xl bg-white border border-slate-200"><ChevronLeft className="w-4 h-4" /></button>
                  <div className="text-center">
                    <div className="text-xs font-black text-slate-700 uppercase">{mobileStatsMode === 'week' ? 'Tuần thống kê' : selectedMonth?.label}</div>
                    <div className="text-[10px] font-bold text-slate-400">{mobileStatsMode === 'week' ? weekRangeLabel : 'Vuốt danh sách để xem học sinh vắng'}</div>
                  </div>
                  <button type="button" onClick={() => setWeekAnchor(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; })} className="p-2 rounded-xl bg-white border border-slate-200"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
              {mobileStatsRows.length === 0 ? (
                <div className="p-6 text-center text-slate-400 font-bold">Chưa có học sinh để thống kê.</div>
              ) : mobileStatsRows.map(row => (
                <div key={row.student.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-black text-slate-900 truncate">{row.student.fullName || '(Chưa có tên)'}</div>
                      <div className="text-[10px] font-bold text-slate-400">Lớp {getClassName(row.student)} · {row.student.accessCode || ''}</div>
                    </div>
                    <div className="flex gap-1 text-[10px] font-black">
                      <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-1">CP {row.cp}</span>
                      <span className="rounded-full bg-rose-50 text-rose-700 px-2 py-1">KP {row.kp}</span>
                    </div>
                  </div>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(statsDates.length, mobileStatsMode === 'week' ? 5 : 6))}, minmax(0, 1fr))` }}>
                    {statsDates.map(date => {
                      const status = row.statuses[toDateKey(date)];
                      return (
                        <div key={toDateKey(date)} className={`rounded-xl border px-1 py-2 text-center text-[10px] font-black ${status === null ? 'bg-slate-50 text-slate-300 border-slate-100' : attendanceCellClass(status)}`}>
                          <div>{formatShortDate(date)}</div>
                          <div>{status === null ? '-' : (status || '✓')}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-white flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-900 uppercase flex items-center gap-2"><Users className="w-5 h-5 text-emerald-600" /> Bảng điểm danh</h3>
              <p className="text-xs text-slate-500 font-bold">CP là có phép, KP là không phép. Bỏ chọn nghĩa là có mặt.</p>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              {isAdmin && (
                <select value={activeClass} onChange={(e) => setActiveClass(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black">
                  {(timetable.classOrder || configuredClasses).map(className => <option key={className} value={className}>Lớp {className}</option>)}
                </select>
              )}
              <select value={`${selectedMonth?.year || ''}-${selectedMonth?.month || ''}`} onChange={(e) => {
                const [year, month] = e.target.value.split('-').map(Number);
                const found = months.find(item => item.year === year && item.month === month);
                setSelectedMonth(found);
              }} className="hidden sm:block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black">
                {months.map(month => <option key={`${month.year}-${month.month}`} value={`${month.year}-${month.month}`}>{month.label}</option>)}
              </select>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="hidden sm:block rounded-2xl border border-slate-200 overflow-hidden bg-white">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                <button type="button" onClick={() => moveAttendanceWeek(-1)} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50 font-black">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-center">
                  <div className="text-sm font-black text-slate-900 uppercase">Lớp {activeClass} - tuần {weekRangeLabel}</div>
                  <div className="text-[11px] font-bold text-slate-400">{classStudents.length} học sinh</div>
                </div>
                <button type="button" onClick={() => moveAttendanceWeek(1)} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50 font-black">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <th className="px-4 py-3 text-left min-w-[260px]">Học sinh</th>
                      {weekDates.map(date => (
                        <th key={toDateKey(date)} className="px-3 py-3 text-center min-w-[124px]">
                          <span className="flex items-center justify-center gap-1.5">
                            <span>
                              <span className="block text-slate-700 leading-none">{formatShortDate(date)}</span>
                              <span className="block mt-1 text-[10px] text-slate-400">{getShortDayLabel(date)}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => copyZaloAttendanceMessage(toDateKey(date))}
                              className="rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700 hover:bg-cyan-600 hover:text-white"
                              title="Copy tin Zalo ngày này"
                            >
                              Zalo
                            </button>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.length === 0 ? (
                      <tr>
                        <td colSpan={weekDates.length + 1} className="px-4 py-8 text-center font-bold text-slate-400">Chưa có học sinh trong lớp này.</td>
                      </tr>
                    ) : classStudents.map(student => (
                      <tr key={student.id} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/40">
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => setProfilePreviewStudent(student)} className="flex items-center gap-3 text-left group">
                            <span className="w-11 h-11 rounded-2xl bg-cyan-50 border border-cyan-100 overflow-hidden flex items-center justify-center text-sm font-black text-cyan-700 shrink-0">
                              <AttendanceAvatar student={student} />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-black text-slate-900 group-hover:text-indigo-700 truncate">{student.fullName || '(Chưa có tên)'}</span>
                              <span className="block text-[11px] font-bold text-slate-400">Bấm tên để xem ảnh lớn</span>
                            </span>
                          </button>
                        </td>
                        {weekDates.map(date => {
                          const key = toDateKey(date);
                          const currentStatus = attendanceMap.get(`${key}__${activeClass}`)?.[student.id]?.status || '';
                          return (
                            <td key={key} className={`px-2 py-2 text-center ${currentStatus === 'CP' ? 'bg-amber-50/70' : currentStatus === 'KP' ? 'bg-rose-50/70' : ''}`}>
                              <div className="inline-grid grid-cols-2 gap-1.5 w-[104px]">
                                {ATTENDANCE_STATUS.filter(status => status.key).map(status => (
                                  <button key={status.key} type="button" onClick={() => updateAttendance(student, currentStatus === status.key ? '' : status.key, key)} className={`px-2 py-1.5 rounded-xl border text-[11px] font-black uppercase ${statusClass(status.key, currentStatus)}`}>
                                    {status.label}
                                  </button>
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="sm:hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => moveAttendanceWeek(-1)} className="p-2 rounded-xl bg-white border border-slate-200"><ChevronLeft className="w-4 h-4" /></button>
                <div className="text-center">
                  <div className="text-xs font-black text-slate-700 uppercase flex items-center justify-center gap-1"><Clock3 className="w-4 h-4 text-indigo-600" /> Tuần hiện tại</div>
                  <div className="text-[10px] font-bold text-slate-400">{weekRangeLabel}</div>
                </div>
                <button type="button" onClick={() => moveAttendanceWeek(1)} className="p-2 rounded-xl bg-white border border-slate-200"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, weekDates.length)}, minmax(0, 1fr))` }}>
                {weekDates.map(date => {
                  const key = toDateKey(date);
                  return (
                    <button key={key} type="button" onClick={() => setSelectedDate(key)} className={`py-2.5 rounded-xl border text-[10px] font-black ${selectedDate === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                      <span className="block text-sm leading-none">{formatShortDate(date)}</span>
                      <span className="block mt-1 text-[9px] opacity-75">{getShortDayLabel(date)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sm:hidden rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="font-black text-slate-800">Lớp {activeClass} - {selectedDate}</div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => copyZaloAttendanceMessage(selectedDate)} className="rounded-xl bg-cyan-600 px-3 py-1.5 text-[11px] font-black text-white shadow-sm">
                    Zalo
                  </button>
                  <div className="text-xs font-black text-slate-400">{classStudents.length} học sinh</div>
                </div>
              </div>
              {classStudents.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold">Chưa có học sinh trong lớp này.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {classStudents.map(student => {
                    const currentStatus = records[student.id]?.status || '';
                    return (
                      <div key={student.id} className="p-2 sm:p-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:gap-3 items-center">
                        <div className="min-w-0">
                          <button type="button" onClick={() => setProfilePreviewStudent(student)} className={`font-black text-sm sm:text-base truncate text-left focus:outline-none ${currentStatus === 'CP' ? 'text-amber-700 hover:text-amber-800' : currentStatus === 'KP' ? 'text-rose-700 hover:text-rose-800' : 'text-emerald-700 hover:text-emerald-800'}`}>
                            {student.fullName || '(Chưa có tên)'}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 w-[112px] sm:w-[140px]">
                          {ATTENDANCE_STATUS.filter(status => status.key).map(status => (
                            <button key={status.key} type="button" onClick={() => updateAttendance(student, currentStatus === status.key ? '' : status.key)} className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border text-[11px] sm:text-xs font-black uppercase ${statusClass(status.key, currentStatus)}`}>
                              {status.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1"><CheckCircle2 className="w-3 h-3" /> Có mặt</span>
              <span className="rounded-full bg-amber-50 text-amber-700 px-3 py-1">CP: Có phép</span>
              <span className="rounded-full bg-rose-50 text-rose-700 px-3 py-1">KP: Không phép</span>
            </div>
          </div>
        </section>
        </>
        )}
      </div>
      {profilePreviewStudent && (
        <div className="fixed inset-0 z-[140] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setProfilePreviewStudent(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-black text-slate-900 truncate">{profilePreviewStudent.fullName || 'Học sinh'}</div>
                <div className="text-xs font-bold text-slate-400">Lớp {getClassName(profilePreviewStudent) || activeClass}</div>
              </div>
              <button type="button" onClick={() => setProfilePreviewStudent(null)} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-rose-600 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="mx-auto w-56 h-56 rounded-3xl bg-cyan-50 border border-cyan-100 overflow-hidden flex items-center justify-center text-5xl font-black text-cyan-700">
                <AttendanceAvatar student={profilePreviewStudent} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
