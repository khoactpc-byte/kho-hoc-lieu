import { useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';

export default function StudentDisplayOptions({ children }) {
  const [open, setOpen] = useState(false), root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="student-view-options">
    <button type="button" className="student-view-options-trigger" aria-expanded={open} onClick={() => setOpen(value => !value)}><Eye size={16} />Hiển thị</button>
    <div className="student-view-options-panel" data-open={open}>{children}</div>
  </div>;
}
