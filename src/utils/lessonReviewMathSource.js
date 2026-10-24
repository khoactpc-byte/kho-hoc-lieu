import { normalizeMathDelimiters, normalizeMathText } from './quizContent.js';
import { formulaIssues } from './quizQuality.js';

const decode = value => typeof value === 'string' ? value.replaceAll('[BS]', '\\') : '';

// The transport carries math bodies separately; only the application adds delimiters.
export function lessonReviewFieldSource(value) {
  if (typeof value === 'string') return decode(value);
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('Thiếu các phần nội dung câu hỏi.');
  return value.map(part => {
    if (!part || !['text', 'math'].includes(part.kind) || typeof part.value !== 'string') throw new Error('Phần chữ hoặc công thức chưa đúng cấu trúc.');
    const body = decode(part.value);
    if (part.kind === 'text') return body;
    const normalized = normalizeMathDelimiters(body.trim());
    // Also accept a single already-delimited formula from older responses.
    const unwrapped = /^\\\([\s\S]*\\\)$/.test(normalized) || /^\\\[[\s\S]*\\\]$/.test(normalized) ? normalized.slice(2, -2) : normalized;
    return `\\(${unwrapped}\\)`;
  }).join('');
}

function closeLegacyBareDelimiters(text) {
  let open = '', end = 0, output = '';
  for (const match of text.matchAll(/\\\\|\\[()[\]]|\\[A-Za-z]+|\\(?=\s|[.,;:!?]|$)/g)) {
    const token = match[0];
    output += text.slice(end, match.index);
    if (token === '\\(' || token === '\\[') open = token;
    else if (token === '\\)' || token === '\\]') open = '';
    if (token === '\\' && open) {
      // A bare terminator can close an intact expression, never missing TeX data.
      const candidate = output.slice(output.lastIndexOf(open)) + (open === '\\(' ? '\\)' : '\\]');
      if (!formulaIssues(candidate, { allowTrailingEquality: true }).length) {
        output += open === '\\(' ? '\\)' : '\\]'; open = ''; end = match.index + 1; continue;
      }
    }
    output += token; end = match.index + token.length;
  }
  return output + text.slice(end);
}

export function normalizeLessonReviewField(value) {
  const source = lessonReviewFieldSource(value);
  const encoding = formulaIssues(source, { allowTrailingEquality: true }).find(issue => /escape JSON/.test(issue));
  if (encoding) throw new Error(encoding);
  const normalized = normalizeMathText(source.trim());
  if (typeof value !== 'string' || !formulaIssues(normalized, { allowTrailingEquality: true }).length) return { text: normalized, repaired: false };
  const repaired = closeLegacyBareDelimiters(normalized);
  return { text: repaired, repaired: repaired !== normalized };
}
