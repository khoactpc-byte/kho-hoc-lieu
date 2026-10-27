import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';

const searchKey = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

// null means all values; an empty array deliberately means no values.
export default function StudentFilterDropdown({ label, options, value, onChange, open, onOpenChange, compact = false }) {
  const trigger = useRef(null);
  const panel = useRef(null);
  const selectAll = useRef(null);
  const panelId = useId();
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState(null);
  const selected = new Set(value ?? options.map(option => option.value));
  const shown = options.filter(option => searchKey(option.label).includes(searchKey(search.trim())));
  const checkedCount = shown.filter(option => selected.has(option.value)).length;
  const allChecked = shown.length > 0 && checkedCount === shown.length;
  const selectedLabels = value?.map(item => options.find(option => option.value === item)?.label ?? item);
  const summary = value == null ? 'Tất cả' : !value.length ? 'Chưa chọn' : value.length <= 2 ? selectedLabels.join(', ') : `${value.length} mục đã chọn`;

  const close = (restoreFocus = false) => {
    onOpenChange(false);
    if (restoreFocus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    setSearch('');
    const measure = () => {
      const rect = trigger.current.getBoundingClientRect(), viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop || 0, viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
      const width = Math.min(300, window.innerWidth - 16);
      const below = viewportBottom - rect.bottom - 12, above = rect.top - viewportTop - 12;
      const upwards = below < 240 && above > below;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: upwards ? undefined : Math.max(viewportTop + 8, rect.bottom + 4),
        bottom: upwards ? Math.max(8, window.innerHeight - rect.top + 4) : undefined,
        width, maxHeight: Math.min(360, Math.max(120, upwards ? above : below))
      });
    };
    measure();
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [open]);

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = checkedCount > 0 && !allChecked;
  }, [checkedCount, allChecked, open, position]);

  useEffect(() => {
    if (!open) return;
    const outside = event => {
      if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) onOpenChange(false);
    };
    const keyboard = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        trigger.current?.focus();
      }
    };
    const scroll = event => {
      if (!panel.current?.contains(event.target)) onOpenChange(false);
    };
    const viewportWidth = window.innerWidth;
    const resize = () => { if (window.innerWidth !== viewportWidth) onOpenChange(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open, onOpenChange]);

  const toggle = (items, checked) => {
    const next = new Set(selected);
    items.forEach(item => checked ? next.add(item.value) : next.delete(item.value));
    onChange(checked && options.length > 0 && options.every(option => next.has(option.value)) ? null : [...next]);
  };

  return <>
    <button ref={trigger} type="button" aria-label={compact ? `Lọc ${label}` : label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
      title={compact ? `Lọc ${label}${value == null ? '' : `: ${summary}`}` : summary}
      onClick={() => onOpenChange(!open)}
      className={compact
        ? `inline-flex items-center gap-0.5 rounded p-0.5 ${value != null ? 'bg-white text-sky-700' : 'hover:bg-white/20'}`
        : `flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded border bg-white px-2 text-left text-sm text-slate-700 focus:border-sky-500 focus:outline-none ${value != null ? 'border-sky-500' : 'border-slate-300'}`}>
      {!compact && <span className="truncate">{summary}</span>}
      {compact && value != null && <span className="text-[10px] tabular-nums">{value.length}</span>}
      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
    </button>
    {open && position && createPortal(
      <div ref={panel} id={panelId} role="dialog" aria-label={`Lọc ${label}`} style={position}
        className="student-filter-panel fixed z-[100] flex flex-col rounded-lg border border-slate-200 bg-white p-2 text-left text-xs font-normal normal-case text-slate-700 shadow-xl">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <span className="truncate font-medium">{label}</span>
          <button type="button" aria-label={`Đóng lọc ${label}`} onClick={() => close(true)} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative mb-2 shrink-0">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
          <input autoFocus type="search" aria-label={`Tìm trong ${label}`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm giá trị..."
            className="h-8 w-full rounded border border-slate-300 pl-7 pr-2 focus:border-sky-500 focus:outline-none" />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 border-b border-slate-100 px-2 py-2">
          <input ref={selectAll} type="checkbox" checked={allChecked} disabled={!shown.length} onChange={event => toggle(shown, event.target.checked)} className="h-4 w-4 shrink-0 accent-sky-700" />
          <span>{search.trim() ? 'Chọn tất cả kết quả' : 'Chọn tất cả'}</span>
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1" role="group" aria-label={`Giá trị ${label}`}>
          {shown.map(option => <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-sky-50">
            <input type="checkbox" checked={selected.has(option.value)} onChange={event => toggle([option], event.target.checked)} className="h-4 w-4 shrink-0 accent-sky-700" />
            <span className="min-w-0 break-words">{option.label}</span>
          </label>)}
          {!shown.length && <p className="px-2 py-3 text-slate-400">Không có giá trị phù hợp.</p>}
        </div>
        <div className="mt-1 flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <button type="button" onClick={() => { onChange(null); setSearch(''); }} className="rounded px-2 py-1.5 text-slate-500 hover:bg-slate-100">Xóa lọc</button>
          <button type="button" onClick={() => close(true)} className="rounded bg-sky-700 px-3 py-1.5 text-white hover:bg-sky-800">Xong</button>
        </div>
      </div>, document.body
    )}
  </>;
}
