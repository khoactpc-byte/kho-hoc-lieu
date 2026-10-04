const SPREADSHEET_ID = '1oIGnM9Dw_3bUl8xfTKYE0XKsBvJWHb-J7qvD11fDcMM';
const FOLDER_ID = '1T28uP92Iuzec0QE6Z5ZAwhsY68_oQdEX';
const REGISTRATION_LOCATION_CACHE_SECONDS_ = 21600;
const REGISTRATION_LOCATION_CHUNK_CHARS_ = 20000;
// Keep this value equal to the current school year in the main website.
// A Script Property named CURRENT_SCHOOL_YEAR takes precedence when present.
const REGISTRATION_DEFAULT_SCHOOL_YEAR = '2025-2026';
const REGISTRATION_SCHOOLS = [
  { key: 'nguyen-an-ninh', name: 'THCS Nguyễn An Ninh', code: 'NAN', suffix: 'A' },
  { key: 'tran-quang-khai', name: 'THCS Trần Quang Khải', code: 'TQK', suffix: 'B' }
];
const REGISTRATION_ADMIN_ACTIONS_ = [
  'listPending',
  'listStudents',
  'markDropout',
  'markExistingRegistration',
  'deleteRegistration',
  'syncStudent',
  'syncSchoolYearClasses',
  'syncCurrentSchoolYear'
];

function getRegistrationConfig() {
  return {
    currentSchoolYear: getConfiguredRegistrationSchoolYear_(),
    schools: REGISTRATION_SCHOOLS
  };
}

function getConfiguredRegistrationSchoolYear_() {
  const configured = String(PropertiesService.getScriptProperties().getProperty('CURRENT_SCHOOL_YEAR') || '').trim();
  return /^20\d{2}-20\d{2}$/.test(configured) ? configured : REGISTRATION_DEFAULT_SCHOOL_YEAR;
}

function getSchoolYearStart_(value) {
  const match = String(value || '').match(/20\d{2}/);
  return match ? Number(match[0]) : 0;
}

function getRegistrationSchool_(key) {
  return REGISTRATION_SCHOOLS.find(item => item.key === String(key || '').trim()) || null;
}

function requireRegistrationAdmin_(params) {
  const adminSessionToken = String(params.adminSessionToken || '').trim();
  const properties = PropertiesService.getScriptProperties();
  const mainWebAppUrl = String(properties.getProperty('APP_MAIN_WEB_APP_URL') || '').trim();
  const clientToken = String(properties.getProperty('APP_CLIENT_TOKEN') || '').trim();
  if (!adminSessionToken) throw new Error('Cần đăng nhập Admin để truy cập dữ liệu học sinh.');
  if (!mainWebAppUrl || !clientToken) {
    throw new Error('Chưa cấu hình xác thực giữa hai Apps Script. Xem hướng dẫn cập nhật và bảo mật.');
  }

  try {
    const response = UrlFetchApp.fetch(mainWebAppUrl, {
      method: 'post',
      contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({
        action: 'validateAdminSession',
        clientToken: clientToken,
        adminSessionToken: adminSessionToken
      }),
      muteHttpExceptions: true
    });
    const result = JSON.parse(response.getContentText() || '{}');
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300 && result.status === 'success') return;
  } catch (error) {
    throw new Error('Không xác thực được phiên Admin với máy chủ chính. Kiểm tra cấu hình và quyền UrlFetchApp.');
  }
  throw new Error('Phiên Admin đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.');
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action;
  if (action === 'version') return jsonp_(params.callback, { version: '2026-10-04-location-cache-v7' });
  if (REGISTRATION_ADMIN_ACTIONS_.indexOf(action) >= 0) {
    return jsonp_(params.callback, { success: false, message: 'Dữ liệu quản trị chỉ nhận POST đã xác thực.' });
  }
  if (action === 'registrationConfig') {
    return jsonp_(params.callback, getRegistrationConfig());
  }
  if (action === 'locationBootstrap') return jsonp_(params.callback, getRegistrationLocationBootstrap());
  if (action === 'birthPlaceProvince') return jsonp_(params.callback, getBirthPlaceProvince(params.province));
  if (action === 'provinces') {
    return jsonp_(params.callback, { items: getProvinces() });
  }
  if (action === 'addressDirectory') {
    return jsonp_(params.callback, getAddressDirectory());
  }
  if (action === 'birthPlaceDirectory') {
    return jsonp_(params.callback, getBirthPlaceDirectory());
  }
  if (action === 'birthPlaceDistricts') {
    return jsonp_(params.callback, { items: getBirthPlaceDistricts(params.province) });
  }
  if (action === 'birthPlaceCommunes') {
    return jsonp_(params.callback, { items: getBirthPlaceCommunes(params.province, params.district) });
  }
  if (action === 'communes') {
    return jsonp_(params.callback, { items: getCommunes(params.province) });
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Đăng ký học sinh')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doPost(e) {
  try {
    const params = JSON.parse(e && e.postData ? e.postData.contents || '{}' : '{}');
    requireRegistrationAdmin_(params);
    const handlers = { listPending: params => listPendingRegistrations_(params.callback), listStudents: listSheetStudents_, markDropout: markDropoutInSheet_, markExistingRegistration: markExistingRegistration_,
      deleteRegistration: deleteRegistration_, syncStudent: syncStudentToSheet_, syncSchoolYearClasses: syncSchoolYearClasses_, syncCurrentSchoolYear: syncCurrentSchoolYear_ };
    if (!Object.prototype.hasOwnProperty.call(handlers, params.action)) throw new Error('Thao tác không được hỗ trợ.');
    params.callback = '';
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const result = handlers[params.action](params);
      SpreadsheetApp.flush();
      return result;
    } finally { lock.releaseLock(); }
  } catch (error) { return jsonp_('', { success: false, message: error.message }); }
}

