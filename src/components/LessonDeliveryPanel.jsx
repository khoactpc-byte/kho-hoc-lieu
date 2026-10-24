import { useRef, useState } from 'react';
import { ADMIN_SERVER_SESSION_STORAGE_KEY } from '../config/sessionKeys.js';
import { LESSON_DELIVERY_ENABLED, retryLessonDelivery } from '../services/lessonDelivery.js';

export default function LessonDeliveryPanel({ admin = false, delivery, compact = false }) {
  const [report, setReportState] = useState(() => { try {
    const saved = JSON.parse(window.localStorage.getItem('khl-lesson-transfer-report-v1') || 'null');
    return saved && ['processed', 'synced', 'failed'].every(key => Number.isSafeInteger(saved[key]) && saved[key] >= 0)
      && Array.isArray(saved.failures) && typeof saved.cursor === 'string' ? saved : null;
  } catch { return null; } }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const setReport = value => setReportState(previous => { const next = typeof value === 'function' ? value(previous) : value;
    try { window.localStorage.setItem('khl-lesson-transfer-report-v1', JSON.stringify(next)); } catch { /* The visible report remains available. */ }
    return next;
  });
  const stopping = useRef(false);
  if (!LESSON_DELIVERY_ENABLED) return null;
  const state = delivery?.state || {};
  const message = state.syncing ? 'Đang cập nhật bản học sinh…' : ({ synced: state.published === false ? 'Đã gỡ bản đọc học sinh' : 'Bản học sinh đã cập nhật',
    pending: 'Bài gốc đã lưu · bản học sinh đang chờ cập nhật', error: 'Bài gốc đã lưu · cập nhật bản học sinh chưa thành công', stale: 'Cần đối chiếu phiên bản bài học' }[state.status]);
  const backfill = async () => {
    setBusy(true); stopping.current = false; setError('');
    let summary = report && !report.done ? report : { processed: 0, synced: 0, failed: 0, failures: [], cursor: '', done: false };
    setReport(summary);
    try {
      do {
        const adminSessionToken = window.sessionStorage.getItem(ADMIN_SERVER_SESSION_STORAGE_KEY);
        if (!adminSessionToken) throw new Error('Đăng nhập quản trị để đồng bộ bài cũ.');
        const response = await fetch('/.netlify/functions/lesson-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'backfill', cursor: summary.cursor, limit: 5, adminSessionToken }), signal: AbortSignal.timeout(60000) });
        let result; try { result = await response.json(); } catch { throw new Error('Kết nối bị gián đoạn. Bấm Tiếp tục để chạy từ nhóm cuối; các bài đã chuyển được giữ nguyên.'); }
        if (!response.ok) throw new Error(result.error || 'Chưa đồng bộ được. Có thể chạy lại; bài đã chuyển không bị tạo trùng.');
        summary = { processed: summary.processed + result.processed, synced: summary.synced + result.synced,
          failed: summary.failed + result.failed, failures: [...summary.failures, ...result.failures], cursor: result.nextCursor, done: result.done };
        setReport(summary);
        if (!result.done && !result.processed) throw new Error('Máy chủ chưa xử lý tiếp được. Có thể chạy lại sau.');
      } while (!summary.done && !stopping.current);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  if (compact && !message) return null;
  return <section data-state={state.status} title={message || undefined} className={`lesson-delivery-panel${compact ? ' is-inline' : ''} mx-3 my-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-sm`} aria-label="Đồng bộ bản học sinh">
    {message && <div className="flex flex-wrap items-center gap-2" role="status" aria-label={message} title={message}><span>{compact && state.status === 'synced' && !state.syncing && state.published !== false ? '✓ Đã cập nhật' : message}</span>
      {['pending', 'error', 'stale'].includes(state.status) && !state.syncing && <button type="button" title="Thử lại đồng bộ bài học" aria-label="Thử lại đồng bộ bài học" onClick={() => void delivery.retry()} className="rounded border border-blue-300 bg-white px-3 py-1 text-blue-700">{compact ? '↻' : 'Thử lại'}</button>}</div>}
    {admin && <details className="mt-1"><summary className="cursor-pointer font-semibold">Chuyển các bài cũ sang bản đọc học sinh</summary>
      <p className="my-2">Đồng bộ từng nhóm nhỏ; giữ bài gốc và tách đáp án giáo viên. Chạy lại không tạo bài trùng.</p>
      <button type="button" onClick={() => void backfill()} disabled={busy} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Đang đồng bộ…' : report && !report.done ? 'Tiếp tục đồng bộ bài cũ' : 'Đồng bộ các bài cũ'}</button>
      {busy && <button type="button" onClick={() => { stopping.current = true; }} className="ml-2 rounded border bg-white px-3 py-2">Dừng sau nhóm này</button>}
      {report && <p role="status" className="my-2">Đã kiểm tra {report.processed} bài · Thành công {report.synced} · Cần xử lý {report.failed}{report.done ? ' · Đã duyệt hết danh sách.' : ''}</p>}
      {report && <button type="button" className="my-1 underline text-blue-700" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'bao-cao-dong-bo-bai-hoc.json'; link.click(); URL.revokeObjectURL(url);
      }}>Tải báo cáo đồng bộ</button>}
      {error && <p role="alert" className="my-2 text-orange-700">{error}</p>}
      {!!report?.failures.length && <ul className="max-h-56 overflow-auto">{report.failures.map(item => <li key={item.noteId} className="my-1">{item.noteId}: {item.error} <button type="button" onClick={async () => {
        const result = await retryLessonDelivery(item.noteId);
        if (result.status === 'synced') setReport(previous => ({ ...previous, synced: previous.synced + 1, failed: Math.max(0, previous.failed - 1), failures: previous.failures.filter(row => row.noteId !== item.noteId) }));
        setError(result.status === 'synced' ? `Đã đồng bộ lại ${item.noteId}.` : `Chưa đồng bộ được ${item.noteId}.`);
      }} className="underline text-blue-700">Thử lại bài này</button></li>)}</ul>}
    </details>}
  </section>;
}
