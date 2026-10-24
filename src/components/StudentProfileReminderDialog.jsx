import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Mail, X } from 'lucide-react';
import { studentProfileReminderBody } from '../utils/studentProfileReminders';
import { studentMailboxFailureSummary } from '../services/studentMailboxBatch';

export default function StudentProfileReminderDialog({ check, onSend, onClose, onOpenMailboxHistory }) {
  const missingRows = check.rows.filter(row => row.missing.length);
  const withoutCode = missingRows.filter(row => !String(row.student.accessCode || '').trim());
  const [pendingRows, setPendingRows] = useState(() => missingRows.filter(row => String(row.student.accessCode || '').trim()));
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const sendLock = useRef(false);
  const closeButton = useRef(null);
  const title = 'Thông báo bổ sung hồ sơ';
  const selectedRows = pendingRows.filter(row => !row.excluded);
  const pendingIds = new Set(pendingRows.map(row => row.student.id));
  const sentRows = missingRows.filter(row => String(row.student.accessCode || '').trim() && !pendingIds.has(row.student.id));

  useEffect(() => {
    closeButton.current?.focus();
    const keyboard = event => {
      if (event.key === 'Escape' && !sendLock.current) onClose();
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [onClose]);

  const send = async () => {
    if (sendLock.current || !onSend || !selectedRows.length) return;
    sendLock.current = true;
    setIsSending(true);
    setError('');
    try {
      const messages = selectedRows.map(({ student, missing }) => ({
        student, category: 'profile', title, body: studentProfileReminderBody(missing)
      }));
      const result = await onSend(messages);
      const failedIds = new Set((result?.failedMessages || []).map(message => message.student.id));
      const failedRows = selectedRows.filter(row => failedIds.has(row.student.id)).map(row => ({
        ...row, failureReason: result?.failureReasons?.find(item => item.studentId === row.student.id)?.message || ''
      }));
      setSentCount(count => count + selectedRows.length - failedRows.length);
      setPendingRows([...pendingRows.filter(row => row.excluded), ...failedRows]);
      if (failedRows.length) {
        const reasons = studentMailboxFailureSummary(result?.failureReasons);
        setError(`Còn ${failedRows.length} thư chưa gửi được.${reasons ? `\n${reasons}` : '\nMáy chủ chưa cung cấp lý do lỗi.'}\nNút thử lại chỉ gửi riêng các thư còn lại.`);
      }
    } catch (failure) {
      setError(`Chưa gửi được thư: ${failure.message}`);
    } finally {
      sendLock.current = false;
      setIsSending(false);
    }
  };

  return <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:p-3"
    role="dialog" aria-modal="true" aria-labelledby="profile-reminder-title" onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), summary')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <div className="flex max-h-[min(94dvh,100%)] w-full min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-w-xl">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
        <h4 id="profile-reminder-title" className="min-w-0 text-sm font-medium text-slate-900">Kiểm tra và gửi nhắc bổ sung hồ sơ</h4>
        <button ref={closeButton} type="button" onClick={onClose} disabled={isSending} aria-label="Đóng kiểm tra hồ sơ"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-40"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-3 text-sm text-slate-700">
        <p>Đã kiểm tra {check.rows.length} học sinh {check.scope}. {missingRows.length} bạn còn thiếu hồ sơ; {check.rows.length - missingRows.length} bạn đã đủ các mục cần kiểm tra.</p>
        {withoutCode.length > 0 && <details className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <summary className="cursor-pointer py-1">{withoutCode.length} bạn chưa có mã học sinh để nhận thư</summary>
          <p className="mt-1">Cấp mã học sinh rồi kiểm tra lại: {withoutCode.map(row => `${row.student.fullName} (${row.student.className || 'chưa xếp lớp'})`).join(', ')}.</p>
        </details>}
        {sentCount > 0 && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />Đã gửi {sentCount} thư vào hộp thư học sinh.</p>}
        {sentRows.length > 0 && <details className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900" aria-label="Danh sách học sinh đã gửi thư">
          <summary className="cursor-pointer py-1 font-medium">Đã gửi {sentRows.length} bạn — xem danh sách</summary>
          <ul className="mt-1 space-y-1 border-t border-emerald-200 pt-2">
            {sentRows.map(({ student }) => <li key={student.id}>{student.fullName} · {student.className || 'chưa xếp lớp'} · {student.accessCode}</li>)}
          </ul>
        </details>}
        {onOpenMailboxHistory && <button type="button" onClick={onOpenMailboxHistory} disabled={isSending}
          className="min-h-10 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs text-sky-800 disabled:opacity-40">Xem thư đã gửi / xử lý gửi nhầm</button>}
        {error && <p role="alert" className="whitespace-pre-wrap break-words rounded-lg bg-rose-50 p-2 text-rose-800">{error}</p>}
        {pendingRows.length > 0 && <>
          <p className="text-xs text-slate-500">Đang chọn {selectedRows.length}/{pendingRows.length} bạn chưa gửi. Bỏ tích những bạn không cần nhận thư; bấm tên để xem nội dung.</p>
          <p className="text-xs font-medium">Tiêu đề: {title}</p>
          <div className="space-y-2">
            {pendingRows.map(({ student, missing, excluded, failureReason }, index) => <details key={student.id} open={index === 0} className={`rounded-lg border bg-white ${excluded ? 'border-slate-100 text-slate-400' : 'border-slate-200'}`}>
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-slate-800">
                <input type="checkbox" aria-label={`Gửi thư cho ${student.fullName}`} checked={!excluded} disabled={isSending}
                  onClick={event => event.stopPropagation()} onChange={event => {
                    const selected = event.target.checked;
                    setPendingRows(rows => rows.map(row => row.student.id === student.id ? { ...row, excluded: !selected } : row));
                  }} className="mr-2 h-4 w-4 align-middle accent-emerald-600" />
                {student.fullName} · {student.className || 'chưa xếp lớp'} · {student.accessCode} — Thiếu {missing.length} mục
              </summary>
              {failureReason && <p className="break-words px-3 pt-2 text-xs text-rose-700">Lỗi gửi: {failureReason}</p>}
              <p className="whitespace-pre-wrap border-t border-slate-100 px-3 py-2 text-sm leading-6">{studentProfileReminderBody(missing)}</p>
            </details>)}
          </div>
        </>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
        <button type="button" onClick={onClose} disabled={isSending} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600 disabled:opacity-40">{sentCount ? 'Đóng' : 'Hủy'}</button>
        {pendingRows.length > 0 && <button type="button" onClick={send} disabled={isSending || !onSend || !selectedRows.length} className="flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white disabled:opacity-50">
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {isSending ? 'Đang gửi…' : error ? `Thử gửi lại ${selectedRows.length} thư` : `Gửi ${selectedRows.length} thư vào hộp thư`}
        </button>}
      </div>
    </div>
  </div>;
}