function capQuyenMotLan() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  ['Data', 'Provinces', 'Communes', 'tinhhuyenxa'].forEach(name => {
    if (!spreadsheet.getSheetByName(name)) throw new Error('Thiếu sheet ' + name + ' trong spreadsheet đăng ký.');
  });
  spreadsheet.getSheetByName('Data').getLastRow();
  DriveApp.getFolderById(FOLDER_ID).getName();
  const doc = DocumentApp.create('Kiem tra quyen tao PDF hoc ba');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  const message = 'Đã cấp đủ quyền: Sheet, Drive, Google Docs.';
  console.log(message);
  return message;
}

function getProvinces() {
  try {
    return getLocationProvinceList_('address').provinces;
  } catch (e) {
    return [];
  }
}

function getCommunes(province) {
  const result = getRegistrationCommunes(province);
  return result.success ? result.items : [];
}

function getAddressDirectory() {
  try {
    return getLocationDirectory_('address');
  } catch (e) {
    return { success: false, provinces: [], communes: {}, message: e.message };
  }
}

function getBirthPlaceDirectory() {
  try {
    return getLocationDirectory_('birth');
  } catch (e) {
    return { success: false, provinces: [], districtsByProvince: {}, communesByDistrict: {}, message: e.message };
  }
}

function getLocationDirectoryRevision_() {
  return 'locations-v2:' + String(PropertiesService.getScriptProperties().getProperty('LOCATION_DIRECTORY_VERSION') || '1').trim().slice(0, 32);
}

function locationCacheKey_(name) {
  return getLocationDirectoryRevision_() + ':' + name;
}

function readLocationCache_(name) {
  try {
    const cache = CacheService.getScriptCache();
    const key = locationCacheKey_(name);
    const raw = cache.get(key);
    if (!raw) return null;
    const manifest = JSON.parse(raw);
    if (!Number.isInteger(manifest.count) || manifest.count < 1 || manifest.count > 150 || !/^[a-zA-Z0-9-]+$/.test(manifest.generation || '')) return null;
    const keys = Array.from({ length: manifest.count }, (_, index) => key + ':' + manifest.generation + ':' + index);
    const parts = cache.getAll(keys);
    if (keys.some(part => typeof parts[part] !== 'string')) return null;
    const result = JSON.parse(keys.map(part => parts[part]).join(''));
    return result && typeof result === 'object' && result.success === true ? result : null;
  } catch (error) { return null; }
}

function writeLocationCache_(name, data) {
  try {
    const json = JSON.stringify(data);
    const chunks = [];
    for (let offset = 0; offset < json.length;) {
      let end = Math.min(offset + REGISTRATION_LOCATION_CHUNK_CHARS_, json.length);
      const last = json.charCodeAt(end - 1);
      if (end < json.length && last >= 0xD800 && last <= 0xDBFF) end -= 1;
      chunks.push(json.slice(offset, end));
      offset = end;
    }
    const count = chunks.length;
    if (count > 150) return;
    const cache = CacheService.getScriptCache();
    const key = locationCacheKey_(name);
    const generation = Utilities.getUuid();
    const parts = {};
    for (let index = 0; index < count; index++) {
      parts[key + ':' + generation + ':' + index] = chunks[index];
    }
    cache.putAll(parts, REGISTRATION_LOCATION_CACHE_SECONDS_);
    // Publish only after every part has been written. Concurrent rebuilds use different generations.
    cache.put(key, JSON.stringify({ generation: generation, count: count }), REGISTRATION_LOCATION_CACHE_SECONDS_);
  } catch (error) {
    // Cache is optional; an eviction or service failure must never hide valid Sheet data.
  }
}

