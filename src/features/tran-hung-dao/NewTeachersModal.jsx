import { X } from 'lucide-react';

export default function NewTeachersModal({
  activeTeachingBatch,
  previousTeachingBatch,
  rows = [],
  normalizeTeacherNameKey,
  onClose
}) {
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/45 p-3">
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col rounded-3xl border border-amber-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <div className="text-xs font-black uppercase text-amber-700">Giáo viên mới so với đợt trước</div>
            <div className="mt-1 text-lg font-black text-slate-900">{activeTeachingBatch?.name || ''}</div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-auto p-4">
          {!previousTeachingBatch && (
            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Đây là đợt đầu tiên nên chưa có đợt trước để đối chiếu.
            </div>
          )}
          {previousTeachingBatch && !rows.length && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              Không có giáo viên mới so với đợt trước.
            </div>
          )}
          {rows.length > 0 && (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
                  <th className="w-12 border border-slate-200 px-2 py-2 text-center">STT</th>
                  <th className="border border-slate-200 px-2 py-2">Họ và tên</th>
                  <th className="w-28 border border-slate-200 px-2 py-2">Chuyên môn</th>
                  <th className="w-28 border border-slate-200 px-2 py-2">Chức vụ</th>
                  <th className="w-40 border border-slate-200 px-2 py-2">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`new-teacher-${normalizeTeacherNameKey(row.teacherName)}`} className="bg-white">
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-500">{index + 1}</td>
                    <td className="border border-slate-200 px-2 py-1.5 font-semibold text-slate-800">{row.teacherName}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.specialty}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.position}</td>
                    <td className="whitespace-pre-wrap border border-slate-200 px-2 py-1.5 text-slate-600">{row.note || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
