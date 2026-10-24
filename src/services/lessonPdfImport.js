import { MAX_IMPORTED_LESSON_BYTES, pdfImportNoteId } from '../utils/lessonPdfImport.js';
import { normalizeLessonLayoutMode } from '../utils/lessonLayout.js';

export function createLessonPdfImportService({ context, readNote, saveDraft, assertScope, hasDraft, onSaved }) {
  const check = week => {
    assertScope();
    const noteId = pdfImportNoteId(context, week);
    if (hasDraft(noteId)) throw new Error(`Tuần ${week} có thay đổi chưa lưu. Lưu bài đang soạn trước khi nhập tài liệu.`);
    return noteId;
  };
  const readLessons = async weeks => Object.fromEntries(await Promise.all(weeks.map(async week => {
    const noteId = check(week);
    const data = await readNote(noteId) || {};
    check(week);
    if ((data.schoolCode && data.schoolCode !== context.schoolCode) || (data.grade && String(data.grade) !== String(context.grade)) || (data.subject && data.subject !== context.subject)) throw new Error(`Dữ liệu tuần ${week} không khớp khối/môn/trường đang chọn. Chưa thay bài.`);
    return [week, { noteId, content: data.content || '', layoutMode: normalizeLessonLayoutMode(data.layoutMode), updatedAt: data.updatedAt || null }];
  })));
  const saveLesson = async (row, source) => {
    const noteId = check(row.week);
    if (row.base?.noteId !== noteId || typeof row.base?.content !== 'string' || typeof row.html !== 'string' || !row.html.trim() || row.issues?.length || row.renderIssue || !row.renderChecked) throw new Error('Bài nhập chưa sẵn sàng hoặc sai tuần. Hãy tạo lại bản xem trước.');
    if (new TextEncoder().encode(row.html).length > MAX_IMPORTED_LESSON_BYTES) throw new Error('Bài học quá lớn để lưu.');
    const draft = { noteId, baseContent: row.base.content, baseLayoutMode: row.base.layoutMode, layoutMode: row.base.layoutMode,
      content: row.html, authorId: context.authorId, schoolCode: context.schoolCode, schoolYear: context.schoolYear,
      grade: String(context.grade), subject: context.subject, lesson: String(row.week),
      documentSource: { ...source, importedAt: Date.now() },
      ...(source.sourceType === 'docx' ? {} : { pdfSource: { ...source, importedAt: Date.now() } }) };
    await saveDraft(draft);
    onSaved?.(draft);
  };
  return { readLessons, saveLesson };
}
