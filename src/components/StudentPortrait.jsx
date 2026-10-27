import { useState } from 'react';
import { UserRound } from 'lucide-react';

export default function StudentPortrait({ url = '', name = '', size = 160, className = '', showStatus = false }) {
  const [failed, setFailed] = useState([]);
  const first = String(url || '').split(/\s*,\s*|\n+/)[0].trim();
  const id = first.match(/\/file\/d\/([\w-]+)|[?&]id=([\w-]+)|googleusercontent\.com\/d\/([\w-]+)/);
  const fileId = id && (id[1] || id[2] || id[3]);
  const sources = fileId ? [`https://lh3.googleusercontent.com/d/${fileId}=w${size}`, `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`] : /^https?:\/\//i.test(first) ? [first] : [];
  const source = sources.find(item => !failed.includes(item));
  return source ? <img className={className} src={source} alt={`Ảnh ${name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(previous => [...previous, source])} />
    : <span className={`student-portrait-placeholder flex flex-col items-center justify-center gap-2 text-sm text-slate-400 ${className}`} role="img" aria-label={first ? `Chưa tải được ảnh ${name}` : `${name} chưa có ảnh`}><UserRound size={22} />{showStatus && <span>{first ? 'Chưa tải được ảnh đại diện.' : 'Chưa có ảnh đại diện.'}</span>}</span>;
}
