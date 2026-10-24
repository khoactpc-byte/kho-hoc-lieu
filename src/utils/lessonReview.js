import { normalizeSelfQuizDraft, parseSelfQuizFromHtml, stripHtmlToText } from './selfQuiz.js';
import { formatQuizAiText, splitQuizHtml } from './quizContent.js';
import { formulaIssues, quizQualityIssues, QUIZ_FORMULA_PROMPT } from './quizQuality.js';

export const REVIEW_QUESTION_OPTIONS = [
  { value: 'auto', label: 'Tự động theo nội dung bài học' },
  { value: '5', label: '5 câu trắc nghiệm' },
  { value: '10', label: '10 câu trắc nghiệm' }
];

// AI sometimes returns quiz controls. Keep the answer text, never interactive HTML.
export function normalizeLessonReviewSource(value = '') {
  return String(value || '')
    .replace(/&lt;\/?(?:label|input)\b[\s\S]*?&gt;/gi, '')
    .replace(/<\/?(?:label|input)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi, '');
}

export function prepareLessonReviewContent(value, count, essayCount, { format = formatQuizAiText, split = splitQuizHtml } = {}) {
  const content = format(normalizeLessonReviewSource(value));
  const parsed = parseSelfQuizFromHtml(content);
  const essayQuestions = extractLessonReviewEssays(split(content).question);
  const prepared = prepareLessonReview(parsed, count, { essayCount, essayQuestions });
  const sourceIssues = formulaIssues(stripHtmlToText(content), { allowTrailingEquality: true });
  return { ...prepared, ...(!prepared.error && sourceIssues.length ? { error: `Công thức trong đề hoặc đáp án: ${sourceIssues.join(' ')}` } : {}), content, parsed: { ...parsed, essayQuestions } };
}

export function lessonReviewPrompt(count = 'auto', essayCount = 0) {
  const quantity = count === '5' || count === '10' ? `đúng ${count} câu trắc nghiệm ôn tập` : 'từ 3 đến 20 câu trắc nghiệm ôn tập, tự chọn số câu phù hợp với độ dài và các ý chính của bài học; bài ngắn ít câu, bài dài nhiều câu, tránh lặp ý';
  const essays = Math.min(5, Math.max(0, Number(essayCount) || 0));
  const extra = essays ? ` Sau phần trắc nghiệm, thêm mục TỰ LUẬN gồm đúng ${essays} câu tự luận tự luyện, đánh số Bài 1., Bài 2., ...; không chèn đáp án vào câu hỏi. Phần tự luận không tính vào điểm tự chấm. Gợi ý giải tự luận đặt cùng phần đáp án riêng cho giáo viên.` : ' Chỉ tạo trắc nghiệm, không thêm tự luận.';
  return `Hãy tạo ${quantity} dựa trên bài học. Mỗi câu có đủ 4 phương án A, B, C, D và một đáp án đúng.${extra} Đặt toàn bộ đáp án ở cuối trong <div class="teacher-only">...</div>, ghi rõ đáp án trắc nghiệm Câu 1: A, Câu 2: B... Phần trắc nghiệm có tổng điểm 10, chia đều cho các câu.\n\n${QUIZ_FORMULA_PROMPT}`;
}

// Input is the question projection from splitQuizHtml, with private answers removed.
export function extractLessonReviewEssays(questionHtml = '') {
  const text = stripHtmlToText(questionHtml).replace(/\r/g, '');
  const heading = /(?:^|\n)\s*(?:(?:phần|phan)\s*(?:ii|2)\s*[:.-]?\s*)?t[ựu]\s*lu[ậa]n[^\n]*(?:\n|$)/i.exec(text);
  if (!heading) return [];
  const body = text.slice(heading.index + heading[0].length).split(/\n\s*(?:đáp án|dap an|hướng dẫn|huong dan|gợi ý|goi y|lời giải|loi giai|biểu điểm|bieu diem)\s*[:.-]?/i)[0];
  const starts = [...body.matchAll(/(?:^|\n)\s*(?:Bài|Bai|Câu|Cau)\s*(\d+)\s*[.):-]\s*/gi)];
  return starts.map((match, index) => ({ id: `essay-${index + 1}`, text: body.slice(match.index + match[0].length, starts[index + 1]?.index ?? body.length).trim() }));
}

export function prepareLessonReview(parsed, count = 'auto', { essayCount = 0, essayQuestions = [], requireAnswers = true } = {}) {
  const questions = parsed?.questions || [];
  const expected = count === '5' || count === '10' ? Number(count) : 0;
  if (expected ? questions.length !== expected : questions.length < 3 || questions.length > 20) {
    return { error: `Tách được ${questions.length} câu; cần ${expected || 'từ 3 đến 20'} câu trắc nghiệm. Thầy cô kiểm tra nội dung hoặc tạo lại.` };
  }
  const incomplete = questions.flatMap((question, index) => {
    const ids = ['a', 'b', 'c', 'd'];
    const missing = [];
    if (!question.text?.trim()) missing.push('thiếu nội dung câu hỏi');
    const options = ids.filter(id => !question.options?.some(option => option.id === id && option.text?.trim()));
    if (options.length) missing.push(`thiếu phương án ${options.map(id => id.toUpperCase()).join('/')}`);
    if (requireAnswers && !ids.includes(question.correctOptionId)) missing.push('chưa xác định được đáp án đúng');
    return missing.length ? [`Câu ${index + 1}: ${missing.join('; ')}.`] : [];
  });
  if (incomplete.length) return { error: `${incomplete.join('\n')} Thầy cô sửa hoặc nhờ AI kiểm tra trước khi lưu.` };
  const qualityIssues = quizQualityIssues({ ...parsed, essayQuestions });
  if (qualityIssues.length) return { error: qualityIssues.join('\n') };
  if (!Number.isInteger(essayCount) || essayCount < 0 || essayCount > 5 || essayQuestions.length !== essayCount || essayQuestions.some(question => !question.text?.trim())) {
    return { error: `Tách được ${essayQuestions.length} câu tự luận; cần đúng ${essayCount} câu. Thầy cô kiểm tra mục TỰ LUẬN (Bài 1., Bài 2., ...) hoặc tạo lại.` };
  }
  const quizData = normalizeSelfQuizDraft({
    ...parsed, questions: questions.map(question => ({ ...question, points: 10 / questions.length })),
    questionBank: [], questionCountPerAttempt: questions.length,
    shuffleQuestions: true, shuffleOptions: true, showScoreAfterSubmit: true,
    allowRetake: true, requirePassingScore: true, passingPercent: 80
  });
  return { quizData: { ...quizData, ...(essayCount ? { essayQuestions: essayQuestions.map((question, index) => ({ id: `essay-${index + 1}`, text: question.text.trim() })) } : {}) } };
}
