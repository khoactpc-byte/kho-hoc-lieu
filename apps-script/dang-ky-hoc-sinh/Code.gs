const SPREADSHEET_ID = '1oIGnM9Dw_3bUl8xfTKYE0XKsBvJWHb-J7qvD11fDcMM';
const FOLDER_ID = '1T28uP92Iuzec0QE6Z5ZAwhsY68_oQdEX';

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'listPending') {
    return listPendingRegistrations_(e.parameter.callback);
  }
  if (action === 'provinces') {
    return jsonp_(e.parameter.callback, { items: getProvinces() });
  }
  if (action === 'addressDirectory') {
    return jsonp_(e.parameter.callback, getAddressDirectory());
  }
  if (action === 'communes') {
    return jsonp_(e.parameter.callback, { items: getCommunes(e.parameter.province) });
  }
  if (action === 'markDropout') {
    return markDropoutInSheet_(e.parameter || {});
  }
  if (action === 'syncStudent') {
    return syncStudentToSheet_(e.parameter || {});
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Đăng ký học sinh')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function capQuyenMotLan() {
  SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data').getLastRow();
  DriveApp.getFolderById(FOLDER_ID).getName();
  const doc = DocumentApp.create('Kiem tra quyen tao PDF hoc ba');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return 'Đã cấp đủ quyền: Sheet, Drive, Google Docs.';
}

function getProvinces() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Provinces');
    const values = sheet.getDataRange().getValues().flat().filter(String);
    const hcmIndex = values.indexOf('TP.HCM');
    if (hcmIndex > 0) values.unshift(values.splice(hcmIndex, 1)[0]);
    return values;
  } catch (e) {
    return [];
  }
}

function getCommunes(province) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Communes');
    const rows = sheet.getDataRange().getValues();
    const provinceName = String(province || '').trim();
    const communes = rows
      .map(row => {
        if (row.length >= 2) return { province: String(row[0] || '').trim(), commune: String(row[1] || '').trim() };
        return { province: '', commune: String(row[0] || '').trim() };
      })
      .filter(item => item.commune)
      .filter(item => !provinceName || !item.province || item.province === provinceName)
      .map(item => item.commune);
    return [...new Set(communes)].sort((a, b) => a.localeCompare(b, 'vi'));
  } catch (e) {
    return [];
  }
}

function getAddressDirectory() {
  try {
    const provinces = getProvinces();
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Communes');
    const rows = sheet.getDataRange().getValues();
    const communes = {};
    rows.forEach(row => {
      const province = String(row[0] || '').trim();
      const commune = String(row[1] || '').trim();
      if (!commune) return;
      if (!communes[province]) communes[province] = [];
      communes[province].push(commune);
    });
    Object.keys(communes).forEach(province => {
      communes[province] = [...new Set(communes[province])].sort((a, b) => a.localeCompare(b, 'vi'));
    });
    return { success: true, provinces, communes };
  } catch (e) {
    return { success: false, provinces: [], communes: {}, message: e.message };
  }
}

function listPendingRegistrations_(callback) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
  ensureExtraHeaders_(sheet);
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    timestamp: formatCellDate_(row[0]),
    fullName: row[1] || '',
    birthDate: formatCellDate_(row[2]),
    gender: row[3] || '',
    identityCode: String(row[4] || '').replace(/^'/, ''),
    phone: String(row[5] || '').replace(/^'/, ''),
    className: row[6] || '',
    enrollmentYear: row[7] || '',
    address: row[8] || '',
    ward: row[9] || '',
    province: row[10] || '',
    householdAddress: row[11] || '',
    householdWard: row[12] || '',
    householdProvince: row[13] || '',
    fatherName: row[14] || '',
    fatherBirthYear: row[15] || '',
    fatherJob: row[16] || '',
    fatherPhone: String(row[17] || '').replace(/^'/, ''),
    motherName: row[18] || '',
    motherBirthYear: row[19] || '',
    motherJob: row[20] || '',
    motherPhone: String(row[21] || '').replace(/^'/, ''),
    temporaryStatus: row[22] || '',
    transport: row[23] || '',
    birthCertificateUrl: row[24] || '',
    transcriptUrl: row[25] || '',
    portraitUrl: row[26] || '',
    identityCardUrl: row[27] || '',
    hocLucLop6: row[28] || '',
    hanhKiemLop6: row[29] || '',
    hocLucLop7: row[30] || '',
    hanhKiemLop7: row[31] || '',
    hocLucLop8: row[32] || '',
    hanhKiemLop8: row[33] || '',
    dropoutYear: row[34] || ''
  })).filter(item => item.fullName || item.identityCode);
  const json = JSON.stringify({ items: rows });
  const body = callback ? `${callback}(${json});` : json;
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function markDropoutInSheet_(params) {
  const callback = params.callback;
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    ensureExtraHeaders_(sheet);
    const rowNumber = findStudentRow_(sheet, params);
    if (!rowNumber) {
      return jsonp_(callback, { success: false, message: 'Không tìm thấy học sinh trong Sheet để cập nhật năm bỏ học.' });
    }
    const isDropped = String(params.status || '').toLowerCase() === 'dropped';
    sheet.getRange(rowNumber, 35).setValue(isDropped ? (params.schoolYear || '') : '');
    return jsonp_(callback, { success: true, rowNumber: rowNumber });
  } catch (e) {
    return jsonp_(callback, { success: false, message: e.message });
  }
}

