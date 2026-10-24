import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { MAX_LESSON_PDF_BYTES } from '../utils/lessonPdfImport.js';
import { escapeHtmlText } from '../utils/safeHtml.js';
import { createHtmlSanitizer } from '../utils/safeHtml.js';
import { replaceWordMath } from '../utils/wordMath.js';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MARKER = 'KHL_DOCUMENT_PART_BREAK_7BD0';

export async function openLessonWord(file, windowObject = window) {
  if (!file || !file.size || file.size > MAX_LESSON_PDF_BYTES) throw new Error('Chọn Word .docx có dung lượng tối đa 12 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Tệp Word cũ .doc hoặc tệp không hợp lệ. Mở trong Word, chọn Lưu thành .docx rồi nhập lại.');
  let files, total = 0, entries = 0;
  try {
    files = unzipSync(bytes, { filter: entry => {
      total += entry.originalSize; entries++;
      if (entry.originalSize > 20 * 1024 * 1024 || total > 48 * 1024 * 1024 || entries > 1500) throw new Error('Tài liệu Word có nội dung giải nén quá lớn. Chia thành các tệp nhỏ hơn.');
      return true;
    } });
  } catch (failure) { throw new Error(failure.message.includes('quá lớn') ? failure.message : 'Không mở được Word. Tệp có thể bị hỏng hoặc được đặt mật khẩu.', { cause: failure }); }
  if (!files['word/document.xml'] || !files['[Content_Types].xml']) throw new Error('Tệp này không phải tài liệu Word .docx hợp lệ.');
  if (Object.keys(files).some(name => /vbaProject\.bin$/i.test(name))) throw new Error('Tệp chứa macro. Lưu bản Word .docx thông thường rồi nhập lại.');
  const parse = xml => {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Cấu trúc XML của Word không được hỗ trợ.');
    const result = new windowObject.DOMParser().parseFromString(xml, 'application/xml');
    if (result.querySelector('parsererror')) throw new Error('Cấu trúc Word bị lỗi. Mở và lưu lại .docx trước khi nhập.');
    return result;
  };
  for (const name of Object.keys(files).filter(name => /^word\/(?:document|footnotes|endnotes)\.xml$/.test(name))) {
    const xml = parse(strFromU8(files[name]));
    if (xml.getElementsByTagNameNS(WORD_NS, 'object').length || xml.getElementsByTagNameNS(WORD_NS, 'altChunk').length) throw new Error('Word có công thức/đối tượng nhúng kiểu cũ chưa đọc được. Chuyển đối tượng sang ảnh hoặc xuất PDF để giữ đủ nội dung.');
    for (const drawing of xml.getElementsByTagNameNS(WORD_NS, 'drawing')) {
      if (!drawing.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip').length) throw new Error('Word có biểu đồ hoặc hình vẽ chưa chuyển thành ảnh. Xuất PDF để giữ đủ hình trước khi nhập.');
    }
    replaceWordMath(xml);
    for (const node of [...xml.getElementsByTagNameNS(WORD_NS, 'lastRenderedPageBreak'), ...xml.getElementsByTagNameNS(WORD_NS, 'br')]) {
      if (node.localName === 'br' && node.getAttributeNS(WORD_NS, 'type') !== 'page') continue;
      const text = xml.createElementNS(WORD_NS, 'w:t'); text.textContent = MARKER; node.replaceWith(text);
    }
    files[name] = strToU8(new windowObject.XMLSerializer().serializeToString(xml));
  }
  const packageBytes = zipSync(files);
  const mammothModule = await import('mammoth/mammoth.browser.js');
  const mammoth = mammothModule.default || mammothModule;
  const converted = await mammoth.convertToHtml({ arrayBuffer: packageBytes.buffer.slice(packageBytes.byteOffset, packageBytes.byteOffset + packageBytes.byteLength) },
    { externalFileAccess: false, includeEmbeddedStyleMap: false, convertImage: mammoth.images.imgElement(async image => {
      if (!/^image\/(png|jpeg|webp)$/.test(image.contentType)) throw new Error('Word có ảnh định dạng chưa đọc được. Đổi ảnh sang PNG/JPG hoặc xuất PDF để giữ đủ hình.');
      return { src: `data:${image.contentType};base64,${await image.readAsBase64String()}` };
    }) });
  const root = windowObject.document.createElement('div'); root.innerHTML = createHtmlSanitizer(windowObject)(converted.value);
  root.querySelectorAll('a').forEach(link => link.replaceWith(...link.childNodes));
  const sections = [], images = {};
  let buffer = '', length = 0, imageCount = 0;
  const flush = () => { if (buffer.trim()) { sections.push({ html: buffer }); buffer = ''; length = 0; } };
  for (const node of [...root.childNodes]) {
    const text = node.textContent || '';
    if (buffer && (/^\s*TUẦN\s*\d+\b/i.test(text) || length > 10000 || text.includes(MARKER))) flush();
    let html = node.nodeType === 1 ? node.outerHTML : `<p>${escapeHtmlText(node.textContent)}</p>`;
    html = html.replaceAll(MARKER, '');
    if (!html.replace(/<[^>]+>/g, '').trim() && !/<img\b/.test(html)) continue;
    const block = windowObject.document.createElement('div'); block.innerHTML = html;
    for (const image of block.querySelectorAll('img')) {
      const src = image.getAttribute('src') || '';
      if (!/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(src)) throw new Error('Có ảnh liên kết ngoài hoặc ảnh Word không đọc được. Nhúng ảnh vào tài liệu rồi nhập lại.');
      const id = `word-image-${++imageCount}`; images[id] = src; image.setAttribute('data-word-image', id);
    }
    buffer += block.innerHTML; length += text.length;
  }
  flush();
  if (!sections.length || sections.length > 100 || root.textContent.length > 350000 || imageCount > 100) throw new Error('Word rỗng hoặc quá dài. Mỗi lần nhập tối đa 100 phần; chia tài liệu lớn thành các học kỳ.');
  const warnings = (converted.messages || []).filter(item => item.type === 'warning').map(item => item.message).slice(0, 15);
  if (warnings.some(message => /image|unrecognised element: (?:w:drawing|w:pict|m:|v:)/i.test(message))) throw new Error('Có hình hoặc công thức trong Word chưa đọc đủ. Xuất PDF để giữ nguyên nội dung trước khi nhập.');
  return { kind: 'docx', name: file.name, pageCount: sections.length, sections, images, warnings };
}

export function sliceLessonWord(source, startPage = 1, endPage = source.pageCount) {
  if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage < 1 || endPage > source.pageCount || startPage > endPage) throw new Error('Khoảng phần nội dung Word không hợp lệ.');
  return { sections: source.sections.slice(startPage - 1, endPage), images: source.images, startPage };
}
