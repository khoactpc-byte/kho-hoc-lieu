import { useEffect, useRef, useState } from 'react';
import { createLessonPresentationTools, lessonRevisionPayload, parseLessonRevision } from '../utils/lessonPresentation';
import { createLessonSupportTools } from '../utils/lessonSupport';

export default function useLessonNormalization({ contextKey, getSource, applyHtml, requestAI, subject, grade, ownerKey = '' }) {
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [undo, setUndo] = useState(null);
  const sequence = useRef(0), scope = useRef(contextKey), pending = useRef(false), controller = useRef(null);
  scope.current = contextKey;
  useEffect(() => () => { sequence.current++; controller.current?.abort(); pending.current = false; }, [contextKey]);
  const visible = preview?.contextKey === contextKey ? preview : null;
  const close = () => { sequence.current++; controller.current?.abort(); pending.current = false; setPreview(null); setBusy(false); setError(''); };
  const open = () => {
    close();
    const original = getSource();
    if (!original?.trim()) { setError('Chưa có nội dung bài học để chuẩn hóa.'); return; }
    const formatted = createLessonPresentationTools(window).format(original, { subject });
    setPreview({ contextKey, original, formatted: formatted.html, html: formatted.html, warnings: formatted.warnings, cleanups: formatted.cleanups, changes: [], aiChecked: false });
  };
  const revise = async (instruction = '', practiceOptions = {}) => {
    if (!visible || pending.current) return;
    const request = ++sequence.current, captured = visible, aiPracticeOptions = { practiceCount:practiceOptions.practiceCount, practiceDifficulty:practiceOptions.practiceDifficulty };
    controller.current = new AbortController();
    pending.current = true; setBusy(true); setError('');
    try {
      const tools = createLessonPresentationTools(window), blocks = tools.blocks(captured.formatted);
      const text = await requestAI(lessonRevisionPayload(blocks, { subject, grade, instruction, ...aiPracticeOptions }), { signal: controller.current.signal });
      if (request !== sequence.current || scope.current !== captured.contextKey) return;
      const aiResult = parseLessonRevision(text);
      const result = createLessonSupportTools(window).apply(captured.formatted, aiResult, { includeMath: false, instruction, ...aiPracticeOptions });
      setPreview({ ...captured, ...result, aiResult, aiInstruction:instruction, aiPracticeOptions, aiChecked: true });
    } catch (failure) {
      if (request === sequence.current && scope.current === captured.contextKey) setError(failure.message || 'Chưa rà được bằng AI. Thầy cô vẫn có thể dùng bản chuẩn hóa trình bày.');
    } finally {
      if (request === sequence.current) { pending.current = false; setBusy(false); }
    }
  };
  const apply = () => {
    if (!visible || busy) return false;
    if (getSource() !== visible.original) { setError('Bài đang soạn đã thay đổi. Đóng xem trước rồi chuẩn hóa lại để giữ các chỉnh sửa mới.'); return false; }
    if (applyHtml(visible.html) === false) { setError('Bài học chưa sẵn sàng để áp dụng. Nội dung gốc vẫn được giữ.'); return false; }
    setUndo({ contextKey, before: visible.original, after: visible.html }); close(); return true;
  };
  const toggleChange = id => {
    if (!visible?.aiResult || busy) return;
    const selectedIds = visible.changes.filter(change => change.id === id ? !change.selected : change.selected).map(change => change.id);
    const result = createLessonSupportTools(window).apply(visible.formatted, visible.aiResult, { selectedIds, instruction:visible.aiInstruction, ...visible.aiPracticeOptions });
    setPreview({ ...visible, ...result });
  };
  const restore = () => {
    if (undo?.contextKey !== contextKey || getSource() !== undo.after) return false;
    if (applyHtml(undo.before) === false) return false;
    setUndo(null); return true;
  };
  const updatePreviewHtml = (html, expectedHtml) => {
    if (!visible || busy || visible.html !== expectedHtml || getSource() !== visible.original) {
      setError('Bài hoặc vùng đang soạn đã thay đổi. Thầy cô mở lại chuẩn hóa trước khi chèn.'); return false;
    }
    setPreview(current => current?.contextKey === contextKey && current.html === expectedHtml
      ? { ...current, html, formatted: html, changes: [], aiResult: null, aiInstruction:'', aiPracticeOptions:null, aiChecked: false,
        warnings: createLessonPresentationTools(window).format(html, { subject }).warnings } : current);
    return true;
  };
  return { preview: visible, busy: !!visible && busy, error: visible ? error : '', open, close, revise, apply, restore, toggleChange, updatePreviewHtml,
    assistantContext: { contextKey, subject, grade, ownerKey, requestAI, sourceIsCurrent: () => !!visible && getSource() === visible.original },
    canUndo: undo?.contextKey === contextKey && getSource() === undo.after };
}
