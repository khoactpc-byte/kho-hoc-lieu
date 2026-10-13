import { useMemo, useState } from 'react';

const statusLabel = student => student.status === 'dropped' ? 'Bỏ học' : student.status === 'completed' ? 'TNTHCS' : 'Đang học';
const sourceLabel = source => source === 'web' ? 'Web' : 'Sheet';
const actionLabel = { create: 'Thiếu trên web', class: 'Khác lớp', matched: 'Đã khớp', ambiguous: 'Nghi trùng', blocked: 'Cần bổ sung', saved: 'Đã cập nhật', failed: 'Lỗi cập nhật' };

export default function StudentSheetReconciliation({ report, webStudents, busy, onApply, onClose, onView, onSelectWeb }) {
  const [filter, setFilter] = useState('issues');
  const [classFilter, setClassFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const rows = useMemo(() => report.rows || [], [report.rows]);
  const classes = useMemo(() => [...new Set([...rows.map(row => row.student.className || 'Chưa xếp lớp'),
    ...webStudents.map(student => student.className || 'Chưa xếp lớp')])].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })), [rows, webStudents]);
  const visible = rows.filter(row => (!classFilter || (row.student.className || 'Chưa xếp lớp') === classFilter)
    && (filter === 'all' || filter === 'issues' && row.action !== 'matched' || filter === row.action));
  const selectedRows = rows.filter(row => selected.has(row.key) && ['create', 'class'].includes(row.action));
  const selectable = visible.filter(row => ['create', 'class'].includes(row.action));
  const toggle = key => setSelected(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/40 p-2 sm:p-4">
    <section role="dialog" aria-modal="true" aria-label={report.mode === 'duplicates' ? 'Hồ sơ nghi trùng' : 'Đối chiếu học sinh với Sheet'} className="flex max-h-[94vh] w-full max-w-7xl flex-col rounded-lg border border-slate-200 bg-white text-sm font-normal text-slate-700 shadow-xl">
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div><h2>{report.mode === 'duplicates' ? 'Hồ sơ nghi trùng' : 'Đối chiếu học sinh với Sheet'} · {report.schoolYear}</h2>
          <p className="mt-1 text-xs text-slate-500">Lớp Sheet lấy theo cột năm đang xem. Hồ sơ nghi trùng được liệt kê để bạn kiểm tra; cùng một học sinh ở các năm khác nhau không tính là trùng.</p></div>
        <button type="button" disabled={busy} onClick={onClose} className="rounded border px-3 py-1.5 disabled:opacity-40">Đóng đối chiếu Sheet</button>
      </header>
      <div className="min-h-0 space-y-4 overflow-auto p-3">
        {report.loading && <p role="status">Đang đọc và đối chiếu danh sách Sheet…</p>}
        {report.error && <p role="alert" className="text-rose-700">{report.error}</p>}
        {report.mode !== 'duplicates' && !report.loading && <>
          <div className="overflow-auto"><table aria-label="Số học sinh theo lớp trên Sheet và web" className="border-collapse text-xs">
            <thead className="bg-slate-100"><tr>{['Lớp', 'Dòng Sheet', 'Hồ sơ web', 'Thiếu trên web', 'Khác lớp', 'Nghi trùng'].map(label => <th key={label} className="border px-3 py-2 font-normal">{label}</th>)}</tr></thead>
            <tbody>{classes.map(name => { const classRows = rows.filter(row => (row.student.className || 'Chưa xếp lớp') === name); return <tr key={name}>
              <td className="border px-3 py-1.5"><button type="button" onClick={() => { setClassFilter(name); setFilter('all'); }} className="text-sky-700">{name}</button></td>
              {[classRows.length, webStudents.filter(student => (student.className || 'Chưa xếp lớp') === name).length,
                classRows.filter(row => row.action === 'create').length, classRows.filter(row => row.action === 'class').length,
                classRows.filter(row => row.action === 'ambiguous').length].map((count, index) => <td key={index} className="border px-3 py-1.5 text-center">{count}</td>)}
            </tr>; })}</tbody>
          </table></div>
          <p className="text-xs text-slate-500">Số dòng Sheet có thể gồm dòng trùng. Bỏ học được tính ở Chưa xếp lớp. Chênh lệch được giải thích theo từng dòng bên dưới.</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label>Hiện <select aria-label="Loại đối chiếu Sheet" value={filter} onChange={event => setFilter(event.target.value)} className="ml-1 rounded border bg-white px-2 py-1.5">
              {[['issues', 'Cần xử lý'], ['all', 'Tất cả'], ['create', 'Thiếu trên web'], ['class', 'Khác lớp'], ['ambiguous', 'Nghi trùng'], ['blocked', 'Cần bổ sung'], ['matched', 'Đã khớp']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Lớp <select aria-label="Lớp đối chiếu Sheet" value={classFilter} onChange={event => setClassFilter(event.target.value)} className="ml-1 rounded border bg-white px-2 py-1.5"><option value="">Tất cả</option>{classes.map(name => <option key={name}>{name}</option>)}</select></label>
          </div>
          <div className="overflow-auto"><table aria-label="Hồ sơ Sheet cần đối chiếu" className="w-full border-collapse text-xs">
            <thead className="bg-slate-100"><tr><th className="border p-2"><input type="checkbox" aria-label="Chọn các hồ sơ Sheet đang hiện đủ điều kiện" disabled={busy || !selectable.length}
              checked={selectable.length > 0 && selectable.every(row => selected.has(row.key))} onChange={event => { const checked = event.target.checked; setSelected(previous => { const next = new Set(previous); selectable.forEach(row => { if (checked) next.add(row.key); else next.delete(row.key); }); return next; }); }} /></th>
              {['Dòng Sheet', 'Họ và tên', 'Ngày sinh', 'Mã HS / định danh', 'Lớp Sheet', 'Lớp web', 'Kết quả đối chiếu'].map(label => <th key={label} className="border p-2 font-normal">{label}</th>)}</tr></thead>
            <tbody>{visible.map(row => <tr key={row.key} className="even:bg-slate-50"><td className="border p-2 text-center"><input type="checkbox" aria-label={`Chọn dòng Sheet ${row.rowNumber || row.key}`} checked={selected.has(row.key)} disabled={busy || !['create', 'class'].includes(row.action)} onChange={() => toggle(row.key)} /></td>
              <td className="border p-2 text-center">{row.rowNumber || '—'}</td><td className="border p-2">{row.student.fullName}</td><td className="whitespace-nowrap border p-2 text-center">{row.student.birthDate}</td>
              <td className="border p-2 text-center">{row.student.accessCode || 'Chưa có mã'}<br />{row.student.identityCode || '—'}</td><td className="border p-2 text-center">{row.student.className || '—'}</td><td className="border p-2 text-center">{row.existing?.className || '—'}</td>
              <td className="border p-2"><span className={['ambiguous', 'failed'].includes(row.action) ? 'text-rose-700' : 'text-sky-700'}>{actionLabel[row.action]}</span><p className="mt-1 text-slate-500">{row.reason}</p>
                {row.matches?.map(student => <button key={student.id} type="button" disabled={busy} onClick={() => onView(student)} className="mr-2 mt-1 text-sky-700 disabled:opacity-40">Xem {student.fullName} · {student.accessCode || student.id} · {student.schoolYear}</button>)}</td>
            </tr>)}</tbody></table>{!visible.length && <p className="py-3 text-xs text-slate-500">Không có hồ sơ thuộc bộ lọc này.</p>}</div>
          {report.webOnly?.length > 0 && <details><summary className="text-xs">Có trên web nhưng chưa khớp dòng Sheet ({report.webOnly.length})</summary><ul className="mt-2 space-y-1 text-xs">{report.webOnly.map(student => <li key={student.id}><button type="button" disabled={busy} onClick={() => onView(student)} className="text-sky-700 disabled:opacity-40">{student.fullName} · {student.birthDate} · {student.accessCode} · {student.className || statusLabel(student)}</button></li>)}</ul></details>}
        </>}
        <section aria-label="Danh sách hồ sơ nghi trùng">
          <h3>Hồ sơ nghi trùng ({report.duplicateGroups?.length || 0} nhóm)</h3>
          <p className="mt-1 text-xs text-slate-500">Đối chiếu từng mã và ngày sinh trước khi xóa. Mỗi nguồn được kiểm tra riêng; một dòng Sheet khớp một hồ sơ web là bình thường.</p>
          {report.duplicateGroups?.map(group => <div key={group.id} className="mt-3 overflow-auto rounded border border-amber-200">
            <div className="bg-amber-50 px-3 py-2 text-xs">{sourceLabel(group.source)} · {group.reasons.join(' / ')}</div>
            <table className="w-full border-collapse text-xs"><thead className="bg-slate-50"><tr>{['Dòng / Hồ sơ', 'Họ và tên', 'Ngày sinh', 'Mã học sinh', 'Mã định danh', 'Lớp', 'Cơ sở', 'Trạng thái'].map(label => <th key={label} className="border p-2 font-normal">{label}</th>)}</tr></thead>
              <tbody>{group.records.map((student, index) => <tr key={`${student.id || student.rowNumber}:${index}`}><td className="border p-2">{group.source === 'web' ? <><button type="button" disabled={busy} onClick={() => onView(student)} className="text-sky-700 disabled:opacity-40">Xem hồ sơ</button><br /><button type="button" disabled={busy} onClick={() => onSelectWeb([student])} className="mt-1 text-sky-700">Chọn trên danh sách</button><span className="mt-1 block max-w-44 break-all text-slate-400">{student.id}</span></> : `Sheet: ${student.rowNumber || '—'}`}</td>
                <td className="border p-2">{student.fullName}</td><td className="border p-2 text-center">{student.birthDate}</td><td className="border p-2 text-center">{student.accessCode || '—'}</td><td className="border p-2 text-center">{student.identityCode || '—'}</td><td className="border p-2 text-center">{student.className || '—'}</td><td className="border p-2">{student.schoolName || student.schoolCode || '—'}</td><td className="border p-2 text-center">{statusLabel(student)}</td></tr>)}</tbody>
            </table>
          </div>)}
          {!report.duplicateGroups?.length && !report.loading && <p className="mt-2 text-xs text-slate-500">Chưa phát hiện hồ sơ nghi trùng trong dữ liệu đã đọc.</p>}
        </section>
      </div>
      <footer className="border-t px-4 py-3"><p role="status" className="mb-2 text-xs">{report.progress}</p>
        {report.mode !== 'duplicates' && <button type="button" disabled={busy || !selectedRows.length} onClick={() => onApply(selectedRows)} className="rounded border border-sky-700 bg-sky-700 px-3 py-2 text-xs text-white disabled:opacity-40">Áp dụng các hồ sơ đã chọn ({selectedRows.length})</button>}
      </footer>
    </section>
  </div>;
}
