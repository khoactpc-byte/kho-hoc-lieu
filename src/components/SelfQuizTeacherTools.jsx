import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, ListChecks, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
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
  showHandwrittenSubmissions = false,
  selfQuizDraft,
  setSelfQuizDraft,
  onCreateDraft,
  onToggleBuilder,
  onToggleResults,
  onToggleHandwritten,
  onOpenHandwrittenSubmission,
  onResetQuizAttempts,
  onResetStudentAttempt,
  onAddQuestion,
  onUpdateQuestion,
  onUpdateOption,
  onRemoveQuestion,
  onSaveSelfQuiz,
  showWorkTabs = true
}) {
  const [localWarning, setLocalWarning] = useState('');
  const [saveFeedback, setSaveFeedback] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const previewRef = useRef(null);
  const questions = selfQuizDraft?.questions || [];
  const hasAnyAttempts = currentQuizResults.length > 0 || handwrittenSubmissions.length > 0;
  const normalizeOptionId = (id) => String(id || '').trim().toLowerCase();
  const normalizeNameKey = (name = '') => removeAccents(String(name || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
  const isGenericStudentName = (name = '') => {
    const key = normalizeNameKey(name);
    return !key || key === 'hocsinh' || key === 'student' || key === 'unknown';
  };
  const getStudentKey = (item = {}) => {
    const code = String(item.studentAccessCode || item.accessCode || '').trim().toUpperCase();
    const name = item.studentName || item.fullName || item.name || '';
    return code || (isGenericStudentName(name) ? '' : normalizeNameKey(name));
  };
  const getStudentGrade = (student = {}) => String(student.className || student.grade || '').match(/[1-9]\d*/)?.[0] || '';
  const isActiveStudent = (student = {}) => {
    const status = removeAccents(String(student.status || '').toLowerCase());
    return !status.includes('bohoc') && !status.includes('nghihoc');
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
  }, [currentQuizResults, handwrittenSubmissions, students, selectedGrade, currentSchoolYear]);

  const getEssaySubmissionForResult = (row) => {
    if (row?.essay) return row.essay;
    const key = getStudentKey(row?.result || row);
    if (!key) return null;
    return [...handwrittenSubmissions]
      .filter(submission => getStudentKey(submission) === key)
      .sort((a, b) => (b.reviewedAt || b.aiGradedAt || b.submittedAt || 0) - (a.reviewedAt || a.aiGradedAt || a.submittedAt || 0))[0] || null;
  };

  const getRowStatus = (row, quizPair, essayPair) => {
    const hasQuiz = !!row.result;
    const hasEssay = !!row.essay;
    if (!hasQuiz && !hasEssay) return { text: 'Chưa làm', className: 'bg-slate-50 text-slate-500 border-slate-200' };
    if (hasEssay && !essayPair.hasScore) return { text: 'Chờ chấm', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (hasQuiz || essayPair.hasScore) return { text: 'Đã có điểm', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
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
  const getSelfQuizScorePoint = (result = null, pair = null) => {
    if (!result || !pair?.hasScore) return 0;
    const answers = Array.isArray(result.answers) ? result.answers : [];
    if (answers.length) return answers.filter(answer => answer.isCorrect).length * 0.25;
    return pair.score * 0.25;
  };
  const formatPointOnly = (value, hasScore) => hasScore ? formatPointScore(value) : '-';

  const invalidQuestions = useMemo(() => questions
    .map((q, index) => ({ q, index }))
    .filter(({ q }) => !q.text?.trim() || (q.options || []).filter(opt => opt.text?.trim()).length < 2), [questions]);

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

  const clearWarning = () => {
    setLocalWarning('');
    setSaveFeedback(null);
  };

  useEffect(() => {
    if (showSelfQuizBuilder) typesetMath(previewRef.current);
  }, [showSelfQuizBuilder, questions]);

  const handleSaveClick = async () => {
    if (invalidQuestions.length) {
      const numbers = invalidQuestions.map(({ index }) => index + 1).join(', ');
      setLocalWarning(`${TEXT.question} ${numbers} ch\u01b0a \u0111\u1ee7 n\u1ed9i dung ho\u1eb7c ch\u01b0a \u0111\u1ee7 l\u1ef1a ch\u1ecdn. Th\u1ea7y c\u00f4 ki\u1ec3m tra l\u1ea1i tr\u01b0\u1edbc khi l\u01b0u.`);
      setSaveFeedback(null);
      return;
    }
    if (missingAnswerQuestions.length) {
      const numbers = missingAnswerQuestions.map(({ index }) => index + 1).join(', ');
      setLocalWarning(`${TEXT.question} ${numbers} ch\u01b0a ch\u1ecdn \u0111\u00e1p \u00e1n \u0111\u00fang. Th\u1ea7y c\u00f4 b\u1ea5m v\u00e0o v\u00f2ng tr\u00f2n A/B/C/D c\u1ea1nh \u0111\u00e1p \u00e1n \u0111\u00fang r\u1ed3i l\u01b0u l\u1ea1i.`);
      setSaveFeedback(null);
      return;
    }
    clearWarning();
    setIsSaving(true);
    setSaveFeedback({ type: 'info', message: '\u0110ang l\u01b0u \u0111\u1ec1 t\u1ef1 ch\u1ea5m...' });
    try {
      const result = await onSaveSelfQuiz();
      if (result?.ok === false) {
        setSaveFeedback({ type: 'error', message: result.message || 'Ch\u01b0a l\u01b0u \u0111\u01b0\u1ee3c \u0111\u1ec1 t\u1ef1 ch\u1ea5m.' });
      } else {
        setSaveFeedback({ type: 'success', message: result?.message || '\u0110\u00e3 l\u01b0u \u0111\u1ec1 t\u1ef1 ch\u1ea5m.' });
      }
    } catch (error) {
      setSaveFeedback({ type: 'error', message: `Ch\u01b0a l\u01b0u \u0111\u01b0\u1ee3c \u0111\u1ec1 t\u1ef1 ch\u1ea5m: ${error?.message || 'l\u1ed7i kh\u00f4ng x\u00e1c \u0111\u1ecbnh'}` });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {showWorkTabs && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" onClick={onCreateDraft} className={`${showSelfQuizBuilder ? 'bg-slate-700 hover:bg-slate-800' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-3 py-2.5 rounded-xl text-[10px] sm:text-xs font-black shadow-md flex items-center justify-center gap-2 uppercase transition-colors`}>
            <ListChecks className="w-4 h-4" /> <span>{showSelfQuizBuilder ? TEXT.closeSelfQuiz : TEXT.openSelfQuiz}</span>
          </button>
          <button type="button" onClick={onToggleHandwritten} className={`${showHandwrittenSubmissions ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-700 border-sky-100'} px-3 py-2.5 rounded-xl text-[10px] sm:text-xs font-black shadow-sm flex items-center justify-center gap-2 uppercase border`}>
            <FileText className="w-4 h-4" /> {TEXT.essayAuto} ({handwrittenSubmissions.length})
          </button>
        </div>
      )}

      {showSelfQuizBuilder && (
        <div className="relative bg-gradient-to-b from-emerald-50 to-white border border-emerald-100 rounded-[1.75rem] sm:rounded-2xl p-3 sm:p-4 space-y-3 shadow-sm">
          <button type="button" onClick={onToggleBuilder} className="absolute right-3 top-3 w-9 h-9 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center hover:bg-rose-600 hover:text-white transition-colors shadow-sm" title="Đóng">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3 pr-10">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white shadow-sm flex items-center justify-center shrink-0">
              <ListChecks className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-black text-emerald-950 text-base sm:text-sm uppercase tracking-tight">{TEXT.title}</h4>
              <p className="text-[10px] sm:text-xs text-emerald-700 font-bold leading-relaxed line-clamp-2">{TEXT.hint}</p>
            </div>
          </div>

          {(localWarning || missingAnswerQuestions.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-[11px] sm:text-xs font-bold flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{localWarning || `C\u00f2n ${missingAnswerQuestions.length} c\u00e2u ch\u01b0a ch\u1ecdn \u0111\u00e1p \u00e1n \u0111\u00fang. N\u1ebfu \u0111\u1ec1 kh\u00f4ng c\u00f3 d\u00f2ng "Dap an: 1B 2A...", app s\u1ebd kh\u00f4ng t\u1ef1 \u0111o\u00e1n \u0111\u00e1p \u00e1n.`}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <label className="bg-white border border-emerald-100 rounded-2xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[8.5px] sm:text-[10px] font-black text-emerald-800 uppercase text-center shadow-sm"><input className="accent-emerald-600" type="checkbox" checked={!!selfQuizDraft.shuffleQuestions} onChange={(e) => setSelfQuizDraft(prev => ({ ...prev, shuffleQuestions: e.target.checked }))} /> {TEXT.shuffleQuestions}</label>
            <label className="bg-white border border-emerald-100 rounded-2xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[8.5px] sm:text-[10px] font-black text-emerald-800 uppercase text-center shadow-sm"><input className="accent-emerald-600" type="checkbox" checked={!!selfQuizDraft.shuffleOptions} onChange={(e) => setSelfQuizDraft(prev => ({ ...prev, shuffleOptions: e.target.checked }))} /> {TEXT.shuffleOptions}</label>
            <label className="bg-white border border-emerald-100 rounded-2xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-[8.5px] sm:text-[10px] font-black text-emerald-800 uppercase text-center shadow-sm"><input className="accent-emerald-600" type="checkbox" checked={selfQuizDraft.showScoreAfterSubmit !== false} onChange={(e) => setSelfQuizDraft(prev => ({ ...prev, showScoreAfterSubmit: e.target.checked }))} /> {TEXT.showScore}</label>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 max-h-[calc(100dvh-245px)] sm:max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
            <div className="space-y-3 sm:space-y-3">
              {questions.map((q, qIndex) => (
                <div key={q.id} className="bg-white border border-emerald-100 rounded-[1.6rem] p-3 space-y-3 shadow-sm">
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 font-black flex items-center justify-center text-sm flex-shrink-0">{qIndex + 1}</div>
                    <textarea value={q.text} onChange={(e) => { clearWarning(); onUpdateQuestion(q.id, { text: e.target.value }); }} placeholder="Nội dung câu hỏi..." className="flex-1 min-h-[58px] border border-slate-200 bg-slate-50 rounded-2xl p-3 text-sm font-bold focus:outline-none focus:border-emerald-400 focus:bg-white leading-snug" />
                    <button type="button" onClick={() => onRemoveQuestion(q.id)} className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-500 hover:bg-rose-100 flex items-center justify-center shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SELF_QUIZ_OPTION_IDS.map(optionId => (
                      <label key={optionId} className={`flex items-center gap-2 border rounded-2xl p-2 transition-colors ${normalizeOptionId(q.correctOptionId) === optionId ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                        <input className="w-4 h-4 accent-emerald-600 shrink-0" type="radio" name={`correct-${q.id}`} checked={normalizeOptionId(q.correctOptionId) === optionId} onChange={() => { clearWarning(); onUpdateQuestion(q.id, { correctOptionId: optionId }); }} />
                        <span className={`font-black text-xs uppercase w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${normalizeOptionId(q.correctOptionId) === optionId ? 'bg-white text-emerald-700 border border-emerald-200' : 'bg-white text-slate-600 border border-slate-200'}`}>{optionId.toUpperCase()}</span>
                        <input value={getOptionText(q, optionId)} onChange={(e) => { clearWarning(); onUpdateOption(q.id, optionId, e.target.value); }} placeholder={`${TEXT.optionPlaceholder} ${optionId.toUpperCase()}`} className="min-w-0 flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-400" />
                        {normalizeOptionId(q.correctOptionId) === optionId && <span className="hidden sm:inline text-[9px] font-black text-emerald-700 bg-emerald-100 rounded-full px-2 py-1 uppercase">{TEXT.correct}</span>}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className={`rounded-xl px-3 py-2 text-[10px] font-black border ${q.correctOptionId ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                      {TEXT.correctAnswer}: {getCorrectLabel(q)}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase">{TEXT.point}</span>
                      <input type="number" min="0.25" step="0.25" value={q.points} onChange={(e) => onUpdateQuestion(q.id, { points: e.target.value })} className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-black text-center" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div ref={previewRef} className="bg-white border border-emerald-100 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm xl:sticky xl:top-0 self-start">
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
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <button type="button" onClick={onAddQuestion} className="px-4 py-2.5 bg-white text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" /> {TEXT.addQuestion}</button>
            <button type="button" onClick={handleSaveClick} disabled={isSaving} className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase shadow-md flex items-center justify-center gap-2 disabled:opacity-60"><Save className="w-4 h-4" /> {isSaving ? '\u0110ang l\u01b0u...' : TEXT.save}</button>
          </div>
          {saveFeedback && (
            <div className={`rounded-xl px-3 py-2 text-[11px] sm:text-xs font-black border ${saveFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : saveFeedback.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
              {saveFeedback.message}
            </div>
          )}
        </div>
      )}

      {showQuizResults && (
        <div className="relative bg-blue-50 border border-blue-100 rounded-2xl p-3 sm:p-4">
          <button type="button" onClick={onToggleResults} className="absolute right-3 top-3 w-8 h-8 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center hover:bg-rose-600 hover:text-white transition-colors" title="Đóng">
            <X className="w-4 h-4" />
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pr-10">
            <h4 className="font-black text-blue-900 text-sm uppercase">{TEXT.resultsTitle}</h4>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black text-blue-600 uppercase">{latestResultRows.length} học sinh</span>
              {hasAnyAttempts && (
                <button type="button" onClick={onResetQuizAttempts} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 text-[10px] font-black uppercase flex items-center gap-1.5 hover:bg-rose-600 hover:text-white transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset bai lam
                </button>
              )}
            </div>
          </div>
          {latestResultRows.length === 0 ? (
            <div className="bg-white border border-blue-100 rounded-xl p-4 text-center text-xs font-bold text-slate-500">{hasAnyAttempts ? 'Co du lieu bai lam treo nhung chua ghep duoc vao bang. Bam Reset bai lam de don bai hien tai.' : TEXT.noSubmissions}</div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-xl border border-blue-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-blue-50 text-blue-900 uppercase font-black">
                  <tr>
                    <th className="px-3 py-2">{TEXT.student}</th>
                    <th className="px-3 py-2">{TEXT.score}</th>
                    <th className="px-3 py-2">{TEXT.essayScore}</th>
                    <th className="px-3 py-2">{TEXT.totalScore}</th>
                    <th className="px-3 py-2">{TEXT.percent}</th>
                    <th className="px-3 py-2">{TEXT.time}</th>
                    <th className="px-3 py-2 text-right">Làm lại</th>
                    <th className="px-3 py-2 text-right">Reset</th>
                  </tr>
                </thead>
                <tbody>{latestResultRows.map(row => {
                  const result = row.result || {};
                  const essay = getEssaySubmissionForResult(row);
                  const quizPair = getScorePair(result.score, result.total);
                  const essayPair = getScorePair(essay?.teacherScore ?? essay?.aiScore, essay?.teacherMaxScore ?? essay?.aiMaxScore);
                  const quizPointScore = getSelfQuizScorePoint(result, quizPair);
                  const essayPointScore = essayPair.hasScore ? essayPair.score : 0;
                  const totalScore = (quizPair.hasScore ? quizPointScore : 0) + essayPointScore;
                  const hasTotalScore = quizPair.hasScore || essayPair.hasScore;
                  const percent = hasTotalScore ? Math.round((totalScore / 10) * 100) : 0;
                  const displayTime = Math.max(Number(result.submittedAt || 0), Number(essay?.submittedAt || 0));
                  const rowStatus = getRowStatus(row, quizPair, essayPair);
                  return (
                    <tr key={row.key || `${result.id || row.studentName}-${essay?.id || ''}`} className="border-t border-blue-50">
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-800">{row.studentName || result.studentName || essay?.studentName || TEXT.student}</div>
                        <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${rowStatus.className}`}>{rowStatus.text}</div>
                      </td>
                      <td className="px-3 py-2 font-black text-emerald-700">{formatPointOnly(quizPointScore, quizPair.hasScore)}</td>
                      <td className="px-3 py-2 font-black text-indigo-700">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{formatPointOnly(essayPointScore, essayPair.hasScore)}</span>
                          {essay && (
                            <button type="button" onClick={() => onOpenHandwrittenSubmission?.(row.key)} className="rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1 text-[9px] font-black uppercase text-indigo-700 hover:bg-indigo-600 hover:text-white">
                              Mở
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-black text-blue-800">{hasTotalScore ? formatPointScore(totalScore) : '-'}</td>
                      <td className="px-3 py-2 font-bold">{percent}%</td>
                      <td className="px-3 py-2 text-slate-500 font-bold">{displayTime ? new Date(displayTime).toLocaleString('vi-VN') : '-'}</td>
                      <td className="px-3 py-2 text-right">
                        {(row.result || essay) && (
                          <button type="button" onClick={() => onResetStudentAttempt?.(row.key, row.studentName || result.studentName || essay?.studentName || '')} className="rounded-lg border border-rose-100 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase text-rose-600 hover:bg-rose-600 hover:text-white">
                            Làm lại
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => onResetStudentAttempt?.(row.key, row.studentName || result.studentName || essay?.studentName || '')} disabled={!row.key} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-black uppercase text-slate-600 hover:bg-slate-700 hover:text-white disabled:opacity-40">
                          Reset
                        </button>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
