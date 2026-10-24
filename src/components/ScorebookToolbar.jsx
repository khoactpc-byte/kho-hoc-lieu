import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, FileSpreadsheet, Menu, Printer, Save, Settings2, X } from 'lucide-react';

export default function ScorebookToolbar({
  mode, onModeChange, schoolYear, isDirty, lastSavedText, isSaving, isLoading, needsSelection, onSave,
  previewMode, onPreviewChange, onPrintPage, onPrintWorkbook, onPrintTranscript,
  signatureSettings, onSignatureChange, onClose, children
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toolbarRef = useRef(null);
  const menuId = useId();
  const isTranscript = mode === 'transcript';
  const buttonClass = 'inline-flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50';

  useEffect(() => {
    if (!openMenu && !mobileOpen) return;
    const closeOutside = event => {
      if (!toolbarRef.current?.contains(event.target)) setMobileOpen(false);
      if (!toolbarRef.current?.querySelector('[data-scorebook-menu]')?.contains(event.target)) setOpenMenu(null);
    };
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return;
      const trigger = openMenu ? toolbarRef.current?.querySelector('[data-scorebook-menu] [aria-expanded="true"]') : toolbarRef.current?.querySelector('.scorebook-mobile-toggle');
      setOpenMenu(null);
      if (!openMenu) setMobileOpen(false);
      trigger?.focus();
    };
    document.addEventListener('click', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu, mobileOpen]);

  const changeMode = nextMode => {
    setOpenMenu(null);
    onModeChange(nextMode);
  };

  return (
    <aside ref={toolbarRef} aria-label="Điều khiển sổ điểm" data-expanded={mobileOpen} className="scorebook-toolbar scorebook-sidebar text-slate-700">
      <div className="scorebook-sidebar-heading">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0">
            <h2 className="text-sm font-normal text-slate-800">{isTranscript ? 'Học bạ' : 'Sổ điểm'} <span className="block text-xs text-slate-500">{schoolYear}</span></h2>
            <span role="status" title={lastSavedText} className={`block text-[11px] ${isDirty ? 'text-amber-700' : 'text-slate-500'}`}>
              {isLoading ? 'Đang tải sổ...' : isDirty ? 'Có thay đổi chưa lưu' : lastSavedText === 'Chưa lưu' ? 'Chưa lưu' : 'Đã lưu'}
            </span>
          </div>
        </div>
        <button type="button" onClick={() => setMobileOpen(value => !value)} aria-expanded={mobileOpen} aria-controls={`${menuId}-controls`} aria-label="Tùy chọn sổ điểm" className={`${buttonClass} scorebook-mobile-toggle !w-8 !px-0`}><Menu className="h-4 w-4" /></button>
        <button type="button" onClick={onClose} title="Đóng sổ điểm" aria-label="Đóng sổ điểm" className={`${buttonClass} !w-8 !px-0`}><X className="h-4 w-4" /></button>
      </div>
      <div id={`${menuId}-controls`} className="scorebook-sidebar-content">
        <div role="group" aria-label="Loại sổ" className="grid shrink-0 grid-cols-2 rounded border border-slate-200 bg-slate-50 p-0.5">
          {[['scorebook', 'Sổ gọi tên'], ['transcript', 'Học bạ']].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => changeMode(value)}
              className={`h-7 rounded-sm px-2.5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${mode === value ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-white'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="scorebook-controls">{children}</div>
        <div className="scorebook-actions">
          {!isTranscript && <>
            <button type="button" onClick={onSave} disabled={isSaving || isLoading || needsSelection}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded bg-blue-600 px-3 text-[13px] text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {isSaving ? 'Đang lưu' : 'Lưu'}
            </button>
            <button type="button" onClick={onPreviewChange} aria-pressed={previewMode} title="Xem trước bản in A3" className={buttonClass}>
              {previewMode ? 'Sửa bảng' : 'Xem trước A3'}
            </button>
          </>}
          <div data-scorebook-menu className="relative">
            {isTranscript ? <>
              <button type="button" onClick={() => setOpenMenu(openMenu ? null : 'signature')} aria-expanded={openMenu === 'signature'} aria-controls={menuId}
                title="Cài đặt chữ ký" aria-label="Cài đặt chữ ký" className={buttonClass}>
                  <Settings2 className="h-4 w-4" /> Chữ ký
              </button>
              {openMenu === 'signature' && (
                <div id={menuId} aria-label="Chữ ký trong học bạ" className="mt-1 rounded-md border border-slate-200 bg-white p-1">
                  <div className="px-2 py-1 text-xs text-slate-500">Chữ ký trong học bạ</div>
                  {[[ 'teacher', 'Hiện chữ ký giáo viên' ], [ 'director', 'Hiện chữ ký Phó Giám đốc' ]].map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-[13px] hover:bg-slate-50">
                      <input type="checkbox" checked={signatureSettings[key]} onChange={event => onSignatureChange(key, event.target.checked)} className="h-4 w-4 accent-blue-600" />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </> : <>
              <button type="button" onClick={() => setOpenMenu(openMenu ? null : 'print')} aria-expanded={openMenu === 'print'} aria-controls={menuId} className={buttonClass}>
                <Printer className="h-3.5 w-3.5" /> In <ChevronDown className="h-3 w-3" />
              </button>
              {openMenu === 'print' && (
                <div id={menuId} aria-label="Lựa chọn in" className="mt-1 rounded-md border border-slate-200 bg-white p-1">
                  <button type="button" onClick={() => { setOpenMenu(null); onPrintPage(); }} className="block w-full rounded px-3 py-2 text-left text-[13px] hover:bg-blue-50">In trang này</button>
                  <button type="button" onClick={() => { setOpenMenu(null); onPrintWorkbook(); }} className="block w-full rounded px-3 py-2 text-left text-[13px] hover:bg-blue-50">In tất cả</button>
                </div>
              )}
            </>}
          </div>
          {isTranscript && <button type="button" onClick={() => { setOpenMenu(null); onPrintTranscript(); }} className={buttonClass}>
            <Printer className="h-3.5 w-3.5" /> In học bạ
          </button>}
        </div>
      </div>
    </aside>
  );
}
