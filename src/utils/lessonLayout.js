import { stripHtmlToText } from './selfQuiz.js';

export const LESSON_TWO_COLUMN_MIN_WIDTH = 960;
export const normalizeLessonLayoutMode = mode => ['auto', 'single', 'double'].includes(mode) ? mode : 'auto';

export function lessonColumnCount(html = '', width = 0, mode = 'auto') {
  if (width < LESSON_TWO_COLUMN_MIN_WIDTH || mode === 'single') return 1;
  if (mode === 'double') return 2;
  // Leave illustrated lessons, tables and embedded documents their full width.
  if (/<(?:img|table|pre|iframe|video|canvas|svg)\b/i.test(html)) return 1;
  const lines = stripHtmlToText(html).split('\n').map(line => line.trim()).filter(Boolean);
  const shortLines = lines.filter(line => line.length <= 100).length;
  return lines.length >= 12 && shortLines / lines.length >= 0.65 && lines.join('').length >= 300 ? 2 : 1;
}