function getLocationDirectory_(kind) {
  const cached = readLocationCache_(kind);
  if (cached) return cached;
  let result;
  if (kind === 'address') {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const provinceSheet = spreadsheet.getSheetByName('Provinces');
    const communeSheet = spreadsheet.getSheetByName('Communes');
    if (!provinceSheet || !communeSheet) throw new Error('Thiếu sheet Provinces hoặc Communes.');
    const provinces = [...new Set(provinceSheet.getDataRange().getValues().flat().map(value => String(value || '').trim()).filter(Boolean))];
    const hcmIndex = provinces.indexOf('TP.HCM');
    if (hcmIndex > 0) provinces.unshift(provinces.splice(hcmIndex, 1)[0]);
    const communes = Object.create(null);
    communeSheet.getDataRange().getValues().forEach(row => {
      const province = row.length >= 2 ? String(row[0] || '').trim() : '';
      const commune = String(row[row.length >= 2 ? 1 : 0] || '').trim();
      const header = removeVietnameseMarks_(province);
      if (!commune || header === 'tinh / thanh pho' || header === 'tinh' || header.indexOf('title:') === 0) return;
      if (!communes[province]) communes[province] = [];
      communes[province].push(commune);
    });
    Object.keys(communes).forEach(province => { communes[province] = [...new Set(communes[province])].sort((a, b) => a.localeCompare(b, 'vi')); });
    result = { success: true, provinces: provinces, communes: communes };
  } else {
    const rows = getBirthPlaceRows_();
    const indexes = getBirthPlaceColumnIndexes_(rows);
    const provinces = [];
    const districtsByProvince = Object.create(null);
    const communesByDistrict = Object.create(null);
    rows.slice(1).forEach(row => {
      const province = String(row[indexes.province] || '').trim();
      const district = String(row[indexes.district] || '').trim();
      const commune = String(row[indexes.commune] || '').trim();
      if (!province) return;
      provinces.push(province);
      if (district) {
        if (!districtsByProvince[province]) districtsByProvince[province] = [];
        districtsByProvince[province].push(district);
      }
      if (district && commune) {
        const key = province + '|||' + district;
        if (!communesByDistrict[key]) communesByDistrict[key] = [];
        communesByDistrict[key].push(commune);
      }
    });
    const sortVi = (a, b) => a.localeCompare(b, 'vi');
    Object.keys(districtsByProvince).forEach(province => {
      districtsByProvince[province] = [...new Set(districtsByProvince[province])].sort(sortVi);
    });
    Object.keys(communesByDistrict).forEach(key => {
      communesByDistrict[key] = [...new Set(communesByDistrict[key])].sort(sortVi);
    });
    result = {
      success: true,
      provinces: [...new Set(provinces)].sort(sortVi),
      districtsByProvince,
      communesByDistrict
    };
  }
  result.revision = getLocationDirectoryRevision_();
  writeLocationCache_(kind, result);
  writeLocationCache_(kind + '-provinces', { success: true, provinces: result.provinces, revision: result.revision });
  return result;
}

function getLocationProvinceList_(kind) {
  const cached = readLocationCache_(kind + '-provinces');
  if (cached) return cached;
  try {
    const directory = getLocationDirectory_(kind);
    return { success: true, provinces: directory.provinces, revision: directory.revision };
  } catch (error) { return { success: false, provinces: [], message: error.message }; }
}

function getRegistrationLocationBootstrap() {
  const address = getLocationProvinceList_('address');
  const birth = getLocationProvinceList_('birth');
  return { success: true, revision: getLocationDirectoryRevision_(), config: getRegistrationConfig(),
    provinces: address.provinces, birthProvinces: birth.provinces,
    addressError: address.success ? '' : address.message, birthError: birth.success ? '' : birth.message };
}

function getRegistrationCommunes(province) {
  try {
    const provinceName = String(province || '').trim();
    const cached = provinceName.length <= 120 && readLocationCache_('communes:' + provinceName);
    if (cached) return cached;
    const directory = getLocationDirectory_('address');
    const own = key => Object.prototype.hasOwnProperty.call(directory.communes, key) ? directory.communes[key] : [];
    const items = provinceName ? [...own(provinceName), ...own('')] : Object.keys(directory.communes).flatMap(own);
    const result = { success: true, province: provinceName, items: [...new Set(items)].sort((a, b) => a.localeCompare(b, 'vi')), revision: directory.revision };
    if (provinceName.length <= 120) writeLocationCache_('communes:' + provinceName, result);
    return result;
  } catch (error) { return { success: false, items: [], message: error.message }; }
}

function getBirthPlaceProvince(province) {
  try {
    const provinceName = String(province || '').trim();
    if (!provinceName || provinceName.length > 120) throw new Error('Vui lòng chọn tỉnh/thành phố hợp lệ.');
    const cached = readLocationCache_('birthProvince:' + provinceName);
    if (cached) return cached;
    const directory = getLocationDirectory_('birth');
    const districts = Object.prototype.hasOwnProperty.call(directory.districtsByProvince, provinceName) ? directory.districtsByProvince[provinceName] : [];
    const communesByDistrict = Object.create(null);
    districts.forEach(district => {
      const key = provinceName + '|||' + district;
      communesByDistrict[key] = directory.communesByDistrict[key] || [];
    });
    const result = { success: true, province: provinceName, districts: districts, communesByDistrict: communesByDistrict, revision: directory.revision };
    writeLocationCache_('birthProvince:' + provinceName, result);
    return result;
  } catch (error) { return { success: false, districts: [], communesByDistrict: {}, message: error.message }; }
}

function getBirthPlaceDistricts(province) {
  const result = getBirthPlaceProvince(province);
  return result.success ? result.districts : [];
}

function getBirthPlaceCommunes(province, district) {
  if (!String(district || '').trim()) return [];
  const result = getBirthPlaceProvince(province);
  const key = String(province || '').trim() + '|||' + String(district || '').trim();
  return result.success && Object.prototype.hasOwnProperty.call(result.communesByDistrict, key) ? result.communesByDistrict[key] : [];
}

function getBirthPlaceRows_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('tinhhuyenxa');
  if (!sheet) throw new Error('Thiếu sheet tinhhuyenxa.');
  return sheet.getDataRange().getValues();
}

function getBirthPlaceColumnIndexes_(rows) {
  rows = rows || getBirthPlaceRows_();
  const headers = rows.length ? rows[0].map(value => removeVietnameseMarks_(value || '')) : [];
  return {
    province: Math.max(headers.indexOf('tinh'), 0),
    district: headers.indexOf('huyen') >= 0 ? headers.indexOf('huyen') : 1,
    commune: headers.indexOf('xa') >= 0 ? headers.indexOf('xa') : 2
  };
}

function listPendingRegistrations_(callback) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
  ensureExtraHeaders_(sheet);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const rows = values.slice(1).map((row, index) => mapStudentSheetRow_(row, index, headers))
    .filter(item => item.fullName || item.identityCode)
    .filter(item => !isProcessedRegistrationStatus_(item.registrationStatus));
  return jsonp_(callback, { success: true, items: rows });
}

