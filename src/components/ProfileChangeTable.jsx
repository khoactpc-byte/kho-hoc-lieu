import { CheckCircle2, Trash2, X } from 'lucide-react';
import { hasNewProfileFiles, replacedProfileFileIds } from '../utils/profileDocumentFiles';
import { profileRequestRejectedFields } from '../utils/profileRequestDecisions';

function ChangeValue({ value, isDocument }) {
  if (!value) return <span className="text-slate-400">(trống)</span>;
  if (!isDocument) return value;
  const urls = String(value).split(/\s*,\s*|\n+/).filter(url => /^https?:\/\//i.test(url));
  if (!urls.length) return <span className="break-all">{value}</span>;
  return <div className="flex flex-wrap gap-x-3 gap-y-1">{urls.map((url, index) => <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">{urls.length > 1 ? `Mở file ${index + 1}` : 'Mở file/ảnh'}</a>)}</div>;
}

export default function ProfileChangeTable({ rows, onApprove, onReject, disabled, allowFileCleanup = true, label = 'Thay đổi hồ sơ' }) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200 bg-white">
      <table aria-label={label} className="w-full min-w-[620px] table-fixed border-collapse text-left text-xs font-normal text-slate-700">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th scope="col" className="w-[22%] px-3 py-2 font-normal">Thông tin</th>
            <th scope="col" className="px-3 py-2 font-normal">Hiện tại</th>
            <th scope="col" className="px-3 py-2 font-normal">Đề nghị sửa</th>
            <th scope="col" className="w-24 px-2 py-2 text-center font-normal">Duyệt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const autoCleanup = allowFileCleanup && row.isDocument && hasNewProfileFiles(row.currentValue, row.nextValue) && replacedProfileFileIds(row.currentValue, row.nextValue).length > 0;
            const rejectedFields = profileRequestRejectedFields(Object.fromEntries(rows.map(item => [item.key, item.nextValue])), row.key);
            const rejectTitle = rejectedFields.length > 1 ? 'Từ chối dòng này và các huyện/xã đề nghị phụ thuộc' : 'Từ chối dòng này';
            return (
            <tr key={row.key} className="border-t border-slate-100 align-top">
              <td className="break-words px-3 py-2">{row.label}</td>
              <td className="break-words bg-slate-50/50 px-3 py-2"><ChangeValue value={row.currentValue} isDocument={row.isDocument} /></td>
              <td className="break-words bg-emerald-50/60 px-3 py-2 text-emerald-900"><ChangeValue value={row.nextValue} isDocument={row.isDocument} /></td>
              <td className="px-2 py-1.5">
                <div className="flex justify-center gap-1.5">
                  <button type="button" onClick={() => onApprove(row.key)} disabled={disabled} title={autoCleanup ? 'Duyệt file mới và tự dọn file cũ sau khi đồng bộ thành công' : 'Duyệt dòng này'} aria-label={`Duyệt ${row.label}`} className="flex h-7 w-7 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => onReject(row.key)} disabled={disabled} title={rejectTitle} aria-label={`Từ chối ${row.label}`} className="flex h-7 w-7 items-center justify-center rounded border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
                </div>
                {autoCleanup && (
                  <div title="Chỉ chuyển file cũ vào thùng rác sau khi lưu và đồng bộ thành công; giữ file còn được hồ sơ khác sử dụng."
                    className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] leading-tight text-slate-500">
                    <Trash2 className="h-3 w-3 shrink-0" /> Tự dọn file cũ
                  </div>
                )}
              </td>
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
  );
}
