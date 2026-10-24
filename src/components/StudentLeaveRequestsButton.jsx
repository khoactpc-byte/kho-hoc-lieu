import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Loader2, X } from 'lucide-react';
import useStudentLeaveRequests from '../hooks/useStudentLeaveRequests';
import { submitLeaveRequest } from '../services/studentLeaveRequests';
import { leaveDateLabel, leaveDateRange, LEAVE_STATUS_LABELS } from '../utils/studentLeaveRequests';
import { vietnamDateKey } from '../utils/vietnamDate';

export default function StudentLeaveRequestsButton({ student, currentSchoolYear, disabled = false }) {
  const [open, setOpen] = useState(false);
  const inbox = useStudentLeaveRequests({ enabled: Boolean(student?.id), role: 'student', studentId: student?.id, schoolYear: currentSchoolYear });
  if (!student?.id) return null;
  const pending = inbox.requests.filter(request => request.status === 'pending').length;
  return <>
    <button type="button" onClick={() => setOpen(true)} title="Xin phép nghỉ học" aria-label="Xin phép nghỉ học" className="relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-blue-100 bg-blue-50 px-2 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-100 sm:px-3">
      <CalendarDays className="h-4 w-4" /><span>Xin nghỉ</span>{pending > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pending}</span>}
    </button>
    {open && <StudentLeaveDialog key={`${student.id}/${currentSchoolYear}`} student={student} currentSchoolYear={currentSchoolYear} disabled={disabled || student.schoolYear !== currentSchoolYear} inbox={inbox} onClose={() => setOpen(false)} />}
  </>;
}

function StudentLeaveDialog({ student, currentSchoolYear, disabled, inbox, onClose }) {
  const formId = useId();
  const startYear = Number(currentSchoolYear.slice(0, 4)), firstDate = `${startYear}-09-01`, lastDate = `${startYear + 1}-05-31`;
  const today = vietnamDateKey(), initialDate = today < firstDate ? firstDate : today > lastDate ? lastDate : today;
  const [from, setFrom] = useState(initialDate), [to, setTo] = useState(initialDate), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const sending = useRef(false);
  const changeFrom = event => { setFrom(event.target.value); if (to < event.target.value) setTo(event.target.value); };
  const changeTo = event => setTo(event.target.value);
  const submit = async event => {
    event.preventDefault();
    if (disabled || sending.current) return;
    setMessage(''); setError('');
    let dates;
    try { dates = leaveDateRange(from, to); } catch (problem) { setError(problem.message); return; }
    sending.current = true; setBusy(true);
    try {
      const result = await submitLeaveRequest(student, { dates, reason });
      setMessage(result.created.length ? `Đã gửi đơn cho ${result.created.length} ngày học. Admin duyệt đồng ý sẽ tính Có phép.${result.existing.length ? ` ${result.existing.length} ngày đã có đơn, không gửi trùng.` : ''}`
        : 'Các ngày này đã có đơn chờ duyệt hoặc đã đồng ý. Em xem trạng thái bên dưới.');
      if (result.created.length) setReason('');
    } catch (problem) { setError(problem.message || 'Chưa gửi được đơn. Em thử lại nhé.'); }
    finally { sending.current = false; setBusy(false); }
  };
  const requests = [...inbox.requests].sort((a, b) => b.date.localeCompare(a.date));
  return createPortal(<div className="student-profile-overlay z-[230] bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby={`${formId}-title`} onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); } }}>
    <div className="student-profile-panel max-w-3xl rounded-lg bg-white shadow-2xl">
      <header className="student-profile-header shrink-0 border-b bg-slate-50 px-3 py-2">
        <div className="student-profile-heading min-w-0"><h2 id={`${formId}-title`} className="font-medium text-slate-900">Xin phép nghỉ học</h2><p className="truncate text-xs text-slate-500">{student.fullName} · {student.className} · {currentSchoolYear}</p></div>
        <div className="student-profile-actions"><button type="submit" form={formId} disabled={busy || disabled} className="inline-flex min-h-9 items-center gap-2 rounded bg-blue-600 px-3 text-sm text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Đang gửi…' : 'Gửi đơn xin nghỉ'}</button></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng xin nghỉ học" className="student-profile-close rounded border border-slate-200 bg-white p-2 text-slate-500"><X className="h-5 w-5" /></button>
      </header>
      <div className="student-profile-form min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
        {disabled && <p role="alert" className="rounded bg-amber-50 p-3 text-sm text-amber-800">Hồ sơ này chỉ xem. Em chỉ gửi đơn trong năm đang học.</p>}
        <form id={formId} onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-600">Từ ngày<input aria-label="Xin nghỉ từ ngày" type="date" required min={firstDate} max={lastDate} value={from} disabled={busy || disabled} onInput={changeFrom} onChange={changeFrom} className="rounded border border-slate-200 bg-white" /></label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-slate-600">Đến ngày<input aria-label="Xin nghỉ đến ngày" type="date" required min={from || firstDate} max={lastDate} value={to} disabled={busy || disabled} onInput={changeTo} onChange={changeTo} className="rounded border border-slate-200 bg-white" /></label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-600">Lý do xin nghỉ<textarea aria-label="Lý do xin nghỉ" required maxLength={1000} value={reason} disabled={busy || disabled} onChange={event => setReason(event.target.value)} placeholder="Em ghi rõ lý do để admin xem xét." rows={3} className="w-full resize-y rounded border border-slate-200 p-2 text-sm text-slate-800" /></label>
          <p className="text-xs text-slate-500">Chọn cùng một ngày nếu nghỉ một buổi. Khoảng nhiều ngày chỉ lấy ngày học từ thứ Hai đến thứ Sáu, tối đa 31 ngày.</p>
          {error && <p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {message && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        </form>
        <section className="border-t border-slate-200 pt-3" aria-label="Đơn xin nghỉ của em">
          <h3 className="mb-2 text-sm font-medium text-slate-800">Đơn đã gửi</h3>
          {inbox.status === 'loading' && <p role="status" className="text-sm text-slate-500">Đang tải đơn xin nghỉ…</p>}
          {inbox.error && <p role="alert" className="text-sm text-rose-700">{inbox.error} <button type="button" onClick={inbox.retry} className="underline">Thử lại</button></p>}
          {inbox.status === 'ready' && !requests.length && <p className="text-sm text-slate-500">Em chưa có đơn xin nghỉ trong năm này.</p>}
          <div className="space-y-2">{requests.map(request => <article key={request.id} className="rounded border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium text-slate-800">{leaveDateLabel(request.date)}</span><span className={request.status === 'approved' ? 'text-emerald-700' : request.status === 'rejected' ? 'text-rose-700' : 'text-amber-700'}>{LEAVE_STATUS_LABELS[request.status] || request.status}{request.status === 'approved' ? ' · Có phép' : ''}</span></div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{request.reason}</p>
          </article>)}</div>
        </section>
      </div>
    </div>
  </div>, document.body);
}
