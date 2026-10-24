import { createHtmlSanitizer } from './safeHtml.js';
import { createQuizContentTools } from './quizContent.js';
import { quizMathParts } from './quizMath.js';

const unitSelector = '[data-lai-unit]';
const privateSelector = '.teacher-only,[data-lesson-answer]';
const paragraphSelector = 'p,h1,h2,h3,h4,h5,h6';

// Split only the outer alignment. Row breaks inside cases, fractions, text or
// nested arrays belong to the same step and must stay together.
export function splitLessonMathSteps(math) {
  const delimiter = math.startsWith('\\[') || math.startsWith('\\(') ? 2 : math.startsWith('$$') ? 2 : 1;
  const body = math.slice(delimiter, -delimiter).trim();
  const outer = /^\\begin\{(aligned|align\*?|gathered|gather\*?|alignedat)\}(?:\{\d+\})?([\s\S]*)\\end\{\1\}$/.exec(body);
  let source = outer ? outer[2] : body;
  const rows = []; let start = 0, braces = 0, environments = 0;
  for (let i = 0; i < source.length; i++) {
    const environment = /^\\(begin|end)\{[^{}]+\}/.exec(source.slice(i));
    if (environment) { environments += environment[1] === 'begin' ? 1 : -1; i += environment[0].length - 1; continue; }
    if (source[i] === '\\' && /[{}&]/.test(source[i + 1] || '')) { i++; continue; }
    if (source[i] === '{') braces++;
    if (source[i] === '}') braces--;
    if (braces || environments) continue;
    const rowBreak = outer && source.slice(i, i + 2) === '\\\\';
    const arrow = !outer && /^(?:\\Leftrightarrow\b|\\Rightarrow\b|⇔|⇒)/.exec(source.slice(i));
    if (rowBreak || arrow) {
      if (source.slice(start, i).trim()) rows.push(source.slice(start, i));
      if (rowBreak) {
        i++;
        const spacing = /^\s*\[[\d.]+(?:pt|em|ex)\]/.exec(source.slice(i + 1));
        if (spacing) i += spacing[0].length;
        start = i + 1;
      } else { start = i; i += arrow[0].length - 1; }
    }
  }
  if (source.slice(start).trim()) rows.push(source.slice(start));
  if (rows.length < 2) return [math];
  const stripAlignment = value => {
    let depth = 0, env = 0, result = '';
    for (let i = 0; i < value.length; i++) {
      const match = /^\\(begin|end)\{[^{}]+\}/.exec(value.slice(i));
      if (match) { env += match[1] === 'begin' ? 1 : -1; result += match[0]; i += match[0].length - 1; continue; }
      if (value[i] === '\\' && /[{}&]/.test(value[i + 1] || '')) { result += value.slice(i, i + 2); i++; continue; }
      if (value[i] === '{') depth++;
      if (value[i] === '}') depth--;
      if (value[i] === '&' && !depth && !env) continue;
      result += value[i];
    }
    return result.trim();
  };
  let lastLeft = '';
  return rows.map(row => {
    let value = stripAlignment(row);
    if (/^=/.test(value) && lastLeft) value = `${lastLeft} ${value}`;
    const equality = /^([^=]+?)\s*=/.exec(value);
    if (equality && !/\\(?:begin|Leftrightarrow)|[<>⇔⇒]/.test(equality[1])) lastLeft = equality[1].trim();
    return `\\(${value}\\)`;
  });
}

