import { X } from 'lucide-react';

export default function TeachingCheckModal({
  classNames = [],
  filteredRows = [],
  normalizePeriods,
  onClose,
  onFilterChange,
  onWeeksChange,
  resultFilter = 'all',
  rows = [],
  selectedSchoolYear = '',
  summary = { ok: 0, missing: 0, excess: 0 },
  weeks = ''
}) {
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/45 p-3">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-3xl border border-amber-100 bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <div className="text-xs font-black uppercase text-amber-700">Kiểm tra phân công</div>
            <div className="mt-1 text-xl font-black text-slate-900">{selectedSchoolYear}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-black">
            <label className="flex h-9 items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 text-amber-800">
              <span>Tuần</span>
              <input
                value={weeks}
                onChange={(event) => onWeeksChange(event.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
                onBlur={() => {
                  if (!normalizePeriods(weeks)) onWeeksChange('35');
                }}
                className="h-7 w-14 rounded-lg border border-amber-200 bg-white px-2 text-center text-sm font-black text-slate-800 outline-none focus:border-amber-400"
              />
            </label>
            <button type="button" onClick={() => onFilterChange('all')} className={`rounded-full px-3 py-1 transition-colors ${resultFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
              Tất cả: {rows.length}
            </button>
            <button type="button" onClick={() => onFilterChange('ok')} className={`rounded-full px-3 py-1 transition-colors ${resultFilter === 'ok' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
              Đủ: {summary.ok}
            </button>
            <button type="button" onClick={() => onFilterChange('missing')} className={`rounded-full px-3 py-1 transition-colors ${resultFilter === 'missing' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}>
              Thiếu: {summary.missing}
            </button>
            <button type="button" onClick={() => onFilterChange('excess')} className={`rounded-full px-3 py-1 transition-colors ${resultFilter === 'excess' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
              Dư: {summary.excess}
            </button>
            <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Đóng">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-auto p-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {classNames.map(className => {
              const classRows = filteredRows.filter(row => row.className === className);
              return (
                <div key={`teaching-check-${className}`} className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="bg-slate-100 px-3 py-2 text-sm font-black text-slate-800">{className}</div>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-[11px] font-black uppercase text-slate-500">
                        <th className="border border-slate-200 px-2 py-2">Môn</th>
                        <th className="w-20 border border-slate-200 px-2 py-2 text-center">Cần</th>
                        <th className="w-20 border border-slate-200 px-2 py-2 text-center">Có</th>
                        <th className="w-24 border border-slate-200 px-2 py-2 text-center">Kết quả</th>
                        <th className="border border-slate-200 px-2 py-2">GV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classRows.map(row => {
                        const statusClass = row.diff === 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : (row.diff < 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700');
                        const statusText = row.diff === 0 ? 'Đủ' : (row.diff < 0 ? `Thiếu ${Math.abs(row.diff)}` : `Dư ${row.diff}`);
                        return (
                          <tr key={`${row.className}-${row.subject}`} className="bg-white">
                            <td className="border border-slate-200 px-2 py-1.5 font-semibold text-slate-800">{row.subject}</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{row.expected}</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold text-slate-700">{row.actual || ''}</td>
                            <td className="border border-slate-200 px-2 py-1.5 text-center">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-black ${statusClass}`}>{statusText}</span>
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600">{row.teachers || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {classNames.length === 0 && (
              <div className="xl:col-span-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                Không có lớp/môn phù hợp với bộ lọc này.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
