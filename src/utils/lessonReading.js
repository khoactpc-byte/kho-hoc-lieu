import { mapOutsideQuizMath, protectQuizMath, quizMathParts } from './quizMath.js';
import { prepareLessonMathAlignment } from './lessonMathAlignment.js';

const protectedBlocks = 'table,pre,code,figure,svg,math,mjx-container';

export function shortenLessonWording(text, { heading = false } = {}) {
  return mapOutsideQuizMath(text, value => {
    let result = value.replace(/Ví dụ\s+trực\s+tiếp/gi, match => match.replace(/\s+trực\s+tiếp$/i, ''));
    if (heading) result = result
      .replace(/Lời giải chi tiết(?:\s+từng bước)?\s+cho học sinh\s+GDTX/gi, 'Lời giải chi tiết')
      .replace(/(Ví dụ)\s+(?:từng dòng công thức|từng quy tắc|cho từng dấu hiệu)/gi, '$1')
      .replace(/\s+trình bày theo chuỗi phương trình tương đương\s*(?:\(⇔\))?/gi, '')
      .replace(/\s*\(Trình bày\s*⇔\)/gi, '')
      .replace(/\s*(?:&|và)\s*Trình bày\s*⇔/gi, '');
    return result;
  });
}

const hasBreakBefore = node => {
  let previous = node.previousSibling;
  while (previous?.nodeType === 3 && !previous.nodeValue.trim()) previous = previous.previousSibling;
  return previous?.nodeName === 'BR';
};

function breakTextNode(node, starts) {
  const document = node.ownerDocument, text = node.nodeValue;
  const fragment = document.createDocumentFragment();
  let end = 0, count = 0;
  for (const start of [...new Set(starts)].sort((a, b) => a - b)) {
    fragment.append(document.createTextNode(text.slice(end, start)));
    if (!(text.slice(0, start).trim() === '' && hasBreakBefore(node))) { fragment.append(document.createElement('br')); count++; }
    end = start;
  }
  fragment.append(document.createTextNode(text.slice(end)));
  node.replaceWith(fragment);
  return count;
}

function alignMathChain(value) {
  return value.replace(quizMathParts, math => {
    if (/\\begin\{(?:aligned|align\*?|gathered|array|cases)\}/.test(math)) return math;
    const body = math.slice(math.startsWith('$$') || math.startsWith('\\') ? 2 : 1, math.endsWith('$$') || math.endsWith('\\)') || math.endsWith('\\]') ? -2 : -1);
    if ((body.match(/\\Leftrightarrow|⇔/g) || []).length < 2) return math;
    const aligned = body.replace(/\\Leftrightarrow|⇔/g, token => `\\\\ &${token}`);
    return `\\(\\begin{aligned}&${aligned}\\end{aligned}\\)`;
  });
}

export function formatLessonReading(root) {
  const document = root.ownerDocument, filter = document.defaultView.NodeFilter;
  const nodes = () => {
    const walker = document.createTreeWalker(root, filter.SHOW_TEXT), result = [];
    while (walker.nextNode()) if (!walker.currentNode.parentElement.closest(protectedBlocks)) result.push(walker.currentNode);
    return result;
  };
  let wordingChanges = 0, chains = 0, lineBreaks = 0;
  for (const node of nodes()) {
    const before = node.nodeValue;
    const after = shortenLessonWording(before, { heading: !!node.parentElement.closest('h2,h3,h4,h5,h6') });
    if (after !== before) { node.nodeValue = after; wordingChanges++; }
  }
  for (const paragraph of root.querySelectorAll('p,li')) {
    if (paragraph.closest(protectedBlocks) || paragraph.querySelector('p,li') || paragraph.classList.contains('lesson-equivalence-chain')) continue;
    const text = paragraph.textContent, outside = protectQuizMath(text).source;
    // These are separate geometric conditions, rather than consecutive solution steps.
    if ((outside.match(/(?:^|[:.;]\s+)[1-3]\)\s+\p{L}/gu) || []).length >= 2) continue;
    const plainArrows = (outside.match(/⇔/g) || []).length;
    const mathChain = [...text.matchAll(quizMathParts)].some(match => !/\\begin\{(?:aligned|align\*?|gathered|array|cases)\}/.test(match[0]) && (match[0].match(/\\Leftrightarrow|⇔/g) || []).length >= 2);
    if (plainArrows < 2 && !mathChain) continue;
    const walker = document.createTreeWalker(paragraph, filter.SHOW_TEXT), texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const node of texts) {
      node.nodeValue = alignMathChain(node.nodeValue);
      const protectedMath = protectQuizMath(node.nodeValue), starts = [];
      for (const match of protectedMath.source.matchAll(/⇔|(?<=[.;]\s+)(?:Bài\s+\d+[a-d]?\s*[:)]|[a-d]\)\s|Vậy\s|Ví dụ(?: mẫu)?\s*:)/g)) {
        starts.push(protectedMath.restore(protectedMath.source.slice(0, match.index)).length);
      }
      const label = /^(?:Trình bày bài làm|Lời giải bài làm|Lời giải|Bài làm):\s*/.exec(node.nodeValue);
      if (node === texts[0] && label && !node.nextSibling?.nodeName?.match(/^BR$/)) starts.push(label[0].length);
      if (starts.length) lineBreaks += breakTextNode(node, starts);
    }
    paragraph.classList.add('lesson-equivalence-chain');
    paragraph.style.breakInside = 'avoid-column';
    chains++;
  }
  prepareLessonMathAlignment(root);
  return { wordingChanges, chains, lineBreaks };
}
