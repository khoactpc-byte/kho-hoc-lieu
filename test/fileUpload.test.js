import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileBase64, studentUploadMime, STUDENT_UPLOAD_MAX_BYTES } from '../src/utils/fileUpload.js';

test('student file validation matches the server and infers MIME only when the browser omitted it', () => {
  assert.equal(studentUploadMime({ name: 'scan.PDF', type: '', size: 30 }), 'application/pdf');
  assert.equal(studentUploadMime({ name: 'image.png', type: 'image/png', size: STUDENT_UPLOAD_MAX_BYTES }), 'image/png');
  assert.throws(() => studentUploadMime({ name: 'document.docx', size: 30 }), /chỉ nhận/);
  assert.throws(() => studentUploadMime({ name: 'fake.pdf', type: 'text/html', size: 30 }), /chỉ nhận/);
  assert.throws(() => studentUploadMime({ name: 'scan.pdf', size: 0 }), /nội dung/);
  assert.throws(() => studentUploadMime({ name: 'scan.pdf', size: STUDENT_UPLOAD_MAX_BYTES + 1 }), /20 MB/);
});

test('file read errors and cancellation settle the promise and release the event handlers', async () => {
  const original = globalThis.FileReader;
  const readers = [];
  globalThis.FileReader = class {
    constructor() { readers.push(this); }
    readAsDataURL(file) {
      if (file.event === 'throw') throw new Error('Cannot open file');
      this.result = file.result;
      this.error = new Error('Read failed');
      queueMicrotask(() => this[file.event]());
    }
  };
  try {
    assert.equal(await readFileBase64({ event: 'onload', result: 'data:application/pdf;base64,YWJj' }), 'YWJj');
    await assert.rejects(readFileBase64({ event: 'onerror' }), /Read failed/);
    await assert.rejects(readFileBase64({ event: 'onabort' }), { name: 'AbortError' });
    await assert.rejects(readFileBase64({ event: 'onload', result: 'data:text/plain,invalid' }), /nội dung/);
    await assert.rejects(readFileBase64({ event: 'throw' }), /Cannot open/);
    readers.forEach(reader => assert.equal(reader.onload || reader.onerror || reader.onabort, null));
  } finally {
    if (original === undefined) delete globalThis.FileReader; else globalThis.FileReader = original;
  }
});
