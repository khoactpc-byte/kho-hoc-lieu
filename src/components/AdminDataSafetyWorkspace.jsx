import { useCallback, useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Clock3, DatabaseBackup, Loader2, Mail, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { postAppsScript } from '../utils/helpers';
import { validateMailboxBackup, validateRestoreSnapshot } from '../utils/backupManifest';
import { SERVER_SYSTEM_ENABLED, listMaintenanceJobs, continueMaintenance, continueRestorePreparation, captureServerSnapshot, completeBackupExport, cancelMaintenance, retryMailboxRestore, previewGenerations, cleanGeneration, previewStudentMetadata, applyStudentMetadata } from '../services/serverSystemClient';
import { processRecords } from '../utils/bulkOperations';
import MaterialMigrationPanel from './MaterialMigrationPanel';
import { readSystemSummary } from '../services/systemSummary';

const formatDateTime = (value) => value ? new Date(value).toLocaleString('vi-VN') : '-';
const normalizeCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

export default function AdminDataSafetyWorkspace({
  snapshot,
  students = [],
  onRestore,
  captureSnapshot,
  onClose,
  showNotification
}) {
  const [tab, setTab] = useState('backup');
  const [backups, setBackups] = useState([]);
  const [logs, setLogs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState({});
  const loadRequests = useRef({});
  const operation = useRef(false);
  const [summary, setSummary] = useState(null);
  const loadSummary = useCallback(async () => {
    const request = Symbol(); loadRequests.current.summary = request; setLoading(state => ({ ...state, summary: true }));
    try {
      const result = await readSystemSummary();
      if (loadRequests.current.summary === request) setSummary(result);
    } catch (error) {
      if (loadRequests.current.summary === request) showNotification?.(`Chưa tải được thống kê: ${error.message}`, 'error');
    } finally {
      if (loadRequests.current.summary === request) setLoading(state => ({ ...state, summary: false }));
    }
  }, [showNotification]);
  useEffect(() => () => { loadRequests.current = {}; }, []);
  const beginOperation = name => { if (operation.current) return false; operation.current = true; setBusy(name); return true; };
  const finishOperation = () => { operation.current = false; setBusy(''); };
  const [jobs, setJobs] = useState([]);
  const [generations, setGenerations] = useState(null);
  const [metadataPreview, setMetadataPreview] = useState(null);
  const [docIds, setDocIds] = useState('');
  const [docAudit, setDocAudit] = useState([]);
  const auditDocs = async (dryRun = true) => {
    const fileIds = [...new Set(docIds.split(/[\s,;]+/).filter(Boolean))];
    if (!dryRun && !window.confirm(`Thu hồi chia sẻ theo link của ${docAudit.filter(row => row.success).length} tài liệu đã xem trước?`)) return;
    if (!beginOperation('audit-docs')) return;
    try { const data = await postAppsScript({ action: 'auditQuizDocSharing', fileIds: dryRun ? fileIds : docAudit.filter(row => row.success).map(row => row.fileId), dryRun }); setDocAudit(data.results || []); }
    catch (error) { showNotification?.(error.message, 'error'); } finally { finishOperation(); }
  };
  const maintainGenerations = async (apply = false) => {
    if (apply && !window.confirm('Dọn các bản phân công đã xem trước, không còn dùng và đã qua 30 ngày?')) return;
    if (!beginOperation('generations')) return;
    try {
      if (apply) for (const row of generations.generations.filter(item => item.eligible)) await cleanGeneration(row.id, generations.activeGeneration);
      setGenerations(await previewGenerations());
      if (apply) showNotification?.('Đã dọn các mảnh phân công cũ.');
    } catch (error) { showNotification?.(error.message, 'error'); } finally { finishOperation(); }
  };
  useEffect(() => {
    if (!SERVER_SYSTEM_ENABLED || tab !== 'backup') return undefined;
    let active = true;
    listMaintenanceJobs().then(value => { if (active) setJobs(value.jobs); }).catch(error => { if (active) showNotification?.(error.message, 'error'); });
    return () => { active = false; };
  }, [tab, showNotification]);
  const migrateMetadata = async (apply = false, after = null) => {
    if (apply && !window.confirm('Áp dụng metadata và registry cho các hồ sơ đủ điều kiện trong trang đã xem trước?')) return;
    if (!beginOperation('metadata')) return;
    try {
      if (apply) {
        const outcome = await processRecords(metadataPreview.results.filter(row => row.eligible), applyStudentMetadata);
        setMetadataPreview({ results: outcome.failed.map(item => ({ ...item.record, reason: item.error.message, eligible: false })), after: metadataPreview.after });
        showNotification?.(`Đối soát: ${outcome.succeeded.length} hoàn tất; ${outcome.failed.length} cần xem lại.`, outcome.failed.length ? 'error' : 'success');
      } else setMetadataPreview(await previewStudentMetadata(after));
    } catch (error) { showNotification?.(error.message, 'error'); } finally { finishOperation(); }
  };
  const resumeJob = async (job, rollback = false, cancel = false) => {
    rollback = rollback || job.status === 'rollingBack';
    if (!beginOperation(`job-${job.id}`)) return;
    try {
      if (cancel) await cancelMaintenance(job.id);
      else if (job.kind === 'backup') {
        const saved = await captureServerSnapshot(snapshot?.schoolYear, () => {}, job.id);
        const exported = await postAppsScript({ action: 'createSystemBackup', snapshot: saved, reason: 'tiep-tuc', actor: 'Admin' });
        await completeBackupExport(job.id, exported.id); await loadBackups();
      } else if (job.status === 'complete') await retryMailboxRestore(job.id);
      else {
        if (['validating', 'validated'].includes(job.status)) {
          const preview = await continueRestorePreparation(job.id, { dryRun: true });
          if (!window.confirm(`Tiếp tục phục hồi: thêm ${preview.previewCreateCount || 0}, ghi lại ${preview.previewUpdateCount || 0}, xóa ${preview.previewDeleteCount || 0} hồ sơ ngoài bản lưu?`)) return;
        }
        if (['validating', 'validated', 'planning'].includes(job.status)) await continueRestorePreparation(job.id);
        const finished = await continueMaintenance(job.id, { rollback });
        if (finished.status === 'complete' && finished.mailboxStatus !== 'notIncluded') await retryMailboxRestore(job.id);
      }
      setJobs((await listMaintenanceJobs()).jobs);
      await loadSummary();
      showNotification?.(cancel ? 'Đã hủy công việc.' : rollback ? 'Đã hoàn tác.' : 'Đã hoàn tất công việc.');
    } catch (error) { showNotification?.(error.message, 'error'); } finally { finishOperation(); }
  };

  const loadBackups = useCallback(async () => {
    const request = Symbol(); loadRequests.current.backups = request; setLoading(state => ({ ...state, backups: true }));
    try {
      const response = await postAppsScript({ action: 'listSystemBackups', actor: 'Admin' });
      if (loadRequests.current.backups === request) setBackups(response.backups || []);
    } catch (error) {
      showNotification?.(`Chưa tải được danh sách sao lưu: ${error.message}`, 'error');
    } finally {
      if (loadRequests.current.backups === request) setLoading(state => ({ ...state, backups: false }));
    }
  }, [showNotification]);

  const loadLogs = useCallback(async () => {
    const request = Symbol(); loadRequests.current.logs = request; setLoading(state => ({ ...state, logs: true }));
    try {
      const response = await postAppsScript({ action: 'listAuditLogs', limit: 500, actor: 'Admin' });
      if (loadRequests.current.logs === request) setLogs(response.logs || []);
    } catch (error) {
      showNotification?.(`Chưa tải được nhật ký: ${error.message}`, 'error');
    } finally {
      if (loadRequests.current.logs === request) setLoading(state => ({ ...state, logs: false }));
    }
  }, [showNotification]);

  const loadMessages = useCallback(async () => {
    const request = Symbol(); loadRequests.current.messages = request; setLoading(state => ({ ...state, messages: true }));
    try {
      const response = await postAppsScript({ action: 'listAdminMailboxMessages', limit: 500, actor: 'Admin' });
      if (loadRequests.current.messages === request) setMessages(response.messages || []);
    } catch (error) {
      showNotification?.(`Chưa tải được thư đã gửi: ${error.message}`, 'error');
    } finally {
      if (loadRequests.current.messages === request) setLoading(state => ({ ...state, messages: false }));
    }
  }, [showNotification]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (tab === 'backup') { loadBackups(); loadSummary(); }
      if (tab === 'logs') loadLogs();
      if (tab === 'mail') loadMessages();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tab, loadBackups, loadLogs, loadMessages, loadSummary]);

  const createBackup = async (reason = 'thu-cong') => {
    if (!beginOperation('create-backup')) return;
    try {
      const freshSnapshot = await captureSnapshot();
      const exported = await postAppsScript({ action: 'createSystemBackup', snapshot: freshSnapshot, reason, actor: 'Admin' });
      if (freshSnapshot.maintenanceJobId) await completeBackupExport(freshSnapshot.maintenanceJobId, exported.id);
      showNotification?.('Đã tạo bản sao lưu trên Google Drive.');
      await loadBackups();
      await loadSummary();
    } catch (error) {
      showNotification?.(`Chưa sao lưu được: ${error.message}`, 'error');
    } finally {
      finishOperation();
    }
  };

  const restoreBackup = async (item) => {
    if (!window.confirm(`Phục hồi bản "${item.name}"? Hệ thống sẽ tự sao lưu dữ liệu hiện tại trước khi phục hồi.`)) return;
    if (!beginOperation(`restore-${item.id}`)) return;
    let restoredData = false;
    try {
      const response = await postAppsScript({ action: 'getSystemBackup', fileId: item.id, actor: 'Admin' });
      const backup = response.backup;
      const hasMailbox = validateMailboxBackup(backup);
      const hasData = Boolean(backup?.snapshot?.version === 3 || backup?.snapshot?.version && Object.keys(backup.snapshot.collections || {}).length);
      if (hasData) validateRestoreSnapshot(backup.snapshot);
      if (!hasData && !hasMailbox) throw new Error('Bản sao lưu không có dữ liệu phục hồi hợp lệ.');
      const freshSnapshot = await captureSnapshot();
      const exported = await postAppsScript({ action: 'createSystemBackup', snapshot: freshSnapshot, reason: 'truoc-phuc-hoi', actor: 'Admin' });
      if (freshSnapshot.maintenanceJobId) await completeBackupExport(freshSnapshot.maintenanceJobId, exported.id);
      if (hasData) { await onRestore(backup.snapshot, { mailboxRows: hasMailbox ? backup.mailboxRows : null }); restoredData = true; }
      if (hasMailbox && !(SERVER_SYSTEM_ENABLED && hasData)) await postAppsScript({ action: 'restoreMailboxFromBackup', mailboxRows: backup.mailboxRows, actor: 'Admin' });
      showNotification?.(hasData && hasMailbox ? 'Đã phục hồi dữ liệu và hộp thư.' : hasData ? 'Đã phục hồi dữ liệu; bản này không chứa hộp thư.' : 'Đã phục hồi hộp thư; dữ liệu khác được giữ nguyên.');
      await loadSummary();
    } catch (error) {
      showNotification?.(`${restoredData ? 'Dữ liệu chính đã phục hồi; hộp thư chưa hoàn tất.' : 'Phục hồi chưa hoàn tất.'} ${error.message}`, 'error');
    } finally {
      if (SERVER_SYSTEM_ENABLED) listMaintenanceJobs().then(value => setJobs(value.jobs)).catch(() => undefined);
      finishOperation();
    }
  };

  const deleteMessage = async (message) => {
    if (!window.confirm(`Xóa riêng thư "${message.title}"?`)) return;
    if (!beginOperation(`delete-${message.id}`)) return;
    try {
      const result = await postAppsScript({ action: 'deleteStudentMailboxMessage', messageId: message.id, actor: 'Admin' });
      showNotification?.(result.auditWarning || (result.alreadyDeleted ? 'Thư đã được xóa trước đó.' : 'Đã xóa thư.'), result.auditWarning ? 'error' : 'success');
      await loadMessages();
    } catch (error) {
      showNotification?.(`Chưa xóa được thư: ${error.message}`, 'error');
    } finally {
      finishOperation();
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
    if (!beginOperation(`resend-${message.id}`)) return;
    try {
      const result = await postAppsScript({ action: 'resendStudentMailboxMessage', messageId: message.id, unreadCodes, actor: 'Admin' });
      showNotification?.(result.auditWarning || (result.sentCount ? `Đã gửi lại cho ${result.sentCount} học sinh chưa đọc.` : 'Các học sinh đã đọc thư; không cần gửi lại.'), result.auditWarning ? 'error' : 'success');
      await loadMessages();
    } catch (error) {
      showNotification?.(`Chưa gửi lại được: ${error.message}`, 'error');
    } finally {
      finishOperation();
    }
  };

  return (
    <div className="fixed inset-x-0 top-[114px] bottom-0 z-[140] overflow-y-auto bg-slate-100 p-2 sm:top-[84px] sm:p-4">
      <div className="mx-auto max-w-7xl">
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <div>
            <h2 className="text-lg font-black uppercase text-slate-900">An toàn dữ liệu</h2>
            <p className="text-xs font-semibold text-slate-500">Sao lưu, phục hồi, nhật ký và thư đã gửi</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white disabled:opacity-50" title="Đóng"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto rounded-xl bg-white p-2">
          {[['backup', DatabaseBackup, 'Sao lưu'], ['logs', Clock3, 'Nhật ký'], ['mail', Mail, 'Thư đã gửi']].map(([key, Icon, label]) => (
            <button key={key} type="button" disabled={Boolean(busy)} onClick={() => setTab(key)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-xs font-black uppercase ${tab === key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}><Icon className="h-4 w-4" />{label}</button>
          ))}
        </div>

        {loading[tab === 'mail' ? 'messages' : tab === 'backup' ? 'backups' : 'logs'] && <p className="mb-3 text-sm text-slate-500">Đang tải danh sách...</p>}
        {tab === 'backup' && (
          <div className="space-y-3">
            {SERVER_SYSTEM_ENABLED && <MaterialMigrationPanel busy={busy} beginOperation={beginOperation} finishOperation={finishOperation} showNotification={showNotification} />}
            {SERVER_SYSTEM_ENABLED && <div className="rounded-xl bg-white p-3"><p className="font-bold">Đối soát định danh và phạm vi hồ sơ cũ</p><p className="text-sm text-slate-600">Xem 50 hồ sơ mỗi trang. Hồ sơ thiếu cơ sở hoặc có mã lịch sử khác cần đối chiếu riêng.</p><button disabled={Boolean(busy)} onClick={() => migrateMetadata()} className="mr-3 text-blue-700">Xem trước từ đầu</button><button disabled={Boolean(busy) || !metadataPreview?.after} onClick={() => migrateMetadata(false, metadataPreview.after)} className="mr-3 text-blue-700">Trang tiếp</button><button disabled={Boolean(busy) || !metadataPreview?.results.some(row => row.eligible)} onClick={() => migrateMetadata(true)} className="text-amber-700">Áp dụng trang đã đối chiếu</button>{metadataPreview?.results.map(row => <p key={row.id} className="text-sm">{row.fullName || row.id}: {row.eligible ? `${row.patch.studentKey} · ${row.patch.schoolYear} · ${row.patch.schoolCode} · khối ${row.patch.grade}` : row.reason}</p>)}</div>}
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{SERVER_SYSTEM_ENABLED ? 'Sao lưu gồm đề riêng, lượt làm và mảnh phân công. Phiên đăng nhập không được phục hồi.' : 'Chế độ sao lưu cũ chỉ gồm dữ liệu công khai; chưa bao gồm đề riêng và lượt làm trên máy chủ.'} Nội dung tệp Drive và Sheet tài khoản giáo viên cần sao lưu riêng.</p>
            <div className="rounded-xl bg-white p-3"><p className="font-bold">Kiểm tra quyền tài liệu đề cũ</p><p className="text-sm text-slate-600">Dán mã tệp Google Doc cần kiểm tra. Xem trước chỉ đọc quyền; thu hồi chuyển tài liệu vào thư mục riêng.</p><textarea value={docIds} onChange={event => { setDocIds(event.target.value); setDocAudit([]); }} className="mt-2 w-full rounded border p-2" placeholder="Mã tệp, cách nhau bằng dấu phẩy hoặc xuống dòng" /><button disabled={Boolean(busy) || !docIds.trim()} className="mr-3 text-blue-700" onClick={() => auditDocs(true)}>Xem trước quyền</button><button disabled={Boolean(busy) || !docAudit.some(row => row.success)} className="text-rose-700" onClick={() => auditDocs(false)}>Thu hồi các tệp đã kiểm tra</button>{docAudit.map(row => <p key={row.fileId} className="mt-1 text-sm">{row.filename || row.fileId}: {row.success ? row.revoked ? 'Đã chuyển riêng' : row.sharingBefore : row.error}</p>)}</div>
            {SERVER_SYSTEM_ENABLED && <div className="rounded-xl bg-white p-3"><p className="font-bold">Dọn bản phân công cũ</p><p className="text-sm text-slate-600">Giữ bản đang dùng, bản dưới 30 ngày và bản cũ chưa xác định được thời điểm.</p><button disabled={Boolean(busy)} onClick={() => maintainGenerations()} className="mr-3 text-blue-700">Xem trước</button><button disabled={Boolean(busy) || !generations?.generations.some(row => row.eligible)} onClick={() => maintainGenerations(true)} className="text-rose-700">Dọn các bản đủ điều kiện</button>{generations?.generations.map(row => <p key={row.id} className="text-sm">{row.id}: {row.active ? 'Đang dùng' : row.eligible ? 'Có thể dọn' : 'Giữ lại'}</p>)}</div>}
            {jobs.filter(job => !['complete', 'rolledBack', 'cancelled'].includes(job.status) || job.status === 'complete' && (job.kind === 'backup' && job.exportStatus === 'pending' || ['pending', 'running', 'failed'].includes(job.mailboxStatus))).map(job => <div key={job.id} className="rounded-xl bg-white p-3">
              <p>Công việc chưa hoàn tất: {job.id} · {job.status} · chặng {job.cursor || job.validateCursor || job.scanCursor || 0}/{job.planCount || job.chunkCount || '?'} · hộp thư: {job.mailboxStatus || 'Không kèm'}</p>
              {job.status !== 'uploading' && <button disabled={Boolean(busy)} className="mr-3 text-blue-700" onClick={() => resumeJob(job)}>{job.kind === 'backup' ? 'Tiếp tục và lưu lên Drive' : job.status === 'complete' ? 'Thử lại hộp thư' : 'Tiếp tục'}</button>}
              {(job.kind === 'backup' || ['uploading', 'validating', 'validated', 'planning'].includes(job.status)) && <button disabled={Boolean(busy)} className="mr-3 text-amber-700" onClick={() => resumeJob(job, false, true)}>Hủy và mở khóa</button>}
              {['restoring', 'rollingBack'].includes(job.status) && <button disabled={Boolean(busy)} className="text-amber-700" onClick={() => resumeJob(job, true)}>Hoàn tác phần đã ghi</button>}
              {job.status === 'uploading' && <p className="text-sm text-slate-600">Chưa tải đủ bản lưu. Hủy rồi chọn lại tệp để tiếp tục.</p>}
            </div>)}

            <div className="rounded-2xl border border-blue-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-bold text-slate-600">
                  {summary ? <>Dữ liệu lúc {formatDateTime(summary.readAt)}: {summary.counts.students} hồ sơ học sinh, {summary.counts.scorebooks} sổ điểm, {summary.counts.class_attendance} bảng điểm danh.</> : loading.summary ? 'Đang lấy thống kê dữ liệu...' : 'Chưa lấy được thống kê dữ liệu.'}
                  <button type="button" onClick={loadSummary} disabled={Boolean(busy) || loading.summary} className="ml-3 text-blue-700 disabled:opacity-50">{loading.summary ? 'Đang làm mới...' : 'Làm mới thống kê'}</button>
                </div>
                <button type="button" onClick={() => createBackup()} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase text-white disabled:opacity-50">{busy === 'create-backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Sao lưu ngay</button>
              </div>
              <p className="mt-3 text-xs text-slate-600">Bản lưu gồm dữ liệu ứng dụng và hộp thư, chỉ giữ đường dẫn đến tệp Drive. Cần sao lưu riêng nội dung tệp, bảng đăng ký và bảng tài khoản giáo viên.</p>
              {!SERVER_SYSTEM_ENABLED && <p className="mt-1 text-xs text-amber-700">Chế độ sao lưu hiện tại đọc lần lượt từng nhóm dữ liệu, không bao gồm đề và lượt làm riêng trên máy chủ.</p>}
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
