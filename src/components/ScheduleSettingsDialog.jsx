import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getScheduleTeachingDays, SCHEDULE_DAY_KEYS } from '../utils/scheduleSettings';

export default function ScheduleSettingsDialog({ dayPeriodCounts, weeklyLoads, loadSubjects = [], grades = [], onApply, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...dayPeriodCounts }));
  const [loadDraft, setLoadDraft] = useState(() => weeklyLoads || {});
  const rememberedCounts = useRef({ ...dayPeriodCounts });
  const teachingDays = getScheduleTeachingDays(draft);
  const counts = [...new Set(teachingDays.map(day => draft[day]))];
  const commonCount = counts.length === 1 ? String(counts[0]) : '';
  const totalPeriods = teachingDays.reduce((sum, day) => sum + draft[day], 0);
  const setDayCount = (day, count) => {
    if (count > 0) rememberedCounts.current[day] = count;
    setDraft(prev => ({ ...prev, [day]: count }));
  };

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="schedule-settings-title" className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <h4 id="schedule-settings-title" className="font-normal text-slate-900">Cài đặt thời khóa biểu</h4>
          <button type="button" onClick={onClose} aria-label="Đóng cài đặt thời khóa biểu" className="rounded p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-auto p-3">
          <p className="mb-4 text-sm text-slate-600">Chọn thứ nghỉ và số tiết dạy mỗi ngày. Xếp tự động sẽ giữ đúng cài đặt này.</p>
          <label className="mb-4 flex items-center justify-between gap-3 text-sm font-normal text-slate-700">
            Cùng số tiết cho các ngày dạy
            <select autoFocus aria-label="Số tiết chung cho các ngày dạy" value={commonCount} onChange={event => {
              const count = Number(event.target.value);
              if (!count) return;
              teachingDays.forEach(day => { rememberedCounts.current[day] = count; });
              setDraft(prev => Object.fromEntries(SCHEDULE_DAY_KEYS.map(day => [day, prev[day] ? count : 0])));
            }} className="rounded border border-slate-200 bg-white px-3 py-2">
              <option value="">Tùy từng thứ</option>
              {[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count} tiết</option>)}
            </select>
          </label>
          <div className="space-y-1">
            {SCHEDULE_DAY_KEYS.map(day => (
              <div key={day} className="flex items-center justify-between gap-3 rounded border border-slate-200 p-2">
                <span className="text-sm font-normal text-slate-800">Thứ {day}</span>
                <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" aria-label={`Nghỉ thứ ${day}`} checked={draft[day] === 0} onChange={event => setDayCount(day, event.target.checked ? 0 : (rememberedCounts.current[day] || Number(commonCount) || 5))} className="h-4 w-4 accent-blue-600" /> Nghỉ
                </label>
                <select aria-label={`Số tiết thứ ${day}`} value={draft[day] || rememberedCounts.current[day] || 5} disabled={draft[day] === 0} onChange={event => setDayCount(day, Number(event.target.value))} className="rounded border border-slate-200 bg-white px-2 py-1 text-sm font-normal disabled:opacity-40">
                  {[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count} tiết</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded bg-blue-50 px-2 py-1 text-sm font-normal text-blue-800">{teachingDays.length} ngày dạy · {totalPeriods} tiết/tuần cho mỗi lớp</p>
          {weeklyLoads && <div className="mt-4 overflow-auto">
            <p className="mb-2 text-sm font-normal">Số tiết từng môn mỗi tuần</p>
            <p className="mb-2 text-xs text-slate-500">Nhập số tiết theo kế hoạch của trung tâm. Môn không dạy để 0.</p>
            <table className="w-full text-xs"><thead><tr><th className="p-1 text-left">Môn học</th>{grades.map(grade => <th key={grade}>Khối {grade}</th>)}</tr></thead>
              <tbody>{loadSubjects.map(subject => <tr key={subject.key}><td className="p-1">{subject.label}</td>{grades.map(grade => <td key={grade} className="p-1">
                <input type="number" min="0" max="30" aria-label={`Số tiết ${subject.label} khối ${grade}`} value={loadDraft[grade]?.[subject.key] || 0}
                  onChange={event => setLoadDraft(previous => ({ ...previous, [grade]: { ...previous[grade], [subject.key]: Math.min(30, Math.max(0, Math.floor(Number(event.target.value) || 0))) } }))} className="w-12 rounded border p-1" />
              </td>)}</tr>)}</tbody></table>
          </div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-3 py-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 px-4 py-2 text-sm font-normal text-slate-600">Hủy</button>
          <button type="button" onClick={() => onApply(draft, loadDraft)} className="rounded bg-blue-600 px-4 py-2 text-sm font-normal text-white">Áp dụng</button>
        </div>
      </div>
    </div>
  );
}
