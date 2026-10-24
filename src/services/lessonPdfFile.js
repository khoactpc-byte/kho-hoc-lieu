import { PDFDocument } from 'pdf-lib';
import { MAX_LESSON_PDF_BYTES } from '../utils/lessonPdfImport.js';

export async function openLessonPdf(file) {
  if (!file || file.size === 0 || file.size > MAX_LESSON_PDF_BYTES) throw new Error('Chọn PDF có dung lượng tối đa 12 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-')) throw new Error('Tệp này không phải PDF hợp lệ.');
  let document;
  try { document = await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch { throw new Error('Không mở được PDF. Tệp có thể bị hỏng hoặc được đặt mật khẩu.'); }
  const pageCount = document.getPageCount();
  if (!pageCount || pageCount > 100) throw new Error('Mỗi lần nhập tối đa 100 trang. Hãy chia PDF lớn thành các học kỳ.');
  return { bytes, document, pageCount, name: file.name };
}

export async function sliceLessonPdf(pdf, startPage = 1, endPage = pdf.pageCount) {
  if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage < 1 || endPage > pdf.pageCount || startPage > endPage) throw new Error('Khoảng trang PDF không hợp lệ.');
  const slice = await PDFDocument.create();
  const pages = await slice.copyPages(pdf.document, Array.from({ length: endPage - startPage + 1 }, (_, i) => i + startPage - 1));
  for (const page of pages) slice.addPage(page);
  return { base64: await slice.saveAsBase64({ useObjectStreams: true }), bytes: await slice.save() };
}

export async function loadLessonPdfRenderer(bytes) {
  const [{ getDocument, GlobalWorkerOptions }, { default: workerSrc }] = await Promise.all([
    import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]);
  GlobalWorkerOptions.workerSrc = workerSrc;
  return getDocument({ data: bytes.slice(), isEvalSupported: false });
}

export async function cropLessonPdfFigures(bytes, figures) {
  if (!figures.length) return {};
  const loadingTask = await loadLessonPdfRenderer(bytes);
  const images = {};
  try {
    const pdf = await loadingTask.promise;
    for (const figure of figures) {
      const page = await pdf.getPage(figure.page);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 1700 / natural.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
      const [top, left, bottom, right] = figure.box;
      const x = left / 1000 * canvas.width, y = top / 1000 * canvas.height;
      const width = (right - left) / 1000 * canvas.width, height = (bottom - top) / 1000 * canvas.height;
      const crop = document.createElement('canvas');
      const scale = Math.min(1, 1000 / width);
      crop.width = Math.max(1, Math.round(width * scale)); crop.height = Math.max(1, Math.round(height * scale));
      crop.getContext('2d').drawImage(canvas, x, y, width, height, 0, 0, crop.width, crop.height);
      images[figure.id] = crop.toDataURL('image/jpeg', 0.85);
      canvas.width = 0; canvas.height = 0; crop.width = 0; crop.height = 0;
      page.cleanup();
    }
    return images;
  } finally { await loadingTask.destroy(); }
}
