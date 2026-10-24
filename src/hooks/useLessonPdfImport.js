import { useEffect, useRef, useState } from 'react';
import { createPdfLessonTools, parsePdfIndex, parsePdfWeek, pdfFilenameGrade, pdfIndexPayload, pdfWeekPayload, validatePdfWeekRows } from '../utils/lessonPdfImport';
import { openLessonPdf, sliceLessonPdf, cropLessonPdfFigures } from '../services/lessonPdfFile';
import { openLessonWord, sliceLessonWord } from '../services/lessonWordFile';
import { wordIndexPayload, wordWeekPayload, wordFigureImages } from '../utils/lessonWordImport';

export default function useLessonPdfImport({ context, requestAI, readLessons, saveLesson }) {
  const [pdf, setPdf] = useState(null), [rows, setRows] = useState([]), [warnings, setWarnings] = useState([]);
  const [phase, setPhase] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(''), [activeId, setActiveId] = useState('');
  const [reviewed, setReviewed] = useState(false), [replaceExisting, setReplaceExisting] = useState(false);
  const operation = useRef(0), controller = useRef(null), stop = useRef(false), callbacks = useRef(null);
  callbacks.current = { requestAI, readLessons, saveLesson };
  useEffect(() => () => { operation.current++; controller.current?.abort(); }, []);
  const update = (id, patch) => setRows(previous => previous.map(row => row.id === id ? { ...row, ...patch } : row));
  const begin = name => {
    controller.current?.abort(); controller.current = new AbortController(); stop.current = false;
    setPhase(name); setError(''); setReviewed(false); setReplaceExisting(false);
    const token = ++operation.current;
    return { token, signal: controller.current.signal, current: () => token === operation.current && !controller.current.signal.aborted };
  };
  const finish = task => { if (task.current()) { setPhase(''); setProgress(''); } };
  const selectFile = async file => {
    const task = begin('reading'); setPdf(null); setRows([]); setWarnings([]); setActiveId('');
    try {
      const detected = pdfFilenameGrade(file?.name);
      if (detected && detected !== String(context.grade)) throw new Error(`Tên tài liệu ghi khối ${detected}, nhưng đang mở khối ${context.grade}. Hãy mở đúng khối trước khi nhập.`);
      const opened = /\.docx?$/i.test(file?.name || '') ? await openLessonWord(file) : await openLessonPdf(file);
      if (task.current()) { setPdf(opened); setWarnings(opened.warnings || []); }
    } catch (failure) { if (task.current()) setError(failure.message); }
    finally { finish(task); }
  };
  const analyze = async () => {
    if (!pdf || phase) return;
    const task = begin('analyzing'); setProgress('Gemini đang đọc danh sách tuần trong tài liệu…');
    try {
      const document = pdf.kind === 'docx' ? { ...sliceLessonWord(pdf), pageCount: pdf.pageCount } : await sliceLessonPdf(pdf);
      const payload = pdf.kind === 'docx' ? wordIndexPayload(document, { ...context, pageCount: pdf.pageCount, sourceType: pdf.kind }) : pdfIndexPayload(document.base64, { ...context, pageCount: pdf.pageCount, sourceType: pdf.kind });
      const text = await callbacks.current.requestAI(payload, task.signal);
      if (!task.current()) return;
      const parsed = parsePdfIndex(text, { ...context, pageCount: pdf.pageCount, sourceType: pdf.kind });
      setRows(parsed.rows); setWarnings([...(pdf.warnings || []), ...parsed.warnings]); setActiveId(parsed.rows[0]?.id || '');
    } catch (failure) { if (task.current()) setError(failure.message); }
    finally { finish(task); }
  };
  const changeRow = (id, patch) => {
    if (phase) return;
    setReviewed(false); setReplaceExisting(false);
    update(id, Object.hasOwn(patch, 'selected') ? patch : { ...patch, status: 'pending', result: null, html: '', issues: [], error: '', base: null });
  };
  const addRow = () => {
    if (!pdf || phase) return;
    const week = Array.from({ length: 35 }, (_, i) => i + 1).find(value => !rows.some(row => Number(row.week) === value));
    if (!week) return;
    const row = { id: `manual-${Date.now()}`, week, title: '', startPage: 1, endPage: pdf.pageCount, selected: true, status: 'pending' };
    setRows(previous => [...previous, row]); setActiveId(row.id); setReviewed(false);
  };
  const convert = async (onlyId) => {
    if (!pdf || phase) return;
    const issue = validatePdfWeekRows(rows, pdf.pageCount, { sourceType: pdf.kind });
    if (issue) { setError(issue); return; }
    const targets = rows.filter(row => onlyId ? row.id === onlyId : row.selected && !['ready', 'saved'].includes(row.status));
    if (!targets.length) return;
    const task = begin('converting');
    for (const [index, row] of targets.entries()) {
      if (!task.current() || stop.current) break;
      setProgress(`Đang tạo tuần ${row.week} · ${index + 1}/${targets.length}`); setActiveId(row.id);
      update(row.id, { status: 'working', error: '', issues: [] });
      try {
        const bases = await callbacks.current.readLessons([Number(row.week)]);
        const document = pdf.kind === 'docx' ? sliceLessonWord(pdf, Number(row.startPage), Number(row.endPage)) : await sliceLessonPdf(pdf, Number(row.startPage), Number(row.endPage));
        if (!task.current()) break;
        let result = row.status === 'error' ? row.result : null;
        if (!result) {
          const payload = pdf.kind === 'docx' ? wordWeekPayload(document, context, row) : pdfWeekPayload(document.base64, context, row);
          const text = await callbacks.current.requestAI(payload, task.signal);
          if (!task.current()) break;
          result = parsePdfWeek(text, row);
          update(row.id, { result });
        }
        const figureImages = pdf.kind === 'docx' ? wordFigureImages(document, result.figures) : await cropLessonPdfFigures(document.bytes, result.figures);
        if (!task.current()) break;
        const prepared = createPdfLessonTools(window).prepare(result, { week: row.week, figureImages });
        update(row.id, { ...prepared, result, figureImages, base: bases[Number(row.week)], status: 'ready', renderChecked: false });
      } catch (failure) {
        if (task.current()) {
          update(row.id, { status: 'error', error: failure.message });
          if (/quota|hạn mức|het han muc|API key|phiên|Failed to fetch|không có quyền|session|đăng nhập|phản hồi quá lâu/i.test(failure.message)) {
            setError(`Đã dừng tại tuần ${row.week}: ${failure.message} Các bản đã tạo được giữ để thử tiếp.`);
            break;
          }
        }
      }
    }
    finish(task);
  };
  const save = async () => {
    if (phase || !reviewed) return;
    const selected = rows.filter(row => row.selected && row.status !== 'saved');
    if (!selected.length || selected.some(row => row.status !== 'ready' || row.issues?.length || row.renderIssue || !row.renderChecked || !row.base)) { setError('Cần tạo bài và kiểm tra công thức thành công cho tất cả tuần được chọn.'); return; }
    if (selected.some(row => row.base.content?.trim()) && !replaceExisting) { setError('Hãy xác nhận thay các tuần đã có bài hoặc bỏ chọn những tuần đó.'); return; }
    const task = begin('saving');
    let saved = 0;
    for (const row of selected) {
      if (!task.current() || stop.current) break;
      setProgress(`Đang lưu tuần ${row.week} · ${saved + 1}/${selected.length}`);
      try {
        await callbacks.current.saveLesson(row, { fileName: pdf.name, sourceType: pdf.kind === 'docx' ? 'docx' : 'pdf', rangeUnit: pdf.kind === 'docx' ? 'part' : 'page', startPage: Number(row.startPage), endPage: Number(row.endPage) });
        if (!task.current()) break;
        update(row.id, { status: 'saved', selected: false, error: '' }); saved++;
      } catch (failure) {
        if (task.current()) { update(row.id, { error: failure.message }); setError(`Đã lưu ${saved} tuần. Tuần ${row.week}: ${failure.message} Các tuần còn lại chưa lưu.`); }
        break;
      }
    }
    finish(task);
  };
  const setRenderResult = (id, renderIssue) => {
    setRows(previous => previous.map(row => row.id === id && (row.renderIssue !== renderIssue || !row.renderChecked) ? { ...row, renderIssue, renderChecked: true } : row));
  };
  return { pdf, rows, warnings, phase, error, progress, activeId, setActiveId, reviewed, setReviewed, replaceExisting, setReplaceExisting,
    selectFile, analyze, changeRow, addRow, convert, save, setRenderResult,
    removeRow: id => { if (!phase) { setRows(previous => previous.filter(row => row.id !== id)); setReviewed(false); } },
    stop: () => { stop.current = true; setProgress('Sẽ dừng sau tuần đang xử lý…'); } };
}
