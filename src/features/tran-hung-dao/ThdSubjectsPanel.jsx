import { ArrowDown, ArrowUp, Save, Trash2 } from 'lucide-react';

export default function ThdSubjectsPanel({
  subjects = [],
  classGrades = [],
  hasChanges = false,
  onAddSubject,
  onSave,
  onUpdateSubject,
  onMoveSubject,
  onDeleteSubject,
  normalizeSubjectGrades
}) {
  const getSubjectGrades = (value) => (
    typeof normalizeSubjectGrades === 'function'
      ? normalizeSubjectGrades(value)
      : (Array.isArray(value) ? value : [])
  );

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase text-sky-900">Trần Hưng Đạo</div>
            <div className="text-lg font-semibold text-sky-950">Các môn học</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={onAddSubject} className="h-8 rounded-md border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-800 hover:bg-sky-100">
              + Thêm dòng
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

      <div className="max-h-[calc(100vh-9.5rem)] overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <table className="w-full min-w-[1080px] border-separate border-spacing-y-1 text-sm">
          <thead className="sticky top-0 z-30 bg-white shadow-sm [&_th]:bg-white [&_th]:py-2">
            <tr className="bg-white text-left text-[11px] font-semibold uppercase text-slate-500">
              <th className="w-12 px-2 text-center">STT</th>
              <th className="px-2">Môn</th>
              <th className="w-64 px-2">Ghi tắt</th>
              <th className="w-24 px-2 text-center">HK1</th>
              <th className="w-24 px-2 text-center">HK2</th>
              <th className="w-48 px-2 text-center">Khối áp dụng</th>
              <th className="w-32 px-2 text-center">Dòng</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject, index) => {
              const subjectGrades = getSubjectGrades(subject.grades);
              return (
                <tr key={`thd-subject-${index}`} className="bg-slate-50">
                  <td className="rounded-l-lg px-2 py-1.5 text-center text-slate-500">{index + 1}</td>
                  <td className="px-2 py-1.5">
                    <input
                      value={subject.name}
                      onChange={(event) => onUpdateSubject(index, { name: event.target.value })}
                      placeholder="Tên môn đầy đủ..."
                      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-normal outline-none focus:border-sky-400"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={subject.shortName}
                      onChange={(event) => onUpdateSubject(index, { shortName: event.target.value })}
                      placeholder="Ghi tắt dùng ở phân công..."
                      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-semibold outline-none focus:border-sky-400"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={subject.periodsSemester1 || subject.periods || ''}
                      onChange={(event) => onUpdateSubject(index, { periodsSemester1: event.target.value, periods: event.target.value })}
                      inputMode="decimal"
                      placeholder="4"
                      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-center font-semibold outline-none focus:border-sky-400"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={subject.periodsSemester2 || subject.periods || ''}
                      onChange={(event) => onUpdateSubject(index, { periodsSemester2: event.target.value })}
                      inputMode="decimal"
                      placeholder="4"
                      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-center font-semibold outline-none focus:border-sky-400"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap justify-center gap-1">
                      {classGrades.map(grade => {
                        const checked = subjectGrades.includes(grade);
                        return (
                          <button
                            type="button"
                            key={`thd-subject-grade-${index}-${grade}`}
                            onClick={() => {
                              const current = getSubjectGrades(subject.grades);
                              const next = checked ? current.filter(item => item !== grade) : [...current, grade];
                              onUpdateSubject(index, { grades: next.length ? next : classGrades });
                            }}
                            className={`h-7 rounded-md border px-2 text-xs font-semibold ${checked ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-500'}`}
                          >
                            {grade}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="rounded-r-lg px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => onMoveSubject(index, -1)} disabled={index === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời lên">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => onMoveSubject(index, 1)} disabled={index === subjects.length - 1} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30" title="Dời xuống">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => onDeleteSubject(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50" title="Xóa dòng">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
