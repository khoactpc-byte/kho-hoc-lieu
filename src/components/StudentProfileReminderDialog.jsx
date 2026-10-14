import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Mail, X } from 'lucide-react';
import { studentProfileReminderBody } from '../utils/studentProfileReminders';

export default function StudentProfileReminderDialog({ check, onSend, onClose }) {
  const missingRows = check.rows.filter(row => row.missing.length);
  const withoutCode = missingRows.filter(row => !String(row.student.accessCode || '').trim());
  const [pendingRows, setPendingRows] = useState(() => missingRows.filter(row => String(row.student.accessCode || '').trim()));
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const sendLock = useRef(false);
  const closeButton = useRef(null);
  const title = 'Thông báo bổ sung hồ sơ';

  useEffect(() => {
    closeButton.current?.focus();
    const keyboard = event => {
      if (event.key === 'Escape' && !sendLock.current) onClose();
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [onClose]);

  const send = async () => {
    if (sendLock.current || !onSend || !pendingRows.length) return;
    sendLock.current = true;
    setIsSending(true);
    setError('');
    try {
      const messages = pendingRows.map(({ student, missing }) => ({
        student, category: 'profile', title, body: studentProfileReminderBody(missing)
      }));
      const result = await onSend(messages);
      const failedIds = new Set((result?.failedMessages || []).map(message => message.student.id));
      const failedRows = pendingRows.filter(row => failedIds.has(row.student.id));
      setSentCount(count => count + pendingRows.length - failedRows.length);
      setPendingRows(failedRows);
      if (failedRows.length) setError(`Còn ${failedRows.length} thư chưa gửi được. Bấm thử lại để gửi riêng các thư này.`);
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
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-rose-800">{error}</p>}
        {pendingRows.length > 0 && <>
          <p className="text-xs text-slate-500">Mỗi bạn nhận một thư riêng về các mục mình còn thiếu. Bấm tên để xem nội dung.</p>
          <p className="text-xs font-medium">Tiêu đề: {title}</p>
          <div className="space-y-2">
            {pendingRows.map(({ student, missing }, index) => <details key={student.id} open={index === 0} className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-slate-800">{student.fullName} · {student.className || 'chưa xếp lớp'} · {student.accessCode} — Thiếu {missing.length} mục</summary>
              <p className="whitespace-pre-wrap border-t border-slate-100 px-3 py-2 text-sm leading-6">{studentProfileReminderBody(missing)}</p>
            </details>)}
          </div>
        </>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2.5">
        <button type="button" onClick={onClose} disabled={isSending} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600 disabled:opacity-40">{sentCount ? 'Đóng' : 'Hủy'}</button>
        {pendingRows.length > 0 && <button type="button" onClick={send} disabled={isSending || !onSend} className="flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white disabled:opacity-50">
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {isSending ? 'Đang gửi…' : error ? `Thử gửi lại ${pendingRows.length} thư` : `Gửi ${pendingRows.length} thư vào hộp thư`}
        </button>}
      </div>
    </div>
  </div>;
}
