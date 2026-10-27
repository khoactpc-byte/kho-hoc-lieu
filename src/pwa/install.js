// Capture the browser event before the lazy application has finished loading.
let snapshot = { prompt: null, installed: false, waiting: null, error: '' };
const listeners = new Set();
const publish = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
let initialized = false;
export const subscribeInstall = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const getInstallSnapshot = () => snapshot;
export const openInstallHelp = () => window.dispatchEvent(new window.Event('tmt-open-install'));
export const installLink = () => `${window.location.origin}/?install=1`;
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
export function initializeInstall({ registerWorker = false } = {}) {
  if (initialized) return;
  initialized = true;
  publish({ installed: isStandalone() });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    publish({ prompt: event, error: '' });
  });
  window.addEventListener('appinstalled', () => publish({ installed: true, prompt: null }));
  const display = window.matchMedia?.('(display-mode: standalone)');
  display?.addEventListener?.('change', () => publish({ installed: isStandalone() }));
  if (registerWorker && window.isSecureContext && 'serviceWorker' in navigator) {
    // No auto-reload: a new worker waits until the user explicitly accepts it.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(registration => {
      const ready = () => { if (registration.waiting && navigator.serviceWorker.controller) publish({ waiting: registration.waiting }); };
      ready();
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', ready);
      });
      window.addEventListener('online', () => registration.update().catch(() => {}));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    }).catch(() => publish({ error: 'Chưa chuẩn bị được ứng dụng. Thầy cô và các em vẫn có thể dùng web, rồi thử cài lại sau.' }));
  }
}
export async function requestInstall() {
  const event = snapshot.prompt;
  if (!event) return 'unavailable';
  publish({ prompt: null, error: '' });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    publish({ error: 'Chưa mở được hộp cài. Hãy dùng menu của trình duyệt theo hướng dẫn bên dưới.' });
    return 'unavailable';
  }
}
export function applyUpdate() {
  if (!snapshot.waiting || !navigator.serviceWorker) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  snapshot.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
}
