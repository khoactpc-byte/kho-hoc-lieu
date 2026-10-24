import { useMemo, useState } from 'react';
import { postAppsScript } from '../utils/helpers';

export default function StudentAccountManager({ students = [], showNotification, request = postAppsScript }) {
  const [search, setSearch] = useState('');
  const [className, setClassName] = useState('');
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState({});
  const accounts = useMemo(() => {
    const unique = new Map();
    for (const student of students) {
      const code = String(student.accessCode || '').trim().toUpperCase();
      if (!/^HS\d{3,15}$/.test(code)) continue;
      const previous = unique.get(code);
      if (!previous || String(student.schoolYear || '') > String(previous.schoolYear || '')) unique.set(code, { ...student, accessCode: code });
    }
    return [...unique.values()].sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || ''), 'vi'));
  }, [students]);
  const classes = [...new Set(accounts.map(item => item.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  const needle = search.trim().toLocaleLowerCase('vi');
  const visible = accounts.filter(item => (!className || item.className === className) && (!needle || `${item.fullName} ${item.accessCode}`.toLocaleLowerCase('vi').includes(needle)));
  const save = async event => {
    event.preventDefault();
    if (pending || !selected || password.length < 6 || password.length > 256) return;
    setPending(true); setError('');
    try {
      const result = await request({ action: 'setStudentAccountPassword', accessCode: selected.accessCode, newPassword: password });
      if (result.status !== 'success') throw new Error(result.message || 'Chưa đặt được mật khẩu.');
      setUpdated(previous => ({ ...previous, [selected.accessCode]: true }));
      showNotification?.(`Đã đổi mật khẩu ${selected.accessCode}. Học sinh cần đăng nhập lại.`);
      setSelected(null); setPassword('');
    } catch (saveError) { setError(saveError.message || 'Chưa đặt được mật khẩu.'); }
    finally { setPending(false); }
  };
  return <section className="password-panel p-3" aria-label="Tài khoản học sinh">
    <h4 className="password-section-title">Tài khoản học sinh</h4>
    <p className="password-note my-2">Tên đăng nhập là mã HS. Mật khẩu ban đầu: 111111. Mật khẩu đã đổi vẫn được giữ; không hiển thị mật khẩu hiện tại.</p>
    <div className="mb-3 flex flex-wrap gap-2">
      <input aria-label="Tìm tài khoản học sinh" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên hoặc mã HS" className="password-input min-w-0 flex-1" />
      <select aria-label="Lọc lớp tài khoản học sinh" value={className} onChange={event => setClassName(event.target.value)} className="password-input"><option value="">Tất cả lớp</option>{classes.map(value => <option key={value}>{value}</option>)}</select>
    </div>
    {selected && <form onSubmit={save} className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <p className="mb-2 text-sm">Đặt mật khẩu cho <strong>{selected.fullName} · {selected.accessCode}</strong></p>
      <label className="block text-sm">Mật khẩu mới<input type="password" required minLength={6} maxLength={256} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={pending} className="password-input mt-1 w-full" /></label>
      <p className="password-note mt-1">Ít nhất 6 ký tự. Phiên học sinh cũ sẽ hết hiệu lực.</p>
      <div className="mt-2 flex gap-2"><button type="submit" disabled={pending || password.length < 6} className="password-button password-primary">{pending ? 'Đang lưu…' : 'Lưu mật khẩu'}</button><button type="button" disabled={pending} onClick={() => { setSelected(null); setPassword(''); setError(''); }} className="password-button">Hủy</button></div>
    </form>}
    {error && <p role="alert" className="my-2 text-sm text-rose-600">{error}</p>}
    <p className="password-note mb-2">{visible.length} tài khoản · gộp các năm theo cùng mã HS.</p>
    <div className="max-h-[55vh] overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Học sinh</th><th className="p-2">Tài khoản</th><th className="p-2">Lớp</th><th className="p-2">Thao tác</th></tr></thead><tbody>
      {visible.slice(0, 100).map(item => <tr key={item.accessCode} className="border-t border-slate-100"><td className="p-2">{item.fullName}</td><td className="p-2">{item.accessCode}{updated[item.accessCode] && <span className="block text-xs text-emerald-700">Vừa đổi mật khẩu</span>}</td><td className="p-2">{item.className}</td><td className="p-2"><button type="button" disabled={pending} onClick={() => { setSelected(item); setPassword(''); setError(''); }} className="password-button">Đổi mật khẩu</button></td></tr>)}
      {!visible.length && <tr><td colSpan={4} className="p-3 text-slate-500">Chưa có tài khoản trong danh sách đang tải. Hồ sơ phải có mã HS để đăng nhập.</td></tr>}
    </tbody></table></div>
    {visible.length > 100 && <p className="password-note mt-2">Đang hiển thị 100 tài khoản đầu; chọn lớp hoặc nhập tên để tìm tiếp.</p>}
  </section>;
}
