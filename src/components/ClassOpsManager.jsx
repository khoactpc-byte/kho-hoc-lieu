import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
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
const getClassName = (student = {}) => String(student.className || '').match(/[1-9]\d*/)?.[0] || String(student.className || '').trim();
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

const makeDefaultSlots = () => Object.fromEntries(
  DEFAULT_CLASSES.map(className => [
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

const copyTextSafely = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {}
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (error) {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
};

const uniqueClassesFrom = (students = [], timetable = {}) => {
  const classes = new Set([...(timetable.classOrder || DEFAULT_CLASSES), ...students.map(getClassName).filter(Boolean)]);
  return [...classes].sort((a, b) => Number(a) - Number(b));
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
      className="w-full h-full object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setFallbackMode(true)}
    />
  );
}

function AdminAttendanceStaticTable({ currentSchoolYear = '', students = [], user, onClose, onOpenDatabase, showNotification }) {
  const today = new Date();
  const months = monthOptionsForSchoolYear(currentSchoolYear);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [mobileClassGroup, setMobileClassGroup] = useState('secondary');
  const [selectedMonth, setSelectedMonth] = useState(() => getInitialMonth(months) || { month: today.getMonth() + 1, year: today.getFullYear(), label: `Tháng ${today.getMonth() + 1}/${today.getFullYear()}` });
  const [reportMode, setReportMode] = useState('month');
  const [attendanceDocs, setAttendanceDocs] = useState([]);
  const [showAttendanceStats, setShowAttendanceStats] = useState(false);
  const days = reportMode === 'month' ? makeMonthDates(selectedMonth) : [];
  const reportMonths = useMemo(() => {
    if (reportMode === 'hk1') return months.filter(item => [9, 10, 11, 12, 1].includes(item.month));
    if (reportMode === 'hk2') return months.filter(item => [2, 3, 4, 5].includes(item.month));
    if (reportMode === 'year') return months;
    return [selectedMonth];
  }, [months, reportMode, selectedMonth]);
  const classFilters = uniqueClassesFrom(students, {});
  const rows = normalizeStudents(students, '', currentSchoolYear)
    .filter(student => selectedClasses.length === 0 || selectedClasses.includes(getClassName(student)))
    .sort((a, b) => (Number(getClassName(a) || 0) - Number(getClassName(b) || 0)) || compareVietnameseStudentName(a, b));
  const attendanceMap = useMemo(() => {
    const map = new Map();
    attendanceDocs.forEach(item => {
      map.set(`${item.date}__${item.className}`, item.records || {});
    });
    return map;
  }, [attendanceDocs]);
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

  const classGroups = [
    { key: 'primary', label: 'Tiểu học', classes: ['1', '2', '3', '4', '5'] },
    { key: 'secondary', label: 'THCS', classes: ['6', '7', '8', '9'] }
  ];
  const selectClassGroup = (group) => {
    setMobileClassGroup(group.key);
    setSelectedClasses(group.classes);
  };

  useEffect(() => {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'class_attendance');
    return onSnapshot(ref, snapshot => {
      setAttendanceDocs(snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(item => String(item.schoolYear || '') === String(currentSchoolYear || '')));
    });
  }, [currentSchoolYear]);

  const toggleClass = (className) => {
    setSelectedClasses(prev => prev.includes(className) ? prev.filter(item => item !== className) : [...prev, className].sort((a, b) => Number(a) - Number(b)));
  };

  const cycleAttendance = async (row, date) => {
    const dateKey = toDateKey(date);
    const className = row.className;
    const attendanceId = `${currentSchoolYear}_${dateKey}_K${className}`;
    const current = row.statuses[dateKey] || '';
    const nextStatus = current === '' ? 'CP' : current === 'CP' ? 'KP' : '';
    const currentRecords = attendanceMap.get(`${dateKey}__${className}`) || {};
    const nextRecords = {
      ...currentRecords,
      [row.student.id]: {
        studentId: row.student.id,
        studentName: row.student.fullName || '',
        status: nextStatus,
        updatedAt: Date.now()
      }
    };
    setAttendanceDocs(prev => {
      const found = prev.some(item => item.id === attendanceId);
      const nextDoc = {
        id: attendanceId,
        schoolYear: currentSchoolYear,
        className,
        date: dateKey,
        records: nextRecords,
        updatedAt: Date.now(),
        updatedBy: user?.uid || ''
      };
      return found ? prev.map(item => item.id === attendanceId ? { ...item, ...nextDoc } : item) : [...prev, nextDoc];
    });
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_attendance', attendanceId), {
        schoolYear: currentSchoolYear,
        className,
        date: dateKey,
        records: nextRecords,
        updatedAt: Date.now(),
        updatedBy: user?.uid || ''
      }, { merge: true });
    } catch (error) {
      showNotification?.(`Lỗi lưu điểm danh: ${error.message}`, 'error');
    }
  };

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
    <div className="bg-white shadow-2xl border-0 w-full max-w-none mx-auto h-screen max-h-screen overflow-hidden flex flex-col">
      <div className="px-3 sm:px-5 py-3 border-b bg-cyan-50 flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-cyan-600 shrink-0" />
          <div className="min-w-0">
          <h2 className="text-base sm:text-2xl font-black text-slate-900 uppercase leading-tight truncate">
            <span className="sm:hidden">Điểm danh</span>
            <span className="hidden sm:inline">Điểm danh học sinh</span>
          </h2>
          <p className="text-[10px] sm:text-xs font-bold text-cyan-700/80 truncate">
            <span className="sm:hidden">{currentSchoolYear || 'Năm học'} · {rowsWithStats.length} HS</span>
            <span className="hidden sm:inline">Bảng tháng - năm học {currentSchoolYear || 'đang chọn'} · {rowsWithStats.length} học sinh</span>
          </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenDatabase && (
            <button type="button" title="Mở database" onClick={onOpenDatabase} className="w-10 sm:w-auto h-10 px-0 sm:px-4 rounded-2xl bg-indigo-600 text-white flex items-center justify-center sm:gap-2 shadow-sm text-xs font-black uppercase">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Database</span>
            </button>
          )}
          <button type="button" title="Thống kê" onClick={() => setShowAttendanceStats(prev => !prev)} className={`w-10 sm:w-auto h-10 px-0 sm:px-4 rounded-2xl flex items-center justify-center sm:gap-2 shadow-sm text-xs font-black uppercase ${showAttendanceStats ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-indigo-100'}`}>
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Thống kê</span>
          </button>
          <button type="button" title="Xuất PDF" onClick={exportPdf} className="w-10 sm:w-auto h-10 px-0 sm:px-4 rounded-2xl bg-cyan-600 text-white flex items-center justify-center sm:gap-2 shadow-sm text-xs font-black uppercase">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Xuất PDF</span>
          </button>
          <button type="button" title="Đóng" onClick={onClose} className="w-10 h-10 rounded-2xl bg-white border border-slate-200 text-slate-500 hover:bg-rose-600 hover:text-white transition-colors flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-3 bg-white border-b border-slate-100 flex flex-wrap items-center gap-2">
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setSelectedClasses([])} className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${selectedClasses.length === 0 ? 'bg-cyan-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>Tất cả khối</button>
          {classFilters.map(className => (
            <button key={className} type="button" onClick={() => toggleClass(className)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${selectedClasses.includes(className) ? 'bg-cyan-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>Khối {className}</button>
          ))}
        </div>
        <div className="sm:hidden w-full space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {classGroups.map(group => (
              <button key={group.key} type="button" onClick={() => selectClassGroup(group)} className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase ${mobileClassGroup === group.key ? 'bg-cyan-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                {group.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {(classGroups.find(group => group.key === mobileClassGroup)?.classes || []).map(className => (
              <button key={className} type="button" onClick={() => setSelectedClasses([className])} className={`px-2 py-2 rounded-xl text-[11px] font-black uppercase ${selectedClasses.includes(className) ? 'bg-cyan-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                Lớp {className}
              </button>
            ))}
          </div>
        </div>
        <select value={reportMode === 'month' ? `${selectedMonth.year}-${selectedMonth.month}` : reportMode} onChange={(event) => {
          if (['hk1', 'hk2'].includes(event.target.value)) {
            setReportMode(event.target.value);
            return;
          }
          const [year, month] = event.target.value.split('-').map(Number);
          const found = months.find(item => item.year === year && item.month === month);
          if (found) {
            setSelectedMonth(found);
            setReportMode('month');
          }
        }} className="sm:ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black">
          {months.map(month => <option key={`${month.year}-${month.month}`} value={`${month.year}-${month.month}`}>{month.label}</option>)}
          <option value="hk1">Học kỳ 1</option>
          <option value="hk2">Học kỳ 2</option>
        </select>
        {[
          { key: 'hk1', label: 'Học kỳ 1' },
          { key: 'hk2', label: 'Học kỳ 2' },
          { key: 'year', label: 'Cả năm' }
        ].map(item => (
          <button key={item.key} type="button" onClick={() => setReportMode(item.key)} className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase ${item.key !== 'year' ? 'hidden sm:inline-flex' : ''} ${reportMode === item.key ? 'bg-indigo-600 text-white' : 'bg-indigo-50 border border-indigo-100 text-indigo-700'}`}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 bg-slate-50/60 p-3 sm:p-4 flex flex-col gap-4 overflow-hidden">
        <div className="flex-1 min-h-[360px] overflow-auto overscroll-contain rounded-2xl border border-slate-300 bg-white shadow-sm">
        <table className="w-full min-w-[470px] sm:min-w-[1180px] table-fixed border-separate border-spacing-0 bg-white text-xs">
          <colgroup>
            <col className="w-[104px] sm:w-[260px]" />
            <col className="w-[48px] sm:w-[90px]" />
            <col className="w-[34px] sm:w-[60px]" />
            {reportMode === 'month' && days.map(date => (
              <col key={`col-${toDateKey(date)}`} className="w-[44px] sm:w-[52px]" />
            ))}
            {reportMode !== 'month' && reportMonths.map(monthInfo => (
              <React.Fragment key={`col-${monthInfo.year}-${monthInfo.month}`}>
                <col className="w-[64px]" />
                <col className="w-[64px]" />
              </React.Fragment>
            ))}
            <col className="w-[42px] sm:w-[60px]" />
            <col className="w-[42px] sm:w-[60px]" />
            <col className="w-[44px] sm:w-[70px]" />
          </colgroup>
          <thead className="shadow-sm">
            <tr className="bg-slate-100 text-slate-600 uppercase">
              <th rowSpan="2" className="h-10 w-[104px] min-w-[104px] max-w-[104px] sm:w-[260px] sm:min-w-[260px] sm:max-w-[260px] px-2 sm:px-3 py-3 text-left sticky left-0 top-0 bg-slate-100 z-[80] border-b border-r border-slate-300 shadow-[inset_-1px_0_0_#cbd5e1,inset_0_-1px_0_#cbd5e1]">Họ và đệm</th>
              <th rowSpan="2" className="h-10 w-[48px] min-w-[48px] max-w-[48px] sm:w-[90px] sm:min-w-[90px] sm:max-w-[90px] px-1.5 sm:px-3 py-3 text-left sticky left-[104px] sm:left-[260px] top-0 bg-slate-100 z-[75] border-b border-r border-slate-300 shadow-[inset_-1px_0_0_#cbd5e1,inset_0_-1px_0_#cbd5e1]">Tên</th>
              <th rowSpan="2" className="h-10 w-[34px] min-w-[34px] max-w-[34px] sm:w-[60px] sm:min-w-[60px] sm:max-w-[60px] px-1.5 sm:px-2 py-3 text-center sticky top-0 bg-slate-100 z-40 border-b border-r border-slate-300 shadow-[inset_0_-1px_0_#cbd5e1]">Lớp</th>
              {reportMode === 'month' && days.map((date, dayIndex) => (
                <th key={toDateKey(date)} rowSpan="2" className={`h-10 px-1 sm:px-2 py-3 text-center min-w-[44px] sm:min-w-[52px] sticky top-0 z-40 border-b border-r border-slate-300 shadow-[inset_0_-1px_0_#cbd5e1] ${dayIndex % 2 === 0 ? 'bg-white' : 'bg-sky-50'}`}>
                  <span className="block">{formatShortDate(date)}</span>
                  <span className="block text-[9px] text-slate-400">{getShortDayLabel(date)}</span>
                </th>
              ))}
              {reportMode !== 'month' && reportMonths.map(monthInfo => (
                <th key={`${monthInfo.year}-${monthInfo.month}`} colSpan="2" className="h-10 px-3 py-2 text-center min-w-[128px] sticky top-0 z-40 bg-sky-100 border-b border-l border-r border-slate-300 text-slate-700 shadow-[inset_0_-1px_0_#cbd5e1]">
                  Tháng {monthInfo.month}
                </th>
              ))}
              <th rowSpan="2" className="h-10 px-1.5 sm:px-2 py-3 text-center min-w-[42px] sm:min-w-[60px] sticky top-0 z-40 bg-slate-100 border-b border-l border-r border-slate-300 shadow-[inset_0_-1px_0_#cbd5e1]">CP</th>
              <th rowSpan="2" className="h-10 px-1.5 sm:px-2 py-3 text-center min-w-[42px] sm:min-w-[60px] sticky top-0 z-40 bg-rose-50 border-b border-r border-slate-300 shadow-[inset_0_-1px_0_#cbd5e1]">KP</th>
              <th rowSpan="2" className="h-10 px-1.5 sm:px-2 py-3 text-center min-w-[44px] sm:min-w-[70px] sticky top-0 z-40 bg-slate-100 border-b border-slate-300 shadow-[inset_0_-1px_0_#cbd5e1]">Tổng</th>
            </tr>
            {reportMode !== 'month' && (
              <tr className="bg-slate-50 text-slate-500 uppercase">
                {reportMonths.map(monthInfo => (
                  <React.Fragment key={`${monthInfo.year}-${monthInfo.month}-sub`}>
                    <th className="h-9 px-2 py-2 text-center min-w-[64px] sticky top-10 z-40 border-b border-l border-r border-slate-300 bg-white text-amber-700 shadow-[inset_0_-1px_0_#cbd5e1]">CP</th>
                    <th className="h-9 px-2 py-2 text-center min-w-[64px] sticky top-10 z-40 border-b border-r border-slate-300 bg-rose-50 text-rose-700 shadow-[inset_0_-1px_0_#cbd5e1]">KP</th>
                  </React.Fragment>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rowsWithStats.length === 0 ? (
              <tr>
                <td colSpan={(reportMode === 'month' ? days.length : reportMonths.length * 2) + 6} className="px-4 py-8 text-center text-slate-400 font-bold">Chưa có học sinh trong khối đang chọn.</td>
              </tr>
            ) : rowsWithStats.map((row, index) => {
              const rowBg = row.cp + row.kp > 0 ? 'bg-amber-50' : 'bg-white';
              const stickyBg = row.cp + row.kp > 0 ? 'bg-amber-100' : 'bg-white';
              return (
              <tr key={row.student.id || `${row.student.fullName}-${row.student.birthDate}`} className={`border-t border-slate-100 ${rowBg}`}>
                <td className={`relative overflow-hidden w-[104px] min-w-[104px] max-w-[104px] sm:w-[260px] sm:min-w-[260px] sm:max-w-[260px] px-2 sm:px-3 py-3 sm:py-4 sticky left-0 z-[70] border-b border-slate-200 shadow-[inset_-1px_0_0_#e2e8f0] ${stickyBg}`}>
                  <div className={`absolute inset-0 ${stickyBg}`} aria-hidden="true" />
                  <div className="relative z-10 flex items-center gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-cyan-50 border border-cyan-100 overflow-hidden flex items-center justify-center text-cyan-700 font-black shrink-0">
                      <AttendanceAvatar student={row.student} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-slate-900 text-[11px] sm:text-xs leading-tight sm:truncate overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">{row.nameParts.family || '-'}</div>
                      <div className="hidden sm:block text-[10px] font-bold text-slate-400">{row.student.accessCode || ''}</div>
                    </div>
                  </div>
                </td>
                <td className={`relative overflow-hidden w-[48px] min-w-[48px] max-w-[48px] sm:w-[90px] sm:min-w-[90px] sm:max-w-[90px] px-1.5 sm:px-3 py-3 sm:py-4 sticky left-[104px] sm:left-[260px] z-[65] font-black text-slate-900 text-[11px] sm:text-xs border-b border-r border-slate-200 shadow-[inset_-1px_0_0_#e2e8f0] ${stickyBg}`}>
                  <div className={`absolute inset-0 ${stickyBg}`} aria-hidden="true" />
                  <span className="relative z-10">{row.nameParts.given || '-'}</span>
                </td>
                <td className="w-[34px] min-w-[34px] max-w-[34px] sm:w-[60px] sm:min-w-[60px] sm:max-w-[60px] px-1.5 sm:px-2 py-3 sm:py-4 text-center font-black text-slate-600 border-b border-r border-slate-200 text-[11px] sm:text-xs">{row.className || '-'}</td>
                {reportMode === 'month' && days.map((date, dayIndex) => (
                  <td key={toDateKey(date)} className={`px-1 py-2 text-center border-b border-r border-slate-200 ${dayIndex % 2 === 0 ? 'bg-white' : 'bg-sky-50/45'}`}>
                    {(() => {
                      const status = row.statuses[toDateKey(date)];
                      const tone = status === 'CP' ? 'border-slate-300 bg-white text-amber-700' : status === 'KP' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-300';
                      return <button type="button" onClick={() => cycleAttendance(row, date)} className={`inline-flex min-w-7 sm:min-w-8 justify-center rounded-lg border px-1.5 sm:px-2 py-1 font-black ${tone}`}>{status || '-'}</button>;
                    })()}
                  </td>
                ))}
                {reportMode !== 'month' && reportMonths.map(monthInfo => {
                  const key = `${monthInfo.year}-${monthInfo.month}`;
                  const monthStat = row.monthStats[key] || { cp: 0, kp: 0 };
                  return (
                    <React.Fragment key={key}>
                      <td className="px-2 py-2 text-center font-black text-amber-700 bg-white border-b border-l border-r border-slate-300">{monthStat.cp}</td>
                      <td className="px-2 py-2 text-center font-black text-rose-700 bg-rose-50 border-b border-r border-slate-300">{monthStat.kp}</td>
                    </React.Fragment>
                  );
                })}
                <td className="px-2 py-2 text-center font-black text-amber-700 bg-white border-b border-l border-r border-slate-300">{row.cp}</td>
                <td className="px-2 py-2 text-center font-black text-rose-700 border-b border-r border-slate-300 bg-rose-50">{row.kp}</td>
                <td className="px-2 py-2 text-center font-black text-slate-900 bg-white border-b border-slate-300">{row.cp + row.kp}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {showAttendanceStats && <div className="shrink-0 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 font-black text-slate-700 uppercase text-xs">
            Thống kê {reportMode === 'month' ? selectedMonth.label : reportMode === 'hk1' ? 'học kỳ 1' : reportMode === 'hk2' ? 'học kỳ 2' : 'cả năm'}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase">
                <th className="px-3 py-2 text-left">Khối</th>
                <th className="px-3 py-2 text-center">Số học sinh</th>
                <th className="px-3 py-2 text-center">CP</th>
                <th className="px-3 py-2 text-center">KP</th>
                <th className="px-3 py-2 text-center">Tổng vắng</th>
              </tr>
            </thead>
            <tbody>
              {monthSummary.map(item => (
                <tr key={item.className} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-black text-slate-800">Khối {item.className}</td>
                  <td className="px-3 py-2 text-center font-black text-blue-700">{item.students}</td>
                  <td className="px-3 py-2 text-center font-black text-amber-700">{item.cp}</td>
                  <td className="px-3 py-2 text-center font-black text-rose-700">{item.kp}</td>
                  <td className="px-3 py-2 text-center font-black text-slate-800">{item.total}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td className="px-3 py-2 font-black text-slate-900">Tổng</td>
                <td className="px-3 py-2 text-center font-black text-blue-800">{monthSummary.reduce((sum, item) => sum + item.students, 0)}</td>
                <td className="px-3 py-2 text-center font-black text-amber-800">{monthSummary.reduce((sum, item) => sum + item.cp, 0)}</td>
                <td className="px-3 py-2 text-center font-black text-rose-800">{monthSummary.reduce((sum, item) => sum + item.kp, 0)}</td>
                <td className="px-3 py-2 text-center font-black text-slate-900">{monthSummary.reduce((sum, item) => sum + item.total, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}

export default function ClassOpsManager({
  mode = 'admin',
  initialView = 'attendance',
  currentSchoolYear,
  user,
  students = [],
  currentStudent = null,
  subjects = [],
  onClose,
  onOpenDatabase,
  showNotification
}) {
  const isAdmin = mode === 'admin';
  const activeView = isAdmin && initialView === 'schedule' ? 'schedule' : 'attendance';
  if (isAdmin && activeView === 'attendance') {
    return <AdminAttendanceStaticTable currentSchoolYear={currentSchoolYear} students={students} user={user} onClose={onClose} onOpenDatabase={onOpenDatabase} showNotification={showNotification} />;
  }
  const monitorClass = getClassName(currentStudent);
  const months = useMemo(() => monthOptionsForSchoolYear(currentSchoolYear), [currentSchoolYear]);
  const [timetable, setTimetable] = useState({ classOrder: DEFAULT_CLASSES, slots: makeDefaultSlots() });
  const [isSavingTimetable, setIsSavingTimetable] = useState(false);
  const [activeClass, setActiveClass] = useState(monitorClass || DEFAULT_CLASSES[0]);
  const [selectedMonth, setSelectedMonth] = useState(() => getInitialMonth(months));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(getFirstSchoolDateInWeek(new Date())));
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [records, setRecords] = useState({});
  const [attendanceDocs, setAttendanceDocs] = useState([]);
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
  }, [selectedMonth]);

  useEffect(() => {
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'class_timetables', currentSchoolYear);
    return onSnapshot(ref, snapshot => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setTimetable({
        classOrder: data.classOrder?.length ? data.classOrder : DEFAULT_CLASSES,
        slots: { ...makeDefaultSlots(), ...(data.slots || {}) }
      });
    });
  }, [currentSchoolYear]);

  useEffect(() => {
    if (!activeClass || !selectedDate) return undefined;
    const attendanceId = `${currentSchoolYear}_${selectedDate}_K${activeClass}`;
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'class_attendance', attendanceId);
    return onSnapshot(ref, snapshot => {
      setRecords(snapshot.exists() ? (snapshot.data().records || {}) : {});
    });
  }, [activeClass, currentSchoolYear, selectedDate]);

  useEffect(() => {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'class_attendance');
    return onSnapshot(ref, snapshot => {
      setAttendanceDocs(snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(item => String(item.schoolYear || '') === String(currentSchoolYear || '')));
    });
  }, [currentSchoolYear]);

  const classStudents = useMemo(() => normalizeStudents(students, activeClass, currentSchoolYear), [students, activeClass, currentSchoolYear]);
  const classFilters = useMemo(() => uniqueClassesFrom(students, timetable), [students, timetable]);
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

  const getStatsStatus = (student, date) => {
    const dateKey = toDateKey(date);
    const className = getClassName(student);
    const dayRecords = attendanceMap.get(`${dateKey}__${className}`);
    if (!dayRecords) return null;
    return dayRecords[student.id]?.status || '';
  };

  const statsRows = useMemo(() => statsStudents.map(student => {
    const statuses = Object.fromEntries(statsMonthDays.map(date => [toDateKey(date), getStatsStatus(student, date)]));
    const cp = Object.values(statuses).filter(status => status === 'CP').length;
    const kp = Object.values(statuses).filter(status => status === 'KP').length;
    return { student, statuses, cp, kp, totalAbsent: cp + kp };
  }), [statsStudents, statsMonthDays, attendanceMap]);

  const mobileStatsRows = useMemo(() => statsStudents.map(student => {
    const statuses = Object.fromEntries(statsDates.map(date => [toDateKey(date), getStatsStatus(student, date)]));
    const cp = Object.values(statuses).filter(status => status === 'CP').length;
    const kp = Object.values(statuses).filter(status => status === 'KP').length;
    return { student, statuses, cp, kp, totalAbsent: cp + kp };
  }), [statsStudents, statsDates, attendanceMap]);

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
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_timetables', currentSchoolYear), {
        schoolYear: currentSchoolYear,
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
      const order = [...(prev.classOrder || DEFAULT_CLASSES)];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= order.length) return prev;
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...prev, classOrder: order };
    });
  };

  const updateAttendance = async (student, status, dateKey = selectedDate) => {
    const attendanceId = `${currentSchoolYear}_${dateKey}_K${activeClass}`;
    const currentRecords = dateKey === selectedDate
      ? records
      : (attendanceMap.get(`${dateKey}__${activeClass}`) || {});
    const nextRecords = {
      ...currentRecords,
      [student.id]: {
        studentId: student.id,
        studentName: student.fullName || '',
        status,
        updatedAt: Date.now()
      }
    };
    if (dateKey === selectedDate) setRecords(nextRecords);
    setAttendanceDocs(prev => {
      const nextDoc = {
        id: attendanceId,
        schoolYear: currentSchoolYear,
        className: activeClass,
        date: dateKey,
        records: nextRecords,
        updatedAt: Date.now(),
        updatedBy: user?.uid || currentStudent?.id || ''
      };
      return prev.some(item => item.id === attendanceId)
        ? prev.map(item => item.id === attendanceId ? { ...item, ...nextDoc } : item)
        : [...prev, nextDoc];
    });
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_attendance', attendanceId), {
        schoolYear: currentSchoolYear,
        className: activeClass,
        date: dateKey,
        records: nextRecords,
        updatedAt: Date.now(),
        updatedBy: user?.uid || currentStudent?.id || ''
      }, { merge: true });
    } catch (error) {
      showNotification?.(`Lỗi lưu điểm danh: ${error.message}`, 'error');
    }
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
                  {(timetable.classOrder || DEFAULT_CLASSES).map((className, index) => (
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
                  {classFilters.map(className => <option key={className} value={className}>Khối {className}</option>)}
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
                  {classFilters.map(className => <option key={className} value={className}>Khối {className}</option>)}
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
                  {(timetable.classOrder || DEFAULT_CLASSES).map(className => <option key={className} value={className}>Lớp {className}</option>)}
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
