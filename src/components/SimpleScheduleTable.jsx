import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { BarChart3, ChevronDown, EyeOff, HelpCircle, Save, Send, Trash2, Users, X } from 'lucide-react';
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
const REQUIRED_LOADS = [
  { key: 'toan', label: 'Toán', required: 4 },
  { key: 'van', label: 'Văn', required: 4 },
  { key: 'khtn', label: 'KHTN', required: 4 },
  { key: 'lsdl', label: 'LS&ĐL', required: 4 },
  { key: 'gdcd', label: 'GDCD', required: 1 },
  { key: 'congnghe', label: 'Công nghệ', required: 1 },
  { key: 'gddp', label: 'GDĐP', required: 1 },
  { key: 'hdtt', label: 'HDTT', required: 1 },
  { key: 'cn', label: 'Chủ nhiệm', required: 1 }
];

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
const subjectKey = (value = '') => {
  const normalized = removeAccentsLocal(value).replace(/[^a-z0-9&]/g, '');
  if (!normalized) return '';
  if (normalized.includes('toan')) return 'toan';
  if (normalized.includes('nguvan') || normalized === 'van') return 'van';
  if (normalized.includes('khoahoctunhien') || normalized.includes('khtn')) return 'khtn';
  if (normalized.includes('lichsu') || normalized.includes('dialy') || normalized.includes('ls&dl') || normalized.includes('lsdl')) return 'lsdl';
  if (normalized.includes('congdan') || normalized.includes('gdcd')) return 'gdcd';
  if (normalized.includes('congnghe')) return 'congnghe';
  if (normalized.includes('diaphuong') || normalized.includes('gddp')) return 'gddp';
  if (normalized.includes('hdtt') || normalized.includes('hoatdongtapthe') || normalized.includes('hoatdongtapt')) return 'hdtt';
  if (normalized === 'cn' || normalized.includes('chunhiem')) return 'cn';
  return normalized;
};
const displayPublicSubject = (value = '') => {
  const key = subjectKey(value);
  if (key === 'gddp') return 'GDĐP';
  if (key === 'hdtt') return 'HĐTT';
  if (key === 'cn') return 'Chủ nhiệm';
  return value || '-';
};
const displayEditorSubject = (value = '') => {
  const key = subjectKey(value);
  if (key === 'gddp') return 'Giáo dục địa phương';
  if (key === 'hdtt') return 'Hoạt động tập thể';
  if (key === 'cn') return 'Chủ nhiệm';
  return value || '-';
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
  const header = shownDays.map(day => `<th class="schedule-day-head" style="border:1px solid #dbeafe;padding:6px;background:#eff6ff;">${day.label}</th>`).join('');
  const body = rows.map(row => {
    return PERIODS.slice(0, periodCount).map((period, index) => {
      const classCell = index === 0 ? `<th class="schedule-class-cell" rowspan="${periodCount}" style="border:1px solid #dbeafe;padding:6px;background:#f8fafc;line-height:1.2;width:54px;min-width:54px;">${compactClassHtml(row)}</th>` : '';
      const cells = shownDays.map(day => `<td class="schedule-subject-cell" style="border:1px solid #e2e8f0;padding:6px;text-align:center;line-height:1.25;">${displayPublicSubject(schedule?.[row.id]?.[day.key]?.[period])}</td>`).join('');
      return `<tr>${classCell}<th class="schedule-period-cell" style="border:1px solid #e2e8f0;padding:6px;background:#f8fafc;width:36px;min-width:36px;">${period}</th>${cells}</tr>`;
    }).join('');
  }).join('');
  return `<style>
    .schedule-news table{border-collapse:collapse;width:100%;font-size:14px;table-layout:fixed}
    .schedule-news th,.schedule-news td{word-break:normal;overflow-wrap:anywhere}
    .schedule-news .schedule-class-head{width:54px}
    .schedule-news .schedule-period-head{width:36px}
    @media (max-width:640px){
      .schedule-news table{font-size:12px}
      .schedule-news th,.schedule-news td{padding:5px!important}
      .schedule-news .schedule-class-head,.schedule-news .schedule-class-cell{width:36px!important;min-width:36px!important}
      .schedule-news .schedule-period-head,.schedule-news .schedule-period-cell{width:28px!important;min-width:28px!important}
      .schedule-news .schedule-subject-cell{line-height:1.18}
    }
  </style><div class="schedule-news"><h2>${name}</h2><p>Thời khóa biểu đã được xuất bản.</p><table><thead><tr><th class="schedule-class-head" style="border:1px solid #dbeafe;padding:6px;background:#eff6ff;">Lớp</th><th class="schedule-period-head" style="border:1px solid #dbeafe;padding:6px;background:#eff6ff;">Tiết</th>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
};

export default function SimpleScheduleTable({ subjects = [], currentSchoolYear = '', user, onClose, showNotification }) {
  const [savedSchedules, setSavedSchedules] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [scheduleName, setScheduleName] = useState(`TKB ${currentSchoolYear || ''}`.trim());
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

  const buildScheduleValidationErrors = (candidateSchedule = scheduleRef.current) => {
    const normalized = normalizeSchedule(candidateSchedule, classRows);
    return classRows.flatMap(row => {
      const counts = Object.fromEntries(REQUIRED_LOADS.map(item => [item.key, 0]));
      DAYS.filter(day => visibleDays.includes(day.key)).forEach(day => {
        PERIODS.slice(0, periodCount).forEach(period => {
          const key = subjectKey(normalized?.[row.id]?.[day.key]?.[period]);
          if (key && Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
        });
      });
      return REQUIRED_LOADS
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
  const getScheduleSubjectOptions = (currentValue = '') => {
    if (!currentValue || scheduleSubjects.includes(currentValue)) return scheduleSubjects;
    return [currentValue, ...scheduleSubjects];
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
    setActiveId(item.id || '');
    setScheduleName(item.name || `TKB ${currentSchoolYear || ''}`.trim());
    setClassRows(rows);
    setVisibleDays(item.visibleDays?.length ? item.visibleDays : DAYS.map(day => day.key));
    setPeriodCount(Math.min(5, Math.max(1, Number(item.periodCount || 5))));
    applySchedule(normalizeSchedule(item.schedule || {}, rows));
  };

  const newSchedule = () => {
    const rows = defaultRows();
    setActiveId('');
    setScheduleName(`TKB ${currentSchoolYear || ''} - bản mới`.trim());
    setClassRows(rows);
    setVisibleDays(DAYS.map(day => day.key));
    setPeriodCount(5);
    applySchedule(makeEmptySchedule(rows));
  };

  const updateCell = (rowId, dayKey, period, value) => {
    applySchedule(prev => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || emptyRow()),
        [dayKey]: {
          ...((prev[rowId] || emptyRow())[dayKey] || emptyDay()),
          [period]: value
        }
      }
    }));
  };

  const saveSchedule = async (status = 'draft') => {
    setIsSaving(true);
    try {
      const latestSchedule = collectScheduleFromVisibleInputs();
      const desiredName = scheduleName.trim() || `TKB ${currentSchoolYear}`;
      const activeSchedule = savedSchedules.find(item => item.id === activeId);
      const shouldForkSchedule = Boolean(activeSchedule && desiredName !== (activeSchedule.name || activeSchedule.id || ''));
      const id = activeId && !shouldForkSchedule ? activeId : `tkb_${Date.now()}`;
      const effectiveStatus = status === 'draft' && activeSchedule?.status === 'published' && !shouldForkSchedule ? 'published' : status;
      const normalized = normalizeSchedule(latestSchedule, classRows);
      if (effectiveStatus === 'published') {
        const errors = buildScheduleValidationErrors(normalized);
        if (errors.length > 0) {
          setValidationErrors(errors);
          showNotification?.('Thời khóa biểu chưa đúng số tiết, chưa thể xuất bản.', 'error');
          return;
        }
      }
      const selectedVisibleDays = DAYS.map(day => day.key).filter(dayKey => visibleDays.includes(dayKey));
      const savedVisibleDays = effectiveStatus === 'published'
        ? getContentVisibleDays({ rows: classRows, visibleDays: selectedVisibleDays, schedule: normalized, periodCount })
        : selectedVisibleDays;
      const payload = {
        name: desiredName,
        schoolYear: currentSchoolYear,
        classRows,
        visibleDays: savedVisibleDays,
        periodCount,
        schedule: normalized,
        status: effectiveStatus,
        publishedAt: effectiveStatus === 'published' ? Date.now() : null,
        updatedAt: Date.now()
      };
      if (effectiveStatus === 'published') {
        await Promise.all(savedSchedules
          .filter(item => item.id !== id && item.status === 'published')
          .map(item => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_schedules', item.id), { status: 'draft', publishedAt: null, updatedAt: Date.now() }, { merge: true })));
      }
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_schedules', id), payload, { merge: true });
      if (effectiveStatus === 'published') {
        const newsSnapshot = await getDocs(newsCollection);
        await Promise.all(newsSnapshot.docs
          .filter(item => item.data()?.type === 'class_schedule')
          .map(item => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', item.id))));
        await addDoc(newsCollection, {
          title: `THỜI KHÓA BIỂU: ${payload.name}`,
          content: makeScheduleNewsHtml({ name: payload.name, rows: classRows, visibleDays: payload.visibleDays, schedule: normalized, periodCount }),
          createdAt: Date.now(),
          authorId: user?.uid || '',
          isPinned: true,
          type: 'class_schedule',
          scheduleId: id,
          schoolYear: currentSchoolYear
        });
      }
      setActiveId(id);
      showNotification?.(shouldForkSchedule ? 'Đã lưu thành bản thời khóa biểu mới.' : (effectiveStatus === 'published' ? 'Đã cập nhật thời khóa biểu cho học sinh xem.' : 'Đã lưu thời khóa biểu.'));
    } catch (error) {
      showNotification?.(`Lỗi lưu thời khóa biểu: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteActiveSchedule = async () => {
    if (!activeId) return;
    const activeSchedule = savedSchedules.find(item => item.id === activeId);
    const scheduleLabel = activeSchedule?.name || scheduleName || 'bản thời khóa biểu này';
    if (!window.confirm(`Xóa "${scheduleLabel}"? Nếu bản này đang ghim cho học sinh xem thì tin ghim cũng sẽ được gỡ.`)) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'class_schedules', activeId));
      const newsSnapshot = await getDocs(newsCollection);
      await Promise.all(newsSnapshot.docs
        .filter(item => item.data()?.type === 'class_schedule' && (!item.data()?.scheduleId || item.data()?.scheduleId === activeId))
        .map(item => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', item.id))));
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
          const previous = acc[period - 1] || '';
          if (period > periodCount) acc[period] = current;
          else acc[period] = current || previous;
          return acc;
        }, {})
      }
    }));
  };

  const countRowSubjects = (rowId) => {
    const counts = Object.fromEntries(REQUIRED_LOADS.map(item => [item.key, 0]));
    DAYS.filter(day => visibleDays.includes(day.key)).forEach(day => {
      PERIODS.slice(0, periodCount).forEach(period => {
        const key = subjectKey(schedule?.[rowId]?.[day.key]?.[period]);
        if (key && Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
      });
    });
    return counts;
  };

  const shownDays = DAYS.filter(day => visibleDays.includes(day.key));

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
                {item.status === 'published' ? '[Đã xuất bản] ' : ''}{item.name || item.id}
              </option>
            ))}
          </select>
          <input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} className="h-9 w-[240px] rounded-lg border border-emerald-100 bg-white px-3 text-xs font-bold outline-none focus:border-emerald-400" placeholder="Tên thời khóa biểu..." />
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={deleteActiveSchedule} disabled={!activeId || isSaving} className="h-9 rounded-lg bg-rose-50 border border-rose-100 px-2.5 text-rose-600 text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
              <Trash2 className="w-4 h-4" /> <span>Xóa</span>
            </button>
            <button type="button" onClick={() => saveSchedule('draft')} disabled={isSaving} className="h-9 rounded-lg bg-emerald-600 px-3 text-white text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Save className="w-4 h-4" /> Lưu
            </button>
            <button type="button" onClick={() => saveSchedule('published')} disabled={isSaving} className="h-9 rounded-lg bg-blue-600 px-3 text-white text-[10px] sm:text-xs font-black uppercase inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              <Send className="w-4 h-4" /> <span className="sm:hidden">Ghim</span><span className="hidden sm:inline">Xuất bản</span>
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

      {showStats && (
        <div className="p-3 sm:p-4 bg-amber-50 border-b border-amber-100 overflow-x-auto">
          <div className="text-sm font-black text-amber-900 uppercase mb-3">Kiểm tra số tiết theo từng hàng lớp</div>
          <table className="w-full min-w-[900px] text-xs bg-white border border-amber-100 rounded-2xl overflow-hidden">
            <thead>
              <tr className="bg-amber-100/70 text-amber-900 uppercase">
                <th className="px-3 py-2 text-left">Lớp</th>
                {REQUIRED_LOADS.map(item => <th key={item.key} className="px-3 py-2 text-center">{item.label}<br />({item.required})</th>)}
              </tr>
            </thead>
            <tbody>
              {classRows.map(row => {
                const counts = countRowSubjects(row.id);
                return (
                  <tr key={row.id} className="border-t border-amber-50">
                    <td className="px-3 py-2 font-black text-slate-700">{row.label}</td>
                    {REQUIRED_LOADS.map(item => {
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
                <div className="text-xs font-bold text-rose-600/80 mt-1">Các lớp dưới đây chưa đúng định mức tiết. Sửa xong hãy xuất bản lại.</div>
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
                  {shownDays.map(day => (
                    <td key={day.key} className="px-2 py-2 align-middle border-b border-r border-slate-100">
                      <select
                        data-row-id={row.id}
                        data-day-key={day.key}
                        data-period={period}
                        value={schedule[row.id]?.[day.key]?.[period] || ''}
                        onChange={(event) => updateCell(row.id, day.key, period, event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-400"
                      >
                        <option value="">-</option>
                        {getScheduleSubjectOptions(schedule[row.id]?.[day.key]?.[period] || '').map(subject => (
                          <option key={subject} value={subject}>{displayEditorSubject(subject)}</option>
                        ))}
                      </select>
                    </td>
                  ))}
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
