import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, Loader2, X } from 'lucide-react';
import useStudentLeaveRequests from '../hooks/useStudentLeaveRequests';
import { reviewLeaveRequests } from '../services/studentLeaveRequests';
import { leaveDateLabel, leaveReviewDates, LEAVE_STATUS_LABELS } from '../utils/studentLeaveRequests';
import { getStudentSchoolCode } from '../utils/schoolClasses';
import { vietnamDateKey } from '../utils/vietnamDate';

export default function AdminLeaveRequestsButton({ schoolYear, students, anchorDate, reportMode, disabled = false }) {
  const [open, setOpen] = useState(false);
  const inbox = useStudentLeaveRequests({ role: 'admin', schoolYear });
  const roster = new Map(students.map(student => [student.id, student]));
  const requests = inbox.requests.filter(request => roster.has(request.studentId) && getStudentSchoolCode(roster.get(request.studentId)) === request.schoolCode);
  const count = requests.filter(request => request.status === 'pending').length;
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Danh sách xin nghỉ học" title="Danh sách xin nghỉ học" className="attendance-tool-button">
      <CalendarDays className="h-4 w-4" /><span>Xin nghỉ</span>{count > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{count}</span>}
    </button>
    {open && <AdminLeaveDialog key={schoolYear} schoolYear={schoolYear} anchorDate={anchorDate} reportMode={reportMode} requests={requests} inbox={inbox} disabled={disabled} onClose={() => setOpen(false)} />}
  </>;
}

