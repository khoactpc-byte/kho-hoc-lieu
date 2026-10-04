export function splitUtf8Chunks(text, maxBytes = 250000) {
  if (!Number.isInteger(maxBytes) || maxBytes < 4) throw new Error('Kích thước mảnh không hợp lệ.');
  const encoder = new TextEncoder();
  const chunks = [];
  let part = ''; let size = 0;
  for (const char of String(text)) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > maxBytes) { chunks.push(part); part = ''; size = 0; }
    part += char; size += bytes;
  }
  chunks.push(part);
  return chunks;
}

export async function contentDigest(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function assembleGeneration(metadata, pieces) {
  if (!Number.isInteger(metadata.chunkCount) || metadata.chunkCount < 1 || pieces.length !== metadata.chunkCount) {
    throw new Error('Phân công chưa đủ mảnh; giữ nguyên bản đang xem.');
  }
  const ordered = [...pieces].sort((a, b) => a.index - b.index);
  if (ordered.some((piece, index) => piece.index !== index || typeof piece.text !== 'string'
    || (metadata.generation && piece.generation !== metadata.generation))) {
    throw new Error('Mảnh phân công khác phiên bản hoặc bị lặp.');
  }
  const text = ordered.map(piece => piece.text).join('');
  if (metadata.digest && await contentDigest(text) !== metadata.digest) throw new Error('Phân công không khớp nội dung đã lưu.');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dữ liệu phân công không hợp lệ.');
  return value;
}
