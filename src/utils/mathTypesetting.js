export function createMathTypesetter(getWindow = () => window, timeoutMs = 15000) {
  const pending = new Set();
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
        pending.clear();
        if (!roots.length) continue;
        math.typesetClear?.(roots);
        await math.typesetPromise(roots);
      }
      warned = false;
    } catch { report(); }
    finally { running = false; }
  };
  return root => {
    if (!root || !root.isConnected) return;
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
