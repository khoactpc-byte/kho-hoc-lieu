import { Plus, Save, Trash2 } from 'lucide-react';

export default function ThdClassesPanel({
  classesByGrade = {},
  classGrades = [],
  hasChanges = false,
  onSave,
  onUpdateClass,
  onAddClass,
  onDeleteClass
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase text-sky-900">Trần Hưng Đạo</div>
            <div className="text-lg font-semibold text-sky-950">Danh sách lớp</div>
          </div>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {classGrades.map(grade => (
          <div key={`thd-class-grade-${grade}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 text-sm font-semibold uppercase text-sky-900">Khối {grade}</div>
            <table className="w-full border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase text-slate-500">
                  <th className="w-10 px-2">STT</th>
                  <th className="px-2">Tên lớp</th>
                  <th className="w-10 px-2 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody>
                {(classesByGrade?.[grade] || []).map((className, index) => (
                  <tr key={`thd-class-${grade}-${index}`} className="bg-slate-50">
                    <td className="rounded-l-lg px-2 py-1.5 text-center text-slate-500">{index + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        key={`thd-class-input-${grade}-${index}-${className}`}
                        defaultValue={className}
                        onBlur={(event) => onUpdateClass(grade, index, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-semibold outline-none focus:border-sky-400"
                      />
                    </td>
                    <td className="rounded-r-lg px-2 py-1.5 text-center">
                      <button type="button" onClick={() => onDeleteClass(grade, index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50" title="Xóa lớp">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => onAddClass(grade)} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100">
              <Plus className="h-4 w-4" /> Thêm lớp
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
