const displayDate = date => date.split('-').reverse().join('/');

export default function StudentProfileHistory({ rows = [], attendanceState = 'ready', onRetryAttendance }) {
  return (
    <div className="space-y-2 text-sm font-normal text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span><span className="text-slate-700">Quá trình học tại trung tâm</span> · {rows.length ? `Từ năm nhập học ${rows[0].schoolYear}` : 'Chưa có năm nhập học'}</span>
        {attendanceState === 'loading' && <span role="status">Đang tải điểm danh…</span>}
        {attendanceState === 'error' && <span role="alert">Chưa tải được điểm danh. {onRetryAttendance && <button type="button" onClick={onRetryAttendance} className="text-sky-700 underline">Thử lại</button>}</span>}
      </div>
      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="student-database-table w-full min-w-[660px] border-collapse text-left text-[13px]" aria-label="Quá trình học tại trung tâm">
          <thead className="bg-sky-700 text-white">
            <tr>{['Năm học', 'Lớp', 'Học lực', 'Hạnh kiểm', 'Nghỉ học', 'Tình trạng'].map(label => <th key={label} scope="col" className="whitespace-nowrap">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.schoolYear} className={`border-t border-slate-200 ${row.current ? 'bg-sky-50' : 'odd:bg-white even:bg-slate-50/70'}`}>
                <td className="whitespace-nowrap">{row.schoolYear}</td>
                <td className={row.projected ? 'text-slate-500' : ''}>{row.className || '—'}</td>
                <td>{row.academic || '—'}</td>
                <td>{row.conduct || '—'}</td>
                <td>
                  {attendanceState !== 'ready' || !row.attendance ? <span title="Chưa có dữ liệu điểm danh">—</span> : row.attendance.total === 0 ? '0 ngày' : (
                    <details>
                      <summary className="cursor-pointer whitespace-nowrap text-sky-800">{row.attendance.total} ngày <span className="text-xs text-slate-500">({row.attendance.permitted} CP · {row.attendance.unpermitted} KP)</span></summary>
                      <ul className="my-1 space-y-0.5 text-xs text-slate-500">
                        {row.attendance.days.map(day => <li key={day.date}>{displayDate(day.date)} · {day.status}</li>)}
                      </ul>
                    </details>
                  )}
                </td>
                <td className={`whitespace-nowrap ${/bỏ học/i.test(row.status) ? 'text-rose-600' : row.projected ? 'text-slate-400' : 'text-slate-600'}`}>{row.status}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="text-slate-500">Điền năm nhập học để xem quá trình học.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">Ngày nghỉ theo điểm danh đã lưu. CP: Có phép · KP: Không phép · —: Chưa có dữ liệu. Bấm số ngày nghỉ để xem ngày cụ thể.</p>
    </div>
  );
}
