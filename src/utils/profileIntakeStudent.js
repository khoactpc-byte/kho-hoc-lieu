import { normalizeSchoolCode, DEFAULT_SCHOOL_CODE } from './schoolClasses.js';
// Only call after the existing password/session endpoint has authenticated the
// account. This is a form identity, never an authoritative Firestore student ID.
export function intakeStudentFromVerifiedSession(profile,expectedCode=profile?.accessCode){
  const code=String(profile?.accessCode || '').toUpperCase(),schoolCode=normalizeSchoolCode(profile?.schoolCode) || (!profile?.schoolCode?DEFAULT_SCHOOL_CODE:'');
  if(!/^HS\d{3,15}$/.test(code) || code!==String(expectedCode || '').toUpperCase() || !['NAN','TQK'].includes(schoolCode)
    || !/^20\d{2}-20\d{2}$/.test(profile?.schoolYear || '') || !/^[1-9]/.test(profile?.className || '') || !(profile?.expiresAt>Date.now()))throw new Error('Phiên học sinh chưa đủ dữ liệu để mở biểu mẫu tiếp nhận. Hãy đăng nhập lại.');
  return {id:`intake-${schoolCode}-${profile.schoolYear}-${code}`,accessCode:code,fullName:profile.fullName || '',className:profile.className,
    grade:String(profile.className).match(/^\d+/)[0],schoolYear:profile.schoolYear,schoolCode,status:'active',intakeOnly:true};
}
