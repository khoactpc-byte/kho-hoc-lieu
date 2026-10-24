import { teacherClassLabel } from '../utils/teacherPresentation';

export default function TeacherClassPicker({ profile, grade, onChange }) {
  return <div className="teacher-class-picker" role="group" aria-label="Lớp giảng dạy"><span>Lớp dạy</span>
    {[...(profile?.grades || [])].sort((a, b) => Number(a) - Number(b)).map(item => <button key={item} type="button" aria-pressed={String(grade) === String(item)} onClick={() => onChange(String(item))}>{teacherClassLabel(profile, item)}</button>)}
  </div>;
}
