const kinds = { note: 'lesson_notes', quiz: 'lesson_quizzes', material: 'materials' };
export const LEARNING_UPDATES_COLLECTION = 'learning_updates';
export const learningSourceCollection = kind => kinds[kind] || '';
export const learningUpdateId = (kind, sourceId) => `${kind}-${sourceId}`;
export function learningUpdateMetadata(kind, sourceId, source = {}) {
  if (!kinds[kind] || !sourceId || String(sourceId).includes('/')) return null;
  const schoolYear = String(source.schoolYear || ''), schoolCode = String(source.schoolCode || 'NAN');
  const grade = String(source.grade || ''), subject = String(source.subject || '').trim(), lesson = String(source.lesson || '');
  const updatedAt = Number(source.updatedAt || source.createdAt || 0);
  if (!/^20\d{2}-20\d{2}$/.test(schoolYear) || !/^[A-Z0-9_-]{1,20}$/.test(schoolCode)
    || !/^(?:[1-9]|1[0-2])$/.test(grade) || !subject || subject.length > 100 || !lesson || lesson.length > 50 || !Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  const isQuiz = kind === 'quiz' || source.type === 'quick_quiz';
  const hasContent = Boolean(String(source.content || source.sourceContent || '').trim() || source.hasContent || source.quizData?.questions?.length);
  const scheduled = typeof source.publishAt === 'number' ? source.publishAt : Date.parse(String(source.publishAt || ''));
  const availableAt = isQuiz && !source.isPublished && !(kind === 'material' && source.type === 'quick_quiz') && Number.isFinite(scheduled) ? scheduled : 0;
  const enabled = isQuiz ? hasContent && (source.isPublished === true || availableAt > 0 || kind === 'material' && source.type === 'quick_quiz')
    : kind === 'note' ? hasContent : Boolean(source.url || source.driveFileId);
  // Explicit projection: never publish lesson text, quiz questions/answers, URLs or author identity.
  return { kind, sourceId: String(sourceId), schoolYear, schoolCode, grade, subject, lesson, updatedAt,
    availableAt, enabled, isQuiz };
}
export function learningUpdateFeed(records, { schoolYear, schoolCode = 'NAN', grade = '', student = false, now = Date.now(), weekLabel = value => `Tuần ${value}` } = {}) {
  if (student && !grade) return [];
  return records.filter(item => item.enabled === true && item.schoolYear === schoolYear && item.schoolCode === schoolCode
    && (!grade || item.grade === String(grade)) && item.availableAt <= now && kinds[item.kind])
    .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8).map(item => ({
      id: learningUpdateId(item.kind, item.sourceId), sourceKind: item.kind, sourceId: item.sourceId, targetSchoolCode: item.schoolCode,
      isAuto: true, iconType: item.isQuiz ? 'quiz' : item.kind === 'note' ? 'note' : 'material',
      targetGrade: item.grade, targetSubject: item.subject, targetLesson: item.lesson, timestamp: item.updatedAt,
      title: `GV vừa ${item.isQuiz ? 'mở bài kiểm tra' : item.kind === 'note' ? 'cập nhật bài học' : 'đăng bài học'}: ${item.subject} ${item.grade} · ${weekLabel(item.lesson)}`
    }));
}

export function buildLearningTicker({ records = [], notes = [], quizzes = [], materials = [], ...context } = {}) {
  const sources = new Map(records.filter(item => kinds[item.kind]).map(item => [learningUpdateId(item.kind, item.sourceId), item]));
  for (const [kind, rows] of [['note', notes], ['quiz', quizzes], ['material', materials]]) {
    for (const row of rows) {
      const key = learningUpdateId(kind, row.id);
      // Live records take precedence even when a quiz has just been withdrawn.
      const item = learningUpdateMetadata(kind, row.id, { schoolYear: context.schoolYear, ...row });
      if (item) sources.set(key, item); else sources.delete(key);
    }
  }
  return learningUpdateFeed([...sources.values()], context);
}

export function learningUpdateDestination(item, { grade = '', schoolCode = '' } = {}) {
  if (!item?.isAuto || !['note', 'quiz', 'material'].includes(item.iconType) || !item.targetGrade || !item.targetSubject || !item.targetLesson) return null;
  if (!grade || String(item.targetGrade) !== String(grade) || item.targetSchoolCode && item.targetSchoolCode !== schoolCode) return null;
  return { grade: String(grade), subject: item.targetSubject, lesson: String(item.targetLesson), sourceId: item.sourceId || '',
    section: item.iconType === 'quiz' ? item.sourceKind === 'material' ? 'quickQuiz' : 'quiz' : 'lesson' };
}
