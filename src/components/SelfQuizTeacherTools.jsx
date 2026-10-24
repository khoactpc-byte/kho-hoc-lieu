import { studentWorkKey } from '../utils/studentRecords';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ListChecks, Plus, Trash2 } from 'lucide-react';
import { SELF_QUIZ_OPTION_IDS } from '../utils/selfQuiz';
import { removeAccents, typesetMath } from '../utils/helpers';

const TEXT = {
  openSelfQuiz: 'Tr\u1eafc nghi\u1ec7m',
  closeSelfQuiz: '\u0110\u00f3ng tr\u1eafc nghi\u1ec7m',
  essayAuto: 'T\u1ef1 lu\u1eadn',
  scoreBoard: 'B\u1ea3ng \u0111i\u1ec3m',
  showScores: 'Hi\u1ec7n \u0111i\u1ec3m',
  hideScores: '\u1ea8n \u0111i\u1ec3m',
  gradeTab: 'Ch\u1ea5m \u0111i\u1ec3m',
  title: 'Tr\u1eafc nghi\u1ec7m',
  hint: 'D\u1eef li\u1ec7u l\u1ea5y t\u1eeb \u00f4 so\u1ea1n b\u00e0i ki\u1ec3m tra. Th\u1ea7y c\u00f4 ki\u1ec3m tra l\u1ea1i \u0111\u00e1p \u00e1n \u0111\u00fang tr\u01b0\u1edbc khi l\u01b0u.',
  edit: 'S\u1eeda \u0111\u1ec1',
  preview: 'Xem \u0111\u1eb9p',
  addQuestion: 'Th\u00eam c\u00e2u',
  shuffleQuestions: 'Tr\u1ed9n c\u00e2u',
  shuffleOptions: 'Tr\u1ed9n \u0111\u00e1p \u00e1n',
  showScore: 'Hi\u1ec7n \u0111i\u1ec3m',
  allowRetake: 'Cho l\u00e0m l\u1ea1i',
  previewTitle: 'B\u1ea3n xem \u0111\u1eb9p \u0111\u1ec1 t\u1ef1 ch\u1ea5m',
  question: 'C\u00e2u',
  questions: 'c\u00e2u',
  correctAnswer: '\u0110\u00e1p \u00e1n \u0111\u00fang',
  notSelected: 'Ch\u01b0a ch\u1ecdn',
  emptyText: '(ch\u01b0a c\u00f3 n\u1ed9i dung)',
  emptyQuestion: '(ch\u01b0a c\u00f3 n\u1ed9i dung c\u00e2u h\u1ecfi)',
  emptyOption: '(tr\u1ed1ng)',
  optionPlaceholder: '\u0110\u00e1p \u00e1n',
  correct: '\u0110\u00fang',
  point: '\u0110i\u1ec3m c\u00e2u n\u00e0y',
  close: '\u0110\u00f3ng',
  save: 'L\u01b0u tr\u1eafc nghi\u1ec7m',
  resultsTitle: 'B\u1ea3ng \u0111i\u1ec3m b\u00e0i ki\u1ec3m tra',
  submissions: 'l\u01b0\u1ee3t n\u1ed9p',
  noSubmissions: 'Ch\u01b0a c\u00f3 h\u1ecdc sinh n\u1ed9p b\u00e0i t\u1ef1 ch\u1ea5m.',
  student: 'H\u1ecdc sinh',
  score: 'Tr\u1eafc nghi\u1ec7m',
  essayScore: 'T\u1ef1 lu\u1eadn',
  totalScore: 'T\u1ed5ng',
  percent: 'T\u1ec9 l\u1ec7',
  time: 'Th\u1eddi gian'
};

