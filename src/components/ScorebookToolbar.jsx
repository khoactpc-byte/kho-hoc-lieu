import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, FileSpreadsheet, Printer, Save, Settings2, X } from 'lucide-react';

export default function ScorebookToolbar({
  mode, onModeChange, schoolYear, isDirty, lastSavedText, isSaving, isLoading, needsSelection, onSave,
  previewMode, onPreviewChange, onPrintPage, onPrintWorkbook, onPrintTranscript,
  signatureSettings, onSignatureChange, onClose, children
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const toolbarRef = useRef(null);
  const menuId = useId();
  const isTranscript = mode === 'transcript';
  const buttonClass = 'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50';

  useEffect(() => {
    if (!openMenu) return;
    const closeOutside = event => {
      if (!toolbarRef.current?.querySelector('[data-scorebook-menu]')?.contains(event.target)) setOpenMenu(null);
    };
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return;
      setOpenMenu(null);
      toolbarRef.current?.querySelector('[aria-expanded="true"]')?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  const changeMode = nextMode => {
    setOpenMenu(null);
    onModeChange(nextMode);
  };

  return (
    <div ref={toolbarRef} className="scorebook-toolbar relative z-20 shrink-0 border-b border-slate-200 bg-white text-slate-700">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-blue-600" />
          <h2 className="whitespace-nowrap text-base font-normal text-slate-800">Sổ điểm <span className="text-sm text-slate-500">· {schoolYear}</span></h2>
          <span role="status" title={lastSavedText} className={`hidden text-xs sm:inline ${isDirty ? 'text-amber-700' : 'text-slate-500'}`}>
            {isLoading ? 'Đang tải sổ...' : isDirty ? 'Có thay đổi chưa lưu' : lastSavedText === 'Chưa lưu' ? 'Chưa lưu' : 'Đã lưu'}
          </span>
        </div>
        <div role="group" aria-label="Loại sổ" className="inline-flex shrink-0 rounded border border-slate-200 bg-slate-50 p-0.5">
          {[['scorebook', 'Sổ gọi tên'], ['transcript', 'Học bạ']].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => changeMode(value)}
              className={`h-7 rounded-sm px-2.5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${mode === value ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-white'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!isTranscript && <>
            <button type="button" onClick={onSave} disabled={isSaving || isLoading || needsSelection}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-blue-600 px-3 text-[13px] text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> {isSaving ? 'Đang lưu' : 'Lưu'}
            </button>
            <button type="button" onClick={onPreviewChange} aria-pressed={previewMode} title="Xem trước bản in A3" className={buttonClass}>
              {previewMode ? 'Sửa bảng' : 'Xem trước A3'}
            </button>
          </>}
          <div data-scorebook-menu className="relative" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null);
          }}>
            {isTranscript ? <>
              <button type="button" onClick={() => setOpenMenu(openMenu ? null : 'signature')} aria-expanded={openMenu === 'signature'} aria-controls={menuId}
                title="Cài đặt chữ ký" aria-label="Cài đặt chữ ký" className={buttonClass}>
                <Settings2 className="h-4 w-4" />
              </button>
              {openMenu === 'signature' && (
                <div id={menuId} aria-label="Chữ ký trong học bạ" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
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
                <div id={menuId} aria-label="Lựa chọn in" className="absolute right-0 top-full z-30 mt-1 w-44 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                  <button type="button" onClick={() => { setOpenMenu(null); onPrintPage(); }} className="block w-full rounded px-3 py-2 text-left text-[13px] hover:bg-blue-50">In trang này</button>
                  <button type="button" onClick={() => { setOpenMenu(null); onPrintWorkbook(); }} className="block w-full rounded px-3 py-2 text-left text-[13px] hover:bg-blue-50">In tất cả</button>
                </div>
              )}
            </>}
          </div>
          {isTranscript && <button type="button" onClick={() => { setOpenMenu(null); onPrintTranscript(); }} className={buttonClass}>
            <Printer className="h-3.5 w-3.5" /> In học bạ
          </button>}
          <button type="button" onClick={onClose} title="Đóng sổ điểm" aria-label="Đóng sổ điểm" className={`${buttonClass} !w-8 !px-0`}><X className="h-4 w-4" /></button>
        </div>
        {isDirty && <span className="w-full text-xs text-amber-700 sm:hidden">Có thay đổi chưa lưu</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[13px]">
        {children}
      </div>
    </div>
  );
}
