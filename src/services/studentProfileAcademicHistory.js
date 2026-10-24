import { auth, appId, db } from '../config/firebase';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';
import { requestPrivateApi } from './serverQuizClient';
import { readStudentAcademicProjection } from './studentAcademicProjection';
import { readStudentProfileAcademicHistory } from '../utils/studentProfileAcademicHistory';

export async function loadStudentProfileAcademicHistory({ student, records, currentSchoolYear, signal }) {
  if (SCOPED_AUTH_ENABLED) return requestPrivateApi('data', 'studentProfileHistory', {}, { signal });
  const user = auth.currentUser;
  if (!user) throw new Error('Cần đăng nhập để xem kết quả học tập.');
  const token = await user.getIdToken();
  const requireCurrent = () => { if (signal.aborted || auth.currentUser !== user) throw new DOMException('Phiên đã thay đổi.', 'AbortError'); };
  requireCurrent();
  const result = await readStudentProfileAcademicHistory({ student, records, currentSchoolYear, read: async query => {
    requireCurrent();
    const rows = await readStudentAcademicProjection({ projectId: db.app.options.projectId, appId, token, query, signal });
    requireCurrent(); return rows;
  } });
  requireCurrent(); return result;
}
