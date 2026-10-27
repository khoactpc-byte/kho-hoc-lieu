import { ChevronRight } from 'lucide-react';

export default function StudentMobileList({ students, selectedIds, onToggle, onOpen, showPortraits, allSelected, onToggleAll }) {
  return <div className="student-mobile-list" aria-label="Danh sách học sinh trên điện thoại">
    <label className="student-mobile-select-all"><input type="checkbox" checked={allSelected} onChange={onToggleAll} disabled={!students.length} />Chọn tất cả trong danh sách<span>{selectedIds.size ? `${selectedIds.size} đã chọn` : ''}</span></label>
    {!students.length && <p className="p-4 text-sm text-slate-500">Chưa có học sinh trong năm học hoặc bộ lọc này.</p>}
    <ul>{students.map(student => <li key={student.id} data-selected={selectedIds.has(student.id)}>
      <label className="student-mobile-select"><input type="checkbox" checked={selectedIds.has(student.id)} onChange={() => onToggle(student.id)} aria-label={`Chọn ${student.fullName}`} /></label>
      <button type="button" className="student-mobile-open" aria-label={`Mở hồ sơ ${student.fullName}`} onClick={() => onOpen(student)}>
        {showPortraits && student.portraitUrl && <img src={student.portraitUrl} alt="" loading="lazy" />}
        <span className="student-mobile-identity"><strong>{student.fullName || 'Chưa có họ tên'}</strong><span>{student.className || 'Chưa xếp lớp'} · {student.accessCode || 'Chưa cấp mã'}{student.status === 'dropped' ? ' · Bỏ học' : student.status === 'completed' ? ' · Đã tốt nghiệp' : ''}</span></span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </li>)}</ul>
  </div>;
}
