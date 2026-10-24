import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, FileUp, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import useLessonPdfImport from '../hooks/useLessonPdfImport';
import { pdfFilenameGrade, validatePdfWeekRows } from '../utils/lessonPdfImport';
import { teacherLessonHtml } from '../utils/lessonAnswers';
import { typesetMath } from '../utils/mathTypesetting';
import { renderedQuizMathIssue } from '../utils/quizQuality';
import { loadLessonPdfRenderer } from '../services/lessonPdfFile';

function PdfSourcePreview({ pdf, startPage, endPage }) {
  const canvas = useRef(null), [pageNumber, setPageNumber] = useState(Number(startPage)), [status, setStatus] = useState('Đang hiển thị PDF gốc…');
  useEffect(() => {
    let disposed = false, loadingTask, rendering;
    setStatus('Đang hiển thị PDF gốc…');
    void (async () => {
      try {
        loadingTask = await loadLessonPdfRenderer(pdf.bytes);
        if (disposed) { await loadingTask.destroy(); return; }
        const document = await loadingTask.promise;
        if (disposed) return;
        const page = await document.getPage(pageNumber);
        if (disposed) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1.6, 1200 / original.width) });
        canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height);
        rendering = page.render({ canvas: canvas.current, viewport, background: '#ffffff' });
        await rendering.promise;
        if (!disposed) setStatus('');
      } catch { if (!disposed) setStatus('Chưa hiển thị được trang PDF. Thử chuyển trang hoặc mở lại tài liệu.'); }
    })();
    return () => { disposed = true; rendering?.cancel?.(); void loadingTask?.destroy().catch(() => {}); };
  }, [pdf, pageNumber]);
  return <div className="pdf-import-source"><nav aria-label="Trang PDF gốc"><button type="button" disabled={pageNumber <= Number(startPage)} onClick={() => setPageNumber(value => value - 1)} aria-label="Trang PDF trước">‹</button><span>Trang {pageNumber} / {pdf.pageCount}</span><button type="button" disabled={pageNumber >= Number(endPage)} onClick={() => setPageNumber(value => value + 1)} aria-label="Trang PDF sau">›</button></nav>
    {status && <p role="status">{status}</p>}<canvas ref={canvas} aria-label={`PDF gốc trang ${pageNumber}`} role="img" /></div>;
}

function WordSourcePreview({ pdf, startPage, endPage }) {
  const [part, setPart] = useState(Number(startPage)), root = useRef(null);
  const html = pdf.sections[part - 1]?.html || '';
  useEffect(() => { typesetMath(root.current); }, [html]);
  return <div className="pdf-import-source"><nav aria-label="Phần Word gốc"><button type="button" disabled={part <= Number(startPage)} onClick={() => setPart(value => value - 1)} aria-label="Phần Word trước">‹</button><span>Phần {part} / {pdf.pageCount}</span><button type="button" disabled={part >= Number(endPage)} onClick={() => setPart(value => value + 1)} aria-label="Phần Word sau">›</button></nav><div ref={root} className="pdf-import-preview teacher-content" key={part} dangerouslySetInnerHTML={{ __html: html }} /></div>;
}

function FormulaCheck({ row, onResult }) {
  const root = useRef(null), callback = useRef(onResult);
  callback.current = onResult;
  useEffect(() => {
    let current = true;
    const node = root.current;
    typesetMath(node, success => {
      if (current) callback.current(row.id, success ? renderedQuizMathIssue(node) : 'Chưa tải được phần hiển thị công thức. Tải lại trang trước khi lưu.');
    });
    return () => { current = false; };
  }, [row.id, row.html]);
  return <div ref={root} dangerouslySetInnerHTML={{ __html: row.html }} />;
}

function PdfImportedLessonPreview({ row }) {
  const root = useRef(null);
  const html = useMemo(() => teacherLessonHtml(row.html || ''), [row.html]);
  useEffect(() => { typesetMath(root.current); }, [html]);
  return <div ref={root} className="pdf-import-preview teacher-content" onToggleCapture={event => { if (event.target.open) typesetMath(event.target); }}>
    <div key={html} dangerouslySetInnerHTML={{ __html: html }} />
  </div>;
}

