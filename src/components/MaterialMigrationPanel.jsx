import { useState } from 'react';
import { previewMaterials, applyMaterial } from '../services/serverSystemClient';
import { processRecords } from '../utils/bulkOperations';

export default function MaterialMigrationPanel({ busy, beginOperation, finishOperation, showNotification }) {
  const [preview, setPreview] = useState(null), [selected, setSelected] = useState([]);
  const load = async after => {
    if (!beginOperation('material-preview')) return;
    try { setPreview(await previewMaterials(after)); setSelected([]); }
    catch (error) { showNotification?.(error.message, 'error'); } finally { finishOperation(); }
  };
  const apply = async () => {
    if (!selected.length || !window.confirm('Xác nhận đã mở các tài liệu được chọn và kiểm tra đây là bản dành cho học sinh, không có đáp án riêng?')) return;
    if (!beginOperation('material-migration')) return;
    try {
      const outcome = await processRecords(preview.results.filter(row => selected.includes(row.id)), applyMaterial);
      setPreview({ ...preview, results: preview.results.map(row => outcome.succeeded.some(item => item.record.id === row.id) ? { ...row, changed: false } : row) });
      setSelected([]); showNotification?.(`Tài liệu: ${outcome.succeeded.length} hoàn tất, ${outcome.failed.length} cần xem lại.`, outcome.failed.length ? 'error' : 'success');
    } catch (error) { showNotification?.(error.message, 'error'); } finally { finishOperation(); }
  };
  return <div className="rounded-xl bg-white p-3">
    <p className="font-bold">Đối soát tài liệu học sinh cũ</p>
    <p className="text-sm text-slate-600">Mở tài liệu và kiểm tra nội dung trước khi chọn. Đề có đáp án riêng cần chuyển bằng công cụ đề máy chủ.</p>
    <button disabled={Boolean(busy)} className="mr-3 text-blue-700" onClick={() => load(null)}>Xem từ đầu</button>
    <button disabled={Boolean(busy) || !preview?.after} className="mr-3 text-blue-700" onClick={() => load(preview.after)}>Trang tiếp</button>
    <button disabled={Boolean(busy) || !selected.length} className="text-amber-700" onClick={apply}>Cho học sinh đọc bản đã kiểm tra</button>
    {preview?.results.map(row => <div key={row.id} className="mt-2 flex items-start gap-2 text-sm">
      <input type="checkbox" aria-label={`Đã kiểm tra ${row.title}`} disabled={Boolean(busy) || !row.eligible || !row.changed} checked={selected.includes(row.id)}
        onChange={event => setSelected(values => event.target.checked ? [...values, row.id] : values.filter(id => id !== row.id))} />
      <span>{row.title} · {row.reason || (row.changed ? 'Chờ đối soát' : 'Đã cho học sinh đọc')} {row.url && <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Mở tài liệu</a>}</span>
    </div>)}
  </div>;
}