function listSheetStudents_(params) {
  const callback = params.callback;
  const schoolYear = String(params.schoolYear || '').trim();
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    ensureExtraHeaders_(sheet);
    const values = sheet.getDataRange().getValues();
    const headers = values[0] || [];
    const rows = values.slice(1)
      .map((row, index) => mapStudentSheetRow_(row, index, headers))
      .filter(item => item.fullName || item.identityCode)
      .filter(item => !schoolYear || !item.schoolYear || item.schoolYear === schoolYear);
    return jsonp_(callback, { success: true, items: rows });
  } catch (e) {
    return jsonp_(callback, { success: false, items: [], message: e.message });
  }
}

function mapStudentSheetRow_(row, index, headers) {
  const classHistory = {};
  (headers || []).forEach((header, columnIndex) => {
    const schoolYear = normalizeSchoolYearKey_(header);
    if (schoolYear && columnIndex >= 56 && String(row[columnIndex] || '').trim()) {
      classHistory[schoolYear] = String(row[columnIndex] || '').trim();
    }
  });
  return {
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
    hocLucLop9: row[34] || '',
    hanhKiemLop9: row[35] || '',
    dropoutYear: row[36] || '',
    registrationStatus: row[37] || '',
    registrationNote: row[38] || '',
    currentClassName: row[51] || row[6] || '',
    schoolYear: row[52] || '',
    schoolName: row[53] || '',
    schoolCode: row[54] || '',
    classSuffix: row[55] || '',
    grade: row[50] || getGradeFromClass_(row[51] || row[6]),
    accessCode: row[49] || '',
    birthPlaceName: row[42] || '',
    birthProvince: row[39] || '',
    birthDistrict: row[40] || '',
    birthWard: row[41] || '',
    birthPlace: row[42] || row[39] || '',
    birthRegistrationProvince: row[43] || '',
    birthRegistrationDistrict: row[44] || '',
    birthRegistrationWard: row[45] || '',
    birthRegistrationPlace: buildLocationText_(row[45], row[44], row[43]) || row[43] || '',
    hometownProvince: row[46] || '',
    hometownDistrict: row[47] || '',
    hometownWard: row[48] || '',
    hometownPlace: buildLocationText_(row[48], row[47], row[46]) || row[46] || '',
    classHistory
  };
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
    sheet.getRange(rowNumber, 37).setValue(isDropped ? (params.schoolYear || '') : '');
    return jsonp_(callback, { success: true, rowNumber: rowNumber });
  } catch (e) {
    return jsonp_(callback, { success: false, message: e.message });
  }
}

function markExistingRegistration_(params) {
  const callback = params.callback;
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    ensureExtraHeaders_(sheet);
    const rowNumber = getRegistrationRowNumber_(sheet, params);
    if (!rowNumber) {
      return jsonp_(callback, { success: false, message: 'Khong tim thay dong dang ky de danh dau da co.' });
    }
    const identityCode = String(params.identityCode || '').replace(/^'/, '').trim();
    if (identityCode) {
      sheet.getRange(rowNumber, 5).setValue(/^\d{12}$/.test(identityCode) ? "'" + identityCode : identityCode);
    }
    sheet.getRange(rowNumber, 38).setValue('Đã có');
    sheet.getRange(rowNumber, 39).setValue(params.note || ('Da co trong database luc ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')));
    return jsonp_(callback, { success: true, rowNumber: rowNumber });
  } catch (e) {
    return jsonp_(callback, { success: false, message: e.message });
  }
}

function deleteRegistration_(params) {
  const callback = params.callback;
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    ensureExtraHeaders_(sheet);
    const rowNumber = getRegistrationRowNumber_(sheet, params);
    if (!rowNumber) {
      return jsonp_(callback, { success: false, message: 'Khong tim thay dong dang ky de xoa.' });
    }
    sheet.deleteRow(rowNumber);
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
    const guard = studentSyncGuard_(params, sheet);
    if (guard && guard.replayed) return jsonp_(callback, { success: true, mode: 'replayed', rowNumber: guard.rowNumber });
    const rowData = buildStudentSheetRow_(params);
    const extraRowData = buildStudentExtraSheetRow_(params);
    const rowNumber = guard && guard.previousCode ? findStudentRow_(sheet, { accessCode: guard.previousCode }) || findStudentRow_(sheet, params) : findStudentRow_(sheet, params);
    if (rowNumber) {
      updateStudentSheetRowSkippingOrigin_(sheet, rowNumber, rowData, extraRowData);
      writeRegistrationSchoolMeta_(sheet, rowNumber, params);
      writeSchoolYearHistory_(sheet, rowNumber, params.classHistory);
      writeSchoolYearClass_(sheet, rowNumber, params.schoolYear, params.className);
      commitStudentSyncGuard_(guard, rowNumber);
      return jsonp_(callback, { success: true, rowNumber: rowNumber, mode: 'updated' });
    }
    const appendRowData = rowData.slice();
    appendRowData[5] = '';
    appendRowData[6] = '';
    sheet.appendRow([new Date()].concat(appendRowData).concat(['', '']).concat(extraRowData));
    const newRowNumber = sheet.getLastRow();
    writeRegistrationSchoolMeta_(sheet, newRowNumber, params);
    writeSchoolYearHistory_(sheet, newRowNumber, params.classHistory);
    writeSchoolYearClass_(sheet, newRowNumber, params.schoolYear, params.className);
    commitStudentSyncGuard_(guard, newRowNumber);
    return jsonp_(callback, { success: true, rowNumber: newRowNumber, mode: 'appended' });
  } catch (e) {
    return jsonp_(callback, { success: false, message: e.message });
  }
}

