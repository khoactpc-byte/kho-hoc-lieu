import { useState } from 'react';
import { legacyScorebookPreview } from '../utils/legacyScorebookPreview';

export default function LegacyScorebookPreview({ edits, students, scoreSubjects = [], reviewSubjects = [] }) {
  const [selectedId, setSelectedId] = useState('');
  const groups = legacyScorebookPreview(edits);
  const selected = groups.find(group => group.id === selectedId) || groups[0];
  if (!selected) return <p className="mt-2">Bản cũ không có ô điểm môn học theo số dòng để xem.</p>;
  const title = group => `${group.semester === 'hki' ? 'HKI' : 'HKII'} · ${(group.kind === 'Score' ? scoreSubjects : reviewSubjects)[group.page]?.title || `Môn ${group.page + 1}`}`;
  const columns = ['TX 1', 'TX 2', 'TX 3', 'TX 4', 'Giữa kỳ', 'Cuối kỳ', 'Học kỳ', 'Cả năm', 'Đánh giá lại', 'Ghi chú'];
  const columnKey = index => index === 9 ? 'note' : `${selected.kind === 'Score' ? 's' : 'g'}${index}`;
  return <div className="mt-2 text-slate-700">
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">Điểm gốc:
        <select value={selected.id} onChange={event => setSelectedId(event.target.value)} className="h-8 max-w-full rounded border border-slate-300 bg-white px-2">
          {groups.map(group => <option key={group.id} value={group.id}>{title(group)}</option>)}
        </select>
      </label>
      <span className="text-xs text-slate-500">{selected.rows.length} dòng có dữ liệu · chỉ xem, chưa gắn với học sinh</span>
    </div>
    <div className="max-h-60 overflow-auto rounded border border-slate-200 bg-white">
      <table className="w-full border-collapse whitespace-nowrap text-left text-xs" aria-label="Điểm gốc theo số dòng">
        <thead className="sticky top-0 bg-slate-100"><tr>
          <th className="border-b px-2 py-2 font-normal">Dòng cũ</th>
          <th className="border-b px-2 py-2 font-normal">Tên hiện có để đối chiếu</th>
          {columns.map(label => <th key={label} className="border-b px-2 py-2 font-normal">{label}</th>)}
        </tr></thead>
        <tbody>{selected.rows.map(row => <tr key={row.index} className="even:bg-slate-50">
          <td className="border-b px-2 py-1.5">{row.index + 1}</td>
          <td className="border-b px-2 py-1.5 text-slate-500">{students[row.index]?.fullName || 'Không có trong danh sách hiện có'}</td>
          {columns.map((label, index) => <td key={label} className="border-b px-2 py-1.5">{row.values[columnKey(index)]?.join(' / ') || ''}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
