import { useLayoutEffect, useRef } from 'react';

// Measure the available toolbar space, including embedded panes and browser zoom.
// Keep a readable lower bound; very narrow screens can scroll the single row.
export default function useSingleRowToolbar() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const view = root.ownerDocument.defaultView;
    let disposed = false, queued;
    const fit = () => {
      queued = undefined;
      if (disposed || !root.clientWidth) return;
      let scale = 1;
      root.style.setProperty('--student-toolbar-scale', '1');
      for (let pass = 0; pass < 4; pass++) {
        if (root.scrollWidth <= root.clientWidth) break;
        const next = Math.max(0.75, scale * root.clientWidth / (root.scrollWidth + 2));
        if (next === scale) break;
        scale = next;
        root.style.setProperty('--student-toolbar-scale', String(scale));
      }
    };
    const schedule = () => {
      if (disposed || queued !== undefined) return;
      queued = view.setTimeout(fit, 0);
    };
    fit();
    const resize = view.ResizeObserver ? new view.ResizeObserver(schedule) : null;
    const changes = new view.MutationObserver(schedule);
    resize?.observe(root);
    // Counts and available actions can change without resizing the surrounding pane.
    changes.observe(root, { childList: true, characterData: true, subtree: true });
    view.addEventListener('resize', schedule);
    root.ownerDocument.fonts?.ready.then(schedule);
    return () => {
      disposed = true;
      if (queued !== undefined) view.clearTimeout(queued);
      resize?.disconnect();
      changes.disconnect();
      view.removeEventListener('resize', schedule);
    };
  }, []);
  return ref;
}
