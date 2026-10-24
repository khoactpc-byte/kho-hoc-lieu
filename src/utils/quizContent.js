import { createHtmlSanitizer, escapeHtmlText, sanitizeHtml } from './safeHtml.js';
import { quizMathParts as mathParts, mapOutsideQuizMath as mapOutsideMath } from './quizMath.js';

// Keep TeX source in editors/storage. MathJax only touches read-only previews.
const proseParts = /\(\s*\d+(?:[,.]\d+)?\s*(?:điểm|diem)\s*\)|\bhttps?:\/\/[^\s<]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b[A-Za-z]:\\[^\s]+|`[^`\n]*`/gi;
const mathCommand = /\\(?:[dt]?frac|sqrt|overline|mathbb|sum|prod|int|lim|sin|cos|tan|log|ln|alpha|beta|gamma|theta|pi|infty|times|cdot|leq?|geq?|neq?|notin|in|cup|cap|emptyset|varnothing)\b/;
const mathRun = /(?:\\[A-Za-z]+|(?<![\p{L}])[A-Za-z]{1,3}(?![\p{L}])|\d+(?:[,.]\d+)?|[ \t()+\-−=·×÷*/^_{}.,:;|[\]])+/gu;

function balancedFormula(text) {
  const stack = [], close = { ')': '(', ']': '[', '}': '{' };
  for (const char of text) {
    if ('([{'.includes(char)) stack.push(char);
    else if (close[char] && stack.pop() !== close[char]) return false;
  }
  return !stack.length;
}

export function normalizeMathDelimiters(value = '') {
  // Fix doubled delimiters only; \\ inside aligned environments is a row break.
  const text = String(value ?? '').replace(/\\\\([()[\]])/g, '\\$1');
  return text.replace(mathParts, part => {
    if (part.startsWith('$$')) return `\\[${part.slice(2, -2).trim()}\\]`;
    if (part.startsWith('$')) return `\\(${part.slice(1, -1).trim()}\\)`;
    return part;
  });
}

function recoverLegacyMath(text) {
  // Earlier editor code removed the slash from \frac and all math delimiters.
  const repaired = text.replace(/(?<![\\\p{L}])((?:[dt]?frac|sqrt))(?=\s*\{)/gu, '\\$1');
  return repaired.replace(mathRun, run => {
    if (!mathCommand.test(run) && !/[A-Za-z0-9}][_^](?:\{[^{}]+\}|[+-]?\d+|[A-Za-z])/.test(run)) return run;
    const leading = run.match(/^\s*(?:[a-z]\)\s+)?/i)[0];
    const trailing = run.match(/[\s.,;:]*$/)[0];
    const formula = run.slice(leading.length, run.length - trailing.length);
    if (!formula || !balancedFormula(formula)) return run;
    return `${leading}\\(${formula}\\)${trailing}`;
  });
}

export function normalizeMathText(value = '') {
  return mapOutsideMath(normalizeMathDelimiters(value), text => {
    // Points are prose, not part of the preceding algebraic expression.
    let end = 0, result = '';
    for (const match of text.matchAll(proseParts)) {
      result += recoverLegacyMath(text.slice(end, match.index)) + match[0];
      end = match.index + match[0].length;
    }
    return result + recoverLegacyMath(text.slice(end));
  });
}

const allowedAiTag = /(<\/?(?:p|div|span|br|strong|b|em|i|u|sup|sub|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|blockquote)\b[^>]*>)/gi;
function formatAiSource(value, allowHtml = true) {
  const text = normalizeMathDelimiters(String(value ?? '').replace(/\r\n?/g, '\n').trim()
    .replace(/^```(?:html|latex|tex)?\s*\n([\s\S]*?)\n```$/i, '$1'));
  const formatProse = prose => (allowHtml ? prose.split(allowedAiTag) : [prose]).map((part, index) => {
    if (allowHtml && index % 2) return part;
    return escapeHtmlText(part).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>').replace(/\n/g, '<br/>');
  }).join('');
  let end = 0, html = '';
  for (const match of text.matchAll(mathParts)) {
    html += formatProse(text.slice(end, match.index)) + escapeHtmlText(match[0]);
    end = match.index + match[0].length;
  }
  return html + formatProse(text.slice(end));
}

function restorePrivateMarkers(html) {
  const markers = /&lt;(\/?)div\b([^<>]*?)&gt;/gi;
  let depth = 0, start, bodyStart, end = 0, result = '';
  for (const match of html.matchAll(markers)) {
    if (!depth) {
      if (match[1] || !/^\s+class=(?:&quot;|"|&#39;|')teacher-only(?:&quot;|"|&#39;|')\s*$/i.test(match[2])) continue;
      start = match.index; bodyStart = match.index + match[0].length; depth = 1;
    } else {
      depth += match[1] ? -1 : 1;
      if (!depth) {
        // Count nested escaped divs before locating the closing private marker.
        // Decoding to the first </div> could leave part of an answer public.
        result += html.slice(end, start) + `<div class="teacher-only">${restorePrivateMarkers(html.slice(bodyStart, match.index))}</div>`;
        end = match.index + match[0].length;
      }
    }
  }
  return result + html.slice(end);
}

export function createQuizContentTools(windowObject) {
  const document = windowObject.document, sanitize = createHtmlSanitizer(windowObject);
  const wrapperFor = html => {
    const root = document.createElement('div');
    root.innerHTML = sanitize(html);
    return root;
  };
  const normalizeHtml = html => {
    const root = wrapperFor(html);
    // Recover only the exact private wrapper escaped by the old AI formatter.
    // Protect code examples; never decode arbitrary escaped HTML.
    const examples = [...root.querySelectorAll('pre, code')].filter(node => !node.parentElement.closest('pre, code'));
    const saved = examples.map(node => node.outerHTML);
    examples.forEach((node, index) => { node.replaceWith(document.createComment(`khl-code-${index}`)); });
    root.innerHTML = restorePrivateMarkers(root.innerHTML);
    root.innerHTML = root.innerHTML.replace(/<!--khl-code-(\d+)-->/g, (_, index) => saved[Number(index)] || '');
    for (const node of [...root.querySelectorAll('.teacher-only .teacher-only')]) node.replaceWith(...node.childNodes);
    const walker = document.createTreeWalker(root, windowObject.NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement.closest('pre, code, math, mjx-container, sup, sub')) continue;
      node.nodeValue = normalizeMathText(node.nodeValue);
    }
    return sanitize(root.innerHTML);
  };
  const split = html => {
    const root = wrapperFor(normalizeHtml(html));
    const blocks = [...root.querySelectorAll('.teacher-only')];
    const answer = blocks.map(node => node.innerHTML).join('<p><br></p>');
    blocks.forEach(node => node.remove());
    return { question: root.innerHTML, answer };
  };
  const answerOnly = html => {
    const root = wrapperFor(normalizeHtml(html));
    for (const node of [...root.querySelectorAll('.teacher-only')]) node.replaceWith(...node.childNodes);
    return root.innerHTML;
  };
  const compose = (question = '', answer = '') => {
    const parts = split(question), privateHtml = [parts.answer, answerOnly(answer)].filter(Boolean).join('<p><br></p>');
    return `${parts.question.trim()}${privateHtml.trim() ? `<div class="teacher-only">${privateHtml.trim()}</div>` : ''}`;
  };
  const promptText = html => {
    const root = wrapperFor(normalizeHtml(html));
    // A plain textContent would turn 5x<sup>2</sup> into 5x2 in the AI request.
    for (const node of [...root.querySelectorAll('sup, sub')].reverse()) {
      node.replaceWith(document.createTextNode(`${node.tagName === 'SUP' ? '^' : '_'}{${node.textContent}}`));
    }
    root.querySelectorAll('br').forEach(node => node.replaceWith(document.createTextNode('\n')));
    root.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6').forEach(node => node.append(document.createTextNode('\n')));
    return (root.textContent || '').trim();
  };
  return { normalizeHtml, split, compose, promptText,
    formatPlainText: text => normalizeHtml(formatAiSource(text, false)),
    formatAi: (text, { answerOnly: onlyAnswer = false } = {}) => (onlyAnswer ? answerOnly : normalizeHtml)(formatAiSource(text)) };
}

let browserTools;
const contentTools = () => typeof window === 'undefined' ? null : (browserTools ||= createQuizContentTools(window));
export const normalizeMathHtml = (html = '') => contentTools()?.normalizeHtml(html) ?? sanitizeHtml(html);
export const splitQuizHtml = (html = '') => contentTools()?.split(html) ?? { question: String(html), answer: '' };
export const composeQuizHtml = (question = '', answer = '') => contentTools()?.compose(question, answer) ?? sanitizeHtml(question);
export const formatQuizAiText = (text = '', options) => contentTools()?.formatAi(text, options) ?? sanitizeHtml(formatAiSource(text));
export const formatMathPlainText = (text = '') => contentTools()?.formatPlainText(text) ?? sanitizeHtml(formatAiSource(text, false));
export const quizHtmlToPromptText = (html = '') => contentTools()?.promptText(html) ?? String(html);

export const QUIZ_ANSWER_MATH_INSTRUCTION = String.raw`- Công thức phải dùng LaTeX với một dấu gạch chéo: trong dòng \( ... \), riêng dòng \[ ... \].
- Phân số dùng \frac{tử số}{mẫu số}; số mũ dùng x^{2}; mỗi bước biến đổi rõ ràng. Không viết frac{...}{...} hay x^2 bên ngoài dấu bao công thức.
- Chỉ trả nội dung đáp án và biểu điểm; không bọc <div class="teacher-only">, hệ thống tự quản lý phần chỉ giáo viên thấy.
- Có thể dùng HTML đơn giản (p, strong, ol, li); không đặt công thức trong khối mã Markdown.`;
