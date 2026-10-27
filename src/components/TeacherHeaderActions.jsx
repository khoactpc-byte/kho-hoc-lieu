import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Home, LogOut, MoreHorizontal } from 'lucide-react';

export default function TeacherHeaderActions({ compact, mobile, teacherName, primaryActions, primaryTools, onHome, onBack, onLogout, children }) {
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
  if (!compact) return <div className="student-header-actions flex items-center gap-2 sm:gap-5 flex-shrink-0">{primaryActions}{primaryTools}{children}</div>;
  return <div ref={root} className="student-header-actions teacher-responsive-actions">
    {mobile && <div className="teacher-mobile-navigation"><button type="button" onClick={onHome} aria-label="Trang chủ giáo viên" title="Trang chủ"><Home size={18} /></button>{onBack && <button type="button" onClick={onBack}><ArrowLeft size={16} /><span>Các tuần</span></button>}</div>}
    {primaryActions && <div className="teacher-header-primary-actions">{primaryActions}{!mobile && primaryTools}</div>}
    <button type="button" className="teacher-header-menu-toggle" aria-label="Công cụ giáo viên" title="Công cụ giáo viên" aria-expanded={open} aria-controls="teacher-header-action-items" onClick={() => setOpen(value => !value)}><MoreHorizontal size={18} /><span className="teacher-mobile-menu-label">Công cụ</span></button>
    {mobile && onLogout && <button type="button" className="teacher-mobile-logout" onClick={onLogout}><LogOut size={16} /><span>Thoát</span></button>}
    <div id="teacher-header-action-items" className="teacher-header-action-items" data-open={open} onClick={event => { if (event.target.closest('button:not(:disabled)')) setOpen(false); }}>
      <p className="teacher-menu-name">{teacherName}</p>
      {onHome && <button type="button" className="teacher-mobile-home" onClick={onHome}><Home size={16} /><span>Trang chủ</span></button>}
      {mobile && primaryTools}
      {children}
    </div>
  </div>;
}
