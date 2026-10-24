export default function TeacherIdentity({ profile }) {
  return <div className="teacher-identity"><span>Giáo viên:</span><strong>{profile?.fullName || profile?.username || 'Giáo viên'}</strong></div>;
}
