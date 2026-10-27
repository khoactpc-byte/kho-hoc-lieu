import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import useNarrowScreen from '../hooks/useNarrowScreen';
import { matchesStudentSearch, STUDENT_SEARCH_MISSING, STUDENT_SEARCH_PRESENT, STUDENT_SEARCH_TEXT_FIELDS, studentSearchFormDraft, studentSearchFromForm } from '../utils/studentSearch';

const MAIN_FIELDS = ['fullName', 'accessCode', 'identityCode', 'gender', 'grade', 'className', 'birthDate', 'birthYear', 'phone', 'schoolCode', 'entryGrade', 'enrollmentYear'];
const ADDRESS_FIELDS = ['birthProvince', 'birthDistrict', 'birthWard', 'province', 'ward', 'address', 'householdProvince', 'householdWard', 'householdAddress', 'hometownProvince', 'hometownDistrict', 'hometownWard'];
const LABELS = { grade: 'Khối', className: 'Lớp', birthProvince: 'Nơi sinh: tỉnh/thành', birthDistrict: 'Nơi sinh: quận/huyện', birthWard: 'Nơi sinh: phường/xã', province: 'Hiện tại: tỉnh/thành', ward: 'Hiện tại: phường/xã', address: 'Hiện tại: số nhà/KP', householdProvince: 'Thường trú: tỉnh/thành', householdWard: 'Thường trú: phường/xã', householdAddress: 'Thường trú: số nhà/KP', hometownProvince: 'Quê quán: tỉnh/thành', hometownDistrict: 'Quê quán: quận/huyện', hometownWard: 'Quê quán: phường/xã', birthCertificateUrl: 'Giấy khai sinh', identityCardUrl: 'Căn cước', transcriptUrl: 'Học bạ', portraitUrl: 'Ảnh thẻ' };

export default function StudentSearchDialog({ fields, rows, value, getValue, onApply, onClose }) {
  const [draft, setDraft] = useState(() => studentSearchFormDraft(value));
  const narrow = useNarrowScreen();
  const dialog = useRef(null);
  useEffect(() => { dialog.current?.querySelector('input')?.focus(); }, []);
  const search = useMemo(() => studentSearchFromForm(draft, fields), [draft, fields]);
  const count = rows.filter(row => matchesStudentSearch(row, search, fields, getValue)).length;
  const options = useMemo(() => Object.fromEntries(fields.map(field => [field.key,
    [...new Set(rows.map(row => String(getValue(row, field) ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
  ])), [fields, rows, getValue]);
  const main = MAIN_FIELDS.map(key => fields.find(field => field.key === key)).filter(Boolean);
  const addresses = ADDRESS_FIELDS.map(key => fields.find(field => field.key === key)).filter(Boolean);
  const extra = fields.filter(field => !MAIN_FIELDS.includes(field.key) && !ADDRESS_FIELDS.includes(field.key));
  const control = 'h-8 w-full min-w-0 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none';
  const renderField = field => {
    const label = LABELS[field.key] || field.label;
    const selected = draft[field.key] || '';
    const isText = STUDENT_SEARCH_TEXT_FIELDS.has(field.key);
    const available = [...new Set([...(options[field.key] || []), ...(selected && ![STUDENT_SEARCH_MISSING, STUDENT_SEARCH_PRESENT].includes(selected) ? [selected] : [])])];
    return <label key={field.key} className="student-search-field text-xs text-slate-600">
      <span>{label}</span>
      {isText || field.type === 'date' ? <input aria-label={label} className={control} type={field.type === 'date' ? 'date' : 'text'} placeholder={field.key === 'fullName' ? 'Nhập họ và tên...' : 'Nhập để tìm...'} value={selected} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))} />
        : <select aria-label={label} className={control} value={selected} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))}>
          <option value="">-- Tất cả --</option>
          <option value={STUDENT_SEARCH_MISSING}>{field.type === 'link' ? 'Còn thiếu' : '(Chưa có thông tin)'}</option>
          {field.type === 'link' ? <option value={STUDENT_SEARCH_PRESENT}>Đã có</option> : available.map(item => <option key={item} value={item}>{item}</option>)}
        </select>}
    </label>;
  };
  return <div ref={dialog} id="student-database-search" role="dialog" aria-modal="true" aria-labelledby="student-search-title"
    className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/50 p-2 sm:p-4" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), select, input, summary')].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <form className="flex max-h-[92dvh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onSubmit={event => { event.preventDefault(); onApply(search); }}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-slate-50 px-3 py-2">
        <h2 id="student-search-title" className="flex items-center gap-2 text-base font-semibold text-slate-900"><Search className="h-4 w-4" />Tìm kiếm hồ sơ học sinh</h2>
        <button type="button" aria-label="Đóng tìm kiếm" onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><X className="h-5 w-5" /></button>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto p-3">
        <p className="text-xs text-slate-500">Nhập hoặc chọn mục cần tìm, để trống các mục còn lại. Danh sách chọn lấy từ dữ liệu học sinh đang có.</p>
        <div className="student-search-grid">{main.filter(field => !narrow || ['fullName', 'accessCode', 'grade', 'className'].includes(field.key)).map(renderField)}</div>
        {narrow && <details open={main.some(field => !['fullName', 'accessCode', 'grade', 'className'].includes(field.key) && Boolean(draft[field.key])) || undefined} className="student-search-more border-t border-slate-200 pt-2"><summary className="cursor-pointer text-xs font-medium text-sky-800">Ngày sinh, giới tính và thông tin khác</summary><div className="student-search-grid mt-2">{main.filter(field => !['fullName', 'accessCode', 'grade', 'className'].includes(field.key)).map(renderField)}</div></details>}
        <details open={!narrow || addresses.some(field => Boolean(draft[field.key])) || undefined} className="border-t border-slate-200 pt-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-700">Nơi sinh và địa chỉ</summary>
          <div className="student-search-grid">{addresses.map(renderField)}</div>
        </details>
        <details open={extra.some(field => Boolean(draft[field.key])) || undefined} className="border-t border-slate-200 pt-2">
          <summary className="cursor-pointer text-xs font-medium text-sky-800">Thông tin khác: phụ huynh, giấy tờ, học tập</summary>
          <div className="mt-3 student-search-grid">{extra.map(renderField)}</div>
        </details>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-slate-50 px-3 py-2">
        <p role="status" aria-label="Kết quả tìm kiếm dự kiến" className="mr-auto text-xs text-slate-600">Phù hợp <strong>{count}/{rows.length}</strong> học sinh trong phạm vi đang lọc.</p>
        <button type="button" className="h-8 rounded border border-slate-300 bg-white px-3 text-xs text-slate-600" onClick={() => setDraft({})}>Xóa lựa chọn</button>
        <button type="button" onClick={onClose} className="h-8 rounded border border-slate-300 bg-white px-3 text-xs text-slate-600">Hủy</button>
        <button type="submit" className="flex h-8 items-center gap-1.5 rounded bg-sky-700 px-4 text-xs font-medium text-white"><Search className="h-3.5 w-3.5" />Lọc</button>
      </div>
    </form>
  </div>;
}


