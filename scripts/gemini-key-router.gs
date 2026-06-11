/*
 * Dan phan nay vao Apps Script chinh, gan voi spreadsheet data dang co sheet "key gemini".
 *
 * Yeu cau sheet "key gemini" co header:
 * Trang thai | Khoi | Mon | Uu tien | Key Gemini | Gioi han/ngay | Da dung hom nay | Loi gan nhat | Ghi chu
 *
 * Ten cot co dau/khong dau deu duoc mien gan nghia nhu tren.
 */

const GEMINI_KEY_SHEET_NAME = 'key gemini';

function normalizeGeminiKeyText_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '');
}

function getGeminiKeyColumnMap_(headers) {
  const aliases = {
    status: ['trangthai', 'status', 'bat/tat'],
    grade: ['khoi', 'grade', 'lop'],
    subject: ['mon', 'subject'],
    priority: ['uutien', 'priority'],
    key: ['keygemini', 'geminikey', 'apikey', 'key'],
    dailyLimit: ['gioihanngay', 'gioihan/ngay', 'limit', 'dailylimit'],
    usedToday: ['dadunghomnay', 'dadung', 'usedtoday'],
    lastError: ['loigannhat', 'lasterror', 'loi'],
    note: ['ghichu', 'note']
  };
  const normalizedHeaders = headers.map(normalizeGeminiKeyText_);
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => {
    const index = normalizedHeaders.findIndex(header => names.includes(header));
    return [field, index];
  }));
}

function getGeminiKeySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GEMINI_KEY_SHEET_NAME);
  if (!sheet) throw new Error('Chua co sheet "' + GEMINI_KEY_SHEET_NAME + '" de doc key Gemini.');
  return sheet;
}

function readGeminiKeyRows_() {
  const sheet = getGeminiKeySheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const col = getGeminiKeyColumnMap_(headers);
  if (col.key < 0) throw new Error('Sheet key gemini thieu cot "Key Gemini".');
  return values.slice(1).map((row, rowIndex) => ({
    sheet,
    rowNumber: rowIndex + 2,
    col,
    status: String(row[col.status] || '').trim(),
    grade: String(row[col.grade] || '').trim(),
    subject: String(row[col.subject] || '').trim(),
    priority: Number(row[col.priority] || 999),
    key: String(row[col.key] || '').trim(),
    dailyLimit: Number(row[col.dailyLimit] || 0),
    usedToday: Number(row[col.usedToday] || 0)
  })).filter(item => item.key);
}

function isGeminiKeyEnabled_(row) {
  const status = normalizeGeminiKeyText_(row.status);
  return !status || ['bat', 'on', 'active', 'enabled', 'dangdung'].includes(status);
}

function subjectMatchesGeminiKey_(rowSubject, requestedSubject) {
  const rowKey = normalizeGeminiSubjectKey_(rowSubject);
  const requestedKey = normalizeGeminiSubjectKey_(requestedSubject);
  if (!rowKey) return false;
  if (rowKey === 'chung' || rowKey === 'tatca') return true;
  return rowKey === requestedKey;
}

function gradeMatchesGeminiKey_(rowGrade, requestedGrade) {
  const rowText = normalizeGeminiKeyText_(rowGrade);
  const requestedText = normalizeGeminiKeyText_(requestedGrade);
  if (!rowText || rowText === 'tatca' || rowText === 'all' || rowText === 'chung') return true;
  return rowText === requestedText;
}

function normalizeGeminiSubjectKey_(subject) {
  const text = normalizeGeminiKeyText_(subject);
  if (!text) return '';
  if (['tatca', 'all', 'chung', 'default'].includes(text)) return 'chung';
  if (text.includes('toan')) return 'toan';
  if (text.includes('nguvan') || text === 'van') return 'van';
  if (text.includes('khtn') || text.includes('khoahoctunhien')) return 'khtn';
  if (text.includes('lsdl') || text.includes('lichsudialy') || text.includes('lichsudia')) return 'lsdl';
  if (text.includes('gdcd') || text.includes('giaoduccongdan')) return 'gdcd';
  if (text.includes('gddp') || text.includes('giaoducdiaphuong')) return 'gddp';
  if (text.includes('congnghe') || text === 'cnghe') return 'congnghe';
  return text;
}

function getGeminiKeyCandidates_(context) {
  const requestedGrade = String(context.grade || '').trim();
  const requestedSubject = String(context.subject || '').trim();
  const rows = readGeminiKeyRows_().filter(isGeminiKeyEnabled_);
  const exact = rows.filter(row => (
    gradeMatchesGeminiKey_(row.grade, requestedGrade) &&
    subjectMatchesGeminiKey_(row.subject, requestedSubject) &&
    normalizeGeminiSubjectKey_(row.subject) !== 'chung'
  ));
  const fallback = rows.filter(row => normalizeGeminiSubjectKey_(row.subject) === 'chung');
  return [...exact, ...fallback]
    .filter(row => !row.dailyLimit || !row.usedToday || row.usedToday < row.dailyLimit)
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
}

function markGeminiKeyUsed_(row) {
  if (!row || row.col.usedToday < 0) return;
  const range = row.sheet.getRange(row.rowNumber, row.col.usedToday + 1);
  const current = Number(range.getValue() || 0);
  range.setValue(current + 1);
  if (row.col.lastError >= 0) row.sheet.getRange(row.rowNumber, row.col.lastError + 1).setValue('');
}

function markGeminiKeyError_(row, error) {
  if (!row || row.col.lastError < 0) return;
  const message = String(error && error.message ? error.message : error || '').slice(0, 400);
  row.sheet.getRange(row.rowNumber, row.col.lastError + 1).setValue(message);
}

function callGeminiWithSheetKeys_(request) {
  const candidates = getGeminiKeyCandidates_(request);
  const errors = [];
  for (var i = 0; i < candidates.length; i++) {
    var row = candidates[i];
    try {
      var result = callGeminiApiWithKey_(row.key, request);
      markGeminiKeyUsed_(row);
      result.keySource = {
        subject: row.subject,
        grade: row.grade,
        priority: row.priority,
        rowNumber: row.rowNumber
      };
      return result;
    } catch (err) {
      markGeminiKeyError_(row, err);
      errors.push('Dong ' + row.rowNumber + ': ' + (err && err.message ? err.message : err));
      if (!shouldTryNextGeminiKey_(err)) throw err;
    }
  }
  throw new Error('Tat ca key Gemini theo mon/khoi deu loi hoac het quota. ' + errors.join(' | '));
}

function shouldTryNextGeminiKey_(error) {
  const message = String(error && error.message ? error.message : error || '');
  return /429|quota|RESOURCE_EXHAUSTED|rate limit|TooManyRequests|exceeded|403|PERMISSION_DENIED|API key|invalid|forbidden/i.test(message);
}

function callGeminiApiWithKey_(apiKey, request) {
  var model = request.modelId || request.model || 'gemini-2.0-flash-lite';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
  var payload = {
    contents: request.contents || [{ parts: [{ text: request.prompt || '' }] }],
    generationConfig: request.generationConfig || { temperature: 0.7, maxOutputTokens: 8192 }
  };
  if (request.systemInstruction) payload.systemInstruction = request.systemInstruction;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  var text = response.getContentText();
  var code = response.getResponseCode();
  var data = text ? JSON.parse(text) : {};
  if (code < 200 || code >= 300) {
    throw new Error((data.error && data.error.message) || text || ('Gemini HTTP ' + code));
  }
  data.model = model;
  return data;
}
