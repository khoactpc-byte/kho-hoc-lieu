import { ClipboardPaste, Save, Trash2 } from 'lucide-react';

export default function ThdTeachersPanel({
  teachers = [],
  pasteText = '',
  showPaste = false,
  hasChanges = false,
  positionOptions = [],
  onTogglePaste,
  onPasteTextChange,
  onParsePaste,
  onClosePaste,
  onClearAll,
  onSave,
  onUpdateTeacher,
  onDeleteTeacher,
  onAddTeacher
}) {
  const splitIndex = Math.ceil(teachers.length / 2);
  const groups = [
    { offset: 0, rows: teachers.slice(0, splitIndex) },
    { offset: splitIndex, rows: teachers.slice(splitIndex) }
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase text-sky-900">Trần Hưng Đạo</div>
            <div className="text-lg font-semibold text-sky-950">Danh sách giáo viên riêng</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onTogglePaste} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-sky-600 px-3 text-xs font-semibold text-white shadow hover:bg-sky-700">
              <ClipboardPaste className="h-4 w-4" /> {showPaste ? 'Ẩn khung dán' : 'Dán danh sách'}
            </button>
            <button type="button" onClick={onClearAll} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100">
              <Trash2 className="h-4 w-4" /> Xóa tất cả
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!hasChanges}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${hasChanges ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
            >
              <Save className="h-4 w-4" /> Lưu
            </button>
          </div>
        </div>
      </div>

      {showPaste && (
        <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase text-sky-900">
            <ClipboardPaste className="h-4 w-4" /> Dán danh sách giáo viên Trần Hưng Đạo
          </div>
          <textarea
            value={pasteText}
            onChange={(event) => onPasteTextChange(event.target.value)}
            placeholder="Dán từ Excel: STT | Họ và tên | Chuyên môn | Chức vụ | Ghi chú. Nếu chỉ có Họ và tên | Chuyên môn cũng được."
            className="min-h-[110px] w-full rounded-xl border border-sky-100 bg-sky-50/40 p-3 text-sm font-normal outline-none focus:border-sky-400"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onParsePaste} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-sky-700">Đưa vào bảng</button>
            <button type="button" onClick={onClosePaste} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Đóng</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {groups.map((group, groupIndex) => (
          <div key={`thd-teacher-col-${groupIndex}`} className={`${groupIndex === 1 && !group.rows.length ? 'hidden xl:block' : ''} overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm`}>
            <table className="w-full min-w-[680px] border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase text-slate-500">
                  <th className="w-10 px-2">STT</th>
                  <th className="px-2">Họ và tên</th>
                  <th className="w-40 px-2">Chuyên môn</th>
                  <th className="w-20 px-2">CV</th>
                  <th className="w-48 px-2">Ghi chú</th>
                  <th className="w-12 px-2 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((teacher, rowIndex) => {
                  const index = rowIndex + group.offset;
                  return (
                    <tr key={`thd-teacher-${index}`} className="bg-slate-50">
                      <td className="rounded-l-lg px-2 py-1.5 text-center text-slate-500">{index + 1}</td>
                      <td className="px-2 py-1.5">
                        <input value={teacher.name} onChange={(event) => onUpdateTeacher(index, { name: event.target.value })} placeholder="Nhập tên giáo viên..." className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-sky-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={teacher.subject} onChange={(event) => onUpdateTeacher(index, { subject: event.target.value })} placeholder="VD: Toán" className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-sky-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={teacher.position || 'GV'} onChange={(event) => onUpdateTeacher(index, { position: event.target.value })} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-center font-normal outline-none focus:border-sky-400">
                          {positionOptions.map(position => <option key={position} value={position}>{position}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={teacher.note} onChange={(event) => onUpdateTeacher(index, { note: event.target.value })} placeholder="Ghi chú..." className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-sky-400" />
                      </td>
                      <td className="rounded-r-lg px-2 py-1.5 text-center">
                        <button type="button" onClick={() => onDeleteTeacher(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50" title="Xóa dòng">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <button type="button" onClick={onAddTeacher} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
        + Thêm GV
      </button>
    </div>
  );
}
