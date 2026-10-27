import { useEffect, useRef, useState } from 'react';
import { batchLessonReviewDraft, lessonReviewBatchPayload, prepareBatchLessonReview } from '../utils/lessonReviewBatch';
import { validateLessonReviewMath } from '../services/lessonReviewMath';
import { generateVerifiedLessonReview } from '../services/verifiedLessonReview';

export default function useLessonReviewBatch({ context, service, requestAI, validateMath = validateLessonReviewMath }) {
  const [rows, setRows] = useState([]), [phase, setPhase] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const [count, setCount] = useState('auto'), [essayCount, setEssayCount] = useState(0), [activeId, setActiveId] = useState('');
  const sequence = useRef(0), pending = useRef(false), stop = useRef(false), controller = useRef(null), callbacks = useRef(null);
  callbacks.current = { context, service, requestAI, validateMath };
  const patch = (id, changes) => setRows(previous => previous.map(row => row.id === id ? { ...row, ...changes } : row));
  const scan = async () => {
    if (pending.current) return;
    const generation = ++sequence.current;
    pending.current = true; setPhase('scanning'); setError('');
    try {
      const latest = await callbacks.current.service.scan();
      if (generation === sequence.current) setRows(previous => latest.map(row => {
        const old = previous.find(item => item.id === row.id && item.html === row.html);
        if (row.status === 'existing') return old?.status === 'saved' ? { ...old, ...row, status: 'saved', selected: false } : { ...row, selected: false };
        return old && !['empty', 'existing', 'saved'].includes(old.status) ? { ...old, selected: old.selected } : row;
      }));
    } catch (failure) { if (generation === sequence.current) setError(failure.message); }
    finally { if (generation === sequence.current) { pending.current = false; setPhase(''); } }
  };
  useEffect(() => {
    void scan();
    // This counter invalidates pending requests; it is not a DOM ref snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { sequence.current++; pending.current = false; controller.current?.abort(); };
    // The dialog is keyed by teacher/year/campus/grade/subject in App.
  }, []);
  const run = async () => {
    if (pending.current) return;
    const targets = rows.filter(row => row.selected && ['pending', 'error'].includes(row.status));
    if (!targets.length) return;
    const generation = ++sequence.current;
    controller.current = new AbortController(); stop.current = false; pending.current = true;
    const signal = controller.current.signal, current = () => generation === sequence.current && !signal.aborted;
    const scope = callbacks.current.context;
    let consecutiveGenerationFailures = 0;
    setPhase('running'); setError('');
    try {
      for (const [index, row] of targets.entries()) {
        if (!current() || stop.current) break;
        setProgress(`Tuần ${row.week} · ${index + 1}/${targets.length}`); setActiveId(row.id); patch(row.id, { status: 'working', error: '' });
        let stage = 'source';
        try {
          const existing = await callbacks.current.service.findExisting(row.week);
          if (!current()) break;
          if (existing) { patch(row.id, { status: 'existing', selected: false, material: existing }); continue; }
          const source = await callbacks.current.service.readSource(row);
          if (!current()) break;
          let result = row.resultValidated && row.resultSource === source.html ? row.result : null;
          if (!result) {
            stage = 'generation';
            const sameSource = (row.responseSource ?? row.html) === source.html;
            const sameOptions = (row.responseCount === undefined || row.responseCount === count) && (row.responseEssays === undefined || row.responseEssays === essayCount);
            const checked = await generateVerifiedLessonReview({ windowObject: window,
              payload: lessonReviewBatchPayload(window, source, scope, count, essayCount), count, essayCount, maxAutoQuestions: 10,
              validateMath: html => callbacks.current.validateMath(html, signal),
              initialResponse: row.rawResponse && !row.rawMathFailed && sameSource && sameOptions ? row.rawResponse : '',
              requestAI: async payload => {
                if (!current()) throw new Error('Yêu cầu đã đóng.');
                const response = await callbacks.current.requestAI(payload, row.week, signal);
                if (!current()) throw new Error('Yêu cầu đã đóng.');
                return response;
              }, onProgress: message => { if (current()) setProgress(`Tuần ${row.week} · ${index + 1}/${targets.length} · ${message}`); } });
            if (!current()) break;
            result = checked.result;
            patch(row.id, { rawResponse: checked.response, responseSource: source.html, responseCount: count, responseEssays: essayCount, rawMathFailed: false, html: source.html });
            patch(row.id, { html: source.html, result, resultSource: source.html, resultValidated: false });
          }
          stage = 'validation';
          await callbacks.current.validateMath(result.content, signal);
          if (!current()) break;
          consecutiveGenerationFailures = 0;
          patch(row.id, { resultValidated: true });
          stage = 'save';
          const saved = await callbacks.current.service.save(source, result);
          if (!current()) break;
          patch(row.id, { status: saved.skipped ? 'existing' : 'saved', selected: false, material: saved.material, result, error: '' });
        } catch (failure) {
          if (!current()) break;
          patch(row.id, { status: 'error', error: failure.message, ...(stage === 'validation' ? { rawMathFailed: true } : {}) });
          if (stage === 'generation' || stage === 'validation') consecutiveGenerationFailures++;
          else consecutiveGenerationFailures = 0;
          if (/quota|429|403|401|hạn mức|het han muc|API key|Failed to fetch|session|phiên|đăng nhập|khóa nhập|bảo trì|phản hồi quá lâu|MAX_TOKENS/i.test(failure.message)) { setError(`Đã dừng tại tuần ${row.week}: ${failure.message} Các tuần đã lưu vẫn được giữ.`); break; }
          if (consecutiveGenerationFailures >= 2) { setError('Đã dừng vì 2 tuần liên tiếp không tạo được bộ câu hỏi hợp lệ, tránh tốn thêm lượt AI. Chọn 5 câu và thử riêng một tuần. Các tuần đã lưu vẫn được giữ.'); break; }
        }
      }
    } finally {
      if (current()) { pending.current = false; setPhase(''); setProgress(''); }
    }
  };
  const saveEdited = async (row, data) => {
    if (pending.current) return false;
    const generation = ++sequence.current;
    controller.current = new AbortController(); pending.current = true; setPhase('editing'); setError('');
    try {
      const existing = row.material && ['saved', 'existing'].includes(row.status);
      const result = prepareBatchLessonReview(window, JSON.stringify({ ...data, complete: true }), existing ? String(data.questions.length) : count, existing ? data.essays.length : essayCount);
      await callbacks.current.validateMath(result.content, controller.current.signal);
      if (generation !== sequence.current) return false;
      const source = await callbacks.current.service.readSource(row);
      if (source.html !== row.html) throw new Error('Bài học vừa thay đổi. Đóng và rà lại danh sách.');
      const saved = row.material && ['saved', 'existing'].includes(row.status)
        ? await callbacks.current.service.saveEdited(source, result, row.material)
        : await callbacks.current.service.save(source, result);
      if (generation !== sequence.current) return false;
      patch(row.id, { status: saved.skipped ? 'existing' : 'saved', selected: false, material: saved.material, result, resultValidated: true, resultSource: source.html, rawResponse: JSON.stringify(data), error: '' });
      return true;
    } catch (failure) { if (generation === sequence.current) setError(failure.message); return false; }
    finally { if (generation === sequence.current) { pending.current = false; setPhase(''); } }
  };
  const editExisting = async row => {
    if (pending.current) return;
    const generation = ++sequence.current;
    pending.current = true; setPhase('loading'); setError('');
    try {
      const material = await callbacks.current.service.readGenerated(row);
      if (generation !== sequence.current) return;
      setActiveId(row.id); patch(row.id, { material, rawResponse: JSON.stringify(batchLessonReviewDraft(window, material)) });
    } catch (failure) { if (generation === sequence.current) setError(failure.message); }
    finally { if (generation === sequence.current) { pending.current = false; setPhase(''); } }
  };
  return { rows, phase, error, progress, count, essayCount, activeId, setActiveId, scan, run, saveEdited, editExisting,
    select: (id, selected) => { if (!pending.current) patch(id, { selected }); },
    changeOptions: (nextCount, nextEssays) => {
      if (pending.current) return;
      setCount(nextCount); setEssayCount(nextEssays);
      setRows(previous => previous.map(row => ['pending', 'error'].includes(row.status) ? { ...row, result: null, resultSource: '', resultValidated: false, rawResponse: '', rawMathFailed: false, status: 'pending', error: '' } : row));
    },
    stop: () => { stop.current = true; setProgress('Sẽ dừng sau tuần đang xử lý…'); } };
}