// doPost holds the script lock across the row write and this monotonic checkpoint.
function studentSyncGuard_(params, sheet) {
  if (!params.studentRecordId && !params.syncRevision) return null;
  const recordId = String(params.studentRecordId || '');
  const revision = Number(params.syncRevision), jobId = String(params.syncJobId || '');
  if (!recordId || !Number.isSafeInteger(revision) || revision < 1 || !jobId) throw new Error('Thiếu định danh hoặc phiên bản đồng bộ.');
  const book = sheet.getParent();
  let meta = book.getSheetByName('STUDENT_SYNC_STATE');
  if (!meta) { meta = book.insertSheet('STUDENT_SYNC_STATE'); meta.appendRow(['recordId', 'studentKey', 'revision', 'jobId', 'rowNumber', 'updatedAt', 'schoolYear', 'accessCode']); }
  const rows = meta.getDataRange().getValues();
  const studentKey = String(params.studentKey || ''), schoolYear = String(params.schoolYear || '').trim();
  if (!studentKey || !/^20\d{2}-20\d{2}$/.test(schoolYear)) throw new Error('Thiếu định danh ổn định hoặc năm học đồng bộ.');
  const history = rows.slice(1).filter(row => String(row[1]) === studentKey).sort((a, b) => String(b[6] || '').localeCompare(String(a[6] || '')) || Number(b[5]) - Number(a[5]));
  if (history[0] && String(history[0][6] || '') > schoolYear) throw new Error('Hồ sơ năm cũ không được ghi đè lớp/năm mới trên Sheet.');
  const index = rows.findIndex((row, position) => position > 0 && String(row[0]) === recordId);
  if (index >= 0) {
    const previous = Number(rows[index][2]);
    if (revision < previous || revision === previous && jobId !== String(rows[index][3])) throw new Error('Lượt đồng bộ đã cũ; dữ liệu mới được giữ.');
    if (revision === previous) return { replayed: true, rowNumber: Number(rows[index][4]) };
  }
  return { meta, position: index >= 0 ? index + 1 : meta.getLastRow() + 1, recordId, studentKey, schoolYear, accessCode: String(params.accessCode || params.studentCode || ''), previousCode: history[0] && String(history[0][7] || ''), revision, jobId };
}

function commitStudentSyncGuard_(guard, rowNumber) {
  if (!guard) return;
  guard.meta.getRange(guard.position, 1, 1, 8).setValues([[guard.recordId, guard.studentKey, guard.revision, guard.jobId, rowNumber, Date.now(), guard.schoolYear, guard.accessCode]]);
}

function claimSchoolYearSync_(params) {
  const source = String(params.sourceSchoolYear || '').trim();
  const target = String(params.targetSchoolYear || '').trim();
  const validYear = value => /^20\d{2}-20\d{2}$/.test(value) && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;
  if (!validYear(source) || !validYear(target)) throw new Error('Năm học không hợp lệ.');
  const current = getConfiguredRegistrationSchoolYear_();
  if (current !== source && current !== target) throw new Error('Năm học đăng ký đang là ' + current + '; cần đối chiếu trước khi đổi năm.');
  const properties = PropertiesService.getScriptProperties();
  const sequence = Number(params.sequence);
  const attemptId = String(params.attemptId || '');
  const previous = Number(properties.getProperty('CURRENT_SCHOOL_YEAR_SEQUENCE') || 0);
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !attemptId || sequence < previous ||
      (sequence === previous && attemptId !== properties.getProperty('CURRENT_SCHOOL_YEAR_ATTEMPT'))) {
    throw new Error('Lượt đồng bộ năm học đã cũ hoặc không hợp lệ.');
  }
  properties.setProperties({ CURRENT_SCHOOL_YEAR_SEQUENCE: String(sequence), CURRENT_SCHOOL_YEAR_ATTEMPT: attemptId });
  return target;
}

function syncCurrentSchoolYear_(params) {
  const target = claimSchoolYearSync_(params);
  PropertiesService.getScriptProperties().setProperty('CURRENT_SCHOOL_YEAR', target);
  return jsonp_('', { success: true, currentSchoolYear: target });
}

function syncSchoolYearClasses_(params) {
  const callback = params.callback;
  try {
    claimSchoolYearSync_(params);
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    ensureExtraHeaders_(sheet);
    const rawItems = params.items || params.itemsJson || '[]';
    const items = Array.isArray(rawItems) ? rawItems : JSON.parse(rawItems);
    const errors = [];
    let updatedCount = 0;

    items.forEach(item => {
      const rowNumber = findStudentRow_(sheet, item || {});
      if (!rowNumber) {
        errors.push(item?.fullName || item?.identityCode || 'Không xác định');
        return;
      }
      const sourceSchoolYear = normalizeSchoolYearKey_(item.sourceSchoolYear);
      const targetSchoolYear = normalizeSchoolYearKey_(item.targetSchoolYear);
      if (sourceSchoolYear && item.sourceClassName) writeSchoolYearClass_(sheet, rowNumber, sourceSchoolYear, item.sourceClassName);
      if (targetSchoolYear && item.targetClassName) writeSchoolYearClass_(sheet, rowNumber, targetSchoolYear, item.targetClassName);

      const current = sheet.getRange(rowNumber, 51, 1, 6).getValues()[0];
      const currentClassName = item.targetClassName || item.sourceClassName || current[1] || '';
      const currentSchoolYear = targetSchoolYear || sourceSchoolYear || current[2] || '';
      const currentValues = [
        item.targetClassName || item.sourceClassName ? getGradeFromClass_(currentClassName) : current[0],
        currentClassName,
        currentSchoolYear,
        item.schoolName || current[3] || '',
        item.schoolCode || current[4] || '',
        item.classSuffix || current[5] || ''
      ];
      sheet.getRange(rowNumber, 51, 1, 6).setValues([currentValues]);
      updatedCount += 1;
    });

    return jsonp_(callback, { success: errors.length === 0, updatedCount, errors });
  } catch (e) {
    return jsonp_(callback, { success: false, updatedCount: 0, errors: [e.message], message: e.message });
  }
}