function downloadBackup(rows, context) {
  const snapshot = { exportedAt: new Date().toISOString(), ...context, lessons: rows.filter(row => row.base).map(row => ({ week: Number(row.week), ...row.base })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `sao-luu-${context.schoolCode}-${context.grade}-${context.schoolYear}-${Date.now()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function LessonPdfImportDialog({ context, requestAI, readLessons, saveLesson, onClose }) {
  const importer = useLessonPdfImport({ context, requestAI, readLessons, saveLesson });
  const { pdf, rows, phase } = importer;
  const isWord = pdf?.kind === 'docx', unit = isWord ? 'phần' : 'trang', sourceName = isWord ? 'Word' : 'PDF';
  const initialFocus = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    initialFocus.current?.focus();
    return () => previousFocus?.focus?.();
  }, []);
  const selected = rows.filter(row => row.selected && row.status !== 'saved');
  const replacing = selected.filter(row => row.base?.content?.trim());
  const active = rows.find(row => row.id === importer.activeId) || rows[0];
  const rowIssue = pdf && rows.length ? validatePdfWeekRows(rows, pdf.pageCount, { sourceType: pdf.kind }) : '';
  const ready = selected.length > 0 && selected.every(row => row.status === 'ready' && !row.issues?.length && row.renderChecked && !row.renderIssue);
  const savedCount = rows.filter(row => row.status === 'saved').length;
  const close = () => { if (!phase) onClose(); };
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],iframe')].filter(node => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <div className="pdf-import-backdrop" onKeyDown={onKeyDown}>
    <section role="dialog" aria-modal="true" aria-labelledby="pdf-import-title" className="pdf-import-dialog">
      <header><div><h2 id="pdf-import-title"><FileUp size={21} />Nhập bài học từ PDF / Word</h2><p>Khối {context.grade} · {context.subject} · {context.schoolYear}</p></div>
        <button type="button" onClick={close} disabled={!!phase} aria-label="Đóng nhập tài liệu"><X size={20} /></button></header>
      <div className="pdf-import-body">
        <section className="pdf-import-choose">
          <div><strong>1. Chọn tài liệu có nhiều tuần</strong><p>Tối đa 12 MB: PDF 100 trang hoặc Word .docx 100 phần nội dung. Tệp .doc cũ cần lưu lại thành .docx.</p></div>
          <label className="pdf-import-file-picker"><FileUp size={16} /><span>{pdf ? 'Chọn tài liệu khác' : 'Chọn PDF / Word'}</span><input ref={initialFocus} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" aria-label="Chọn PDF hoặc Word bài học" disabled={!!phase} onChange={event => { const file = event.target.files?.[0]; if (file) void importer.selectFile(file); event.target.value = ''; }} /></label>
          {pdf && <div className="pdf-import-file"><span><strong>{pdf.name}</strong> · {pdf.pageCount} {unit}{pdfFilenameGrade(pdf.name) && ` · khối ${pdfFilenameGrade(pdf.name)}`}</span><button type="button" className="pdf-import-primary" disabled={!!phase} onClick={importer.analyze}>{phase === 'analyzing' ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}Phân tích các tuần bằng Gemini</button></div>}
          <small>Chỉ khi bấm phân tích/tạo bài, nội dung tài liệu mới được gửi đến Gemini để xử lý.</small>
        </section>
        {importer.error && <p role="alert" className="pdf-import-error">{importer.error}</p>}
        {importer.warnings.length > 0 && <ul className="pdf-import-warnings">{importer.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
        {pdf && <>
          <div className="pdf-import-step"><div><strong>2. Kiểm tra tuần và khoảng {unit}</strong><p>{isWord ? 'Word chia theo tuần và ngắt trang thành các phần nội dung để đối chiếu; số phần không phải số trang in.' : 'Số trang tính từ trang đầu của PDF; hai tuần được phép chung trang.'} Có thể sửa hoặc tự thêm tuần.</p></div><button type="button" disabled={!!phase} onClick={importer.addRow}><Plus size={16} />Thêm tuần</button></div>
          {rowIssue && <p role="alert" className="pdf-import-error">{rowIssue}</p>}
          {rows.length > 0 && <div className="pdf-import-table-wrap"><table className="pdf-import-table"><thead><tr><th>Chọn</th><th>Tuần</th><th>Tên bài trong tài liệu</th><th>Từ {unit}</th><th>Đến {unit}</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className={active?.id === row.id ? 'is-active' : ''}>
            <td><input type="checkbox" aria-label={`Chọn tuần ${row.week}`} checked={row.selected} disabled={!!phase || row.status === 'saved'} onChange={event => importer.changeRow(row.id, { selected: event.target.checked })} /></td>
            <td><input type="number" min="1" max="35" value={row.week} disabled={!!phase || row.status === 'saved'} aria-label={`Số tuần của dòng ${row.id}`} onChange={event => importer.changeRow(row.id, { week: Number(event.target.value) })} /></td>
            <td><input value={row.title} maxLength={250} placeholder="Tên bài học" disabled={!!phase || row.status === 'saved'} aria-label={`Tên bài tuần ${row.week}`} onChange={event => importer.changeRow(row.id, { title: event.target.value })} /></td>
            <td><input type="number" min="1" max={pdf.pageCount} value={row.startPage} disabled={!!phase || row.status === 'saved'} aria-label={`${isWord ? 'Phần' : 'Trang'} đầu tuần ${row.week}`} onChange={event => importer.changeRow(row.id, { startPage: Number(event.target.value) })} /></td>
            <td><input type="number" min="1" max={pdf.pageCount} value={row.endPage} disabled={!!phase || row.status === 'saved'} aria-label={`${isWord ? 'Phần' : 'Trang'} cuối tuần ${row.week}`} onChange={event => importer.changeRow(row.id, { endPage: Number(event.target.value) })} /></td>
            <td><span className={`pdf-import-status status-${row.status}`}>{row.status === 'saved' ? 'Đã lưu' : row.status === 'working' ? 'Đang tạo…' : row.status === 'error' ? 'Chưa tạo được' : row.status === 'ready' ? (row.issues?.length || row.renderIssue ? 'Cần sửa công thức' : !row.renderChecked ? 'Đang rà công thức…' : row.base?.content?.trim() ? 'Sẵn sàng · đã có bài cũ' : 'Sẵn sàng · bài mới') : 'Chưa tạo bài'}</span></td>
            <td className="pdf-import-row-actions"><button type="button" aria-label={`Xem trước tuần ${row.week}`} onClick={() => importer.setActiveId(row.id)}>Xem</button>{row.status !== 'saved' && <><button type="button" disabled={!!phase || !!rowIssue} onClick={() => importer.convert(row.id)} aria-label={`Tạo lại tuần ${row.week}`}><RotateCcw size={14} /></button><button type="button" disabled={!!phase} onClick={() => importer.removeRow(row.id)} aria-label={`Bỏ dòng tuần ${row.week}`}><X size={14} /></button></>}</td>
          </tr>)}</tbody></table></div>}
          <div className="pdf-import-process"><button type="button" className="pdf-import-primary" disabled={!!phase || !!rowIssue || !selected.some(row => row.status !== 'ready')} onClick={() => importer.convert()}>Tạo bài cho {selected.length} tuần đã chọn</button>
            {phase && <span role="status"><Loader2 size={16} className="animate-spin" />{importer.progress || 'Đang đọc tài liệu…'}</span>}
            {['converting', 'saving'].includes(phase) && <button type="button" onClick={importer.stop}>Dừng sau tuần này</button>}</div>
          {active && <section className="pdf-import-review"><div><h3>3. Đối chiếu tuần {active.week} với {sourceName} gốc</h3><p>Đáp án được tách riêng và mặc định ẩn với học sinh. Bấm phần đáp án trong bản xem trước để kiểm tra.</p></div>
            {active.error && <p role="alert" className="pdf-import-error">{active.error}</p>}
            {[...(active.issues || []), ...(active.renderIssue ? [active.renderIssue] : []), ...(active.warnings || [])].map((issue, i) => <p key={i} className="pdf-import-warnings">{issue}</p>)}
            <div className="pdf-import-review-columns"><div><h4>{sourceName} gốc · {unit} {active.startPage}–{active.endPage}</h4>{isWord ? <WordSourcePreview key={`${active.id}/${active.startPage}/${active.endPage}`} pdf={pdf} startPage={active.startPage} endPage={active.endPage} /> : <PdfSourcePreview key={`${active.id}/${active.startPage}/${active.endPage}`} pdf={pdf} startPage={active.startPage} endPage={active.endPage} />}</div><div><h4>Bài sẽ lưu trên web</h4>{active.html ? <PdfImportedLessonPreview key={active.id} row={active} /> : <p className="pdf-import-empty">Bấm “Tạo bài” để xem nội dung đã chuyển.</p>}</div></div>
          </section>}
        </>}
        <div className="pdf-import-formula-check" aria-hidden="true">{rows.filter(row => row.status === 'ready' && row.html).map(row => <FormulaCheck key={`${row.id}/${row.html}`} row={row} onResult={importer.setRenderResult} />)}</div>
      </div>
      <footer><div className="pdf-import-confirmations">{savedCount > 0 && <p className="pdf-import-success"><Check size={16} />Đã lưu {savedCount} tuần thành công.</p>}
        {selected.some(row => row.status === 'ready') && <label><input type="checkbox" checked={importer.reviewed} disabled={!!phase || !ready} onChange={event => importer.setReviewed(event.target.checked)} />Tôi đã đối chiếu nội dung, công thức và phần đáp án của các tuần đã chọn.</label>}
        {replacing.length > 0 && <label><input type="checkbox" checked={importer.replaceExisting} disabled={!!phase} onChange={event => importer.setReplaceExisting(event.target.checked)} />Thay nội dung {replacing.length} tuần đã có bài. Giữ bố cục đã chọn, bài kiểm tra và tài liệu đính kèm.</label>}
      </div><div className="pdf-import-footer-actions">{rows.some(row => row.base) && <button type="button" disabled={!!phase} onClick={() => downloadBackup(rows, context)}><Download size={16} />Tải bản sao bài cũ</button>}<button type="button" disabled={!!phase} onClick={close}>Đóng</button><button type="button" className="pdf-import-primary" disabled={!!phase || !ready || !importer.reviewed || (replacing.length > 0 && !importer.replaceExisting)} onClick={importer.save}>Lưu {selected.length} tuần vào bài học</button></div></footer>
    </section>
  </div>;
}
