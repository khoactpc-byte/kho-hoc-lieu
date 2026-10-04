// Only fill APIs used by this project. Secure identifiers always use browser entropy.
export function installBrowserCompatibility(target = globalThis) {
  const define = (object, key, value) => { if (typeof object?.[key] !== 'function') Object.defineProperty(object, key, { value, configurable: true, writable: true }); };
  define(target.Object, 'hasOwn', (object, key) => Object.prototype.hasOwnProperty.call(object, key));
  define(target.Array.prototype, 'at', function (index) {
    const number = Number(index) || 0, integer = Math.trunc(number), length = this.length;
    const position = integer < 0 ? length + integer : integer;
    return position < 0 || position >= length ? undefined : this[position];
  });
  define(target.String.prototype, 'replaceAll', function (search, replacement) {
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll requires a global RegExp');
      return String(this).replace(search, replacement);
    }
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(this).replace(new RegExp(escaped, 'g'), replacement);
  });
  if (target.crypto?.getRandomValues) define(target.crypto, 'randomUUID', () => {
    const bytes = new Uint8Array(16); target.crypto.getRandomValues(bytes);
    bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  });
  if (target.AbortSignal && target.AbortController) define(target.AbortSignal, 'timeout', milliseconds => {
    const controller = new target.AbortController();
    target.setTimeout(() => controller.abort(), milliseconds); return controller.signal;
  });
}
installBrowserCompatibility();