function updateStudentSheetRowSkippingOrigin_(sheet, rowNumber, rowData, extraRowData) {
  sheet.getRange(rowNumber, 2, 1, 5).setValues([rowData.slice(0, 5)]);
  sheet.getRange(rowNumber, 9, 1, rowData.length - 7).setValues([rowData.slice(7)]);
  const extraRange = sheet.getRange(rowNumber, 40, 1, extraRowData.length);
  const currentExtraData = extraRange.getValues()[0];
  extraRange.setValues([mergeRowKeepingExistingValues_(currentExtraData, extraRowData)]);
}

function mergeRowKeepingExistingValues_(currentRow, nextRow) {
  return nextRow.map(function(value, index) {
    const nextValue = value === null || value === undefined ? '' : value;
    const currentValue = currentRow[index] === null || currentRow[index] === undefined ? '' : currentRow[index];
    if (String(nextValue).trim() === '' && String(currentValue).trim() !== '') return currentValue;
    return nextValue;
  });
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
    params.hocLucLop9 || '',
    params.hanhKiemLop9 || '',
    isDropped ? (params.dropoutYear || params.schoolYear || '') : ''
  ];
}

function buildStudentExtraSheetRow_(params) {
  const birthPlace = String(params.birthPlaceName || '').trim() || params.birthPlace || buildBirthPlaceText_(params);
  return [
    params.birthProvince || '',
    params.birthDistrict || '',
    params.birthWard || '',
    birthPlace || '',
    params.birthRegistrationProvince || '',
    params.birthRegistrationDistrict || '',
    params.birthRegistrationWard || '',
    params.hometownProvince || '',
    params.hometownDistrict || '',
    params.hometownWard || '',
    params.accessCode || params.studentCode || '',
    params.grade || getGradeFromClass_(params.className),
    params.className || '',
    params.schoolYear || '',
    params.schoolName || '',
    params.schoolCode || '',
    params.classSuffix || ''
  ];
}

function getGradeFromClass_(value) {
  const match = String(value || '').trim().match(/(?:^|\D)([1-9])(?:\D|$)/);
  return match ? match[1] : '';
}

function buildBirthPlaceText_(params) {
  return buildLocationText_(params.birthWard, params.birthDistrict, params.birthProvince) || String(params.birthPlaceName || '').trim();
}

function buildLocationText_(ward, district, province) {
  return [
    ward || '',
    district || '',
    province || ''
  ].map(value => String(value || '').trim()).filter(Boolean).join(', ');
}

