import { Loader2 } from 'lucide-react';

export default function LoginSubmitButton({ pending, onClick, type = 'button' }) {
  return <button type={type} onClick={onClick} disabled={pending} aria-busy={pending}
    className="login-submit-button flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-2 py-3.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-400 disabled:shadow-none">
    {pending && <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />}<span>{pending ? 'Đang đăng nhập…' : 'Đăng nhập'}</span>
  </button>;
}
