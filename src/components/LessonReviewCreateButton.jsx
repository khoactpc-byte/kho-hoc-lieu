import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Layers, Sparkles } from 'lucide-react';

export default function LessonReviewCreateButton({ disabled, onCurrent, onBatch }) {
  const [open, setOpen] = useState(false), root = useRef(null), trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector('[role="menuitem"]')?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const keyDown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (!open || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const items = [...root.current.querySelectorAll('[role="menuitem"]')], index = items.indexOf(document.activeElement);
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return <div ref={root} className="lesson-review-create" onKeyDown={keyDown} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} className="lesson-review-button"><Sparkles className="h-4 w-4" /><span>Câu hỏi ôn tập</span><ChevronDown size={14} /></button>
    {open && <div className="lesson-review-create-menu" role="menu" aria-label="Phạm vi tạo câu hỏi ôn tập">
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onCurrent(); }}><Sparkles size={17} /><span><strong>Tạo cho tuần này</strong><small>Xem và chỉnh sửa câu hỏi trước khi lưu</small></span></button>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onBatch(); }}><Layers size={17} /><span><strong>Tạo hàng loạt cho tuần còn thiếu</strong><small>Chọn các tuần đã có bài học, chưa có ôn tập</small></span></button>
    </div>}
  </div>;
}