function findStudentRow_(sheet, params) {
  if (sheet.getLastRow() <= 1) return 0;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 56)).getValues();
  const identity = String(params.identityCode || '').replace(/^'/, '').trim();
  const code = String(params.accessCode || params.studentCode || '').trim().toUpperCase();
  const name = removeVietnameseMarks_(params.fullName || '');
  const birth = normalizeDateForCompare_(params.birthDate || '');
  const unique = matches => {
    if (matches.length > 1) throw new Error('Có nhiều dòng cùng định danh. Cần đối chiếu trước khi cập nhật.');
    return matches.length ? matches[0].index + 2 : 0;
  };
  const indexed = rows.map((row, index) => ({ row, index }));
  if (code) {
    const found = unique(indexed.filter(item => String(item.row[49] || '').trim().toUpperCase() === code));
    if (found) return found;
  }
  if (/^\d{12}$/.test(identity)) {
    const found = unique(indexed.filter(item => String(item.row[4] || '').replace(/^'/, '').trim() === identity));
    if (found) return found;
  }
  if (!name || !birth) return 0;
  return unique(indexed.filter(item => removeVietnameseMarks_(item.row[1] || '') === name
    && normalizeDateForCompare_(formatCellDate_(item.row[2])) === birth));
}

function getRegistrationRowNumber_(sheet, params) {
  // Row numbers change after another administrator deletes or sorts a row.
  // Resolve identity while holding the POST lock instead of trusting a stale index.
  return findStudentRow_(sheet, params);
}

function isProcessedRegistrationStatus_(value) {
  const status = removeVietnameseMarks_(value || '');
  return status === 'da co' || status === 'da xu ly' || status === 'khong dong y' || status === 'xoa';
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
  const safeCallback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(String(callback || '')) ? String(callback) : '';
  const body = safeCallback ? `${safeCallback}(${json});` : json;
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function processForm(formObject, files) {
  try {
    files = files || {};
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    ensureExtraHeaders_(sheet);
    const registrationConfig = getRegistrationConfig();
    const school = getRegistrationSchool_(formObject.coSoHoc);
    if (!school) {
      return { success: false, message: 'Vui lòng chọn đúng cơ sở đăng ký học.' };
    }
    const requestedSchoolYear = String(formObject.tinhTrangHocSinh || '').trim();
    if (!/^20\d{2}-20\d{2}$/.test(requestedSchoolYear) || Number(requestedSchoolYear.slice(5)) !== Number(requestedSchoolYear.slice(0, 4)) + 1) {
      return { success: false, message: 'Năm đăng ký không hợp lệ.' };
    }
    if (getSchoolYearStart_(requestedSchoolYear) < getSchoolYearStart_(registrationConfig.currentSchoolYear)) {
      return { success: false, message: `Năm đăng ký không được nhỏ hơn năm học hiện tại ${registrationConfig.currentSchoolYear}.` };
    }
    const grade = getGradeFromClass_(formObject.lopHoc);
    if (!grade || !new RegExp('^' + grade + school.suffix + '$', 'i').test(String(formObject.lopHoc || '').trim())) {
      return { success: false, message: `Lớp đăng ký phải thuộc cơ sở ${school.name} và có hậu tố ${school.suffix}.` };
    }
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
      anhHocBa: saveHocBaFiles_(folder, files.anhHocBa, hoVaTen)
    };

    const studentParams = {
      fullName: hoVaTen,
      birthDate: formObject.ngaySinh,
      gender: formObject.gioiTinh,
      identityCode: identityCode,
      phone: formObject.soDienThoai,
      grade: grade,
      className: grade + school.suffix,
      enrollmentYear: requestedSchoolYear,
      schoolName: school.name,
      schoolCode: school.code,
      classSuffix: school.suffix,
      address: formObject.soNha,
      ward: formObject.xaPhuong,
      province: formObject.tinhThanh,
      householdAddress: formObject.soNhaHK,
      householdWard: formObject.xaPhuongHK,
      householdProvince: formObject.tinhThanhHK,
      fatherName: formObject.tenCha,
      fatherBirthYear: formObject.namSinhCha,
      fatherJob: formObject.ngheNghiepCha,
      fatherPhone: formObject.sdtCha,
      motherName: formObject.tenMe,
      motherBirthYear: formObject.namSinhMe,
      motherJob: formObject.ngheNghiepMe,
      motherPhone: formObject.sdtMe,
      temporaryStatus: formObject.tinhTrangTamTru,
      transport: formObject.diXe,
      birthCertificateUrl: fileUrls.anhKhaiSinh || '',
      transcriptUrl: fileUrls.anhHocBa || '',
      portraitUrl: fileUrls.anhChanDung || '',
      identityCardUrl: fileUrls.anhCanCuoc || '',
      hocLucLop6: formObject.hocLucLop6 || '',
      hanhKiemLop6: formObject.hanhKiemLop6 || '',
      hocLucLop7: formObject.hocLucLop7 || '',
      hanhKiemLop7: formObject.hanhKiemLop7 || '',
      hocLucLop8: formObject.hocLucLop8 || '',
      hanhKiemLop8: formObject.hanhKiemLop8 || '',
      birthPlaceName: formObject.birthPlaceName || '',
      birthProvince: formObject.birthProvince || '',
      birthDistrict: formObject.birthDistrict || '',
      birthWard: formObject.birthWard || '',
      birthRegistrationProvince: formObject.birthRegistrationProvince || '',
      birthRegistrationDistrict: formObject.birthRegistrationDistrict || '',
      birthRegistrationWard: formObject.birthRegistrationWard || '',
      hometownProvince: formObject.hometownProvince || '',
      hometownDistrict: formObject.hometownDistrict || '',
      hometownWard: formObject.hometownWard || ''
    };
    studentParams.birthPlace = buildBirthPlaceText_(studentParams);
    studentParams.birthRegistrationPlace = buildLocationText_(studentParams.birthRegistrationWard, studentParams.birthRegistrationDistrict, studentParams.birthRegistrationProvince);
    studentParams.hometownPlace = buildLocationText_(studentParams.hometownWard, studentParams.hometownDistrict, studentParams.hometownProvince);
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      // File uploads happen outside the lock. Recheck identity and year before writing.
      if (/^\d{12}$/.test(identityCode) && hasExistingIdentity_(sheet, identityCode)) throw new Error('Mã định danh này vừa được đăng ký. Không tạo hồ sơ trùng.');
      if (getSchoolYearStart_(requestedSchoolYear) < getSchoolYearStart_(getConfiguredRegistrationSchoolYear_())) {
        throw new Error('Năm học vừa thay đổi trong lúc tải tệp. Hãy tải lại trang đăng ký.');
      }
      sheet.appendRow([new Date()]
        .concat(buildStudentSheetRow_(studentParams))
        .concat(['', ''])
        .concat(buildStudentExtraSheetRow_(studentParams)));
      const rowNumber = sheet.getLastRow();
      writeRegistrationSchoolMeta_(sheet, rowNumber, studentParams);
      writeSchoolYearClass_(sheet, rowNumber, requestedSchoolYear, studentParams.className);
      SpreadsheetApp.flush();
    } finally { lock.releaseLock(); }
    return { success: true, message: 'Đã nộp hồ sơ thành công!' };
  } catch (e) {
    const message = (e && e.message) ? e.message : 'không xác định. Vui lòng thử lại hoặc báo quản trị kiểm tra Apps Script/Drive.';
    return { success: false, message: 'Lỗi máy chủ: ' + message };
  }
}

function writeRegistrationSchoolMeta_(sheet, rowNumber, params) {
  sheet.getRange(rowNumber, 54, 1, 3).setValues([[
    params.schoolName || '',
    params.schoolCode || '',
    params.classSuffix || ''
  ]]);
}

function saveFiles_(folder, filesForField, limit, baseName, hoVaTen, required) {
  const list = filesForField || [];
  if (!list.length) {
    if (required === false) return '';
    throw new Error(`Thiếu ảnh ${baseName}.`);
  }
  if (limit > 0 && list.length > limit) throw new Error(`${baseName} chỉ được tải tối đa ${limit} ảnh.`);

  return list.map((file, index) => {
    const blob = fileToBlob_(file);
    const extension = getExtension_(file.name, blob.getContentType());
    const savedFile = folder.createFile(blob).setName(`${safeFileName_(hoVaTen)} ${baseName} ${index + 1}.${extension}`);
    return savedFile.getUrl();
  }).join(', ');
}

function saveHocBaFiles_(folder, filesForField, hoVaTen) {
  const list = filesForField || [];
  if (!list.length) throw new Error('Thiếu file học bạ.');
  const acceptedFiles = list.filter(file => {
    const type = String(file.type || '').toLowerCase();
    return type === 'application/pdf' || type.startsWith('image/');
  });
  if (acceptedFiles.length !== list.length) {
    throw new Error('Học bạ chỉ nhận file PDF hoặc ảnh chụp.');
  }
  return saveFiles_(folder, acceptedFiles, 0, 'Hoc ba', hoVaTen);
}

function fileToBlob_(file) {
  if (!file || !file.bytes) throw new Error('Không đọc được file tải lên.');
  return Utilities.newBlob(Utilities.base64Decode(file.bytes), file.type, file.name);
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

function normalizeSchoolYearKey_(value) {
  const text = String(value || '').trim().replace(/\s+/g, '');
  const match = text.match(/^(20\d{2})-(20\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function getSchoolYearHistoryColumn_(sheet, schoolYear, createIfMissing) {
  const yearKey = normalizeSchoolYearKey_(schoolYear);
  if (!yearKey) return 0;
  const width = Math.max(sheet.getLastColumn(), 56);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  const existingIndex = headers.findIndex(header => normalizeSchoolYearKey_(header) === yearKey);
  if (existingIndex >= 0) return existingIndex + 1;
  if (!createIfMissing) return 0;

  let lastHeaderColumn = 56;
  headers.forEach((header, index) => {
    if (String(header || '').trim()) lastHeaderColumn = Math.max(lastHeaderColumn, index + 1);
  });
  const nextColumn = Math.max(57, lastHeaderColumn + 1);
  sheet.getRange(1, nextColumn).setValue(yearKey);
  return nextColumn;
}

function writeSchoolYearClass_(sheet, rowNumber, schoolYear, className) {
  const yearColumn = getSchoolYearHistoryColumn_(sheet, schoolYear, true);
  if (yearColumn && String(className || '').trim()) {
    sheet.getRange(rowNumber, yearColumn).setValue(String(className).trim());
  }
}

function writeSchoolYearHistory_(sheet, rowNumber, classHistory) {
  Object.entries(classHistory && typeof classHistory === 'object' ? classHistory : {}).forEach(([schoolYear, className]) => {
    writeSchoolYearClass_(sheet, rowNumber, schoolYear, className);
  });
}

function ensureExtraHeaders_(sheet) {
  const fixedHeaders = [
    'Dấu thời gian', 'Họ và tên', 'Ngày sinh', 'Giới tính', 'Mã định danh', 'Số điện thoại', 'Lớp học', 'Năm nhập học',
    'Số nhà / Khu phố', 'Xã / Phường', 'Tỉnh / Thành', 'Số nhà / Khu phố kp', 'Xã / Phường hk', 'Tỉnh / Thành hk',
    'Tên cha', 'Năm sinh cha', 'Nghề nghiệp cha', 'SĐT cha', 'Tên mẹ', 'Năm sinh mẹ', 'Nghề nghiệp mẹ', 'SĐT mẹ',
    'Tình trạng tạm trú', 'Đi xe', 'Link ảnh khai sinh', 'Link học bạ', 'Link ảnh/ ảnh thẻ', 'Link ảnh Căn cước',
    'Học lực lớp 6', 'Hạnh kiểm lớp 6', 'Học lực lớp 7', 'Hạnh kiểm lớp 7', 'Học lực lớp 8', 'Hạnh kiểm lớp 8',
    'Học lực lớp 9', 'Hạnh kiểm lớp 9', 'Năm bỏ học', 'Trạng thái xử lý', 'Ghi chú xử lý', 'Tinh noi sinh',
    'Huyen noi sinh', 'Xa noi sinh', 'Noi sinh day du', 'Tinh dang ky khai sinh', 'Huyen dang ky khai sinh',
    'Xa dang ky khai sinh', 'Tinh que quan', 'Huyen que quan', 'Xa que quan', 'Ma hoc sinh', 'Khối hiện tại',
    'Lớp hiện tại', 'Năm học hiện tại', 'Cơ sở đăng ký', 'Mã cơ sở', 'Hậu tố lớp'
  ];
  const current = sheet.getRange(1, 1, 1, fixedHeaders.length).getValues()[0];
  if (fixedHeaders.some((header, index) => current[index] !== header)) {
    sheet.getRange(1, 1, 1, fixedHeaders.length).setValues([fixedHeaders]);
  }
}