export default function SelfQuizTeacherTools({
  currentQuizResults,
  handwrittenSubmissions = [],
  students = [],
  selectedGrade,
  currentSchoolYear,
  showSelfQuizBuilder,
  showQuizResults,
  selfQuizDraft,
  setSelfQuizDraft,
  onOpenHandwrittenSubmission,
  onResetQuizAttempts,
  onResetStudentAttempt,
  onAddQuestion,
  onUpdateQuestion,
  onUpdateOption,
  onRemoveQuestion
}) {
  const previewRef = useRef(null), resultsRef = useRef(null);
  const [resultFilter, setResultFilter] = useState('all'), [studentSearch, setStudentSearch] = useState(''), [expandedKey, setExpandedKey] = useState('');
  const questions = useMemo(() => selfQuizDraft?.questions || [], [selfQuizDraft?.questions]);
  const hasAnyAttempts = currentQuizResults.length > 0 || handwrittenSubmissions.length > 0;
  const normalizeOptionId = (id) => String(id || '').trim().toLowerCase();
  const normalizeNameKey = useCallback((name = '') => removeAccents(String(name || '').toLowerCase()).replace(/[^a-z0-9]/g, ''), []);
  const isGenericStudentName = useCallback((name = '') => {
    const key = normalizeNameKey(name);
    return !key || key === 'hocsinh' || key === 'student' || key === 'unknown';
  }, [normalizeNameKey]);
  const getStudentKey = useCallback((item = {}) => studentWorkKey({ ...item,
    studentId: item.studentId || (item.fullName ? item.id : '') }), []);
  const getStudentGrade = (student = {}) => String(student.className || student.grade || '').match(/[1-9]\d*/)?.[0] || '';
  const isActiveStudent = (student = {}) => {
    const status = removeAccents(String(student.status || '').toLowerCase());
    return status !== 'dropped' && !status.includes('bohoc') && !status.includes('nghihoc');
  };

  const latestResultRows = useMemo(() => {
    const resultMap = new Map();
    [...currentQuizResults]
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
      .forEach(result => {
        const key = getStudentKey(result);
        if (key && !resultMap.has(key)) resultMap.set(key, result);
      });

    const essayMap = new Map();
    [...handwrittenSubmissions]
      .sort((a, b) => (b.reviewedAt || b.aiGradedAt || b.submittedAt || 0) - (a.reviewedAt || a.aiGradedAt || a.submittedAt || 0))
      .forEach(submission => {
        const key = getStudentKey(submission);
        if (key && !essayMap.has(key)) essayMap.set(key, submission);
      });

    const rows = new Map();
    students
      .filter(student => !selectedGrade || getStudentGrade(student) === String(selectedGrade))
      .filter(student => !currentSchoolYear || !student.schoolYear || String(student.schoolYear) === String(currentSchoolYear))
      .filter(isActiveStudent)
      .forEach(student => {
        const key = getStudentKey(student);
        if (!key) return;
        rows.set(key, {
          key,
          studentName: student.fullName || student.studentName || student.name || 'Học sinh',
          studentAccessCode: student.accessCode || student.studentAccessCode || '',
          className: student.className || student.grade || '',
          result: resultMap.get(key) || null,
          essay: essayMap.get(key) || null
        });
      });

    resultMap.forEach((result, key) => {
      const current = rows.get(key) || {};
      if (!current.studentName && isGenericStudentName(result.studentName || result.fullName || result.name)) return;
      rows.set(key, {
        key,
        studentName: current.studentName || result.studentName || result.fullName || result.name || 'Chưa rõ học sinh',
        studentAccessCode: current.studentAccessCode || result.studentAccessCode || '',
        className: current.className || result.className || result.grade || '',
        result,
        essay: essayMap.get(key) || current.essay || null
      });
    });

    essayMap.forEach((submission, key) => {
      const current = rows.get(key) || {};
      if (!current.studentName && isGenericStudentName(submission.studentName || submission.fullName || submission.name)) return;
      rows.set(key, {
        key,
        studentName: current.studentName || submission.studentName || submission.fullName || submission.name || 'Chưa rõ học sinh',
        studentAccessCode: current.studentAccessCode || submission.studentAccessCode || '',
        className: current.className || submission.className || submission.grade || '',
        result: current.result || resultMap.get(key) || null,
        essay: submission
      });
    });

    return [...rows.values()].sort((a, b) => String(a.studentName || '').localeCompare(String(b.studentName || ''), 'vi', { sensitivity: 'base' }));
  }, [currentQuizResults, handwrittenSubmissions, students, selectedGrade, currentSchoolYear, getStudentKey, isGenericStudentName]);

  const getEssaySubmissionForResult = (row) => {
    if (row?.essay) return row.essay;
    const key = getStudentKey(row?.result || row);
    if (!key) return null;
    return [...handwrittenSubmissions]
      .filter(submission => getStudentKey(submission) === key)
      .sort((a, b) => (b.reviewedAt || b.aiGradedAt || b.submittedAt || 0) - (a.reviewedAt || a.aiGradedAt || a.submittedAt || 0))[0] || null;
  };

  const getRowStatus = (row, essayPair) => {
    const hasQuiz = !!row.result;
    const hasEssay = !!row.essay;
    if (!hasQuiz && !hasEssay) return { text: 'Chưa làm', className: 'bg-slate-50 text-slate-500 border-slate-200' };
    if (hasEssay && (row.essay.status !== 'teacher_reviewed' || !essayPair.hasScore)) return { text: 'Chờ chấm', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (hasQuiz || essayPair.hasScore) return { text: 'Đã chấm', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    return { text: 'Đã nộp', className: 'bg-blue-50 text-blue-700 border-blue-100' };
  };

  const toNumber = (value) => {
    const number = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(number) ? number : 0;
  };

  const getScorePair = (score, maxScore) => {
    const hasScore = score !== undefined && score !== null && String(score).trim() !== '';
    const hasMaxScore = maxScore !== undefined && maxScore !== null && String(maxScore).trim() !== '';
    return {
      score: hasScore ? toNumber(score) : 0,
      maxScore: hasMaxScore ? toNumber(maxScore) : 0,
      hasScore,
      hasMaxScore
    };
  };

  const formatPointScore = (value) => {
    const rounded = Math.round((Number(value) || 0) * 100) / 100;
    const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, '');
    return text.replace('.', ',');
  };
  const formatPointOnly = (value, hasScore) => hasScore ? formatPointScore(value) : '-';

  const missingAnswerQuestions = useMemo(() => questions
    .map((q, index) => ({ q, index }))
    .filter(({ q }) => {
      const correctOptionId = normalizeOptionId(q.correctOptionId);
      const selected = q.options?.find(opt => normalizeOptionId(opt.id) === correctOptionId);
      return !correctOptionId || !selected?.text?.trim();
    }), [questions]);

  const getOptionText = (question, optionId) => question.options?.find(opt => normalizeOptionId(opt.id) === normalizeOptionId(optionId))?.text || '';
  const getCorrectLabel = (question) => normalizeOptionId(question.correctOptionId)
    ? `${normalizeOptionId(question.correctOptionId).toUpperCase()}. ${getOptionText(question, question.correctOptionId) || TEXT.emptyText}`
    : TEXT.notSelected;

  useEffect(() => {
    if (showSelfQuizBuilder) typesetMath(previewRef.current);
  }, [showSelfQuizBuilder, questions]);

  useEffect(() => { if (showQuizResults) typesetMath(resultsRef.current); }, [showQuizResults, expandedKey, currentQuizResults]);

  return (
    <>
      {showSelfQuizBuilder && (
        <div className="relative bg-gradient-to-b from-emerald-50 to-white border border-emerald-100 rounded-[1.75rem] sm:rounded-2xl p-3 sm:p-4 space-y-3 shadow-sm">
          <div className="flex items-start gap-3 pr-10">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white shadow-sm flex items-center justify-center shrink-0">
              <ListChecks className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-black text-emerald-950 text-base sm:text-sm uppercase tracking-tight">{TEXT.title}</h4>
              <p className="text-[10px] sm:text-xs text-emerald-700 font-bold leading-relaxed line-clamp-2">{TEXT.hint}</p>
            </div>
          </div>

          {(missingAnswerQuestions.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-[11px] sm:text-xs font-bold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{`C\u00f2n ${missingAnswerQuestions.length} c\u00e2u ch\u01b0a ch\u1ecdn \u0111\u00e1p \u00e1n \u0111\u00fang. N\u1ebfu \u0111\u1ec1 kh\u00f4ng c\u00f3 d\u00f2ng "Dap an: 1B 2A...", app s\u1ebd kh\u00f4ng t\u1ef1 \u0111o\u00e1n \u0111\u00e1p \u00e1n.`}</span>
            </div>
          )}

          <details className="quiz-advanced"><summary>Tùy chọn trắc nghiệm</summary><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="bg-white border border-emerald-100 rounded-2xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[8.5px] sm:text-[10px] font-black text-emerald-800 uppercase text-center shadow-sm"><input className="accent-emerald-600" type="checkbox" checked={!!selfQuizDraft.shuffleQuestions} onChange={(e) => setSelfQuizDraft(prev => ({ ...prev, shuffleQuestions: e.target.checked }))} /> {TEXT.shuffleQuestions}</label>
            <label className="bg-white border border-emerald-100 rounded-2xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[8.5px] sm:text-[10px] font-black text-emerald-800 uppercase text-center shadow-sm"><input className="accent-emerald-600" type="checkbox" checked={!!selfQuizDraft.shuffleOptions} onChange={(e) => setSelfQuizDraft(prev => ({ ...prev, shuffleOptions: e.target.checked }))} /> {TEXT.shuffleOptions}</label>
            <label className="bg-white border border-emerald-100 rounded-2xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[8.5px] sm:text-[10px] font-black text-emerald-800 uppercase text-center shadow-sm"><input className="accent-emerald-600" type="checkbox" checked={selfQuizDraft.showScoreAfterSubmit !== false} onChange={(e) => setSelfQuizDraft(prev => ({ ...prev, showScoreAfterSubmit: e.target.checked }))} /> {TEXT.showScore}</label>
          </div>

          </details>
          <p className="text-xs text-slate-500">Điểm trắc nghiệm được chia đều theo thang điểm của đề. Kiểm tra đáp án rồi bấm Lưu đề ở cuối trang.</p>
          <div className="space-y-3">
            <div className="space-y-3 sm:space-y-3">
              {questions.map((q, qIndex) => (
                <div key={q.id} className="bg-white border border-emerald-100 rounded-[1.6rem] p-3 space-y-3 shadow-sm">
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 font-black flex items-center justify-center text-sm flex-shrink-0">{qIndex + 1}</div>
                    <textarea value={q.text} onChange={(e) => onUpdateQuestion(q.id, { text: e.target.value })} placeholder="Nội dung câu hỏi..." className="flex-1 min-h-[58px] border border-slate-200 bg-slate-50 rounded-2xl p-3 text-sm font-bold focus:outline-none focus:border-emerald-400 focus:bg-white leading-snug" />
                    <button type="button" onClick={() => onRemoveQuestion(q.id)} className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SELF_QUIZ_OPTION_IDS.map(optionId => (
                      <label key={optionId} className={`flex items-center gap-2 border rounded-2xl p-2 transition-colors ${normalizeOptionId(q.correctOptionId) === optionId ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                        <input className="w-4 h-4 accent-emerald-600 shrink-0" type="radio" name={`correct-${q.id}`} checked={normalizeOptionId(q.correctOptionId) === optionId} onChange={() => onUpdateQuestion(q.id, { correctOptionId: optionId })} />
                        <span className={`font-black text-xs uppercase w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${normalizeOptionId(q.correctOptionId) === optionId ? 'bg-white text-emerald-700 border border-emerald-200' : 'bg-white text-slate-600 border border-slate-200'}`}>{optionId.toUpperCase()}</span>
                        <input value={getOptionText(q, optionId)} onChange={(e) => onUpdateOption(q.id, optionId, e.target.value)} placeholder={`${TEXT.optionPlaceholder} ${optionId.toUpperCase()}`} className="min-w-0 flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-400" />
                        {normalizeOptionId(q.correctOptionId) === optionId && <span className="hidden sm:inline text-[9px] font-black text-emerald-700 bg-emerald-100 rounded-full px-2 py-1 uppercase">{TEXT.correct}</span>}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className={`rounded-xl px-3 py-2 text-[10px] font-black border ${q.correctOptionId ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                      {TEXT.correctAnswer}: {getCorrectLabel(q)}
                    </div>

                  </div>
                </div>
              ))}
            </div>
            <details className="quiz-advanced" onToggle={event => { if (event.currentTarget.open) typesetMath(previewRef.current); }}><summary>Xem trước câu hỏi và đáp án</summary><div ref={previewRef} className="space-y-4 pt-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-50 pb-3">
                  <div className="font-black text-slate-900 uppercase text-sm">{TEXT.previewTitle}</div>
                  <div className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">{questions.length} {TEXT.questions}</div>
                </div>
                {questions.map((q, qIndex) => (
                  <div key={q.id} className="border border-slate-100 rounded-2xl p-3 sm:p-4">
                    <div className="font-black text-slate-900 text-sm sm:text-base whitespace-pre-wrap">{TEXT.question} {qIndex + 1}: {q.text || TEXT.emptyQuestion}</div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SELF_QUIZ_OPTION_IDS.map(optionId => (
                        <div key={optionId} className={`rounded-xl border px-3 py-2 text-sm flex gap-2 ${normalizeOptionId(q.correctOptionId) === optionId ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                          <span className="font-black">{optionId.toUpperCase()}.</span>
                          <span className="font-bold flex-1">{getOptionText(q, optionId) || TEXT.emptyOption}</span>
                          {normalizeOptionId(q.correctOptionId) === optionId && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                        </div>
                      ))}
                    </div>
                    <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-black border ${q.correctOptionId ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                      {TEXT.correctAnswer}: {getCorrectLabel(q)}
                    </div>
                  </div>
                ))}
            </div></details>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <button type="button" onClick={onAddQuestion} className="px-4 py-2.5 bg-white text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" /> {TEXT.addQuestion}</button>

          </div>
        </div>
      )}

      {showQuizResults && (
        <section ref={resultsRef} className="quiz-results-table">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">Bài nộp & Chấm điểm · {latestResultRows.length} học sinh</h4>
            {hasAnyAttempts && <details className="quiz-more-menu"><summary>Tùy chọn</summary><div><button type="button" onClick={onResetQuizAttempts} className="text-rose-700">Cho cả lớp làm lại…</button></div></details>}
          </div>
          <div className="my-3 flex flex-wrap gap-2" role="group" aria-label="Lọc bài nộp">
            {[['all', 'Tất cả'], ['missing', 'Chưa làm'], ['pending', 'Chờ chấm'], ['done', 'Đã chấm']].map(([key, label]) => {
              const count = latestResultRows.filter(row => {
                const essay = getEssaySubmissionForResult(row);
                const pending = essay && (essay.status !== 'teacher_reviewed' || essay.teacherScore == null || String(essay.teacherScore).trim() === '');
                return key === 'all' || (key === 'missing' ? !row.result && !essay : key === 'pending' ? pending : (row.result || essay) && !pending);
              }).length;
              return <button key={key} type="button" aria-pressed={resultFilter === key} onClick={() => setResultFilter(key)} className="rounded-lg border px-3 py-2 text-sm">{label} ({count})</button>;
            })}
            <input aria-label="Tìm học sinh trong bài nộp" placeholder="Tên hoặc mã học sinh" value={studentSearch} onChange={event => setStudentSearch(event.target.value)} className="min-w-0 rounded-lg border px-3 py-2 text-sm" />
          </div>
          <p className="mb-3 text-xs text-slate-500">Điểm AI là gợi ý. Bài tự luận được tính vào tổng điểm sau khi giáo viên lưu duyệt.</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Học sinh</th><th>Trắc nghiệm</th><th>Tự luận</th><th>Tổng điểm</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>{latestResultRows.filter(row => {
              const essay = getEssaySubmissionForResult(row);
              const pending = essay && (essay.status !== 'teacher_reviewed' || essay.teacherScore == null || String(essay.teacherScore).trim() === '');
              const matches = resultFilter === 'all' || (resultFilter === 'missing' ? !row.result && !essay : resultFilter === 'pending' ? pending : (row.result || essay) && !pending);
              return matches && normalizeNameKey(row.studentName + row.studentAccessCode).includes(normalizeNameKey(studentSearch));
            }).map(row => {
              const result = row.result || {}, essay = getEssaySubmissionForResult(row);
              const quizPair = getScorePair(result.score, result.total);
              const essayPair = getScorePair(essay?.teacherScore, essay?.teacherMaxScore);
              const reviewed = essay?.status === 'teacher_reviewed' && essayPair.hasScore;
              const hasTotalScore = quizPair.hasScore || reviewed;
              const total = (quizPair.hasScore ? quizPair.score : 0) + (reviewed ? essayPair.score : 0);
              const status = getRowStatus(row, essayPair);
              return <tr key={row.key} className="border-t align-top">
                <td><strong>{row.studentName}</strong><small className="block text-slate-500">{row.studentAccessCode}</small></td>
                <td>{formatPointOnly(quizPair.score, quizPair.hasScore)}</td>
                <td>{formatPointOnly(essayPair.score, reviewed)}{essay && !reviewed && essay.aiScore != null && <small className="block text-slate-500">AI gợi ý: {essay.aiScore}</small>}</td>
                <td>{hasTotalScore ? formatPointScore(total) : '—'}{essay && !reviewed && <small className="block text-amber-700">Chưa duyệt tự luận</small>}</td>
                <td>{status.text}</td>
                <td><div className="flex flex-wrap gap-2">
                  {row.result && <button type="button" className="quiz-row-action" aria-expanded={expandedKey === row.key} onClick={() => setExpandedKey(expandedKey === row.key ? '' : row.key)}>Xem trắc nghiệm</button>}
                  {essay && <button type="button" className="quiz-row-action" onClick={() => onOpenHandwrittenSubmission?.(row.key)}>{reviewed ? 'Xem tự luận' : 'Chấm tự luận'}</button>}
                  {(row.result || essay) && <details><summary className="cursor-pointer text-slate-500">Thêm</summary><button type="button" onClick={() => onResetStudentAttempt?.(row.key, row.studentName)} className="mt-2 text-rose-700">Cho làm lại…</button></details>}
                </div>
                {expandedKey === row.key && row.result && <section className="mt-3 min-w-64 space-y-2" aria-label={'Trắc nghiệm của ' + row.studentName}>
                  {result.submittedAt && <p className="text-xs text-slate-500">Nộp lúc {new Date(result.submittedAt).toLocaleString('vi-VN')}</p>}
                  {!result.answers?.length && <p>Chưa có chi tiết đáp án.</p>}
                  {(result.answers || []).map((answer, i) => <div key={answer.questionId || i} className="rounded-lg bg-slate-50 p-2"><p className="whitespace-pre-wrap">Câu {i + 1}. {answer.questionText}</p><p className={answer.isCorrect ? 'text-emerald-700' : 'text-rose-700'}>Chọn: {String(answer.selectedOptionId || '—').toUpperCase()} · Đáp án: {String(answer.correctOptionId || '—').toUpperCase()} · {answer.isCorrect ? 'Đúng' : 'Sai'}</p></div>)}
                </section>}
                </td>
              </tr>;
            })}</tbody>
          </table></div>
          {!latestResultRows.length && <p className="p-4 text-center text-slate-500">Chưa có học sinh hoặc bài nộp trong lớp này.</p>}
        </section>
      )}
    </>
  );
}