function AdminLeaveDialog({ schoolYear, anchorDate, reportMode, requests, inbox, disabled, onClose }) {
  const year = Number(schoolYear.slice(0, 4)), firstDate = `${year}-09-01`, lastDate = `${year + 1}-05-31`;
  const preferred = anchorDate || vietnamDateKey();
  const [date, setDate] = useState(preferred < firstDate ? firstDate : preferred > lastDate ? lastDate : preferred);
  const [mode, setMode] = useState(reportMode === 'day' ? 'day' : 'week'), [showProcessed, setShowProcessed] = useState(false);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(null), [result, setResult] = useState(null);
  const running = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dates = leaveReviewDates(mode, date).filter(day => day >= firstDate && day <= lastDate);
  const scopeRequests = requests.filter(request => (mode === 'all' || dates.includes(request.date)) && (showProcessed || request.status === 'pending'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.className.localeCompare(b.className, 'vi') || a.studentName.localeCompare(b.studentName, 'vi'));
  const pending = scopeRequests.filter(request => request.status === 'pending');
  const totalPending = requests.filter(request => request.status === 'pending').length;
  const caption = mode === 'all' ? `Năm học ${schoolYear}` : mode === 'day' ? `Ngày ${leaveDateLabel(date)}` : `Tuần ${leaveDateLabel(dates[0])} – ${leaveDateLabel(dates.at(-1))}`;
  const act = async (targets, decision) => {
    if (running.current || disabled || !targets.length) return;
    running.current = true; setBusy(true); setResult(null); setProgress({ completed: 0, total: targets.length });
    try {
      const response = await reviewLeaveRequests(targets, decision, value => { if (mounted.current) setProgress(value); }, () => mounted.current);
      if (mounted.current) setResult({ ...response, decision });
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  const changeScope = callback => { if (!busy) { setResult(null); callback(); } };
  const changeDate = event => changeScope(() => setDate(event.target.value));
  return createPortal(<div className="student-profile-overlay z-[230] bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="admin-leave-title" onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); } }}>
    <div className="student-profile-panel max-w-5xl rounded-lg bg-white shadow-2xl">
      <header className="student-profile-header shrink-0 border-b bg-slate-50 px-3 py-2">
        <div className="student-profile-heading min-w-0"><h2 id="admin-leave-title" className="font-medium text-slate-900">Danh sách xin nghỉ học</h2><p className="text-xs text-slate-500">{caption} · Theo khối/lớp đang lọc trong điểm danh</p></div>
        <div className="student-profile-actions flex flex-wrap gap-2">
          {mode !== 'all' && <button type="button" disabled={busy || disabled || inbox.status !== 'ready' || !pending.length} onClick={() => act(pending, 'approved')} className="inline-flex min-h-9 items-center gap-1.5 rounded bg-emerald-600 px-3 text-xs text-white disabled:opacity-50"><Check className="h-4 w-4" />Đồng ý tất cả {mode === 'day' ? 'ngày này' : 'tuần này'} ({pending.length})</button>}
        </div>
        <button type="button" disabled={busy} onClick={onClose} aria-label="Đóng danh sách xin nghỉ" className="student-profile-close rounded border border-slate-200 bg-white p-2 text-slate-500"><X className="h-5 w-5" /></button>
      </header>
      <div className="shrink-0 space-y-2 border-b border-slate-200 p-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2">Xem đơn<select aria-label="Khoảng duyệt xin nghỉ" value={mode} disabled={busy} onChange={event => changeScope(() => setMode(event.target.value))} className="h-8 rounded border border-slate-200 bg-white px-2"><option value="day">Theo ngày</option><option value="week">Theo tuần</option><option value="all">Tất cả trong năm ({totalPending} chờ)</option></select></label>
          {mode !== 'all' && <label className="inline-flex min-w-0 items-center gap-2">{mode === 'week' ? 'Ngày trong tuần' : 'Ngày nghỉ'}<input aria-label="Ngày duyệt xin nghỉ" type="date" min={firstDate} max={lastDate} value={date} disabled={busy} onInput={changeDate} onChange={changeDate} className="h-8 min-w-0 rounded border border-slate-200 bg-white px-2" /></label>}
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={showProcessed} disabled={busy} onChange={event => changeScope(() => setShowProcessed(event.target.checked))} />Hiện đơn đã xử lý</label>
        </div>
        <p>Đồng ý đơn sẽ cập nhật Có phép (CP) cho đúng học sinh và ngày nghỉ, kể cả khi lớp trưởng đã ghi Không phép (KP).</p>
        {disabled && <p className="text-amber-700">Đang lưu điểm danh. Chờ lưu xong để duyệt đơn.</p>}
        {busy && <p role="status" className="inline-flex items-center gap-2 text-sky-700"><Loader2 className="h-4 w-4 animate-spin" />Đang xử lý {progress?.completed || 0}/{progress?.total || 0} đơn…</p>}
        {result && <div role="status" className="space-y-1"><p className="text-emerald-700">Đã {result.decision === 'approved' ? 'đồng ý' : 'từ chối'} {result.succeeded.length} đơn.</p>{result.failed.length > 0 && <><p className="text-rose-700">Còn {result.failed.length} đơn chưa xử lý: {result.failed[0].error.message}</p><button type="button" disabled={busy} onClick={() => act(result.failed.map(item => item.record), result.decision)} className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">Thử lại riêng {result.failed.length} đơn</button></>}</div>}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 pb-16">
        {inbox.status === 'loading' && <p role="status" className="p-3 text-sm text-slate-500">Đang tải đơn xin nghỉ…</p>}
        {inbox.error && <p role="alert" className="p-3 text-sm text-rose-700">{inbox.error} <button type="button" onClick={inbox.retry} className="underline">Thử tải lại</button></p>}
        {inbox.status === 'ready' && !scopeRequests.length && <p className="p-3 text-sm text-slate-500">Không có đơn {showProcessed ? '' : 'chờ duyệt '}trong khoảng này.{totalPending > 0 && mode !== 'all' && <button type="button" onClick={() => changeScope(() => setMode('all'))} className="ml-1 text-sky-700 underline">Xem {totalPending} đơn chờ trong năm</button>}</p>}
        {scopeRequests.map(request => <article key={request.id} className="rounded border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 text-sm"><p className="break-words font-medium text-slate-800">{request.studentName} · {request.className} · {request.accessCode}</p><p className="mt-0.5 text-xs text-slate-500">Ngày nghỉ: {leaveDateLabel(request.date)} · <span className={request.status === 'approved' ? 'text-emerald-700' : request.status === 'rejected' ? 'text-rose-700' : 'text-amber-700'}>{LEAVE_STATUS_LABELS[request.status]}</span></p></div>
            {request.status === 'pending' && <div className="flex shrink-0 gap-2"><button type="button" disabled={busy || disabled} onClick={() => act([request], 'approved')} aria-label={`Đồng ý nghỉ ${request.studentName} ngày ${leaveDateLabel(request.date)}`} className="inline-flex min-h-9 items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 text-xs text-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" />Đồng ý</button><button type="button" disabled={busy || disabled} onClick={() => act([request], 'rejected')} aria-label={`Từ chối nghỉ ${request.studentName} ngày ${leaveDateLabel(request.date)}`} className="inline-flex min-h-9 items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 text-xs text-rose-700 disabled:opacity-50"><X className="h-4 w-4" />Từ chối</button></div>}
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{request.reason}</p>
        </article>)}
      </div>
    </div>
  </div>, document.body);
}
