import { useState } from 'react';
export default function TeacherMissingWeekWork({ rows, weeks }) {
  const [filter, setFilter] = useState('missing');
  const visible = rows.filter(r => filter === 'all' || (filter === 'none' ? r.submitted === 0 : r.missing.length > 0));
  const download = () => {
    const cell = v => { const value = String(v || ''); return `"${(/^\s*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`; };
    const lines = [['Học sinh', 'Mã HS', 'Lớp', 'Trạng thái', 'Bài còn thiếu'], ...visible.map(r => [r.student.fullName, r.student.accessCode, r.student.className, r.status, r.missing.join('\n')])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `chua-lam-tuan-${weeks.join('-')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!rows.length || !rows.some(row => row.missing.length)) return null;
  return <section className="teacher-week-missing" aria-label="Học sinh chưa làm bài tuần đã chọn"><div className="teacher-inbox-summary"><h4>Bài còn thiếu · Tuần {weeks.join(', ')}</h4><button type="button" disabled={!visible.length} onClick={download}>Tải danh sách</button></div>
    <p className="teacher-inbox-note">Chỉ đối chiếu bài đã giao cho lớp. Bài đang chờ chấm vẫn tính là đã nộp.</p>
    <label>Hiển thị <select aria-label="Lọc học sinh chưa làm bài" value={filter} onChange={e => setFilter(e.target.value)}><option value="missing">Còn thiếu bài ({rows.filter(r => r.missing.length).length})</option><option value="none">Chưa có bài nộp ({rows.filter(r => !r.submitted).length})</option><option value="all">Tất cả ({rows.length})</option></select></label>
    <div className="teacher-quiz-table-scroll"><table><thead><tr><th>Học sinh</th><th>Mã HS / Lớp</th><th>Trạng thái</th><th>Bài còn thiếu</th></tr></thead><tbody>{!visible.length ? <tr><td colSpan={4}>{rows.length ? 'Không có học sinh theo bộ lọc này.' : 'Tuần này chưa có bài đã phát để lập danh sách.'}</td></tr> : visible.map(row => <tr key={row.key}><td>{row.student.fullName}</td><td>{row.student.accessCode} · {row.student.className}</td><td>{row.status}</td><td>{row.missing.join('; ') || 'Đã nộp đủ'}</td></tr>)}</tbody></table></div>
  </section>;
}
