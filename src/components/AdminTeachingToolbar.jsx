import { ArrowLeft } from 'lucide-react';
import { ADMIN_TEACHING_SCHOOLS } from '../utils/adminTeachingAccess.js';

export default function AdminTeachingToolbar({ schoolCode, schoolYear, schoolYears, locked, onSchoolChange, onYearChange, onClose }) {
  return <div className="admin-teaching-toolbar" role="region" aria-label="Admin hỗ trợ giáo viên">
    <button type="button" onClick={onClose}><ArrowLeft aria-hidden="true" /> Về Quản trị</button>
    <label><span className="sr-only">Trường</span><select aria-label="Trường hỗ trợ" value={schoolCode} onChange={event => onSchoolChange(event.target.value)}>
      {ADMIN_TEACHING_SCHOOLS.map(school => <option key={school.code} value={school.code}>{school.name}</option>)}
    </select></label>
    <label><span className="sr-only">Năm học</span><select aria-label="Năm học hỗ trợ" value={schoolYear} onChange={event => onYearChange(event.target.value)}>
      {schoolYears.map(year => <option key={year} value={year}>{year}</option>)}
    </select></label>
    {locked && <span className="admin-teaching-locked">Đã khóa nhập liệu</span>}
  </div>;
}
