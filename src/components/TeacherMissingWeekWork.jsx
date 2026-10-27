import { useState } from 'react';
export default function TeacherMissingWeekWork({ rows, weeks, alwaysVisible = false }) {
  const [filter, setFilter] = useState('missing');
  const [copyMessage, setCopyMessage] = useState('');
  const visible = rows.filter(r => filter === 'all' || (filter === 'none' ? r.submitted === 0 : r.missing.length > 0));
  const download = () => {
    const cell = v => { const value = String(v || ''); return `"${(/^\s*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`; };
    const lines = [['Học sinh', 'Mã HS', 'Lớp', 'Trạng thái', 'Bài còn thiếu'], ...visible.map(r => [r.student.fullName, r.student.accessCode, r.student.className, r.status, r.missing.join('\n')])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `chua-lam-tuan-${weeks.join('-')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copyNames = async () => {
    try { await navigator.clipboard.writeText(visible.map(row => `${row.student.fullName} · ${row.student.className || ''}: ${row.missing.join('; ') || row.status}`).join('\n')); setCopyMessage('Đã sao chép danh sách để thầy cô nhắc học sinh.'); }
    catch { setCopyMessage('Chưa sao chép được. Thầy cô có thể tải danh sách.'); }
  };
  if (!alwaysVisible && (!rows.length || !rows.some(row => row.missing.length))) return null;
  if (!rows.length) return <p role="status" className="teacher-inbox-note">Chưa có bài đã giao cho lớp trong tuần đang chọn để đối chiếu.</p>;
  return <section className="teacher-week-missing" aria-label="Học sinh chưa làm bài tuần đã chọn"><div className="teacher-inbox-summary"><h4>Bài còn thiếu · Tuần {weeks.join(', ')}</h4><div><button type="button" disabled={!visible.length} onClick={copyNames}>Sao chép danh sách</button><button type="button" disabled={!visible.length} onClick={download}>Tải danh sách</button></div></div>
    <p className="teacher-inbox-note">Chỉ đối chiếu bài đã giao cho lớp. Bài đang chờ chấm vẫn tính là đã nộp.</p>
    {copyMessage && <p role="status">{copyMessage}</p>}
    <label>Hiển thị <select aria-label="Lọc học sinh chưa làm bài" value={filter} onChange={e => setFilter(e.target.value)}><option value="missing">Còn thiếu bài ({rows.filter(r => r.missing.length).length})</option><option value="none">Chưa có bài nộp ({rows.filter(r => !r.submitted).length})</option><option value="all">Tất cả ({rows.length})</option></select></label>
    <ul className="teacher-missing-mobile-list">{!visible.length && <li>Không còn học sinh thiếu bài theo bộ lọc này.</li>}{visible.map(row => <li key={row.key}><strong>{row.student.fullName}</strong><span>{row.student.className} · {row.student.accessCode}</span><b>{row.status}</b><p>{row.missing.join('; ') || 'Đã nộp đủ'}</p></li>)}</ul>
    <div className="teacher-quiz-table-scroll"><table><thead><tr><th>Học sinh</th><th>Mã HS / Lớp</th><th>Trạng thái</th><th>Bài còn thiếu</th></tr></thead><tbody>{!visible.length ? <tr><td colSpan={4}>Không còn học sinh thiếu bài theo bộ lọc này.</td></tr> : visible.map(row => <tr key={row.key}><td>{row.student.fullName}</td><td>{row.student.accessCode} · {row.student.className}</td><td>{row.status}</td><td>{row.missing.join('; ') || 'Đã nộp đủ'}</td></tr>)}</tbody></table></div>
  </section>;
}