function syncStudentToSheet_(params) {
  const callback = params.callback;
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    ensureExtraHeaders_(sheet);
    const rowData = buildStudentSheetRow_(params);
    const rowNumber = findStudentRow_(sheet, params);
    if (rowNumber) {
      sheet.getRange(rowNumber, 2, 1, rowData.length).setValues([rowData]);
      return jsonp_(callback, { success: true, rowNumber: rowNumber, mode: 'updated' });
    }
    sheet.appendRow([new Date()].concat(rowData));
    return jsonp_(callback, { success: true, rowNumber: sheet.getLastRow(), mode: 'appended' });
  } catch (e) {
    return jsonp_(callback, { success: false, message: e.message });
  }
}

function buildStudentSheetRow_(params) {
  const identityCode = String(params.identityCode || '').replace(/^'/, '').trim();
  const isDropped = String(params.status || '').toLowerCase() === 'dropped';
  return [
    params.fullName || '',
    params.birthDate || '',
    params.gender || '',
    /^\d{12}$/.test(identityCode) ? "'" + identityCode : identityCode,
    params.phone ? "'" + params.phone : '',
    params.className || '',
    params.enrollmentYear || '',
    params.address || '',
    params.ward || '',
    params.province || '',
    params.householdAddress || '',
    params.householdWard || '',
    params.householdProvince || '',
    params.fatherName || '',
    params.fatherBirthYear || '',
    params.fatherJob || '',
    params.fatherPhone ? "'" + params.fatherPhone : '',
    params.motherName || '',
    params.motherBirthYear || '',
    params.motherJob || '',
    params.motherPhone ? "'" + params.motherPhone : '',
    params.temporaryStatus || '',
    params.transport || '',
    params.birthCertificateUrl || '',
    params.transcriptUrl || '',
    params.portraitUrl || '',
    params.identityCardUrl || '',
    params.hocLucLop6 || '',
    params.hanhKiemLop6 || '',
    params.hocLucLop7 || '',
    params.hanhKiemLop7 || '',
    params.hocLucLop8 || '',
    params.hanhKiemLop8 || '',
    isDropped ? (params.dropoutYear || params.schoolYear || '') : ''
  ];
}

function findStudentRow_(sheet, params) {
  const identityCode = String(params.identityCode || '').replace(/^'/, '').trim();
  if (/^\d{12}$/.test(identityCode) && sheet.getLastRow() > 1) {
    const match = sheet.getRange(2, 5, sheet.getLastRow() - 1, 1)
      .createTextFinder(identityCode)
      .matchEntireCell(true)
      .findNext();
    if (match) return match.getRow();
  }

  const targetName = removeVietnameseMarks_(params.fullName || '');
  const targetBirth = normalizeDateForCompare_(params.birthDate || '');
  if (!targetName || !targetBirth || sheet.getLastRow() <= 1) return 0;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 35)).getValues();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const name = removeVietnameseMarks_(row[1] || '');
    const birthDate = normalizeDateForCompare_(formatCellDate_(row[2]));
    if (name === targetName && birthDate === targetBirth) return index + 2;
  }
  return 0;
}

