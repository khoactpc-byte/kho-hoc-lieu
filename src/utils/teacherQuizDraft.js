import { normalizeSelfQuizDraft, rebalanceSelfQuizPoints } from './selfQuiz.js';
import { quizQualityIssues } from './quizQuality.js';

// Validate before normalization, which intentionally omits incomplete questions.
export function prepareTeacherQuizDraft(draft, content) {
  const questions = draft?.questions || [];
  if (!questions.length) return { quizData: null };
  const issues = quizQualityIssues(draft);
  if (issues.length) return { error: issues.join('\n') };
  for (const [index, question] of questions.entries()) {
    const options = question.options || [];
    if (!String(question.text || '').trim() || options.filter(option => String(option.text || '').trim()).length < 2) {
      return { error: `Câu ${index + 1} chưa đủ nội dung hoặc lựa chọn.` };
    }
    const answer = String(question.correctOptionId || '').trim().toLowerCase();
    if (!options.some(option => String(option.id).trim().toLowerCase() === answer && String(option.text || '').trim())) {
      return { error: `Câu ${index + 1} chưa chọn đáp án đúng.` };
    }
  }
  return { quizData: rebalanceSelfQuizPoints({ ...draft, ...normalizeSelfQuizDraft(draft) }, content) };
}

export function selfQuizDraftToHtml(draft) {
  const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const questions = draft?.questions || [];
  return questions.map((question, index) => `<p>Câu ${index + 1}. ${escape(question.text)}</p>${(question.options || []).filter(option => String(option.text || '').trim()).map(option => `<p>${escape(String(option.id).toUpperCase())}. ${escape(option.text)}</p>`).join('')}`).join('')
    + `<div class="teacher-only"><p>Đáp án: ${questions.map((question, index) => `${index + 1}${escape(String(question.correctOptionId || '').toUpperCase())}`).join(' ')}</p></div>`;
}
