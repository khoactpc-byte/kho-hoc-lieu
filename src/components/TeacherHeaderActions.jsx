import { useEffect, useRef, useState } from 'react';
import { Home, MoreHorizontal } from 'lucide-react';

export default function TeacherHeaderActions({ compact, teacherName, primaryActions, onHome, children }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('.teacher-header-menu-toggle')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  if (!compact) return <div className="student-header-actions flex items-center gap-2 sm:gap-5 flex-shrink-0">{primaryActions}{children}</div>;
  return <div ref={root} className="student-header-actions teacher-responsive-actions">
    {primaryActions && <div className="teacher-header-primary-actions">{primaryActions}</div>}
    <button type="button" className="teacher-header-menu-toggle" aria-label="Công cụ giáo viên" title="Công cụ giáo viên" aria-expanded={open} aria-controls="teacher-header-action-items" onClick={() => setOpen(value => !value)}><MoreHorizontal size={18} /></button>
    <div id="teacher-header-action-items" className="teacher-header-action-items" data-open={open} onClick={event => { if (event.target.closest('button:not(:disabled)')) setOpen(false); }}>
      <p className="teacher-menu-name">{teacherName}</p>
      {onHome && <button type="button" className="teacher-mobile-home" onClick={onHome}><Home size={16} /><span>Trang chủ</span></button>}
      {children}
    </div>
  </div>;
}
