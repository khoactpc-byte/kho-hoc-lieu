import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

const searchKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

export default function TranscriptStudentPicker({ students, selectedId, selectedPrintIds, onViewStudent, onPrintSelectionChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null), triggerRef = useRef(null);
  const panelId = useId();
  const selected = students.find(student => student.id === selectedId);
  const visibleStudents = students.filter(student => searchKey(`${student.label} ${student.classLabel} ${student.accessCode || ''}`).includes(searchKey(search).trim()));

  useEffect(() => {
    if (!open) return;
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    // Collapse after the clicked control handles its action, so inline content cannot move it mid-click.
    document.addEventListener('click', closeOutside);
    return () => document.removeEventListener('click', closeOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="min-w-0" onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    }}>
      <button ref={triggerRef} type="button" aria-label="Danh sách học sinh" aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen(value => !value)} className="flex w-full items-center gap-2 rounded border border-slate-300 bg-white px-2 py-2 text-left hover:bg-slate-50">
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-slate-500">Danh sách học sinh</span>
          <span className="block truncate text-[13px] text-slate-800" title={selected?.label}>{selected?.label || 'Chọn học sinh'}</span>
          <span className="block text-[11px] text-emerald-700">{selectedPrintIds.length}/{students.length} chọn in</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!open} className="transcript-list-panel mt-1 space-y-2 rounded border border-slate-200 bg-slate-50 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} aria-label="Tìm học sinh trong học bạ"
            placeholder="Tìm tên, lớp, mã..." className="scorebook-select w-full !pl-7" />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button type="button" onClick={() => onPrintSelectionChange(students.map(student => student.id).filter(Boolean))} disabled={!students.length}
            title={`Chọn toàn bộ ${students.length} học sinh trong khối, cơ sở đang mở`} className="h-8 rounded bg-emerald-600 px-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">Chọn hết</button>
          <button type="button" onClick={() => onPrintSelectionChange([])} className="h-8 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600 hover:bg-slate-100">Bỏ chọn</button>
        </div>
        <div role="group" aria-label="Chọn học sinh in học bạ" className="max-h-64 overflow-y-auto overscroll-contain rounded border border-slate-200 bg-white">
          {visibleStudents.map(student => (
            <div key={student.id} className={`flex min-w-0 items-center gap-1 border-b border-slate-100 px-1.5 last:border-0 ${student.id === selectedId ? 'bg-blue-50' : ''}`}>
              <input type="checkbox" checked={selectedPrintIds.includes(student.id)} aria-label={`Chọn in học bạ ${student.label}`}
                onChange={event => onPrintSelectionChange(event.target.checked ? [...new Set([...selectedPrintIds, student.id])] : selectedPrintIds.filter(id => id !== student.id))}
                className="h-4 w-4 shrink-0 accent-emerald-600" />
              <button type="button" aria-label={`Xem học bạ ${student.label}`} aria-pressed={student.id === selectedId} title={`${student.label} · ${student.classLabel}`}
                onClick={() => { onViewStudent(student); setOpen(false); setSearch(''); }} className="flex min-w-0 flex-1 items-center gap-1 py-2 text-left text-xs text-slate-700">
                <span className="min-w-0 flex-1 truncate">{student.label}</span><span className="shrink-0 text-[10px] text-slate-500">{student.classLabel}</span>
              </button>
            </div>
          ))}
          {!visibleStudents.length && <p className="p-2 text-xs text-slate-500">{students.length ? 'Không tìm thấy học sinh.' : 'Chưa có học sinh trong khối này.'}</p>}
        </div>
      </div>
    </div>
  );
}
