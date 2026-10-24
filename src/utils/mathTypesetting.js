import { prepareLessonMathAlignment, alignRenderedLessonSteps } from './lessonMathAlignment.js';

export function createMathTypesetter(getWindow = () => window, timeoutMs = 15000) {
  const pending = new Set();
  const completions = new Map();
  const complete = (root, success) => {
    const callbacks = completions.get(root) || [];
    completions.delete(root);
    callbacks.forEach(callback => callback(success));
  };
  let running = false, boundScript, warned = false;
  const report = () => {
    if (warned) return;
    warned = true;
    const target = getWindow();
    target.dispatchEvent(new target.CustomEvent('khl-math-error', { detail: 'Chưa tải được phần hiển thị công thức toán. Kiểm tra mạng rồi tải lại trang.' }));
  };
  const ready = target => {
    if (target.MathJax?.typesetPromise) return Promise.resolve(target.MathJax);
    const script = target.document.getElementById('MathJax-script');
    if (!script) return Promise.reject(new Error('Missing math script'));
    return new Promise((resolve, reject) => {
      const cleanup = () => { target.clearTimeout(timer); script.removeEventListener('load', loaded); script.removeEventListener('error', failed); };
      const loaded = () => { cleanup(); target.MathJax?.typesetPromise ? resolve(target.MathJax) : reject(new Error('Math startup failed')); };
      const failed = () => { cleanup(); reject(new Error('Math loading failed')); };
      const timer = target.setTimeout(failed, timeoutMs);
      script.addEventListener('load', loaded);
      script.addEventListener('error', failed);
    });
  };
  const drain = async () => {
    if (running || !pending.size) return;
    running = true;
    try {
      const math = await ready(getWindow());
      await math.startup?.promise;
      while (pending.size) {
        const roots = [...pending].filter(root => root.isConnected);
        for (const root of pending) if (!root.isConnected) complete(root, false);
        pending.clear();
        if (!roots.length) continue;
        const callbacks = roots.map(root => { const list = completions.get(root) || []; completions.delete(root); return list; });
        const sourceRoots = roots.filter(root => {
          if (!root.querySelector('mjx-container')) return true;
          const source = root.cloneNode(true);
          source.querySelectorAll('mjx-container').forEach(node => node.remove());
          return /\\[([]/.test(source.textContent) || !!source.querySelector('math');
        });
        // Clearing live rendered formulas forgets their MathItems while leaving
        // assistive MathML in the DOM; the next pass can render that MathML again.
        // Only reset roots whose source HTML has actually been replaced.
        const freshRoots = sourceRoots.filter(root => !root.querySelector('mjx-container'));
        sourceRoots.forEach(prepareLessonMathAlignment);
        if (freshRoots.length) math.typesetClear?.(freshRoots);
        try {
          if (sourceRoots.length) await math.typesetPromise(sourceRoots);
          roots.forEach(alignRenderedLessonSteps);
          callbacks.forEach(list => list.forEach(callback => callback(true)));
        } catch (error) {
          callbacks.forEach(list => list.forEach(callback => callback(false)));
          throw error;
        }
      }
      warned = false;
    } catch { for (const root of completions.keys()) complete(root, false); report(); }
    finally { running = false; }
  };
  return (root, onComplete) => {
    if (!root || !root.isConnected) { onComplete?.(false); return; }
    if (onComplete) completions.set(root, [...(completions.get(root) || []), onComplete]);
    const target = getWindow(), script = target.document.getElementById('MathJax-script');
    if (script && boundScript !== script) {
      boundScript = script;
      // Replay queued roots even if the CDN finished after the timeout warning.
      script.addEventListener('load', () => { target.setTimeout(() => { void drain(); }, 0); });
      script.addEventListener('error', () => { pending.clear(); report(); });
    }
    for (const item of pending) if (!item.isConnected) pending.delete(item);
    pending.add(root);
    void drain();
  };
}

export const typesetMath = createMathTypesetter();
