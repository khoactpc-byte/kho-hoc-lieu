import { X } from 'lucide-react';

const SEMESTER_DATE_FIELDS = [
  ['hk1Start', 'HK1 bắt đầu'],
  ['hk1End', 'HK1 kết thúc'],
  ['hk2Start', 'HK2 bắt đầu'],
  ['hk2End', 'HK2 kết thúc'],
  ['tech8Hk2Start', 'Công nghệ 8 HK2 Bắt đầu'],
  ['tech9Hk2Start', 'Công nghệ 9 HK2 Bắt đầu'],
  ['break1Start', 'Nghỉ 1 bắt đầu'],
  ['break1End', 'Nghỉ 1 kết thúc'],
  ['break2Start', 'Nghỉ 2 bắt đầu'],
  ['break2End', 'Nghỉ 2 kết thúc'],
  ['break3Start', 'Nghỉ 3 bắt đầu'],
  ['break3End', 'Nghỉ 3 kết thúc'],
  ['break4Start', 'Nghỉ 4 bắt đầu'],
  ['break4End', 'Nghỉ 4 kết thúc']
];

export default function TeachingTimeSettingsModal({
  dateInputMax = '',
  dateInputMin = '',
  formatDateForNote,
  hasTeachingBatches = false,
  isThdTeachingPanel = false,
  normalizePeriods,
  onClose,
  onSave,
  onSaveBatchWeeks,
  onSettingsTabChange,
  onUpdateSemesterDate,
  openTeachingWeekSettings,
  selectedSchoolYear = '',
  semesterDates = {},
  setTeachingBatchWeeksDraft,
  teachingBatchesForSelectedYear = [],
  teachingBatchWeeksDraft = {},
  teachingSettingsTab = 'time'
}) {
  const save = () => {
    if (teachingSettingsTab === 'weeks' && isThdTeachingPanel && hasTeachingBatches) onSaveBatchWeeks();
    else {
      onClose();
      onSave();
    }
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-900/45 p-3">
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col rounded-3xl border border-indigo-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <div className="text-xs font-black uppercase text-indigo-700">Cài đặt phân công</div>
            <div className="mt-1 text-lg font-black text-slate-900">{selectedSchoolYear}</div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={() => onSettingsTabChange('time')}
            className={`h-9 rounded-xl px-4 text-sm font-black ${teachingSettingsTab === 'time' ? 'bg-indigo-600 text-white shadow' : 'border border-indigo-100 bg-white text-indigo-700 hover:bg-indigo-50'}`}
          >
            Cài đặt thời gian
          </button>
          {isThdTeachingPanel && hasTeachingBatches && (
            <button
              type="button"
              onClick={() => {
                if (teachingSettingsTab !== 'weeks') openTeachingWeekSettings();
              }}
              className={`h-9 rounded-xl px-4 text-sm font-black ${teachingSettingsTab === 'weeks' ? 'bg-sky-600 text-white shadow' : 'border border-sky-100 bg-white text-sky-700 hover:bg-sky-50'}`}
            >
              Cài đặt số tuần
            </button>
          )}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {teachingSettingsTab === 'weeks' && isThdTeachingPanel && hasTeachingBatches ? (
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-left text-xs font-black uppercase text-slate-600">
                  <th className="w-14 border border-slate-200 px-3 py-2 text-center">STT</th>
                  <th className="border border-slate-200 px-3 py-2">Đợt</th>
                  <th className="w-44 border border-slate-200 px-3 py-2 text-center">Ngày áp dụng</th>
                  <th className="w-28 border border-slate-200 px-3 py-2 text-center">Số tuần</th>
                </tr>
              </thead>
              <tbody>
                {teachingBatchesForSelectedYear.map((batch, index) => (
                  <tr key={`teaching-batch-week-${batch.id}`} className="bg-white">
                    <td className="border border-slate-200 px-3 py-2 text-center font-semibold text-slate-500">{index + 1}</td>
                    <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800">{batch.name || `Đợt ${index + 1}`}</td>
                    <td className="border border-slate-200 px-3 py-2 text-center text-slate-700">
                      {batch.startDate && batch.endDate ? `${formatDateForNote(batch.startDate)} - ${formatDateForNote(batch.endDate)}` : 'Chưa có ngày'}
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <input
                        value={teachingBatchWeeksDraft[batch.id] ?? ''}
                        onChange={(event) => {
                          const value = event.target.value.replace(/[^\d.,]/g, '').slice(0, 5);
                          setTeachingBatchWeeksDraft(prev => ({ ...prev, [batch.id]: value }));
                        }}
                        onBlur={() => {
                          setTeachingBatchWeeksDraft(prev => ({
                            ...prev,
                            [batch.id]: normalizePeriods(prev[batch.id]) || normalizePeriods(batch.weeks) || '1'
                          }));
                        }}
                        inputMode="decimal"
                        className="h-9 w-full rounded-xl border border-sky-100 bg-white px-3 text-center font-black text-slate-800 outline-none focus:border-sky-400"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {SEMESTER_DATE_FIELDS.map(([field, label]) => (
                <label key={`teaching-semester-date-${field}`} className="block">
                  <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{label}</div>
                  <input
                    type="date"
                    value={semesterDates[field] || ''}
                    min={dateInputMin}
                    max={dateInputMax}
                    onChange={(event) => onUpdateSemesterDate(field, event.target.value)}
                    className="h-10 w-full rounded-xl border border-indigo-100 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={onClose} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Đóng
          </button>
          <button type="button" onClick={save} className="h-9 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
