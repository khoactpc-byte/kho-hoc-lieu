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
    <div className="fixed inset-x-0 top-[114px] sm:top-[84px] bottom-0 z-[120] bg-slate-100 p-2 font-normal text-slate-700 sm:p-3">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-normal text-slate-800">
              <ClipboardCheck className="w-5 h-5 text-sky-600" /> Tuyển sinh {schoolYear}
            </h3>
            <div className="text-xs text-slate-500">{applications.length} hồ sơ đăng ký tuyển sinh</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onReset} disabled={isResetting || applications.length === 0} className="h-8 rounded border border-rose-100 bg-rose-50 px-3 text-xs text-rose-600 disabled:opacity-40">
              {isResetting ? 'Đang xóa...' : 'Reset danh sách'}
            </button>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-100" aria-label="Đóng danh sách tuyển sinh">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto">
            <table aria-label="Danh sách tuyển sinh" className="student-database-table min-w-[1400px] w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-sky-700 text-white">
                <tr>
                  <th className="px-2 py-1 font-normal">Thời gian</th>
                  <th className="px-2 py-1 font-normal">Cơ sở</th>
                  <th className="px-2 py-1 font-normal">Họ và tên</th>
                  <th className="px-2 py-1 font-normal">Ngày sinh</th>
                  <th className="px-2 py-1 font-normal">Nơi sinh</th>
                  <th className="px-2 py-1 font-normal">SĐT</th>
                  <th className="px-2 py-1 font-normal text-center">Lớp đăng ký</th>
                  <th className="px-2 py-1 font-normal">Tỉnh/TP</th>
                  <th className="px-2 py-1 font-normal">Xã/Phường</th>
                  <th className="px-2 py-1 font-normal">Số nhà, đường</th>
                  {documents.map(item => <th key={item.key} className="px-2 py-1 font-normal text-center">{item.shortLabel || item.label}</th>)}
                  <th className="px-2 py-1 font-normal text-center">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.length === 0 ? (
                  <tr><td colSpan={11 + documents.length} className="px-4 py-10 text-center text-sm font-normal text-slate-400">Chưa có hồ sơ tuyển sinh.</td></tr>
                ) : applications.map(item => {
                  const address = parseAddress(item.address);
                  return (
                    <tr key={item.id} className="even:bg-slate-50 hover:bg-sky-50">
                      <td className="px-2 py-1 text-xs font-normal text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '-'}</td>
                      <td className="px-2 py-1 font-normal text-sky-800">{item.schoolName || (item.classSuffix ? `Cơ sở ${item.classSuffix}` : '-')}</td>
                      <td className="px-2 py-1 font-normal text-slate-900">{item.fullName || '-'}</td>
                      <td className="px-2 py-1 font-normal text-slate-700">{formatDate(item.birthDate)}</td>
                      <td className="px-2 py-1 font-normal text-slate-700">{item.birthPlace || '-'}</td>
                      <td className="px-2 py-1 font-normal text-slate-700">{item.phone || '-'}</td>
                      <td className="px-2 py-1 font-normal text-sky-700 text-center">{item.targetClass || '-'}</td>
                      <td className="px-2 py-1 font-normal text-slate-700">{address.province}</td>
                      <td className="px-2 py-1 font-normal text-slate-700">{address.commune}</td>
                      <td className="px-2 py-1 font-normal text-slate-700">{address.detailed}</td>
                      {documents.map(documentItem => (
                        <td key={`${item.id}-${documentItem.key}`} className="px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(item.documents?.[documentItem.key])}
                            onChange={event => onToggleDocument(item.id, documentItem.key, event.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                            aria-label={`${documentItem.label} của ${item.fullName || 'học sinh'}`}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-center">
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
