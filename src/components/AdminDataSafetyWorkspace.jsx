import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, Clock3, DatabaseBackup, Loader2, Mail, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { postAppsScript } from '../utils/helpers';

const formatDateTime = (value) => value ? new Date(value).toLocaleString('vi-VN') : '-';
const normalizeCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

export default function AdminDataSafetyWorkspace({
  snapshot,
  students = [],
  onRestore,
  onClose,
  showNotification
}) {
  const [tab, setTab] = useState('backup');
  const [backups, setBackups] = useState([]);
  const [logs, setLogs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState('');

  const loadBackups = useCallback(async () => {
    setBusy('load-backups');
    try {
      const response = await postAppsScript({ action: 'listSystemBackups', actor: 'Admin' });
      setBackups(response.backups || []);
    } catch (error) {
      showNotification?.(`Chưa tải được danh sách sao lưu: ${error.message}`, 'error');
    } finally {
      setBusy('');
    }
  }, [showNotification]);

  const loadLogs = useCallback(async () => {
    setBusy('load-logs');
    try {
      const response = await postAppsScript({ action: 'listAuditLogs', limit: 500, actor: 'Admin' });
      setLogs(response.logs || []);
    } catch (error) {
      showNotification?.(`Chưa tải được nhật ký: ${error.message}`, 'error');
    } finally {
      setBusy('');
    }
  }, [showNotification]);

  const loadMessages = useCallback(async () => {
    setBusy('load-messages');
    try {
      const response = await postAppsScript({ action: 'listAdminMailboxMessages', limit: 500, actor: 'Admin' });
      setMessages(response.messages || []);
    } catch (error) {
      showNotification?.(`Chưa tải được thư đã gửi: ${error.message}`, 'error');
    } finally {
      setBusy('');
    }
  }, [showNotification]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (tab === 'backup') loadBackups();
      if (tab === 'logs') loadLogs();
      if (tab === 'mail') loadMessages();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tab, loadBackups, loadLogs, loadMessages]);

  const createBackup = async (reason = 'thu-cong') => {
    setBusy('create-backup');
    try {
      await postAppsScript({ action: 'createSystemBackup', snapshot, reason, actor: 'Admin' });
      showNotification?.('Đã tạo bản sao lưu trên Google Drive.');
      await loadBackups();
    } catch (error) {
      showNotification?.(`Chưa sao lưu được: ${error.message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const restoreBackup = async (item) => {
    if (!window.confirm(`Phục hồi bản "${item.name}"? Hệ thống sẽ tự sao lưu dữ liệu hiện tại trước khi phục hồi.`)) return;
    setBusy(`restore-${item.id}`);
    try {
      await postAppsScript({ action: 'createSystemBackup', snapshot, reason: 'truoc-phuc-hoi', actor: 'Admin' });
      const response = await postAppsScript({ action: 'getSystemBackup', fileId: item.id, actor: 'Admin' });
      await onRestore?.(response.backup?.snapshot || {});
      await postAppsScript({ action: 'restoreMailboxFromBackup', mailboxRows: response.backup?.mailboxRows || [], actor: 'Admin' });
      showNotification?.('Đã phục hồi dữ liệu và hộp thư từ bản sao lưu.');
    } catch (error) {
      showNotification?.(`Phục hồi chưa thành công: ${error.message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const deleteMessage = async (message) => {
    if (!window.confirm(`Xóa riêng thư "${message.title}"?`)) return;
    setBusy(`delete-${message.id}`);
    try {
      await postAppsScript({ action: 'deleteStudentMailboxMessage', messageId: message.id, actor: 'Admin' });
      showNotification?.('Đã xóa thư.');
      await loadMessages();
    } catch (error) {
      showNotification?.(`Chưa xóa được thư: ${error.message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const getTargetCodes = useCallback((message) => {
    const eligible = students.filter(student => !message.schoolYear || !student.schoolYear || String(student.schoolYear) === String(message.schoolYear));
    if (message.recipientType === 'student') return [normalizeCode(message.recipientValue)].filter(Boolean);
    if (message.recipientType === 'class') return eligible.filter(student => String(student.className || '') === String(message.recipientValue || '')).map(student => normalizeCode(student.accessCode)).filter(Boolean);
    return eligible.map(student => normalizeCode(student.accessCode)).filter(Boolean);
  }, [students]);

  const resendUnread = async (message) => {
    const readSet = new Set((message.readBy || []).map(normalizeCode));
    const unreadCodes = [...new Set(getTargetCodes(message).filter(code => !readSet.has(code)))];
    if (!unreadCodes.length) {
      showNotification?.('Không có học sinh chưa đọc thư này.', 'error');
      return;
    }
    setBusy(`resend-${message.id}`);
    try {
      await postAppsScript({ action: 'resendStudentMailboxMessage', messageId: message.id, unreadCodes, actor: 'Admin' });
      showNotification?.(`Đã gửi lại cho ${unreadCodes.length} học sinh chưa đọc.`);
      await loadMessages();
    } catch (error) {
      showNotification?.(`Chưa gửi lại được: ${error.message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const summary = useMemo(() => ({
    students: snapshot?.collections?.students?.length || 0,
    scores: snapshot?.collections?.scorebooks?.length || 0,
    attendance: snapshot?.collections?.class_attendance?.length || 0
  }), [snapshot]);

  return (
    <div className="fixed inset-x-0 top-[114px] bottom-0 z-[140] overflow-y-auto bg-slate-100 p-2 sm:top-[84px] sm:p-4">
      <div className="mx-auto max-w-7xl">
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <div>
            <h2 className="text-lg font-black uppercase text-slate-900">An toàn dữ liệu</h2>
            <p className="text-xs font-semibold text-slate-500">Sao lưu, phục hồi, nhật ký và thư đã gửi</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white" title="Đóng"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto rounded-xl bg-white p-2">
          {[['backup', DatabaseBackup, 'Sao lưu'], ['logs', Clock3, 'Nhật ký'], ['mail', Mail, 'Thư đã gửi']].map(([key, Icon, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-xs font-black uppercase ${tab === key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>

        {tab === 'backup' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-blue-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-bold text-slate-600">Dữ liệu hiện tại: {summary.students} học sinh, {summary.scores} sổ điểm, {summary.attendance} bảng điểm danh.</div>
                <button type="button" onClick={() => createBackup()} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase text-white disabled:opacity-50">{busy === 'create-backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Sao lưu ngay</button>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {backups.map(item => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 last:border-0">
                  <div><div className="text-sm font-black text-slate-800">{item.name}</div><div className="text-xs font-semibold text-slate-400">{formatDateTime(item.createdAt)} · {Math.max(1, Math.round((item.size || 0) / 1024))} KB</div></div>
                  <button type="button" onClick={() => restoreBackup(item)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-black uppercase text-amber-800 disabled:opacity-50">{busy === `restore-${item.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />} Phục hồi</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {logs.map(log => <div key={log.id} className="border-b border-slate-100 p-3 last:border-0"><div className="flex flex-wrap justify-between gap-2"><span className="text-sm font-black text-slate-800">{log.action.replaceAll('_', ' ')}</span><span className="text-xs font-semibold text-slate-400">{formatDateTime(log.createdAt)}</span></div><div className="mt-1 text-xs font-semibold text-slate-500">{log.actor} · {JSON.stringify(log.details)}</div></div>)}
          </div>
        )}

        {tab === 'mail' && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {messages.map(message => {
              const targetCount = getTargetCodes(message).length;
              return <div key={message.id} className="border-b border-slate-100 p-3 last:border-0"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="text-sm font-black text-slate-900">{message.title}</div><div className="mt-1 text-xs font-semibold text-slate-500">{message.recipientLabel} · đã đọc {message.readCount}/{targetCount || '?'} · {formatDateTime(message.createdAt)}</div><div className="mt-2 line-clamp-2 text-xs text-slate-600">{message.body}</div></div><div className="flex gap-2"><button type="button" onClick={() => resendUnread(message)} disabled={Boolean(busy)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700" title="Gửi lại cho học sinh chưa đọc">{busy === `resend-${message.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button><button type="button" onClick={() => deleteMessage(message)} disabled={Boolean(busy)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700" title="Xóa thư">{busy === `delete-${message.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></div></div></div>;
            })}
          </div>
        )}

        {busy && !['create-backup'].includes(busy) && <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-xl"><RefreshCw className="h-4 w-4 animate-spin" /> Đang xử lý...</div>}
      </div>
    </div>
  );
}
