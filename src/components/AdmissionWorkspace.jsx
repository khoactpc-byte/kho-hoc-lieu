import React from 'react';
import { ClipboardCheck, Trash2, X } from 'lucide-react';

export default function AdmissionWorkspace({
  applications,
  schoolYear,
  documents,
  isResetting,
  formatDate,
  parseAddress,
  onReset,
  onClose,
  onToggleDocument,
  onDelete
}) {
  return (
    <div className="fixed inset-x-0 top-[114px] sm:top-[84px] bottom-0 z-[120] bg-slate-100 overflow-y-auto p-2 sm:p-3">
      <div className="w-full max-w-none px-2 sm:px-6 space-y-3">
        <div className="sticky top-0 z-10 rounded-3xl border border-sky-100 bg-white/95 px-4 sm:px-6 py-4 shadow-lg backdrop-blur flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-black text-sky-950 text-base sm:text-xl uppercase tracking-tight flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-sky-600" /> Tuyển sinh {schoolYear}
            </h3>
            <div className="text-[10px] sm:text-xs font-bold text-sky-700/70 truncate">{applications.length} hồ sơ đăng ký tuyển sinh đã gửi từ bản tin</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onReset} disabled={isResetting || applications.length === 0} className="h-10 rounded-xl bg-rose-50 px-3 text-[10px] font-black uppercase text-rose-600 border border-rose-100 disabled:opacity-40">
              {isResetting ? 'Đang xóa...' : 'Reset danh sách'}
            </button>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg" aria-label="Đóng danh sách tuyển sinh">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-sm">
          <div className="overflow-auto">
            <table className="min-w-[1400px] w-full text-left text-sm">
              <thead className="bg-sky-50 text-[11px] uppercase text-sky-900">
                <tr>
                  <th className="px-4 py-3 font-black">Thời gian</th>
                  <th className="px-4 py-3 font-black">Họ và tên</th>
                  <th className="px-4 py-3 font-black">Ngày sinh</th>
                  <th className="px-4 py-3 font-black">Nơi sinh</th>
                  <th className="px-4 py-3 font-black">SĐT</th>
                  <th className="px-4 py-3 font-black text-center">Lớp đăng ký</th>
                  <th className="px-4 py-3 font-black">Tỉnh/TP</th>
                  <th className="px-4 py-3 font-black">Xã/Phường</th>
                  <th className="px-4 py-3 font-black">Số nhà, đường</th>
                  {documents.map(item => <th key={item.key} className="px-4 py-3 font-black text-center">{item.shortLabel || item.label}</th>)}
                  <th className="px-4 py-3 font-black text-center">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.length === 0 ? (
                  <tr><td colSpan={10 + documents.length} className="px-4 py-10 text-center text-sm font-bold text-slate-400">Chưa có hồ sơ tuyển sinh.</td></tr>
                ) : applications.map(item => {
                  const address = parseAddress(item.address);
                  return (
                    <tr key={item.id} className="hover:bg-sky-50/40">
                      <td className="px-4 py-3 text-xs font-bold text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '-'}</td>
                      <td className="px-4 py-3 font-black text-slate-900">{item.fullName || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{formatDate(item.birthDate)}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{item.birthPlace || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{item.phone || '-'}</td>
                      <td className="px-4 py-3 font-black text-sky-700 text-center">{item.targetClass || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{address.province}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{address.commune}</td>
                      <td className="px-4 py-3 font-bold text-slate-700">{address.detailed}</td>
                      {documents.map(documentItem => (
                        <td key={`${item.id}-${documentItem.key}`} className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(item.documents?.[documentItem.key])}
                            onChange={event => onToggleDocument(item.id, documentItem.key, event.target.checked)}
                            className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                            aria-label={`${documentItem.label} của ${item.fullName || 'học sinh'}`}
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <button type="button" onClick={() => onDelete(item.id)} className="inline-flex items-center justify-center p-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-colors" title="Xóa hồ sơ">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
