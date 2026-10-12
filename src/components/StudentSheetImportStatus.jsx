export default function StudentSheetImportStatus({ status, onClose }) {
  if (!status) return null;
  const running = ['reading', 'updating'].includes(status.phase);
  return <section aria-label="Kết quả cập nhật từ Sheet" role="status" aria-live="polite" className="rounded border border-slate-200 bg-white px-3 py-2 text-xs font-normal text-slate-700">
    <div className="flex items-center justify-between gap-3">
      <span>{status.phase === 'reading' ? 'Đang đọc hồ sơ từ Sheet…' : status.phase === 'updating' ? `Đang xử lý ${status.completed}/${status.total} hồ sơ…`
        : status.phase === 'error' ? 'Cập nhật chưa hoàn tất' : 'Đã cập nhật xong từ Sheet'}</span>
      {!running && <button type="button" onClick={onClose} aria-label="Đóng kết quả cập nhật">Đóng</button>}
    </div>
    {status.phase !== 'reading' && <p className="mt-1 text-slate-500">Đã sửa {status.updated} · Không đổi {status.unchanged} · Bỏ qua {status.skipped} · Lỗi {status.failed} · Giữ lớp khác Sheet {status.classConflicts}</p>}
    {status.phase === 'updating' && <progress aria-label="Tiến độ cập nhật từ Sheet" max={status.total || 1} value={status.completed} className="mt-1 h-1.5 w-full" />}
    {status.message && <p className="mt-1 text-rose-700">{status.message}</p>}
    {status.errors?.length > 0 && <details className="mt-1"><summary>Xem hồ sơ lỗi / lớp cần đối chiếu ({status.errors.length})</summary><ul className="mt-1 list-inside list-disc">{status.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></details>}
  </section>;
}
