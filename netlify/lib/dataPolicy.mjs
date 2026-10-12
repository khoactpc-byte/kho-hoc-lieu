import { SCOREBOOK_SOURCE_FILE, QUICK_SCORE_SUBJECTS } from '../../src/config/scorebookDomain.js';
import { extractSchoolYearFromText } from '../../src/utils/schoolYearText.js';
import { PRIMARY_SCOREBOOK_SOURCE, PRIMARY_TERMS, PRIMARY_QUALITIES, PRIMARY_SUBJECT_LEVELS, PRIMARY_QUALITY_LEVELS, PRIMARY_YEAR_LEVELS, primarySubjectsForGrade, primaryHasTest, normalizePrimaryScore } from '../../src/utils/primaryAcademic.js';
export const fail = (ok, status, message) => { if (!ok) throw Object.assign(new Error(message), { status }); };
export const documentId = value => { fail(typeof value === 'string' && value.length > 0 && value.length <= 300 && !value.includes('/') && !['.', '..', '__proto__', 'constructor', 'prototype'].includes(value), 400, 'Mã dữ liệu không hợp lệ.'); return value; };
export const teacherScope = (actor, data) => fail(actor.role === 'admin' || actor.role === 'teacher' && actor.schoolCode === data.schoolCode && actor.grades?.map(String).includes(String(data.grade)) && actor.subjects?.includes(data.subject), 403, 'Chưa được phân công phạm vi này.');
export function writable(settings, schoolYear) {
  fail(!settings.maintenance?.active, 423, 'Hệ thống đang sao lưu hoặc phục hồi.');
  fail(extractSchoolYearFromText(schoolYear, '') === schoolYear, 400, 'Năm học không hợp lệ.');
  fail(!settings.inputYearLocks?.[schoolYear], 423, 'Năm học đang khóa nhập liệu.');
}
export function activeStudent(actor, profile, settings) {
  fail(actor.role === 'student' && profile && profile.status !== 'dropped' && profile.accessCode === actor.accessCode
    && profile.schoolCode === actor.schoolCode && extractSchoolYearFromText(profile.schoolYear, '') === actor.schoolYear
    && String(profile.className || '').match(/^[1-9]\d*/)?.[0] === actor.grade, 403, 'Hồ sơ đã thay đổi. Đăng nhập lại.');
  fail(extractSchoolYearFromText(settings.schoolYear, '') === actor.schoolYear, 403, 'Chỉ được nộp trong năm học hiện tại.');
  writable(settings, actor.schoolYear);
}
export function scoreCell(actor, metadata, key) {
  if (metadata.sourceFile === PRIMARY_SCOREBOOK_SOURCE) {
    fail(/^[1-5]$/.test(String(metadata.grade)) && metadata.schoolCode && !/:r\d+(?::|$)/.test(key) && key.length <= 500, 400, 'Phạm vi sổ tiểu học không hợp lệ.');
    const match = key.match(/^custom:primary:(mid1|end1|mid2|end2):([a-z_]+):u([^:]+):(score|level|comment|quality|promotion)$/);
    fail(match, 400, 'Ô đánh giá tiểu học không hợp lệ.');
    const [, term, subjectKey, identity, field] = match;
    const subject = primarySubjectsForGrade(metadata.grade).find(item => item.key === subjectKey);
    const quality = PRIMARY_QUALITIES.some(item => item.key === subjectKey);
    fail(PRIMARY_TERMS.some(item => item.key === term) && (field === 'quality' ? quality : subjectKey === 'summary' ? ['level', 'comment', 'promotion'].includes(field) : subject && ['score', 'level', 'comment'].includes(field)), 400, 'Nội dung không thuộc khối tiểu học này.');
    fail(field !== 'score' || primaryHasTest(subject, term, metadata.grade), 400, 'Không có bài kiểm tra định kỳ ở thời điểm này.');
    teacherScope(actor, { ...metadata, subject: field === 'quality' || subjectKey === 'summary' ? 'Chủ nhiệm' : subject.label });
    return { studentKey: decodeURIComponent(identity), primary: true, subject: subject?.label || 'Chủ nhiệm',
      normalize: field === 'score' ? normalizePrimaryScore : null,
      levels: field === 'quality' ? PRIMARY_QUALITY_LEVELS : field === 'level' ? (subjectKey === 'summary' ? PRIMARY_YEAR_LEVELS : PRIMARY_SUBJECT_LEVELS) : null };
  }
  fail(metadata.sourceFile === SCOREBOOK_SOURCE_FILE && /^[1-9]\d?$/.test(String(metadata.grade)) && metadata.schoolCode, 400, 'Mẫu hoặc phạm vi sổ điểm không hợp lệ.');
  fail(!/:r\d+(?::|$)/.test(key) && key.length <= 500, 400, 'Ô điểm thiếu định danh ổn định.');
  const match = key.match(/^custom:(hki|hkii)(Score|Review):(\d+):u([^:]+):([sg])(\d+)$/);
  if (actor.role === 'admin' && !match) return null;
  fail(match, 403, 'Chỉ được sửa ô nhập điểm của môn được phân công.');
  const subject = QUICK_SCORE_SUBJECTS.find(item => item.pageIndex === Number(match[3]));
  fail(subject, 403, 'Môn chưa có quy tắc nhập điểm.');
  teacherScope(actor, { ...metadata, subject: subject.name });
  const index = Number(match[6]);
  fail(match[2] === 'Score' ? match[5] === 's' && index < 6 && (index >= 4 || index < subject.txCount) : match[5] === 'g' && index < 6, 403, 'Không được ghi cột tính toán.');
  return { studentKey: decodeURIComponent(match[4]), numeric: match[2] === 'Score', subject: subject.name };
}
export const scoreValue = value => {
  if (value == null || value === '') return null;
  const number = Number(String(value).trim().replace(',', '.'));
  fail(Number.isFinite(number) && number >= 0 && number <= 10, 400, 'Điểm phải từ 0 đến 10.');
  return (Math.round(number * 10) / 10).toFixed(1);
};
