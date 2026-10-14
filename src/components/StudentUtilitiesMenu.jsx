import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, X } from 'lucide-react';

const GROUP_ORDER = ['common', 'review', 'sheet', 'repair'];

export default function StudentUtilitiesMenu({ position, groups, onClose }) {
  const panel = useRef(null);
  const content = useRef(null);
  const closeButton = useRef(null);
  const tabRefs = useRef({});
  const id = useId();
  const availableGroups = groups.filter(Boolean).sort((a, b) => GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id));
  const [selectedGroupId, setSelectedGroupId] = useState(() => availableGroups[0]?.id);
  const [helpActionId, setHelpActionId] = useState(null);
  const selectedIndex = Math.max(0, availableGroups.findIndex(group => group.id === selectedGroupId));
  const selectedGroup = availableGroups[selectedIndex];
  const explainedAction = selectedGroup?.actions.find(action => action.id === helpActionId);
  const contentId = `${id}-content`;
  const helpId = `${id}-help`;

  useEffect(() => { closeButton.current?.focus(); }, []);
  useEffect(() => {
    const keyboard = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
    };
  }, [onClose]);

  const selectGroup = (index, focusTab = false) => {
    const group = availableGroups[(index + availableGroups.length) % availableGroups.length];
    setSelectedGroupId(group.id);
    setHelpActionId(null);
    if (content.current) content.current.scrollTop = 0;
    if (focusTab) tabRefs.current[group.id]?.focus();
  };
  const handleTabKeyDown = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = index + 1;
    else if (event.key === 'ArrowLeft') nextIndex = index - 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = availableGroups.length - 1;
    else return;
    event.preventDefault();
    selectGroup(nextIndex, true);
  };
  const keepFocusInPanel = event => {
    if (event.key !== 'Tab') return;
    const controls = [...panel.current.querySelectorAll('button:not([disabled]), select:not([disabled]), [tabindex="0"]')]
      .filter(control => control.tabIndex >= 0 && !control.closest('[hidden]'));
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

  if (!selectedGroup) return null;

  return <>
    <button type="button" tabIndex={-1} className="fixed inset-0 z-[1000] cursor-default bg-transparent" onClick={onClose} aria-label="Đóng tiện ích" />
    <div ref={panel} role="dialog" aria-modal="true" aria-label="Tiện ích học sinh" onKeyDown={keepFocusInPanel}
      className="fixed z-[1010] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-xl"
      style={position}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <span className="text-sm font-semibold text-slate-800">Tiện ích học sinh</span>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Đóng bảng tiện ích" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"><X className="h-4 w-4" /></button>
      </div>
      {availableGroups.length > 1 && <div role="tablist" aria-label="Nhóm tiện ích" className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-slate-100 bg-slate-50 p-2">
        {availableGroups.map((group, index) => <button key={group.id} ref={element => { tabRefs.current[group.id] = element; }}
          type="button" role="tab" id={`${id}-tab-${group.id}`} aria-selected={index === selectedIndex} aria-controls={contentId}
          tabIndex={index === selectedIndex ? 0 : -1} onClick={() => selectGroup(index)} onKeyDown={event => handleTabKeyDown(event, index)}
          className={`flex min-h-10 min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${index === selectedIndex ? 'border-indigo-200 bg-white text-indigo-700 shadow-sm' : 'border-transparent text-slate-600 hover:bg-white hover:text-slate-800'}`}>
          <span aria-hidden="true" className="shrink-0">{group.icon}</span>
          <span className="min-w-0 flex-1">{group.tabLabel || group.label}</span>
          {group.badge > 0 && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" aria-label={`${group.badge} hồ sơ chờ đồng bộ`}>{group.badge}</span>}
        </button>)}
      </div>}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        {availableGroups.length > 1 && <button type="button" onClick={() => selectGroup(selectedIndex - 1)} aria-label="Nhóm tiện ích trước"
          title={`Nhóm trước: ${availableGroups[(selectedIndex - 1 + availableGroups.length) % availableGroups.length].label}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"><ChevronLeft className="h-4 w-4" /></button>}
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[13px] font-semibold text-slate-800">{selectedGroup.label}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{availableGroups.length > 1 ? `Nhóm ${selectedIndex + 1} / ${availableGroups.length} · ` : ''}{selectedGroup.actions.length} chức năng</p>
        </div>
        {availableGroups.length > 1 && <button type="button" onClick={() => selectGroup(selectedIndex + 1)} aria-label="Nhóm tiện ích tiếp theo"
          title={`Nhóm tiếp theo: ${availableGroups[(selectedIndex + 1) % availableGroups.length].label}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"><ChevronRight className="h-4 w-4" /></button>}
      </div>
      <div role={availableGroups.length > 1 ? 'tabpanel' : 'region'} id={contentId}
        aria-labelledby={availableGroups.length > 1 ? `${id}-tab-${selectedGroup.id}` : undefined}
        aria-label={availableGroups.length > 1 ? undefined : selectedGroup.label} tabIndex={0}
        className="flex min-h-0 flex-col outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
        <div ref={content} className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="space-y-1 p-2">
          {selectedGroup.content}
          {selectedGroup.actions.map(action => {
            const noteId = `${id}-${selectedGroup.id}-${action.id}`;
            return <div key={action.id} onMouseEnter={() => setHelpActionId(action.id)}
              className={`flex items-stretch rounded-lg border transition-colors ${helpActionId === action.id ? 'border-indigo-100 bg-indigo-50/60' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'}`}>
              <button type="button" onClick={action.onClick} onFocus={() => setHelpActionId(action.id)} disabled={action.disabled}
                aria-label={action.label} aria-describedby={noteId}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left font-normal text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-45">
                <span className="shrink-0" aria-hidden="true">{action.icon}</span>
                <span className="min-w-0 text-[13px] leading-5">{action.label}</span>
              </button>
              <span id={noteId} className="sr-only">{action.note}</span>
              <button type="button" aria-label={`Giải thích: ${action.label}`} aria-describedby={noteId} aria-controls={helpId}
                onFocus={() => setHelpActionId(action.id)} onClick={() => setHelpActionId(action.id)}
                className="flex w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-100 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"><Info className="h-4 w-4" /></button>
            </div>;
          })}
        </div>
        </div>
        <aside id={helpId} aria-label="Giải thích chức năng" className="mx-2 mb-2 min-h-[104px] shrink-0 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2.5">
          <p className="flex items-start gap-2 text-xs font-medium leading-5 text-sky-900"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{explainedAction?.label || 'Giải thích chức năng'}</span></p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{explainedAction?.note || selectedGroup.note || 'Chọn một chức năng để xem giải thích.'}</p>
          {!explainedAction && <p className="mt-1 text-[11px] leading-4 text-slate-500">Rê chuột vào chức năng hoặc bấm ⓘ để xem giải thích.</p>}
        </aside>
      </div>
    </div>
  </>;
}
