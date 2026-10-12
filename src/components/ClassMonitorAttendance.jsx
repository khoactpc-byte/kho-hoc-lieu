import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Loader2, X } from 'lucide-react';
import { appId, db } from '../config/firebase';
import { saveAttendanceEntry } from '../services/attendance';
import { requestPrivateApi } from '../services/serverQuizClient';
import { SCOPED_AUTH_ENABLED } from '../services/scopedIdentity';
import { attendanceDocumentId } from '../utils/classNormalization';
import { getStudentSchoolCode, normalizeSchoolClassName } from '../utils/schoolClasses';

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shortDate = date => `${date.getDate()}/${date.getMonth() + 1}`;
const weekOf = date => {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - (monday.getDay() || 7) + 1);
  return Array.from({ length: 5 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);
    return day;
  });
};
const initialDate = schoolYear => {
  const startYear = Number(String(schoolYear).match(/^\d{4}/)?.[0]);
  const today = new Date();
  const day = startYear && (today < new Date(startYear, 8, 1) || today > new Date(startYear + 1, 4, 31, 23, 59, 59))
    ? new Date(startYear, 8, 1) : today;
  return day.getDay() === 0 || day.getDay() === 6 ? weekOf(day)[0] : day;
};
const compareNames = (a, b) => {
  const key = name => {
    const parts = String(name || '').trim().split(/\s+/);
    return `${parts.at(-1)} ${parts.slice(0, -1).join(' ')}`;
  };
  return key(a.fullName).localeCompare(key(b.fullName), 'vi');
};

