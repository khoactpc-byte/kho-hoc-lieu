import { useState } from 'react';
import { Eye, EyeOff, Lock, X } from 'lucide-react';
import LoginSubmitButton from './LoginSubmitButton';

export default function UnifiedLoginDialog({ username, password, onUsernameChange, onPasswordChange, onSubmit, onClose, onRegister, pending, error }) {
  const [visible, setVisible] = useState(false);
  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="unified-login-title" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="unified-login-title" className="flex items-center gap-2 text-xl font-bold text-slate-900"><Lock className="h-5 w-5" />Đăng nhập</h2>
        <button type="button" onClick={onClose} aria-label="Đóng đăng nhập" className="rounded-lg p-2 text-slate-500"><X className="h-5 w-5" /></button>
      </div>
      <p className="mb-4 text-sm text-slate-500">Dùng tài khoản đã được cấp.</p>
      <form onSubmit={event => { event.preventDefault(); onSubmit(); }} className="space-y-4" aria-busy={pending}>
        <label className="block text-sm font-medium text-slate-700">Tên đăng nhập
          <input autoFocus required maxLength={40} autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event => onUsernameChange(event.target.value)} disabled={pending} className="mt-1 w-full rounded-lg border border-slate-300 p-3" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Mật khẩu
          <span className="relative mt-1 block"><input aria-label="Mật khẩu" required maxLength={256} autoComplete="current-password" type={visible ? 'text' : 'password'} value={password} onChange={event => onPasswordChange(event.target.value)} disabled={pending} className="w-full rounded-lg border border-slate-300 p-3 pr-12" />
            <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} className="absolute inset-y-0 right-0 px-3 text-slate-500">{visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
          </span>
        </label>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex"><LoginSubmitButton onClick={onSubmit} pending={pending} /></div>
      </form>
      <p className="mt-4 text-xs text-slate-500">Quên tài khoản hoặc mật khẩu? Liên hệ giáo viên hoặc quản trị để được cấp lại.</p>
      <button type="button" onClick={onRegister} disabled={pending} className="mt-4 w-full rounded-lg border border-emerald-200 py-2.5 text-sm font-semibold text-emerald-700">Chưa có hồ sơ? Đăng ký mới</button>
    </section>
  </div>;
}
