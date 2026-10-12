import { useState } from 'react';

export default function StudentYearReconciliation({ rows, schoolYear, busy, progress, onRestore, onApprove, onPriorRoster, onClose }) {
  const [priorRoster, setPriorRoster] = useState('');
  const restores = rows.filter(row => row.action === 'restore');
  const reviews = rows.filter(row => row.action === 'review');
  return <div className="fixed inset-0 z-[185] flex items-center justify-center bg-slate-950/40 p-3">
    <section role="dialog" aria-modal="true" aria-label="Đối chiếu lớp theo kết quả năm trước" className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded border border-slate-200 bg-white text-sm font-normal text-slate-700 shadow-xl">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div><h2>Đối chiếu lớp năm {schoolYear}</h2><p className="mt-1 text-xs text-slate-500">Giữ lớp và năm nhập học. Xét lớp hiện tại theo sổ điểm đúng năm, đúng cơ sở; thiếu điểm thì chờ đối chiếu.</p></div>
        <button type="button" disabled={busy} onClick={onClose} className="rounded border px-3 py-1.5">Đóng đối chiếu</button>
      </header>
      <div className="min-h-0 overflow-auto p-3">
        <table aria-label="Đối chiếu lớp năm học" className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-100"><tr>{['Mã / Học sinh', 'Lớp năm trước', 'Điểm cả năm', 'Lớp hiện tại', 'Lớp đối chiếu', 'Căn cứ / Trạng thái'].map(label => <th key={label} className="border p-2 text-left font-normal">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.student.id} data-action={row.action} className="odd:bg-white even:bg-slate-50">
            <td className="border p-2">{row.student.accessCode}<br />{row.student.fullName}</td>
            <td className="border p-2 text-center">{row.sourceClass || '—'}</td>
            <td className="border p-2 text-center">{row.academicResult || '—'}<span className="block text-slate-500">{row.completedCount}/{row.requiredCount} môn trong sổ</span></td>
            <td className="border p-2 text-center">{row.currentClass}</td>
            <td className="border p-2 text-center">{row.proposedClass || '—'}</td>
            <td className="border p-2">{row.reason}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <footer className="border-t p-3">
        <details className="mb-3 text-xs">
          <summary>Khôi phục từ bản danh sách trước cập nhật</summary>
          <p className="my-2 text-slate-500">Dùng khi có bản lớp đã lưu trước lúc đồng bộ sai. Mỗi dòng: mã học sinh, lớp đang sai, lớp trước cập nhật. Ví dụ: HS25601,6A,7A.</p>
          <textarea aria-label="Bản danh sách lớp trước cập nhật" value={priorRoster} onChange={event => setPriorRoster(event.target.value)} disabled={busy} rows={3} className="w-full rounded border p-2" />
          <button type="button" disabled={busy || !priorRoster.trim()} onClick={() => onPriorRoster(priorRoster)} className="mt-1 rounded border px-3 py-1.5">Đối chiếu bản đã lưu</button>
        </details>
        {progress && <p role="status" className="mb-2 text-xs">{progress}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || !restores.length} onClick={() => onRestore(restores)} className="rounded border border-sky-700 bg-sky-700 px-3 py-2 text-white disabled:opacity-40">Khôi phục lớp đã lưu ({restores.length})</button>
          <button type="button" disabled={busy || !reviews.length} onClick={() => onApprove(reviews)} className="rounded border px-3 py-2 disabled:opacity-40">Duyệt lớp theo đủ điểm cả năm ({reviews.length})</button>
          <span className="text-xs text-slate-500">{rows.filter(row => row.action === 'blocked').length} hồ sơ cần đối chiếu thêm. Đang xem toàn bộ năm, gồm cả hồ sơ ngoài bộ lọc.</span>
        </div>
      </footer>
    </section>
  </div>;
}
