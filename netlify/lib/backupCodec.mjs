import { Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';
import { fail } from './dataPolicy.mjs';
const tag = '__khlBackupType';
export function encodeBackupValue(value, depth = 0) {
  fail(depth <= 100, 400, 'Dữ liệu sao lưu lồng quá sâu.');
  if (value instanceof Timestamp) return { [tag]: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof GeoPoint) return { [tag]: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof DocumentReference) return { [tag]: 'reference', path: value.path };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { [tag]: 'bytes', base64: Buffer.from(value).toString('base64') };
  if (value instanceof Date) return { [tag]: 'timestamp', seconds: Math.floor(value.getTime() / 1000), nanoseconds: ((value.getTime() % 1000 + 1000) % 1000) * 1000000 };
  if (typeof value === 'number' && !Number.isFinite(value)) return { [tag]: 'number', value: String(value) };
  if (Array.isArray(value)) return value.map(item => encodeBackupValue(item, depth + 1));
  if (value && typeof value === 'object') {
    fail(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 400, 'Kiểu dữ liệu sao lưu chưa được hỗ trợ.');
    const entries = Object.entries(value).map(([key, item]) => [key, encodeBackupValue(item, depth + 1)]);
    return Object.hasOwn(value, tag) ? { [tag]: 'map', entries } : Object.fromEntries(entries);
  }
  fail(value !== undefined && ['string', 'number', 'boolean'].includes(typeof value) || value === null, 400, 'Giá trị sao lưu không hợp lệ.');
  return value;
}
export function decodeBackupValue(value, store, depth = 0) {
  fail(depth <= 100, 400, 'Dữ liệu phục hồi lồng quá sâu.');
  if (Array.isArray(value)) return value.map(item => decodeBackupValue(item, store, depth + 1));
  if (value && typeof value === 'object') {
    switch (value[tag]) {
      case 'timestamp': return new Timestamp(value.seconds, value.nanoseconds);
      case 'geopoint': return new GeoPoint(value.latitude, value.longitude);
      case 'reference': fail(typeof value.path === 'string' && value.path.split('/').length % 2 === 0 && !value.path.split('/').some(part => !part || ['.', '..'].includes(part)), 400, 'Tham chiếu sao lưu không hợp lệ.'); return store.doc(value.path);
      case 'bytes': fail(typeof value.base64 === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(value.base64), 400, 'Dữ liệu nhị phân không hợp lệ.'); return Buffer.from(value.base64, 'base64');
      case 'number': fail(['NaN', 'Infinity', '-Infinity'].includes(value.value), 400, 'Số sao lưu không hợp lệ.'); return Number(value.value);
      case 'map': fail(Array.isArray(value.entries) && value.entries.every(entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'), 400, 'Map sao lưu không hợp lệ.'); return Object.fromEntries(value.entries.map(([key, item]) => [key, decodeBackupValue(item, store, depth + 1)]));
      case undefined: return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeBackupValue(item, store, depth + 1)]));
      default: fail(false, 400, 'Kiểu sao lưu không hợp lệ.');
    }
  }
  return value;
}
