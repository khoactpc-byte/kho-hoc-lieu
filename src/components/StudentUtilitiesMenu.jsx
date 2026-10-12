import { useEffect, useId, useRef } from 'react';
import { ChevronDown, X } from 'lucide-react';

export default function StudentUtilitiesMenu({ position, groups, onClose }) {
  const panel = useRef(null);
  const closeButton = useRef(null);
  const id = useId();

  useEffect(() => { closeButton.current?.focus(); }, []);
  useEffect(() => {
    const keyboard = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', keyboard);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const keepFocusInPanel = event => {
    if (event.key !== 'Tab') return;
    const controls = [...panel.current.querySelectorAll('button:not([disabled]), select:not([disabled]), summary')]
      .filter(control => control.tagName === 'SUMMARY' || !control.closest('details:not([open])'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const renderGroupContent = group => <>
    {group.content}
    {group.actions.map(action => {
      const noteId = `${id}-${action.id}`;
      return (
        <button key={action.id} type="button" onClick={action.onClick} disabled={action.disabled}
          aria-label={action.label} aria-describedby={noteId} title={action.note}
          className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left font-normal text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-45">
          <span className="mt-0.5 shrink-0" aria-hidden="true">{action.icon}</span>
          <span className="min-w-0">
            <span className="block text-[13px] leading-4">{action.label}</span>
            <span id={noteId} className="mt-0.5 block text-[11px] leading-4 text-slate-500">{action.note}</span>
          </span>
        </button>
      );
    })}
  </>;

  return <>
    <button type="button" tabIndex={-1} className="fixed inset-0 z-[1000] cursor-default bg-transparent" onClick={onClose} aria-label="Đóng tiện ích" />
    <div ref={panel} role="dialog" aria-modal="true" aria-label="Tiện ích học sinh" onKeyDown={keepFocusInPanel}
      className="fixed z-[1010] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-xl"
      style={position}>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-sm font-normal text-slate-700">Tiện ích học sinh</span>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Đóng bảng tiện ích" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-1.5">
        {groups.filter(Boolean).map(group => group.collapsible ? (
          <details key={group.id} className="group border-t border-slate-100 first:border-t-0">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-2 rounded px-2 py-2 text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-[13px] leading-4">{group.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{group.note}</span>
              </span>
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="pl-1">{renderGroupContent(group)}</div>
          </details>
        ) : (
          <section key={group.id} aria-label={group.label} className="border-t border-slate-100 first:border-t-0">
            {group.label && <p className="px-2 pb-1 pt-2 text-[11px] font-normal text-slate-500">{group.label}</p>}
            {renderGroupContent(group)}
          </section>
        ))}
      </div>
    </div>
  </>;
}
