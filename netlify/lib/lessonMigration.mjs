import { parseFragment, serialize } from 'parse5';
import { createHash } from 'node:crypto';
import { studentHtml } from './studentHtml.mjs';

const fail = message => { throw Object.assign(new Error(message), { status: 422 }); };
export const validLessonId = value => typeof value === 'string' && value.length >= 3 && value.length <= 180
  && /^[\p{L}\p{N}_&-]+$/u.test(value);

// Parse the whole tree: answer sections may use details, tables or nested divs.
export function prepareLessonMigration(noteId, source, { allowEmpty = false } = {}) {
  if (!validLessonId(noteId)) fail('Mã bài học không hợp lệ.');
  const scope = { note_id: noteId, school_code: String(source.schoolCode || ''),
    school_year: String(source.schoolYear || ''), grade: String(source.grade || ''),
    subject: String(source.subject || ''), lesson: Number(source.lesson || source.week || 0) };
  const invalid = [];
  if (!scope.school_code) invalid.push('trường');
  if (!/^\d{4}-\d{4}$/.test(scope.school_year) || Number(scope.school_year.slice(5)) !== Number(scope.school_year.slice(0, 4)) + 1) invalid.push('năm học');
  if (!/^[1-9]$/.test(scope.grade)) invalid.push('khối');
  if (!scope.subject) invalid.push('môn');
  if (!Number.isInteger(scope.lesson) || scope.lesson < 1 || scope.lesson > 35) invalid.push('tuần');
  if (invalid.length) fail(`Bài thiếu hoặc sai: ${invalid.join(', ')}.`);
  if (typeof source.content !== 'string' || !allowEmpty && !source.content.trim()) fail('Bài học chưa có nội dung.');
  const tree = parseFragment(source.content), answers = [];
  const visit = parent => {
    parent.childNodes = (parent.childNodes || []).filter(node => {
      const attrs = Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
      const hidden = (attrs.class || '').split(/\s+/).includes('teacher-only')
        || Object.hasOwn(attrs, 'data-lesson-answer') && attrs['data-student-visible'] !== 'true';
      if (hidden) { answers.push(node); return false; }
      visit(node); return true;
    });
  };
  visit(tree);
  const html = studentHtml(serialize(tree));
  const answerHtml = serialize({ nodeName: '#document-fragment', childNodes: answers });
  const layout = ['auto', 'single', 'double'].includes(source.layoutMode) ? source.layoutMode : 'auto';
  const stamp = Number(source.updatedAt || 0);
  const sourceHash = createHash('sha256').update(JSON.stringify({ ...scope, content: source.content,
    layout, updatedAt: Number.isSafeInteger(stamp) ? stamp : null })).digest('hex');
  return { publicRow: { ...scope, html, layout_mode: layout, published: false,
    source_updated_at: Number.isSafeInteger(stamp) ? stamp : null, content_hash: sourceHash },
  privateRow: { note_id: noteId, answer_html: answerHtml },
  report: { noteId, sourceHash, published: false, hiddenSections: answers.length,
    sourceBytes: Buffer.byteLength(source.content), studentBytes: Buffer.byteLength(html),
    privateBytes: Buffer.byteLength(answerHtml) } };
}
