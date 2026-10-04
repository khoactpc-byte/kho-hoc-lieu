// Only use JSONP for public address data. Private records go through authenticated POST.
export function requestJsonp(url, params = {}, { timeoutMs = 10000, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('Dữ liệu này cần được tải trong trình duyệt.')); return; }
    if (signal?.aborted) { reject(new DOMException('Yêu cầu đã hủy.', 'AbortError')); return; }
    const callbackName = `__khlJsonp_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
    const script = document.createElement('script');
    const requestUrl = new URL(url);
    Object.entries(params).forEach(([key, value]) => { if (value != null) requestUrl.searchParams.set(key, String(value)); });
    requestUrl.searchParams.set('callback', callbackName);
    requestUrl.searchParams.set('t', String(Date.now()));
    script.referrerPolicy = 'no-referrer';
    let finished = false;
    let timer;
    const complete = (error, value) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      delete window[callbackName];
      script.remove();
      if (error) reject(error); else resolve(value || {});
    };
    const onAbort = () => complete(new DOMException('Yêu cầu đã hủy.', 'AbortError'));
    window[callbackName] = value => complete(null, value);
    script.onerror = () => complete(new Error('Chưa kết nối được máy chủ dữ liệu.'));
    timer = window.setTimeout(() => complete(new Error('Máy chủ chưa phản hồi. Hãy thử tải lại.')), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      script.src = requestUrl.toString();
      document.body.appendChild(script);
    } catch (error) { complete(error); }
  });
}
