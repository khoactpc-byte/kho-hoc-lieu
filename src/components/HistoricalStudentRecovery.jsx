import { useMemo, useRef, useState } from 'react';
import { buildHistoricalStudentPlan } from '../utils/historicalStudents';
import { createHistoricalStudentRecord } from '../services/historicalStudentRecovery';
import { processRecords } from '../utils/bulkOperations';
import { downloadHistoricalRecoveryReport } from '../utils/historicalRecoveryReport';
import { belongsToEducationLevel } from '../utils/educationLevels';

export default function HistoricalStudentRecovery({ students, schoolYear, educationLevel = '', actor, busy, onBusyChange, onSync, onView, onExport = downloadHistoricalRecoveryReport }) {
  const rows = useMemo(() => buildHistoricalStudentPlan(students, schoolYear).filter(row => belongsToEducationLevel(row.source, educationLevel)), [students, schoolYear, educationLevel]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState('');
  const [issues, setIssues] = useState([]);
  const lock = useRef(false);
  const ready = rows.filter(row => row.status === 'ready');
  const chosen = ready.filter(row => selected.has(row.source.id));
  const selectedRows = rows.filter(row => selected.has(row.source.id));
  const unresolved = [...new Map([...rows.filter(row => row.status !== 'ready'), ...issues].map(row => [row.source.id, row])).values()];
  const reportRows = selectedRows.length ? selectedRows.map(row => issues.find(issue => issue.source.id === row.source.id) || row) : unresolved;
  const selectRows = values => setSelected(new Set(values.map(row => row.source.id)));
  const apply = async () => {
    if (busy || lock.current || !chosen.length) return;
    lock.current = true; onBusyChange(true);
    let syncFailures = 0;
    const syncIssues = [];
    try {
      const result = await processRecords(chosen, async row => {
        const saved = await createHistoricalStudentRecord(row, { actor });
        try { await onSync(saved); } catch (error) {
          syncFailures++;
          syncIssues.push({ ...row, status: 'sync_failed', reason: error.message || 'Đồng bộ chưa hoàn tất.',
            details: ['Hồ sơ đã lưu trên Web.'], nextStep: 'Kiểm tra lỗi đồng bộ; không cần tạo lại hồ sơ.' });
        }
        return saved;
      }, progress => setMessage(`Đã xử lý ${progress.completed}/${progress.total} hồ sơ…`));
      setSelected(previous => new Set([...previous].filter(id => !result.succeeded.some(item => item.record.source.id === id))));
      setIssues(previous => [...previous.filter(issue => !chosen.some(row => row.source.id === issue.source.id)),
        ...result.failed.map(({ record, error }) => ({ ...record, status: 'save_failed', reason: error.message,
          details: record.details || [], nextStep: 'Mở hồ sơ nguồn, kiểm tra thay đổi và thử lại sau khi đối chiếu.' })), ...syncIssues]);
      setMessage(`Đã lưu ${result.succeeded.length} hồ sơ năm ${schoolYear}.${syncFailures ? ` ${syncFailures} hồ sơ chờ đồng bộ Sheet, có thể thử lại trong mục Đồng bộ.` : ''}${result.failed.length ? ` ${result.failed.length} hồ sơ chưa lưu: ${result.failed[0].error.message}` : ''}`);
    } catch (error) { setMessage(error.message); }
    finally { lock.current = false; onBusyChange(false); }
  };
  if (!rows.length && !message && !issues.length) return null;
  return <section className="shrink-0 border-b border-blue-200 bg-blue-50 px-3 py-2 text-sm" aria-label="Bổ sung hồ sơ năm cũ">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span>{ready.length} hồ sơ có thể bổ sung cho {schoolYear}{rows.length > ready.length ? ` · ${rows.length - ready.length} cần đối chiếu` : ''}.</span>
      <button type="button" disabled={busy} className="rounded border border-blue-300 bg-white px-3 py-1.5 text-blue-800 disabled:opacity-50"
        aria-expanded={open} onClick={() => { setOpen(!open); if (!open) setSelected(new Set(ready.map(row => row.source.id))); }}>Bổ sung hồ sơ năm cũ</button>
    </div>
    {open && <div className="mt-2 space-y-2">
      <p className="text-xs text-slate-600">Kiểm tra lớp trước khi lưu. Hồ sơ năm cũ lưu riêng trên Web, giữ mã học sinh và dùng sổ điểm đúng năm. Lớp tính ngược giữ ký hiệu lớp đã biết, cần đối chiếu nếu từng đổi lớp.</p>
      <p className="text-xs text-slate-600">Có thể chọn hồ sơ cần đối chiếu để lập báo cáo. Chỉ hồ sơ đủ căn cứ mới được lưu tự động.</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2"><input type="checkbox" disabled={busy || !rows.length} checked={rows.length > 0 && selectedRows.length === rows.length}
          onChange={event => selectRows(event.target.checked ? rows : [])} /> Chọn tất cả hồ sơ</label>
        <button type="button" disabled={busy || !ready.length} className="text-blue-700 underline disabled:opacity-50" onClick={() => selectRows(ready)}>Chọn đủ căn cứ</button>
        <button type="button" disabled={busy || rows.length === ready.length} className="text-amber-800 underline disabled:opacity-50" onClick={() => selectRows(rows.filter(row => row.status !== 'ready'))}>Chọn cần đối chiếu</button>
        <button type="button" disabled={busy || !selectedRows.length} className="text-slate-600 underline disabled:opacity-50" onClick={() => selectRows([])}>Bỏ chọn</button>
      </div>
      <div className="max-h-64 overflow-y-auto rounded border border-slate-200 bg-white">
        {rows.map(row => <article data-historical-review key={row.source.id} className="flex items-start gap-2 border-b border-slate-100 px-2 py-2 last:border-0">
          <input type="checkbox" aria-label={`Chọn đối chiếu ${row.source.fullName}`} className="mt-1" disabled={busy} checked={selected.has(row.source.id)}
            onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(row.source.id); else next.delete(row.source.id); return next; })} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" aria-label={`Xem hồ sơ nguồn ${row.source.fullName}`} disabled={busy || !onView} onClick={() => onView(row.source)} className="text-left text-blue-800 underline decoration-blue-200 underline-offset-2">{row.source.fullName} · {row.source.accessCode}{row.className && ` → ${row.className}`}</button>
              <button type="button" disabled={busy || !onView} onClick={() => onView(row.source)} className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs text-blue-700">Xem hồ sơ</button>
            </div>
            <p className="text-xs text-slate-500">Nguồn {row.source.schoolYear} · lớp {row.source.className || row.source.dropoutPreviousClassName || 'chưa có'} · nhập học {row.source.enrollmentYear || 'chưa có'} · khối {row.source.entryGrade || 'chưa có'}</p>
            <p className={`text-xs ${row.status === 'ready' ? 'text-slate-500' : 'text-amber-800'}`}>{row.reason}</p>
            {row.details?.length > 0 && <details className="text-xs text-slate-600"><summary className="cursor-pointer">Căn cứ đối chiếu</summary>
              <ul className="ml-4 list-disc">{row.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>
              <p className="mt-1">{row.nextStep}</p>
            </details>}
          </div>
        </article>)}
      </div>
      <p className="text-xs text-slate-600">Đã chọn {selectedRows.length} hồ sơ: {chosen.length} có thể lưu, {selectedRows.length - chosen.length} cần đối chiếu.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !chosen.length} onClick={apply} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Đang bổ sung…' : `Lưu ${chosen.length} hồ sơ vào ${schoolYear}`}</button>
        <button type="button" disabled={busy || !reportRows.length} onClick={() => onExport(reportRows, schoolYear)} className="rounded border border-amber-300 bg-white px-3 py-2 text-amber-900">{selectedRows.length ? `Tải báo cáo đã chọn (${reportRows.length})` : `Tải báo cáo chưa bổ sung (${reportRows.length})`}</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded border bg-white px-3 py-2">Đóng</button>
      </div>
    </div>}
    {message && <p role="status" className="mt-2 text-xs text-slate-700">{message}</p>}
    {issues.length > 0 && <div role="alert" className="mt-2 space-y-1 text-xs text-amber-900">
      {issues.map(issue => <p key={issue.source.id}><button type="button" disabled={busy || !onView} onClick={() => onView(issue.source)} className="underline">{issue.source.fullName} · {issue.source.accessCode}</button>: {issue.reason}</p>)}
      {!open && <button type="button" onClick={() => onExport(unresolved, schoolYear)} className="underline">Tải báo cáo chưa bổ sung ({unresolved.length})</button>}
    </div>}
  </section>;
}
