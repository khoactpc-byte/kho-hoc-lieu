import { createHtmlSanitizer } from './safeHtml.js';
const sanitizers = new WeakMap();

export function createNewsPreview(windowObject, html = '') {
  const root = windowObject.document.createElement('div');
  if (!sanitizers.has(windowObject)) sanitizers.set(windowObject, createHtmlSanitizer(windowObject));
  root.innerHTML = sanitizers.get(windowObject)(html);
  root.querySelectorAll('script, style, img, iframe, video, audio').forEach(node => node.remove());
  const firstTable = root.querySelector('table');
  let tableHtml = '';
  if (firstTable) {
    const table = firstTable.cloneNode(true);
    const rows = [...table.querySelectorAll('tr')];
    rows.slice(5).forEach(row => row.remove());
    table.querySelectorAll('a').forEach(link => link.replaceWith(...link.childNodes));
    [table, ...table.querySelectorAll('*')].forEach(node => {
      [...node.attributes].forEach(attribute => { if (!['rowspan', 'colspan'].includes(attribute.name)) node.removeAttribute(attribute.name); });
      if (node.hasAttribute('rowspan')) node.setAttribute('rowspan', String(Math.min(4, Number(node.getAttribute('rowspan')) || 1)));
    });
    tableHtml = table.outerHTML;
  }
  root.querySelectorAll('table, h1, h2, h3, h4, h5, h6').forEach(node => node.remove());
  root.querySelectorAll('br').forEach(node => node.replaceWith(windowObject.document.createTextNode(' ')));
  root.querySelectorAll('p, div, li').forEach(node => node.append(windowObject.document.createTextNode(' ')));
  return { summary: (root.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 800), tableHtml };
}