function normalizeDateForCompare_(value) {
  const text = String(value || '').trim();
  const vn = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (vn) return `${vn[1].padStart(2, '0')}${vn[2].padStart(2, '0')}${vn[3]}`;
  const iso = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, '0')}${iso[2].padStart(2, '0')}${iso[1]}`;
  return text.replace(/\D/g, '');
}

function jsonp_(callback, data) {
  const json = JSON.stringify(data || {});
  const body = callback ? `${callback}(${json});` : json;
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processForm(formObject, files) {
  try {
    files = files || {};
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    ensureExtraHeaders_(sheet);
    const identityCode = normalizeIdentityInput_(formObject.maDinhDanh);
    if (!identityCode) {
      return { success: false, message: 'Mã định danh phải là đúng 12 số, hoặc ghi đúng: bé chưa có' };
    }
    if (/^\d{12}$/.test(identityCode) && hasExistingIdentity_(sheet, identityCode)) {
      return { success: false, message: 'Mã định danh này đã tồn tại trong hệ thống.' };
    }

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const hoVaTen = String(formObject.hoVaTen || '').trim().toLocaleUpperCase('vi-VN');
    const fileUrls = {
      anhKhaiSinh: saveFiles_(folder, files.anhKhaiSinh, 2, 'Khai sinh', hoVaTen),
      anhCanCuoc: saveFiles_(folder, files.anhCanCuoc, 2, 'Can cuoc', hoVaTen, /^\d{12}$/.test(identityCode)),
      anhChanDung: saveFiles_(folder, files.anhChanDung, 1, 'Chan dung', hoVaTen),
      anhHocBa: saveHocBaPdf_(folder, files.anhHocBa, hoVaTen)
    };

    sheet.appendRow([
      new Date(),
      hoVaTen,
      formObject.ngaySinh,
      formObject.gioiTinh,
      /^\d{12}$/.test(identityCode) ? "'" + identityCode : identityCode,
      "'" + formObject.soDienThoai,
      formObject.lopHoc,
      formObject.tinhTrangHocSinh,
      formObject.soNha,
      formObject.xaPhuong,
      formObject.tinhThanh,
      formObject.soNhaHK,
      formObject.xaPhuongHK,
      formObject.tinhThanhHK,
      formObject.tenCha,
      formObject.namSinhCha,
      formObject.ngheNghiepCha,
      formObject.sdtCha ? "'" + formObject.sdtCha : '',
      formObject.tenMe,
      formObject.namSinhMe,
      formObject.ngheNghiepMe,
      formObject.sdtMe ? "'" + formObject.sdtMe : '',
      formObject.tinhTrangTamTru,
      formObject.diXe,
      fileUrls.anhKhaiSinh || '',
      fileUrls.anhHocBa || '',
      fileUrls.anhChanDung || '',
      fileUrls.anhCanCuoc || '',
      formObject.hocLucLop6 || '',
      formObject.hanhKiemLop6 || '',
      formObject.hocLucLop7 || '',
      formObject.hanhKiemLop7 || '',
      formObject.hocLucLop8 || '',
      formObject.hanhKiemLop8 || ''
    ]);
    return { success: true, message: 'Đã nộp hồ sơ thành công!' };
  } catch (e) {
    return { success: false, message: 'Lỗi máy chủ: ' + e.message };
  }
}

function saveFiles_(folder, filesForField, limit, baseName, hoVaTen, required) {
  const list = filesForField || [];
  if (!list.length) {
    if (required === false) return '';
    throw new Error(`Thiếu ảnh ${baseName}.`);
  }
  if (list.length > limit) throw new Error(`${baseName} chỉ được tải tối đa ${limit} ảnh.`);

  return list.map((file, index) => {
    const blob = fileToBlob_(file);
    const extension = getExtension_(file.name, blob.getContentType());
    const savedFile = folder.createFile(blob).setName(`${safeFileName_(hoVaTen)} ${baseName} ${index + 1}.${extension}`);
    return savedFile.getUrl();
  }).join(', ');
}

function saveHocBaPdf_(folder, filesForField, hoVaTen) {
  const list = filesForField || [];
  if (!list.length) throw new Error('Thiếu file học bạ.');
  if (list.length > 20) throw new Error('Học bạ chỉ nên tải tối đa 20 file mỗi lần.');

  const pdfFiles = list.filter(file => String(file.type || '').toLowerCase() === 'application/pdf');
  const imageFiles = list.filter(file => String(file.type || '').toLowerCase().startsWith('image/'));
  if (pdfFiles.length + imageFiles.length !== list.length) {
    throw new Error('Học bạ chỉ nhận file PDF hoặc ảnh chụp.');
  }
  if (pdfFiles.length && imageFiles.length) {
    throw new Error('Học bạ chỉ chọn 1 file PDF, hoặc chọn nhiều ảnh chụp. Không chọn lẫn PDF và ảnh.');
  }
  if (pdfFiles.length > 1) {
    throw new Error('Nếu tải học bạ dạng PDF, thầy cô vui lòng chọn đúng 1 file PDF đã gộp sẵn.');
  }

  const safeName = safeFileName_(hoVaTen);
  if (pdfFiles.length === 1) {
    const file = pdfFiles[0];
    const blob = fileToBlob_(file);
    const savedFile = folder.createFile(blob).setName(`${safeName} Hoc ba.pdf`);
    return savedFile.getUrl();
  }

  const doc = DocumentApp.create(`${safeName} Hoc ba`);
  const docFile = DriveApp.getFileById(doc.getId());
  const body = doc.getBody();
  body.clear();

  imageFiles.forEach((file, index) => {
    const blob = fileToBlob_(file);
    body.appendParagraph(`Trang học bạ ${index + 1}`).setBold(true);
    const image = body.appendImage(blob);
    fitImageWidth_(image, 520);
    if (index < imageFiles.length - 1) body.appendPageBreak();
  });

  doc.saveAndClose();
  const pdfBlob = docFile.getAs(MimeType.PDF).setName(`${safeName} Hoc ba.pdf`);
  const pdfFile = folder.createFile(pdfBlob);
  docFile.setTrashed(true);
  return pdfFile.getUrl();
}

function fileToBlob_(file) {
  if (!file || !file.bytes) throw new Error('Không đọc được file tải lên.');
  return Utilities.newBlob(Utilities.base64Decode(file.bytes), file.type, file.name);
}

function fitImageWidth_(image, maxWidth) {
  const width = image.getWidth();
  const height = image.getHeight();
  if (width > maxWidth) {
    const ratio = maxWidth / width;
    image.setWidth(maxWidth);
    image.setHeight(Math.round(height * ratio));
  }
}

function getExtension_(fileName, contentType) {
  const name = String(fileName || '');
  const fromName = name.includes('.') ? name.split('.').pop() : '';
  if (fromName) return fromName.replace(/[^\w]/g, '').toLowerCase() || 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'application/pdf') return 'pdf';
  return 'jpg';
}

function safeFileName_(name) {
  return String(name || 'Hoc sinh').trim().replace(/[\\/:*?"<>|]+/g, '-');
}

function normalizeIdentityInput_(value) {
  const text = String(value || '').trim().toLowerCase();
  if (/^\d{12}$/.test(text)) return text;
  if (removeVietnameseMarks_(text) === 'be chua co') return 'bé chưa có';
  return '';
}

function removeVietnameseMarks_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasExistingIdentity_(sheet, identityCode) {
  if (sheet.getLastRow() <= 1) return false;
  const range = sheet.getRange(2, 5, sheet.getLastRow() - 1, 1);
  const finder = range.createTextFinder(String(identityCode)).matchEntireCell(true);
  return Boolean(finder.findNext());
}

function formatCellDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return String(value);
}

function ensureExtraHeaders_(sheet) {
  const headers = [
    'Link ảnh Căn cước',
    'Học lực lớp 6',
    'Hạnh kiểm lớp 6',
    'Học lực lớp 7',
    'Hạnh kiểm lớp 7',
    'Học lực lớp 8',
    'Hạnh kiểm lớp 8',
    'Năm bỏ học'
  ];
  const startColumn = 28;
  const current = sheet.getRange(1, startColumn, 1, headers.length).getValues()[0];
  const shouldWrite = headers.some((header, index) => current[index] !== header);
  if (shouldWrite) {
    sheet.getRange(1, startColumn, 1, headers.length).setValues([headers]);
  }
}
