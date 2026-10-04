import createDOMPurify from 'dompurify';

export const escapeHtmlText = (value = '') => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

export function createHtmlSanitizer(windowObject) {
  const purifier = createDOMPurify(windowObject);
  purifier.addHook('uponSanitizeElement', (node) => {
    if (node.nodeName.toLowerCase() !== 'iframe') return;
    try {
      const url = new URL(node.getAttribute('src') || '');
      const trusted = url.protocol === 'https:' && (
        (url.hostname === 'drive.google.com' && /^\/file\/d\/[^/]+\/preview$/.test(url.pathname))
        || (['www.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname) && url.pathname.startsWith('/embed/'))
      );
      if (!trusted) node.remove();
      else {
        node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
        node.setAttribute('referrerpolicy', 'no-referrer');
      }
    } catch { node.remove(); }
  });
  purifier.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName.toLowerCase() === 'a' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
    // Attachment URLs are consumed later by UI code, so validate data-* too.
    for (const attribute of [...(node.attributes || [])]) {
      if (/^data-(?:preview-)?url$/i.test(attribute.name) && !/^https:\/\//i.test(attribute.value.trim())) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  return html => purifier.sanitize(String(html ?? ''), {
    USE_PROFILES: { html: true, mathMl: true },
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['target', 'sandbox', 'referrerpolicy', 'allow', 'allowfullscreen'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'object', 'embed'],
    FORBID_ATTR: ['srcdoc'],
    ALLOW_DATA_ATTR: true
  });
}

let browserSanitizer;
export function sanitizeHtml(html = '') {
  if (typeof window === 'undefined') return escapeHtmlText(html);
  browserSanitizer ||= createHtmlSanitizer(window);
  return browserSanitizer(html);
}

export const formatSafeAiText = (text = '') => sanitizeHtml(escapeHtmlText(text)
  .replace(/\r\n/g, '\n').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>'));
