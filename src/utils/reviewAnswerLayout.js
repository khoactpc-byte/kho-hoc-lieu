// Measure the rendered answer, including radio, letter, MathJax and correction
// label. A TeX source string's length does not describe its displayed width.
export function observeReviewAnswerLayout(root) {
  if (!root) return () => {};
  const target = root.ownerDocument.defaultView;
  const requestFrame = target.requestAnimationFrame?.bind(target) || (callback => target.setTimeout(callback, 0));
  const cancelFrame = target.cancelAnimationFrame?.bind(target) || target.clearTimeout.bind(target);
  let frame = null, stopped = false;
  const measure = () => {
    for (const grid of root.querySelectorAll('.lesson-review-answers')) {
      const width = grid.getBoundingClientRect().width;
      if (!width) continue;
      const options = [...grid.querySelectorAll('.lesson-review-option')];
      const gap = parseFloat(target.getComputedStyle(grid).columnGap) || 0;
      let requiredWidth;
      grid.classList.add('is-measuring');
      try { requiredWidth = Math.max(...options.map(option => option.getBoundingClientRect().width)) + 8; }
      finally { grid.classList.remove('is-measuring'); }
      const fits = columns => requiredWidth * columns + gap * (columns - 1) <= width;
      const columns = options.length === 4 && width >= 640 && fits(4) ? 4 : options.length >= 2 && width >= 300 && fits(2) ? 2 : 1;
      if (grid.dataset.columns !== String(columns)) grid.dataset.columns = String(columns);
    }
  };
  const schedule = () => {
    if (stopped || frame !== null) return;
    frame = requestFrame(() => { frame = null; if (!stopped) measure(); });
  };
  measure();
  const resize = target.ResizeObserver ? new target.ResizeObserver(schedule) : null;
  resize?.observe(root);
  const mutation = new target.MutationObserver(schedule);
  mutation.observe(root, { childList: true, subtree: true, characterData: true });
  target.addEventListener('resize', schedule);
  root.ownerDocument.fonts?.addEventListener('loadingdone', schedule);
  root.ownerDocument.fonts?.ready.then(schedule);
  return () => {
    stopped = true;
    if (frame !== null) cancelFrame(frame);
    resize?.disconnect(); mutation.disconnect();
    target.removeEventListener('resize', schedule);
    root.ownerDocument.fonts?.removeEventListener('loadingdone', schedule);
  };
}