export function createLessonSelectionTools(windowObject) {
  const document = windowObject.document, sanitize = createHtmlSanitizer(windowObject);
  const normalize = createQuizContentTools(windowObject).normalizeHtml;
  const rootFor = html => { const root = document.createElement('div'); root.innerHTML = sanitize(html); return root; };
  const walkTexts = root => {
    const walker = document.createTreeWalker(root, windowObject.NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim() && !walker.currentNode.parentElement.closest('pre,code,math,mjx-container,figure,svg')) nodes.push(walker.currentNode);
    return nodes;
  };
  const plan = (html, { mathEnabled = true } = {}) => {
    const root = rootFor(mathEnabled ? normalize(html) : html), items = [], groups = [];
    const privacy = new Map();
    root.querySelectorAll(privateSelector).forEach((node, i) => privacy.set(node, `private-${i}`));
    const add = (node, kind, text, group = '', chain = '') => {
      const id = `unit-${items.length}`;
      node.dataset.laiUnit = id; node.dataset.laiKind = kind;
      if (kind !== 'text') { node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0'); node.setAttribute('aria-label', `Chọn ${kind === 'figure' ? 'hình minh họa' : 'bước'}: ${text.slice(0, 180)}`); }
      items.push({ id, kind, text, group, chain, privacy: privacy.get(node.closest(privateSelector)) || '' });
      return id;
    };
    const texts = walkTexts(root);
    for (const text of texts) {
      const source = text.nodeValue, fragment = document.createDocumentFragment(); let end = 0;
      const appendText = value => { if (!value) return; const span = document.createElement('span'); span.textContent = value; fragment.append(span); add(span, 'text', value); };
      for (const match of mathEnabled ? source.matchAll(quizMathParts) : []) {
        appendText(source.slice(end, match.index));
        const steps = splitLessonMathSteps(match[0]), group = `math-${groups.length}`, wrapper = document.createElement('span');
        const chain=text.parentElement.closest('[data-lesson-step-chain]')?.dataset.lessonStepChain || (steps.length>1?`chain-${windowObject.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`:'');
        const punctuation=steps.length>1?(/^[.;,](?=\s|$)/.exec(source.slice(match.index+match[0].length))?.[0]||''):'';
        if(punctuation)steps[steps.length-1]+=punctuation;
        wrapper.dataset.laiGroup = group;
        if(chain)wrapper.dataset.lessonStepChain=chain;
        const ids = steps.map(step => { const span = document.createElement('span'); span.textContent = step; span.className = steps.length > 1 ? 'lesson-math-step' : 'lesson-math-inline'; wrapper.append(span); return add(span, 'math', step, group,chain); });
        if (steps.length > 1) wrapper.className = 'lesson-math-steps';
        groups.push({ id: group, ids, original: match[0]+punctuation,chain }); fragment.append(wrapper); end = match.index + match[0].length+punctuation.length;
      }
      appendText(source.slice(end));
      // Privacy is inherited from the original text parent, before annotation is attached.
      const privacyId = privacy.get(text.parentElement.closest(privateSelector)) || '';
      for (const node of fragment.querySelectorAll(unitSelector)) items.find(item => item.id === node.dataset.laiUnit).privacy = privacyId;
      text.replaceWith(fragment);
    }
    for (const figure of root.querySelectorAll('figure')) add(figure, 'figure', figure.querySelector('figcaption')?.textContent || figure.querySelector('img')?.alt || 'Hình minh họa');
    const order = [...root.querySelectorAll(unitSelector)].map(node => node.dataset.laiUnit);
    items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return { originalHtml: html, annotatedHtml: root.innerHTML, items, groups };
  };
  const whole = (plan, id) => {
    const item = plan.items.find(item => item.id === id);
    return item ? { startId: id, start: 0, endId: id, end: item.text.length } : null;
  };
  const selectedItems = (plan, selection) => {
    if (!selection) return [];
    const start = plan.items.findIndex(item => item.id === selection.startId), end = plan.items.findIndex(item => item.id === selection.endId);
    return start < 0 || end < start ? [] : plan.items.slice(start, end + 1);
  };
  const expand = (plan, selection, next) => {
    if (!selection) return next;
    const index = id => plan.items.findIndex(item => item.id === id);
    const start = index(selection.startId) < index(next.startId) ? selection : next;
    const end = index(selection.endId) > index(next.endId) ? selection : next;
    return { startId: start.startId, start: start.start, endId: end.endId, end: end.end };
  };
  const wholeGroup = (plan, selection) => {
    const item = plan.items.find(item => item.id === selection?.startId), group = plan.groups.find(group => group.id === item?.group);
    if(item?.chain) {
      const chain=plan.items.filter(candidate=>candidate.chain===item.chain);
      return {...whole(plan,chain[0].id),endId:chain.at(-1).id,end:chain.at(-1).text.length};
    }
    return group ? { ...whole(plan, group.ids[0]), endId: group.ids.at(-1), end: plan.items.find(item => item.id === group.ids.at(-1)).text.length } : selection;
  };
  const rangeFor = (root, plan, selection) => {
    const items = selectedItems(plan, selection);
    if (!items.length || new Set(items.map(item => item.privacy)).size > 1) throw new Error('Chọn nội dung trong cùng một phần bài học hoặc cùng phần đáp án.');
    const first = root.querySelector(`[data-lai-unit="${selection.startId}"]`), last = root.querySelector(`[data-lai-unit="${selection.endId}"]`);
    if (!first || !last) throw new Error('Đoạn đã chọn đã thay đổi. Thầy cô chọn lại đoạn cần bổ sung.');
    const a = first.closest('td,th,li'), b = last.closest('td,th,li');
    if ((a || b) && a !== b) throw new Error('Thầy cô chọn trong một ô bảng hoặc một mục danh sách mỗi lần.');
    const range = document.createRange();
    const endpoint = (node, item, offset, start) => {
      if (item.kind === 'figure' || offset === 0 || offset === item.text.length) {
        const after = offset !== 0;
        if (start) after ? range.setStartAfter(node) : range.setStartBefore(node);
        else after ? range.setEndAfter(node) : range.setEndBefore(node);
      } else {
        const text = node.firstChild;
        if (!text || text.nodeType !== 3 || offset < 0 || offset > text.nodeValue.length) throw new Error('Vùng chọn không còn khớp. Thầy cô chọn lại.');
        if (start) range.setStart(text, offset); else range.setEnd(text, offset);
      }
    };
    endpoint(first, items[0], selection.start, true); endpoint(last, items.at(-1), selection.end, false);
    return range;
  };
  const details = (plan, selection) => {
    const root = rootFor(plan.annotatedHtml), range = rangeFor(root, plan, selection), content = document.createElement('div'); content.append(range.cloneContents());
    const items = selectedItems(plan, selection), start = plan.items.indexOf(items[0]), end = plan.items.indexOf(items.at(-1));
    const text = content.textContent.trim() || (items.length===1&&items[0].kind==='figure'?items[0].text:'');
    if (!text && !content.querySelector('figure')) throw new Error('Thầy cô chọn đoạn chữ hoặc công thức trước.');
    if (text.length > 14000) throw new Error('Đoạn chọn quá dài. Thầy cô chọn ít bước hơn để AI giải thích rõ.');
    return { text, private: !!items[0].privacy, before: plan.items.slice(Math.max(0, start - 12), start).map(item => item.text).join('\n').slice(-7000),
      after: plan.items.slice(end + 1, end + 9).map(item => item.text).join('\n').slice(0, 4000), headings: [...root.querySelectorAll('h1,h2,h3,h4')].map(node => node.textContent).join('\n').slice(0, 2000) };
  };
  const capture = (root, plan, nativeSelection) => {
    if (!nativeSelection?.rangeCount || nativeSelection.isCollapsed) return null;
    const range = nativeSelection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const hits = [...root.querySelectorAll(unitSelector)].filter(node => { try { return range.intersectsNode(node); } catch { return false; } });
    if (!hits.length) return null;
    const offset = (unit, container, position, isEnd) => {
      const item = plan.items.find(item => item.id === unit.dataset.laiUnit);
      if (item.kind !== 'text') return isEnd ? item.text.length : 0;
      if (!unit.contains(container)) return isEnd ? item.text.length : 0;
      const part = document.createRange(); part.selectNodeContents(unit); part.setEnd(container, position);
      return part.toString().length;
    };
    const selection = { startId: hits[0].dataset.laiUnit, start: offset(hits[0], range.startContainer, range.startOffset, false), endId: hits.at(-1).dataset.laiUnit, end: offset(hits.at(-1), range.endContainer, range.endOffset, true) };
    // Boundary-only intersections do not count as a selected next unit.
    if (hits.length > 1 && selection.end === 0) { selection.endId = hits.at(-2).dataset.laiUnit; selection.end = plan.items.find(item => item.id === selection.endId).text.length; }
    return selection;
  };
  const clean = (root, plan) => {
    for (const node of [...root.querySelectorAll('[data-lai-group]')].reverse()) {
      const group = plan.groups.find(group => group.id === node.dataset.laiGroup), units = [...node.querySelectorAll(unitSelector)];
      const untouched = group && units.length === group.ids.length && units.every((unit, i) => unit.dataset.laiUnit === group.ids[i] && unit.textContent === plan.items.find(item => item.id === group.ids[i])?.text);
      if (untouched) node.replaceWith(document.createTextNode(group.original));
      else { node.className = 'lesson-math-steps'; if(group?.chain)node.dataset.lessonStepChain=group.chain; node.removeAttribute('data-lai-group'); }
    }
    for (const node of [...root.querySelectorAll(unitSelector)]) {
      if (node.dataset.laiKind === 'text' || node.classList.contains('lesson-math-inline')) node.replaceWith(...node.childNodes);
      else { for (const attribute of [...node.attributes]) if (attribute.name.startsWith('data-lai-') || ['role','tabindex','aria-label','aria-pressed'].includes(attribute.name)) node.removeAttribute(attribute.name); node.classList.remove('is-ai-selected'); }
    }
    for (const node of root.querySelectorAll('[data-lai-group]')) node.removeAttribute('data-lai-group');
    return sanitize(root.innerHTML);
  };
  const insert = (plan, selection, html, position = 'before') => {
    if (!['before','after','replace'].includes(position)) throw new Error('Vị trí chèn không hợp lệ.');
    const root = rootFor(plan.annotatedHtml), range = rangeFor(root, plan, selection), generated = rootFor(html);
    if (!generated.textContent.trim() && !generated.querySelector('img')) throw new Error('Chưa có nội dung để chèn.');
    if (position === 'replace') range.deleteContents();
    range.collapse(position !== 'after');
    const parent = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const block = parent.closest(paragraphSelector);
    if (block && root.contains(block)) {
      const beforeRange = document.createRange(), afterRange = document.createRange();
      beforeRange.selectNodeContents(block); beforeRange.setEnd(range.startContainer, range.startOffset);
      afterRange.selectNodeContents(block); afterRange.setStart(range.startContainer, range.startOffset);
      const before = block.cloneNode(false), after = block.cloneNode(false);
      before.append(beforeRange.cloneContents()); after.append(afterRange.cloneContents());
      const parts = [];
      if (before.textContent.trim() || before.querySelector('img')) parts.push(before);
      parts.push(...generated.childNodes);
      if (after.textContent.trim() || after.querySelector('img')) parts.push(after);
      block.replaceWith(...parts);
    } else range.insertNode(generatedToFragment(generated));
    return clean(root, plan);
  };
  const generatedToFragment = root => { const fragment = document.createDocumentFragment(); fragment.append(...root.childNodes); return fragment; };
  const changeFigure = (plan, selection, { width, caption, remove = false }) => {
    const root = rootFor(plan.annotatedHtml), unit = root.querySelector(`[data-lai-unit="${selection?.startId}"]`);
    if (!unit?.matches('figure')) throw new Error('Thầy cô chọn hình cần chỉnh.');
    if (remove) unit.remove();
    else {
      const image = unit.querySelector('img');
      if (image) { image.style.width = `${Math.min(100, Math.max(25, Number(width) || 100))}%`; image.style.maxWidth = '100%'; image.alt=String(caption||'Hình minh họa').slice(0,500); }
      let label = unit.querySelector('figcaption');
      if (!label) { label = document.createElement('figcaption'); unit.append(label); }
      label.textContent = String(caption || '').slice(0, 500);
    }
    return clean(root, plan);
  };
  return { plan, whole, wholeGroup, expand, capture, details, selectedItems, insert, changeFigure };
}
