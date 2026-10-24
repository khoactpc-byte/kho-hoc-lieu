import { prepareLessonReviewContent } from './lessonReview.js';
import { prepareBatchLessonReview } from './lessonReviewBatch.js';
import { createQuizContentTools } from './quizContent.js';

export const isStructuredLessonReview = value => /^(?:\s*\{|\s*```(?:json)?\s*\{)/i.test(String(value || ''));

// Generated fields stay structured through preview and save. Legacy pasted text is still supported.
export function prepareAiLessonReview(value, count, essayCount, { windowObject = globalThis.window, ...legacyOptions } = {}) {
  if (!isStructuredLessonReview(value)) {
    const tools = windowObject ? createQuizContentTools(windowObject) : null;
    return prepareLessonReviewContent(value, count, essayCount, { ...(tools ? { format: tools.formatAi, split: tools.split } : {}), ...legacyOptions });
  }
  try {
    const result = prepareBatchLessonReview(windowObject, value, count, essayCount, { maxAutoQuestions: 20 });
    return { ...result, parsed: { questions: result.quizData.questions, essayQuestions: result.quizData.essayQuestions || [] } };
  } catch (failure) {
    return { error: failure.message, content: '', parsed: { questions: [], essayQuestions: [] } };
  }
}