export default function ClassMonitorAttendance({ currentSchoolYear, currentStudent, user, onClose, showNotification }) {
  const schoolCode = getStudentSchoolCode(currentStudent || {});
  const rawClass = currentStudent?.className || '';
  const className = normalizeSchoolClassName(rawClass);
  const studentId = currentStudent?.id || '';
  const allowed = currentStudent?.isClassLeader === true && Boolean(studentId && className && currentSchoolYear && schoolCode !== 'UNKNOWN');
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loaded, setLoaded] = useState({ students: false, attendance: false });
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(initialDate(currentSchoolYear)));
  const [saving, setSaving] = useState(new Set());
  const pending = useRef(new Set());
  const generation = useRef(0);

  useEffect(() => {
    setSelectedDate(dateKey(initialDate(currentSchoolYear)));
  }, [currentSchoolYear, studentId, className, schoolCode]);

  useEffect(() => {
    const revision = ++generation.current;
    const controller = new AbortController();
    const unsubscribers = [];
    setStudents([]);
    setAttendance([]);
    setLoaded({ students: false, attendance: false });
    setSaving(new Set());
    pending.current.clear();
    setError('');
    const current = () => !controller.signal.aborted && generation.current === revision;
    const failed = problem => { if (current()) setError(problem.message || 'Chưa tải được danh sách lớp.'); };
    const applyStudents = rows => {
      if (!current()) return;
      if (rows.length >= 151) { failed(new Error('Lớp có quá nhiều hồ sơ. Nhờ giáo viên kiểm tra lại danh sách.')); return; }
      setStudents(rows.filter(student => student.status !== 'dropped'
        && student.schoolYear === currentSchoolYear && getStudentSchoolCode(student) === schoolCode
        && normalizeSchoolClassName(student.className) === className).sort(compareNames));
      setLoaded(previous => ({ ...previous, students: true }));
    };
    const applyAttendance = rows => {
      if (!current()) return;
      setAttendance(rows.filter(row => row.schoolYear === currentSchoolYear && getStudentSchoolCode(row) === schoolCode
        && normalizeSchoolClassName(row.className) === className));
      setLoaded(previous => ({ ...previous, attendance: true }));
    };
    let timer;
    if (allowed && SCOPED_AUTH_ENABLED) {
      let busy = false;
      const load = async () => {
        if (busy || !current()) return;
        busy = true;
        try {
          const data = await requestPrivateApi('data', 'classOps', {}, { signal: controller.signal });
          if (current()) { setError(''); applyStudents(data.students || []); applyAttendance(data.attendance || []); }
        } catch (problem) { failed(problem); }
        finally { busy = false; }
      };
      void load();
      timer = setInterval(() => { void load(); }, 15000);
    } else if (allowed) {
      // The regular student subscription intentionally contains only their own profile.
      // Load this roster separately, only while the assigned class monitor opens attendance.
      for (const [name, maxRows, apply] of [['students', 151, applyStudents], ['class_attendance', 400, applyAttendance]]) {
        try {
          const source = query(collection(db, 'artifacts', appId, 'public', 'data', name),
            where('schoolYear', '==', currentSchoolYear), where('schoolCode', '==', schoolCode),
            where('className', '==', rawClass), limit(maxRows));
          unsubscribers.push(onSnapshot(source, snapshot => apply(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))), failed));
        } catch (problem) { failed(problem); }
      }
    }
    return () => {
      controller.abort();
      generation.current += 1;
      clearInterval(timer);
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [allowed, className, currentSchoolYear, rawClass, retry, schoolCode, studentId]);

  const weekDates = useMemo(() => weekOf(new Date(`${selectedDate}T12:00:00`)), [selectedDate]);
  const dayDocuments = attendance.filter(row => row.date === selectedDate);
  const dayDocument = dayDocuments[0];
  const records = dayDocument?.records || {};
  const displayError = error || (dayDocuments.length > 1 ? 'Có nhiều bảng điểm danh cùng ngày/lớp. Nhờ giáo viên đối chiếu trước khi sửa.' : '');
  const ready = allowed && loaded.students && loaded.attendance && !displayError;
  const cp = students.filter(student => records[student.id]?.status === 'CP').length;
  const kp = students.filter(student => records[student.id]?.status === 'KP').length;
  const moveWeek = offset => {
    const next = new Date(`${selectedDate}T12:00:00`);
    next.setDate(next.getDate() + offset * 7);
    setSelectedDate(dateKey(next));
  };
  const updateAttendance = async (student, status) => {
    if (!ready) return;
    const key = `${selectedDate}/${student.id}`;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setSaving(new Set(pending.current));
    const revision = generation.current;
    const date = selectedDate;
    try {
      const documentId = attendanceDocumentId(attendance, { schoolYear: currentSchoolYear, schoolCode, className, date });
      const entry = await saveAttendanceEntry({ documentId, student, status, expectedEntry: records[student.id],
        schoolYear: currentSchoolYear, schoolCode, className, date, authorId: user?.uid || studentId });
      if (generation.current !== revision) return;
      setAttendance(previous => {
        const existing = previous.find(row => row.date === date);
        const next = { ...(existing || { id: documentId, schoolYear: currentSchoolYear, schoolCode, className, date }),
          records: { ...existing?.records, [student.id]: entry } };
        return existing ? previous.map(row => row === existing ? next : row) : [...previous, next];
      });
    } catch (problem) {
      if (generation.current === revision) showNotification?.(`Chưa lưu điểm danh: ${problem.message}`, 'error');
    } finally {
      if (generation.current === revision) { pending.current.delete(key); setSaving(new Set(pending.current)); }
    }
  };
  const copySummary = async () => {
    const names = status => students.filter(student => records[student.id]?.status === status).map(student => student.fullName).join(', ') || 'Không có';
    const message = `ĐIỂM DANH LỚP ${className} - ${selectedDate.split('-').reverse().join('/')}\nCP: ${names('CP')}\nKP: ${names('KP')}\nTổng vắng: ${cp + kp} (CP ${cp}, KP ${kp})`;
    let copied = false;
    try { await navigator.clipboard.writeText(message); copied = true; } catch { /* Some mobile webviews only support the selection fallback. */ }
    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = message;
      textarea.readOnly = true;
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, message.length);
      try { copied = document.execCommand('copy'); } catch { copied = false; }
      finally { textarea.remove(); }
    }
    if (copied) {
      showNotification?.('Đã sao chép điểm danh. Em có thể dán vào nhóm Zalo.');
    } else showNotification?.('Chưa sao chép được. Em thử lại trên trình duyệt.', 'error');
  };

  return (
    <section className="monitor-attendance" role="dialog" aria-modal="true" aria-label="Điểm danh lớp">
      <header className="monitor-attendance-header">
        <div><h2><CalendarDays size={18} /> Điểm danh lớp {className}</h2><p>Năm học {currentSchoolYear} · {loaded.students ? `${students.length} học sinh` : 'Đang tải danh sách'}</p></div>
        <button type="button" className="monitor-icon-button" aria-label="Đóng điểm danh" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="monitor-attendance-calendar">
        <div className="monitor-week-navigation">
          <button type="button" className="monitor-icon-button" aria-label="Tuần trước" onClick={() => moveWeek(-1)}><ChevronLeft size={18} /></button>
          <span>{shortDate(weekDates[0])} – {shortDate(weekDates[4])}/{weekDates[4].getFullYear()}</span>
          <button type="button" className="monitor-today-button" onClick={() => setSelectedDate(dateKey(initialDate(currentSchoolYear)))}>Hôm nay</button>
          <button type="button" className="monitor-icon-button" aria-label="Tuần sau" onClick={() => moveWeek(1)}><ChevronRight size={18} /></button>
        </div>
        <div className="monitor-week-days" role="group" aria-label="Chọn ngày điểm danh">
          {weekDates.map((date, index) => <button key={dateKey(date)} type="button" aria-pressed={selectedDate === dateKey(date)} onClick={() => setSelectedDate(dateKey(date))}>
            <span>Thứ {index + 2}</span><span>{shortDate(date)}</span>
          </button>)}
        </div>
      </div>
      <div className="monitor-attendance-help">CP: Vắng có phép · KP: Vắng không phép. Bỏ chọn là có mặt.</div>
      {!allowed ? <p role="alert" className="monitor-load-message">Chưa có phân công lớp trưởng hoặc hồ sơ chưa đủ lớp, cơ sở. Nhờ giáo viên kiểm tra lại.</p>
        : displayError ? <div role="alert" className="monitor-load-message">{displayError} <button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></div>
          : !ready ? <p role="status" className="monitor-load-message"><Loader2 size={16} className="animate-spin" /> Đang tải danh sách cả lớp…</p>
            : <div className="monitor-attendance-list">
              <table aria-label={`Điểm danh lớp ${className}`}>
                <colgroup><col className="monitor-order-column" /><col /><col className="monitor-status-column" /><col className="monitor-status-column" /></colgroup>
                <thead><tr><th scope="col">STT</th><th scope="col">Họ và tên</th><th scope="col">CP</th><th scope="col">KP</th></tr></thead>
                <tbody>{students.length === 0 ? <tr><td colSpan={4} className="monitor-empty-list">Chưa có học sinh trong lớp này. Nhờ giáo viên kiểm tra danh sách.</td></tr> : students.map((student, index) => {
                  const currentStatus = records[student.id]?.status || '';
                  const busy = saving.has(`${selectedDate}/${student.id}`);
                  return <tr key={student.id}>
                    <td>{index + 1}</td><th scope="row">{student.fullName || '(Chưa có tên)'}</th>
                    {['CP', 'KP'].map(status => <td key={status}><button type="button" className="monitor-status-button" data-status={status}
                      aria-label={`${status === 'CP' ? 'Vắng có phép' : 'Vắng không phép'}: ${student.fullName}`}
                      aria-pressed={currentStatus === status} disabled={busy} onClick={() => updateAttendance(student, currentStatus === status ? '' : status)}>{status}</button></td>)}
                  </tr>;
                })}</tbody>
              </table>
            </div>}
      <footer className="monitor-attendance-footer">
        <span>{ready ? `Có mặt ${students.length - cp - kp} · CP ${cp} · KP ${kp}` : 'Danh sách đúng lớp được tải khi mở điểm danh.'}</span>
        <button type="button" disabled={!ready || saving.size > 0 || !students.length} onClick={copySummary}><Copy size={14} /> Sao chép Zalo</button>
      </footer>
    </section>
  );
}
