import { previousGrades, RESULT_OPTIONS } from '../registrationModel';
import { Section, SelectField } from './RegistrationFields';

// Entry grade determines exactly which previous secondary grades are required.
export default function AcademicHistoryFields({ values, errors, onChange }) {
  const grades = previousGrades(values.lopHoc);
  if (!grades.length) return null;
  const entryGrade = Number(values.lopHoc.match(/^\d+/)[0]);
  return <Section title="Thông tin học tập các lớp trước" description={`Đăng ký lớp ${entryGrade}: khai học lực, hạnh kiểm lớp ${grades.join(', ')}.`}>
    <div className="reg-academic-list" style={{ '--reg-academic-columns': grades.length }}>
      {grades.map(grade => <div className="reg-academic-row" key={grade}><div className="reg-grid">
        <SelectField name={`hocLucLop${grade}`} label={`Học lực lớp ${grade}`} required options={RESULT_OPTIONS} values={values} errors={errors} onChange={onChange} placeholder="Chọn" />
        <SelectField name={`hanhKiemLop${grade}`} label={`Hạnh kiểm lớp ${grade}`} required options={RESULT_OPTIONS} values={values} errors={errors} onChange={onChange} placeholder="Chọn" />
      </div></div>)}
    </div>
    <p className="reg-hint reg-academic-hint">Quy đổi học lực cũ: Giỏi → Tốt; Trung bình → Đạt.</p>
  </Section>;
}
