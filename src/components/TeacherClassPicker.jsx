import { teacherClassLabel } from '../utils/teacherPresentation';
import useNarrowScreen from '../hooks/useNarrowScreen';

export default function TeacherClassPicker({ profile, grade, onChange }) {
  const narrow = useNarrowScreen();
  if (narrow) return <label className="teacher-class-picker-mobile">Lớp dạy<select aria-label="Chọn lớp giảng dạy" value={grade || ''} onChange={event => onChange(event.target.value)}><option value="" disabled>Chọn lớp</option>{[...(profile?.grades || [])].sort((a,b) => Number(a)-Number(b)).map(item => <option key={item} value={item}>{teacherClassLabel(profile,item)}</option>)}</select></label>;
  return <div className="teacher-class-picker" role="group" aria-label="Lớp giảng dạy"><span>Lớp dạy</span>
    {[...(profile?.grades || [])].sort((a, b) => Number(a) - Number(b)).map(item => <button key={item} type="button" aria-pressed={String(grade) === String(item)} onClick={() => onChange(String(item))}>{teacherClassLabel(profile, item)}</button>)}
  </div>;
}
