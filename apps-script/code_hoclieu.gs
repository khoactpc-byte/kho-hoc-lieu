var APPKHOBAI_GEMINI_API_KEY = "";
var APPKHOBAI_DATA_SPREADSHEET_ID = "1oIGnM9Dw_3bUl8xfTKYE0XKsBvJWHb-J7qvD11fDcMM";
var APPKHOBAI_GEMINI_KEY_SHEET_NAME = "key gemini";
var APPKHOBAI_DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
var APPKHOBAI_ALLOWED_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-lite"
];
var APPKHOBAI_MAX_AI_FILE_BYTES = 20 * 1024 * 1024;
var APPKHOBAI_MASTER_DRIVE_FOLDER_ID = "1Cl_WOAr09kXsmL3pBRnbQS49vt1ya7DK";
var APPKHOBAI_QUIZ_DRIVE_FOLDER_ID = '1IlstZlmh3uC_PIooSlMfHnZ--HlomM0d';
var APPKHOBAI_IMAGE_DRIVE_FOLDER_ID = "1AnglegF_ekb6d1Tvtqi8WZjKgZ4l32Xk";
var APPKHOBAI_STUDENT_SUBMISSION_FOLDER_ID = "1Sn1wmYiuW4P0IzhOWfWDyhf2BW4IGQFk";
var APPKHOBAI_STUDENT_MAILBOX_FOLDER_ID = "1mdDD9kK_s_o2YytkUbqM0MH-T9HR9XXE";
var APPKHOBAI_BACKUP_FOLDER_NAME = "SAO LUU HE THONG";
var APPKHOBAI_AUDIT_SHEET_NAME = "NHAT KY HOAT DONG";
var APPKHOBAI_STUDENT_MAILBOX_SHEET_NAME = "HOP THU HOC SINH";
var APPKHOBAI_STUDENT_MAILBOX_HEADERS = ["ID", "CREATED_AT", "SCHOOL_YEAR", "RECIPIENT_TYPE", "RECIPIENT_VALUE", "RECIPIENT_LABEL", "CATEGORY", "TITLE", "BODY", "LINK_URL", "READ_BY", "SENDER"];
var APPKHOBAI_SCRIPT_VERSION = "2026-10-04-review-v8";

var APPKHOBAI_ADMIN_SESSION_SECONDS = 21600;
var APPKHOBAI_TEACHER_ACCOUNTS_SHEET = "TEACHER_ACCOUNTS";
var APPKHOBAI_TEACHER_ACCOUNT_HEADERS = ["ID", "USERNAME", "FULL_NAME", "SCHOOL_CODE", "GRADES_JSON", "SUBJECTS_JSON", "PASSWORD_SALT", "PASSWORD_HASH", "IS_ACTIVE", "CREATED_AT", "UPDATED_AT", "SESSION_VERSION"];
var APPKHOBAI_TEACHER_GRADES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
var APPKHOBAI_TEACHER_SUBJECTS = ["Toán", "Ngữ Văn", "Khoa học tự nhiên", "Lịch sử & Địa Lý", "Giáo dục công dân", "Giáo dục địa phương", "Công nghệ", "HĐTT", "Chủ nhiệm"];

function getSecurityProperty_(key) {
  return String(PropertiesService.getScriptProperties().getProperty(key) || "").trim();
}

function requireClientToken_(data) {
  var expected = getSecurityProperty_("APP_CLIENT_TOKEN");
  if (!expected) throw new Error("Chua cau hinh APP_CLIENT_TOKEN trong Script Properties.");
  if (String(data.clientToken || data.secretToken || "") !== expected) {
    throw new Error("Tu choi truy cap: ma ket noi khong hop le.");
  }
}

function requireAdminSession_(data) {
  var token = String(data.adminSessionToken || "").trim();
  if (!token || CacheService.getScriptCache().get("staff-session:" + token) !== "admin" || !staffSessionCurrent_(token)) {
    throw new Error("Phien admin da het han hoac khong hop le. Hay dang nhap lai.");
  }
}

function staffSessionCurrent_(token) {
  var cache = CacheService.getScriptCache();
  var version = String(PropertiesService.getScriptProperties().getProperty('STAFF_SESSION_VERSION') || '1');
  return cache.get('staff-session-version:' + token) === version && Number(cache.get('staff-session-expiry:' + token) || 0) > Date.now();
}
function revokeStaffSessions_() {
  var properties = PropertiesService.getScriptProperties();
  properties.setProperty('STAFF_SESSION_VERSION', String(Number(properties.getProperty('STAFF_SESSION_VERSION') || 1) + 1));
}

function getStaffSessionRole_(data) {
  var adminToken = String(data.adminSessionToken || "").trim();
  if (adminToken && CacheService.getScriptCache().get("staff-session:" + adminToken) === "admin" && staffSessionCurrent_(adminToken)) return "admin";
  var staffToken = String(data.staffSessionToken || "").trim();
  if (!staffToken) return "";
  var cachedSession = String(CacheService.getScriptCache().get("staff-session:" + staffToken) || "");
  try {
    var parsedSession = JSON.parse(cachedSession);
    if (parsedSession.role === "teacher") return getTeacherSessionProfile_(data) ? "teacher" : "";
    return staffSessionCurrent_(staffToken) ? String(parsedSession.role || "") : '';
  } catch (error) {
    return staffSessionCurrent_(staffToken) ? cachedSession : '';
  }
}

function getTeacherSessionProfile_(data) {
  var token = String(data.staffSessionToken || '').trim();
  if (!token) return null;
  var session;
  try { session = JSON.parse(CacheService.getScriptCache().get('staff-session:' + token) || 'null'); } catch (error) { return null; }
  if (!session || session.role !== 'teacher' || !(session.expiresAt > Date.now())) return null;
  var sheet = getTeacherAccountsSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length).getValues() : [];
  var account = rows.find(function(row) { return String(row[0]) === session.teacherId; });
  if (!account || account[8] === false || String(account[8]).toLowerCase() === 'false'
    || (Number(account[11]) || 1) !== (Number(session.sessionVersion) || 1)) throw new Error('Tài khoản hoặc phân công đã đổi. Đăng nhập lại.');
  session.schoolCode = String(account[3]); session.grades = safeJsonArray_(account[4]); session.subjects = safeJsonArray_(account[5]);
  return session;
}

function getTeacherAccountsSheet_() {
  var spreadsheet = SpreadsheetApp.openById(APPKHOBAI_DATA_SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(APPKHOBAI_TEACHER_ACCOUNTS_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(APPKHOBAI_TEACHER_ACCOUNTS_SHEET);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length).setValues([APPKHOBAI_TEACHER_ACCOUNT_HEADERS]);
  else if (String(sheet.getRange(1, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length).getValue() || "") !== "SESSION_VERSION") {
    sheet.getRange(1, 1, 1, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length).setValues([APPKHOBAI_TEACHER_ACCOUNT_HEADERS]);
    if (sheet.getLastRow() > 1) {
      var versions = Array.from({ length: sheet.getLastRow() - 1 }, function() { return [1]; });
      sheet.getRange(2, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length, versions.length, 1).setValues(versions);
    }
  }
  return sheet;
}

function getTeacherPasswordPepper_() {
  var properties = PropertiesService.getScriptProperties();
  var pepper = String(properties.getProperty("APP_TEACHER_PASSWORD_PEPPER") || "").trim();
  if (!pepper) {
    pepper = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty("APP_TEACHER_PASSWORD_PEPPER", pepper);
  }
  return pepper;
}

function hashTeacherPassword_(salt, password) {
  var pepper = getTeacherPasswordPepper_();
  var digest = Utilities.computeHmacSha256Signature(String(salt) + ":" + String(password), pepper, Utilities.Charset.UTF_8);
  for (var round = 0; round < 2000; round++) {
    digest = Utilities.computeHmacSha256Signature(digest, pepper, Utilities.Charset.UTF_8);
  }
  return digest.map(function(byte) { return ("0" + ((byte + 256) % 256).toString(16)).slice(-2); }).join("");
}

function normalizeTeacherAccountScopes_(data) {
  var schoolCode = String(data.schoolCode || "").trim().toUpperCase();
  if (["NAN", "TQK"].indexOf(schoolCode) < 0) throw new Error("Vui lòng chọn đúng cơ sở giảng dạy.");
  var grades = Array.from(new Set((Array.isArray(data.grades) ? data.grades : []).map(function(item) { return String(item); }).filter(function(item) { return APPKHOBAI_TEACHER_GRADES.indexOf(item) >= 0; })));
  var subjects = Array.from(new Set((Array.isArray(data.subjects) ? data.subjects : []).map(function(item) { return String(item).trim(); }).filter(function(item) { return APPKHOBAI_TEACHER_SUBJECTS.indexOf(item) >= 0; })));
  if (!grades.length || !subjects.length) throw new Error("Mỗi tài khoản cần ít nhất một khối và một môn được phân công.");
  return { schoolCode: schoolCode, grades: grades, subjects: subjects };
}

function listTeacherAccounts_(data) {
  requireAdminSession_(data);
  var sheet = getTeacherAccountsSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length).getValues() : [];
  return json_({
    status: "success",
    accounts: rows.filter(function(row) { return row[0]; }).map(function(row) {
      return {
        id: String(row[0] || ""),
        username: String(row[1] || ""),
        fullName: String(row[2] || ""),
        schoolCode: String(row[3] || ""),
        grades: safeJsonArray_(row[4]),
        subjects: safeJsonArray_(row[5]),
        isActive: row[8] !== false && String(row[8]).toLowerCase() !== "false",
        createdAt: Number(row[9]) || 0,
        updatedAt: Number(row[10]) || 0
      };
    })
  });
}

function safeJsonArray_(value) {
  try {
    var parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveTeacherAccount_(data) {
  requireAdminSession_(data);
  var username = String(data.username || "").trim().toLowerCase();
  var fullName = String(data.fullName || "").trim();
  var password = String(data.password || "");
  if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(username)) throw new Error("Tên đăng nhập cần 1–40 ký tự: chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.");
  if (!fullName || fullName.length > 120 || /^[=+@-]/.test(fullName)) throw new Error("Vui lòng nhập họ tên hợp lệ (tối đa 120 ký tự).");
  if (password.length > 256) throw new Error("Mật khẩu không được vượt quá 256 ký tự.");
  var scopes = normalizeTeacherAccountScopes_(data);
  var sheet = getTeacherAccountsSheet_();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length).getValues() : [];
    var accountId = String(data.id || "").trim();
    var rowIndex = rows.findIndex(function(row) { return String(row[0] || "") === accountId; });
    var duplicate = rows.some(function(row, index) { return index !== rowIndex && String(row[1] || "").trim().toLowerCase() === username; });
    if (duplicate) throw new Error("Tên đăng nhập này đã được sử dụng.");
    var existing = rowIndex >= 0 ? rows[rowIndex] : null;
    if (!existing && password.length < 6) throw new Error("Mật khẩu tài khoản mới cần ít nhất 6 ký tự.");
    if (password && password.length < 6) throw new Error("Mật khẩu cần ít nhất 6 ký tự.");
    var salt = existing ? String(existing[6] || "") : "";
    var passwordHash = existing ? String(existing[7] || "") : "";
    if (password) {
      salt = Utilities.getUuid() + Utilities.getUuid();
      passwordHash = hashTeacherPassword_(salt, password);
    }
    var now = Date.now();
    var sessionVersion = existing ? (Number(existing[11]) || 1) + 1 : 1;
    var row = [
      accountId || Utilities.getUuid(), username, fullName, scopes.schoolCode,
      JSON.stringify(scopes.grades), JSON.stringify(scopes.subjects), salt, passwordHash,
      typeof data.isActive === "boolean" ? data.isActive : (existing ? existing[8] !== false && String(existing[8]).toLowerCase() !== "false" : true),
      existing ? Number(existing[9]) || now : now, now, sessionVersion
    ];
    if (rowIndex >= 0) sheet.getRange(rowIndex + 2, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    appendAuditLog_(existing ? "cap_nhat_tai_khoan_giao_vien" : "tao_tai_khoan_giao_vien", data, { username: username, schoolCode: scopes.schoolCode, grades: scopes.grades, subjects: scopes.subjects });
    return json_({ status: "success", account: { id: row[0], username: username, fullName: fullName, schoolCode: scopes.schoolCode, grades: scopes.grades, subjects: scopes.subjects, isActive: row[8] } });
  } finally {
    lock.releaseLock();
  }
}

function setTeacherAccountStatus_(data) {
  requireAdminSession_(data);
  var id = String(data.id || "").trim();
  if (!id) throw new Error("Thiếu mã tài khoản giáo viên.");
  var sheet = getTeacherAccountsSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length).getValues() : [];
  var rowIndex = rows.findIndex(function(row) { return String(row[0] || "") === id; });
  if (rowIndex < 0) throw new Error("Không tìm thấy tài khoản giáo viên.");
  var isActive = data.isActive === true;
  sheet.getRange(rowIndex + 2, 9).setValue(isActive);
  sheet.getRange(rowIndex + 2, 11).setValue(Date.now());
  sheet.getRange(rowIndex + 2, 12).setValue((Number(rows[rowIndex][11]) || 1) + 1);
  appendAuditLog_(isActive ? "kich_hoat_tai_khoan_giao_vien" : "khoa_tai_khoan_giao_vien", data, { username: String(rows[rowIndex][1] || "") });
  return json_({ status: "success", id: id, isActive: isActive });
}

function createTeacherAccountSession_(data) {
  var username = String(data.username || "").trim().toLowerCase();
  var password = String(data.password || "");
  if (!username || !password) throw new Error("Nhập tên đăng nhập và mật khẩu giáo viên.");
  if (password.length > 256) throw new Error("Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.");
  var cache = CacheService.getScriptCache();
  var attemptKey = "teacher-login-attempts:" + username;
  var attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= 10) throw new Error("Đăng nhập tạm khóa do thử sai nhiều lần. Vui lòng thử lại sau 15 phút.");
  var sheet = getTeacherAccountsSheet_();
  var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length).getValues() : [];
  var row = rows.find(function(item) { return String(item[1] || "").trim().toLowerCase() === username; });
  if (!row || row[8] === false || String(row[8]).toLowerCase() === "false" || !row[6] || !row[7]) {
    cache.put(attemptKey, String(attempts + 1), 900);
    throw new Error("Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.");
  }
  var passwordHash = hashTeacherPassword_(String(row[6]), password);
  if (passwordHash !== String(row[7])) {
    cache.put(attemptKey, String(attempts + 1), 900);
    throw new Error("Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.");
  }
  cache.remove(attemptKey);
  var profile = {
    role: "teacher",
    teacherId: String(row[0]),
    username: String(row[1]),
    fullName: String(row[2]),
    schoolCode: String(row[3]),
    grades: safeJsonArray_(row[4]),
    subjects: safeJsonArray_(row[5]),
    sessionVersion: Number(row[11]) || 1
  };
  profile.expiresAt = Date.now() + APPKHOBAI_ADMIN_SESSION_SECONDS * 1000;
  var token = Utilities.getUuid() + Utilities.getUuid();
  cache.put("staff-session:" + token, JSON.stringify(profile), APPKHOBAI_ADMIN_SESSION_SECONDS);
  return json_({ status: "success", staffSessionToken: token, role: "teacher", teacherProfile: profile, expiresIn: APPKHOBAI_ADMIN_SESSION_SECONDS });
}

function requireTeacherContentScope_(data) {
  var profile = getTeacherSessionProfile_(data);
  if (!profile) throw new Error("Cần phiên giáo viên hợp lệ để tải nội dung.");
  var accountsSheet = getTeacherAccountsSheet_();
  var accounts = accountsSheet.getLastRow() > 1
    ? accountsSheet.getRange(2, 1, accountsSheet.getLastRow() - 1, APPKHOBAI_TEACHER_ACCOUNT_HEADERS.length).getValues()
    : [];
  var currentAccount = accounts.find(function(row) { return String(row[0] || "") === profile.teacherId; });
  if (!currentAccount || currentAccount[8] === false || String(currentAccount[8]).toLowerCase() === "false") {
    throw new Error("Tài khoản giáo viên đã bị khóa hoặc không còn tồn tại.");
  }
  if ((Number(currentAccount[11]) || 1) !== (Number(profile.sessionVersion) || 1)) {
    throw new Error("Phân công hoặc trạng thái tài khoản đã thay đổi. Vui lòng đăng nhập lại.");
  }
  profile.schoolCode = String(currentAccount[3] || "").toUpperCase();
  profile.grades = safeJsonArray_(currentAccount[4]);
  profile.subjects = safeJsonArray_(currentAccount[5]);
  var grade = String(data.grade || "").trim();
  var subject = String(data.subject || "").trim();
  var schoolCode = String(data.schoolCode || "").trim().toUpperCase();
  if (schoolCode !== profile.schoolCode || profile.grades.indexOf(grade) < 0 || profile.subjects.indexOf(subject) < 0) {
    throw new Error("Tài khoản giáo viên không được phân công cơ sở, khối hoặc môn này.");
  }
  return profile;
}

function requireTeacherDriveFileScope_(data) {
  var profile = requireTeacherContentScope_(data);
  var file = DriveApp.getFileById(String(data.fileId || ""));
  var filename = String(file.getName() || "");
  var campusPrefix = "[" + profile.schoolCode + "]_";
  var campusMatches = filename.indexOf(campusPrefix) === 0
    || (profile.schoolCode === "NAN" && filename.indexOf("[TQK]_") !== 0);
  var gradeSubjectMarker = "_K" + String(data.grade) + "_" + String(data.subject);
  var planMarker = "_[K" + String(data.grade) + "]_[" + String(data.subject) + "]";
  if (!campusMatches || (filename.indexOf(gradeSubjectMarker) < 0 && filename.indexOf(planMarker) < 0)) {
    throw new Error("Tài khoản giáo viên không có quyền thao tác tệp này.");
  }
  return file;
}

function requireTeacherStudentSubmissionFileScope_(data) {
  var profile = requireTeacherContentScope_(data);
  var file = DriveApp.getFileById(String(data.fileId || ""));
  var parents = file.getParents();
  var isStudentSubmission = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === APPKHOBAI_STUDENT_SUBMISSION_FOLDER_ID) isStudentSubmission = true;
  }
  var filename = String(file.getName() || "");
  var campusMatches = filename.indexOf("[" + profile.schoolCode + "]_") === 0
    || (profile.schoolCode === "NAN" && filename.indexOf("[TQK]_") !== 0);
  var gradeSubjectMarker = "_[K" + String(data.grade) + "]_[" + String(data.subject) + "]";
  if (!isStudentSubmission || !campusMatches || filename.indexOf(gradeSubjectMarker) < 0) {
    throw new Error("Tài khoản giáo viên không có quyền xem bài nộp này.");
  }
  return file;
}

function requireStaffSession_(data, allowedRoles) {
  var role = getStaffSessionRole_(data);
  if (role === "teacher") getTeacherSessionProfile_(data);
  var allowed = allowedRoles || ["admin", "teacher", "thd"];
  if (allowed.indexOf(role) === -1) {
    throw new Error("Phien nhan su da het han hoac khong co quyen thuc hien thao tac nay. Hay dang nhap lai.");
  }
  return role;
}

function createStaffSessionToken_(role) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put("staff-session:" + token, role, APPKHOBAI_ADMIN_SESSION_SECONDS);
  CacheService.getScriptCache().put("staff-session-expiry:" + token, String(Date.now() + APPKHOBAI_ADMIN_SESSION_SECONDS * 1000), APPKHOBAI_ADMIN_SESSION_SECONDS);
  CacheService.getScriptCache().put('staff-session-version:' + token, String(PropertiesService.getScriptProperties().getProperty('STAFF_SESSION_VERSION') || '1'), APPKHOBAI_ADMIN_SESSION_SECONDS);
  return token;
}

function handleCreateAdminSession_(data) {
  recordLoginAttempt_("admin");
  var expectedPassword = getSecurityProperty_("APP_ADMIN_PASSWORD");
  if (!expectedPassword) throw new Error("Chua cau hinh APP_ADMIN_PASSWORD trong Script Properties.");
  if (String(data.password || "") !== expectedPassword) throw new Error("Mat khau admin khong chinh xac.");
  var token = createStaffSessionToken_("admin");
  CacheService.getScriptCache().remove('login-attempt:admin');
  return json_({ status: "success", adminSessionToken: token, expiresIn: APPKHOBAI_ADMIN_SESSION_SECONDS });
}

function handleCreateStaffSession_(data) {
  var role = String(data.role || "").trim().toLowerCase();
  if (role !== "teacher" && role !== "thd") throw new Error("Vai tro nhan su khong hop le.");
  if (role === "teacher") return createTeacherAccountSession_(data);
  recordLoginAttempt_("thd");
  var expectedPassword = getSecurityProperty_("APP_THD_PASSWORD");
  if (!expectedPassword) throw new Error("Admin chua cau hinh mat khau cho khu vuc nay.");
  if (String(data.password || "") !== expectedPassword) throw new Error("Mat khau khong chinh xac.");
  CacheService.getScriptCache().remove('login-attempt:thd');
  return json_({ status: "success", staffSessionToken: createStaffSessionToken_(role), role: role, expiresIn: APPKHOBAI_ADMIN_SESSION_SECONDS });
}

function handleGetAccessConfig_() {
  return json_({
    status: "success",
    thdPasswordConfigured: Boolean(getSecurityProperty_("APP_THD_PASSWORD"))
  });
}

function handleUpdateAccessConfig_(data) {
  requireAdminSession_(data);
  var properties = PropertiesService.getScriptProperties();
  if (Object.prototype.hasOwnProperty.call(data, "thdPassword")) {
    var thdPassword = String(data.thdPassword || "");
    if (thdPassword && thdPassword.length < 8) throw new Error("Mat khau Tran Hung Dao phai co it nhat 8 ky tu.");
    if (thdPassword) { properties.setProperty("APP_THD_PASSWORD", thdPassword); revokeStaffSessions_(); }
  }
  appendAuditLog_("doi_cau_hinh_truy_cap", data, {
    changedThdPassword: Object.prototype.hasOwnProperty.call(data, "thdPassword")
  });
  return handleGetAccessConfig_();
}

function handleChangeAdminPassword_(data) {
  requireAdminSession_(data);
  var nextPassword = String(data.newPassword || "");
  if (nextPassword.length < 8) throw new Error("Mat khau admin moi phai co it nhat 8 ky tu.");
  PropertiesService.getScriptProperties().setProperty("APP_ADMIN_PASSWORD", nextPassword);
  revokeStaffSessions_();
  appendAuditLog_("doi_mat_khau_admin", data, {});
  return json_({ status: "success" });
}

// Hàm giúp kiểm tra kết nối Web App.
function doGet(e) {
  return ContentService.createTextOutput("KET NOI MAY CHU THANH CONG. Version: " + APPKHOBAI_SCRIPT_VERSION);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || "{}");

    requireClientToken_(data);
    if (data.action === 'getSessionIdentity') return handleGetSessionIdentity_(data);
    if (data.action === 'createVerifiedStudentSession') return createVerifiedStudentSession_(data);
    if (data.action === 'createStudentSession') return createStudentSession_(data);
    if (data.action === 'createUploadPermit') return createUploadPermit_(data);
    if (data.action === 'verifyStudentUpload') return verifyStudentUpload_(data);
    if (data.action === 'registrationAdminAction') return handleRegistrationAdminAction_(data);

    if (data.action === "createAdminSession") {
      return handleCreateAdminSession_(data);
    }

    if (data.action === "createStaffSession") {
      return handleCreateStaffSession_(data);
    }

    if (data.action === "getAccessConfig") {
      return handleGetAccessConfig_();
    }

    if (data.action === "updateAccessConfig") {
      return handleUpdateAccessConfig_(data);
    }

    if (data.action === "changeAdminPassword") {
      return handleChangeAdminPassword_(data);
    }

    if (data.action === "validateAdminSession") {
      requireAdminSession_(data);
      return json_({ status: "success" });
    }

    if (data.action === "listTeacherAccounts") {
      return listTeacherAccounts_(data);
    }

    if (data.action === "saveTeacherAccount") {
      return saveTeacherAccount_(data);
    }

    if (data.action === "setTeacherAccountStatus") {
      return setTeacherAccountStatus_(data);
    }

    // 1. GỌI AI
    if (data.action === "gemini") {
      var geminiRole = requireStaffSession_(data);
      if (geminiRole === "teacher" && data.fileId) requireTeacherDriveFileScope_(data);
      return handleGeminiProxy_(data);
    }

    if (data.action === "askAI" || data.action === "gradeStudentWork") {
      var aiRole = requireStaffSession_(data);
      if (aiRole === "teacher" && data.fileId) {
        if (data.action === "gradeStudentWork" || data.mode === "gradeStudentWork") requireTeacherStudentSubmissionFileScope_(data);
        else requireTeacherDriveFileScope_(data);
      }
      if (data.action === "gradeStudentWork") data.mode = "gradeStudentWork";
      return handleAskAI_(data);
    }

    // 2. ẨN FILE / ĐỔI TÊN KHỎI KHO CHUNG
    if (data.action === "deleteFile" || data.action === "rename") {
      var fileRole = requireStaffSession_(data);
      var fileToHide = fileRole === "teacher" ? requireTeacherDriveFileScope_(data) : DriveApp.getFileById(data.fileId);
      if (fileToHide.getName().indexOf("[CHO_XOA] ") !== 0) {
        fileToHide.setName("[CHO_XOA] " + fileToHide.getName());
      }
      return json_({ status: "success" });
    }

    // 3. TAO GOOGLE DOC DEP TU NOI DUNG HTML BAI KIEM TRA
    if (data.action === "createGoogleDocFromHtml") {
      var docRole = requireStaffSession_(data);
      if (docRole === "teacher") requireTeacherContentScope_(data);
      data.archiveAudience = 'teacher';
      return handleCreateGoogleDocFromHtml_(data);
    }
    if (data.action === 'createStudentQuizDocFromHtml') {
      requireIdentityBridge_(data);
      data.archiveAudience = 'student';
      return handleCreateGoogleDocFromHtml_(data);
    }
    if (data.action === 'auditQuizDocSharing') {
      requireAdminSession_(data);
      return auditQuizDocSharing_(data);
    }

    // --- BƯỚC CHẶN 2: CHỐNG BƠM RÁC VÀO KHO DRIVE CHUNG ---
    if (data.action === "createStudentListPdf") {
      requireStaffSession_(data, ["admin"]);
      return handleCreateStudentListPdf_(data);
    }

    if (data.action === "createStudentListSheet") {
      requireStaffSession_(data, ["admin"]);
      return handleCreateStudentListSheet_(data);
    }

    if (data.action === "sendStudentMailboxMessage") {
      requireAdminSession_(data);
      return handleSendStudentMailboxMessage_(data);
    }

    if (data.action === "getStudentMailboxMessages") {
      return handleGetStudentMailboxMessages_(data);
    }

    if (data.action === "markStudentMailboxMessageRead") {
      return handleMarkStudentMailboxMessageRead_(data);
    }

    if (data.action === "deleteStudentMailboxMessages") {
      requireAdminSession_(data);
      return handleDeleteStudentMailboxMessages_(data);
    }

    if (data.action === "listAdminMailboxMessages") {
      requireAdminSession_(data);
      return handleListAdminMailboxMessages_(data);
    }

    if (data.action === "deleteStudentMailboxMessage") {
      requireAdminSession_(data);
      return handleDeleteStudentMailboxMessage_(data);
    }

    if (data.action === "resendStudentMailboxMessage") {
      requireAdminSession_(data);
      return handleResendStudentMailboxMessage_(data);
    }

    if (data.action === "createSystemBackup") {
      requireAdminSession_(data);
      return handleCreateSystemBackup_(data);
    }

    if (data.action === "listSystemBackups") {
      requireAdminSession_(data);
      return handleListSystemBackups_();
    }

    if (data.action === "getSystemBackup") {
      requireAdminSession_(data);
      return handleGetSystemBackup_(data);
    }

    if (data.action === "restoreMailboxFromBackup") {
      requireAdminSession_(data);
      return handleRestoreMailboxFromBackup_(data);
    }

    if (data.action === "listAuditLogs") {
      requireAdminSession_(data);
      return handleListAuditLogs_(data);
    }

    if (data.action === "writeAuditLog") {
      requireStaffSession_(data);
      appendAuditLog_(String(data.auditAction || "hoat_dong"), data, data.details || {});
      return json_({ status: "success" });
    }

    if (!data.base64) {
      return json_({
        status: "error",
        message: "Apps Script da nhan request nhung khong dung action hoac thieu base64. version=" + APPKHOBAI_SCRIPT_VERSION + ", action=" + (data.action || "(trong)")
      });
    }

    if (data.base64 && data.base64.length > 35000000) { // Giới hạn tầm 25MB sau mã hóa
      return json_({ status: "error", message: "Từ chối: File tải lên vượt quá giới hạn dung lượng." });
    }

    // 4. UPLOAD FILE CHUNG
    var folderId = data.folderId || APPKHOBAI_MASTER_DRIVE_FOLDER_ID;
    var uploadRole = getStaffSessionRole_(data);
    if (uploadRole === "teacher" && folderId !== APPKHOBAI_STUDENT_SUBMISSION_FOLDER_ID
      && !(folderId === APPKHOBAI_IMAGE_DRIVE_FOLDER_ID && data.contentType === "news")) {
      requireTeacherContentScope_(data);
    }
    var publicUploadFolders = [APPKHOBAI_IMAGE_DRIVE_FOLDER_ID, APPKHOBAI_STUDENT_SUBMISSION_FOLDER_ID];
    if (publicUploadFolders.indexOf(folderId) === -1) requireStaffSession_(data);
    if (publicUploadFolders.indexOf(folderId) >= 0 && !uploadRole) consumeUploadPermit_(data, folderId);
    var folder = DriveApp.getFolderById(folderId);
    var decodedData = Utilities.base64Decode(data.base64);
    var uniqueFilename = getUniqueFileName_(folder, data.filename);
    var newFile = folder.createFile(Utilities.newBlob(decodedData, data.mimeType, uniqueFilename));
    
    try {
      newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareError) {}

    var uploadReceipt = '';
    if (!uploadRole && folderId === APPKHOBAI_STUDENT_SUBMISSION_FOLDER_ID) {
      var uploadStudent = requireStudentSession_(data);
      uploadReceipt = Utilities.getUuid();
      CacheService.getScriptCache().put('student-upload:' + uploadReceipt, JSON.stringify({ studentId: uploadStudent.id || '', accessCode: uploadStudent.accessCode,
        fileId: newFile.getId(), fileName: uniqueFilename, fileUrl: newFile.getUrl(), mimeType: data.mimeType, fileSize: decodedData.length }), 21600);
    }
    return json_({ status: "success", url: newFile.getUrl(), fileId: newFile.getId(), filename: uniqueFilename, uploadReceipt: uploadReceipt });
  } catch (error) {
    return json_({ status: "error", message: cleanErrorForClient_(error) });
  }
}

// --- TỐI ƯU HIỆU SUẤT: ĐỔI VÒNG LẶP (WHILE) THÀNH THỜI GIAN THỰC (TIMESTAMP) ---
function getUniqueFileName_(folder, filename) {
  var original = String(filename || "tai-lieu").trim();
  var dotIndex = original.lastIndexOf(".");
  var baseName = dotIndex > 0 ? original.substring(0, dotIndex) : original;
  var extension = dotIndex > 0 ? original.substring(dotIndex) : "";
  
  // Dùng thời gian mili-giây để tên file luôn là duy nhất, không cần Google Drive quét đếm số nữa
  var timestamp = new Date().getTime(); 
  return baseName + "_" + timestamp + extension;
}

function verifyStudentUpload_(data) {
  requireIdentityBridge_(data);
  var raw = CacheService.getScriptCache().get('student-upload:' + String(data.uploadReceipt || ''));
  var receipt = raw ? JSON.parse(raw) : null;
  if (!receipt || receipt.fileId !== data.fileId || receipt.accessCode !== data.accessCode || receipt.studentId && receipt.studentId !== data.studentId) throw new Error('Tệp không thuộc lượt tải của học sinh hoặc đã hết hạn.');
  return json_({ status: 'success', file: receipt });
}

// --- CÁC HÀM XỬ LÝ AI CỦA THẦY ĐƯỢC GIỮ NGUYÊN HOÀN TOÀN ---

function handleAskAI_(data) {
  if (!data.fileId) throw new Error("Thieu fileId.");

  var file = DriveApp.getFileById(data.fileId);
  var prepared = prepareFileForAI_(file);

  if (prepared.bytes.length > APPKHOBAI_MAX_AI_FILE_BYTES) {
    throw new Error("File lon hon 20MB sau khi chuan bi. Hay tach file nho hon hoac tai len tai lieu ngan gon hon.");
  }

  var modelOrder = getGeminiModelOrder_(data.model);
  var resultInfo = callGeminiWithFileFallback_(data.prompt || "", prepared, modelOrder, data.mode || "", data);

  return json_({
    status: "success",
    result: resultInfo.result,
    fileName: prepared.name,
    mimeType: prepared.mimeType,
    model: resultInfo.model,
    keySource: resultInfo.keySource || null
  });
}

function handleGeminiProxy_(data) {
  var contents = Array.isArray(data.contents) ? data.contents : [];
  if (!contents.length) throw new Error("Thieu noi dung de goi Gemini.");

  var payload = {
    contents: contents,
    generationConfig: data.generationConfig || { temperature: 0.35, maxOutputTokens: 4096 }
  };
  if (data.systemInstruction) payload.systemInstruction = data.systemInstruction;

  var resultInfo = callGeminiPayloadFallback_(payload, getGeminiModelOrder_(data.modelId || data.model), data);
  var text = extractGeminiText_(resultInfo.response);
  return json_({
    status: "success",
    model: resultInfo.model,
    text: text,
    result: text,
    candidates: resultInfo.response.candidates || [],
    promptFeedback: resultInfo.response.promptFeedback || null,
    keySource: resultInfo.keySource || null
  });
}

function callGeminiPayloadFallback_(payload, modelOrder, requestContext) {
  var lastError = "";
  var errors = [];
  var quotaModels = [];
  var keyCandidates = getGeminiKeyCandidates_(requestContext || {});
  for (var keyIndex = 0; keyIndex < keyCandidates.length; keyIndex++) {
    var keyInfo = keyCandidates[keyIndex];
    for (var i = 0; i < modelOrder.length; i++) {
      try {
        var response = callGeminiPayload_(payload, modelOrder[i], keyInfo.apiKey);
        markGeminiKeyUsed_(keyInfo);
        return { response: response, model: modelOrder[i], keySource: getGeminiKeySource_(keyInfo) };
      } catch (error) {
        lastError = error.message || String(error);
        errors.push((keyInfo.label || "key") + " / " + modelOrder[i] + ": " + compactText_(lastError, 180));
        markGeminiKeyError_(keyInfo, lastError);
        if (isQuotaErrorText_(lastError)) quotaModels.push(modelOrder[i]);
      }
    }
  }
  if (quotaModels.length === modelOrder.length && modelOrder.length > 0) {
    throw new Error("Gemini dang het han muc su dung cho tat ca model da thu (" + modelOrder.join(", ") + "). Hay doi API key con quota, nang/gia han billing trong Google AI Studio, hoac thu lai sau it phut. Neu moi doi key, cap nhat Apps Script roi Deploy lai.");
  }
  throw new Error(compactText_(lastError || ("Tat ca key/model Gemini deu chua dung duoc. " + errors.join(" | ")), 900));
}

function callGeminiPayload_(payload, model, apiKey) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(apiKey);
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var text = response.getContentText();
  if (response.getResponseCode() >= 300) throw new Error(formatGeminiHttpError_(response.getResponseCode(), text, model, "tao noi dung"));

  var json = JSON.parse(text);
  if (json.error) throw new Error("Loi tu AI: " + json.error.message);
  return json;
}

function extractGeminiText_(json) {
  try {
    var candidates = json.candidates || [];
    var parts = candidates[0] && candidates[0].content && candidates[0].content.parts ? candidates[0].content.parts : [];
    var text = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && parts[i].text) text.push(parts[i].text);
    }
    return text.join("\n");
  } catch (error) {
    return "";
  }
}

function getGeminiModelOrder_(requestedModel) {
  var model = String(requestedModel || APPKHOBAI_DEFAULT_GEMINI_MODEL).trim();
  if (APPKHOBAI_ALLOWED_GEMINI_MODELS.indexOf(model) === -1) {
    model = APPKHOBAI_DEFAULT_GEMINI_MODEL;
  }
  var order = [model];
  for (var i = 0; i < APPKHOBAI_ALLOWED_GEMINI_MODELS.length; i++) {
    if (APPKHOBAI_ALLOWED_GEMINI_MODELS[i] !== model) order.push(APPKHOBAI_ALLOWED_GEMINI_MODELS[i]);
  }
  return order;
}

function prepareFileForAI_(file) {
  var originalMimeType = file.getMimeType();
  var name = file.getName();
  var blob;
  var mimeType;

  if (
    originalMimeType === MimeType.GOOGLE_DOCS ||
    originalMimeType === MimeType.GOOGLE_SLIDES ||
    originalMimeType === MimeType.GOOGLE_SHEETS
  ) {
    blob = file.getAs("application/pdf");
    mimeType = "application/pdf";
    name = name + ".pdf";
  } else {
    blob = file.getBlob();
    mimeType = blob.getContentType() || originalMimeType || "application/octet-stream";

    if (!isGeminiFriendlyMime_(mimeType)) {
      try {
        blob = file.getAs("application/pdf");
        mimeType = "application/pdf";
        name = name.replace(/\.[^/.]+$/, "") + ".pdf";
      } catch (convertError) {
        throw new Error("AI chua doc duoc dinh dang file nay (" + mimeType + "). Hay dung PDF, anh, TXT, DOC Google hoac Slide Google.");
      }
    }
  }

  return { name: name, mimeType: mimeType, bytes: blob.getBytes() };
}

function isGeminiFriendlyMime_(mimeType) {
  return [
    "application/pdf", "text/plain", "text/html", "text/csv", "text/markdown",
    "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"
  ].indexOf(mimeType) !== -1;
}

function uploadGeminiFile_(displayName, mimeType, bytes, apiKey) {
  var startUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + encodeURIComponent(apiKey);
  var startResponse = UrlFetchApp.fetch(startUrl, {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType
    },
    payload: JSON.stringify({ file: { display_name: displayName } }),
    muteHttpExceptions: true
  });

  if (startResponse.getResponseCode() >= 300) {
    throw new Error(formatGeminiHttpError_(startResponse.getResponseCode(), startResponse.getContentText(), "", "khoi tao file"));
  }

  var uploadUrl = getHeader_(startResponse, "x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini khong tra ve upload URL.");

  var uploadResponse = UrlFetchApp.fetch(uploadUrl, {
    method: "post",
    contentType: mimeType,
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    payload: bytes,
    muteHttpExceptions: true
  });

  var uploadText = uploadResponse.getContentText();
  if (uploadResponse.getResponseCode() >= 300) {
    throw new Error(formatGeminiHttpError_(uploadResponse.getResponseCode(), uploadText, "", "nhan file"));
  }

  var uploadJson = JSON.parse(uploadText);
  return uploadJson.file;
}

function callGeminiWithFileFallback_(prompt, prepared, modelOrder, mode, requestContext) {
  var lastError = "";
  var errors = [];
  var quotaModels = [];
  var keyCandidates = getGeminiKeyCandidates_(requestContext || {});
  for (var keyIndex = 0; keyIndex < keyCandidates.length; keyIndex++) {
    var keyInfo = keyCandidates[keyIndex];
    var geminiFile = null;
    try {
      geminiFile = uploadGeminiFile_(prepared.name, prepared.mimeType, prepared.bytes, keyInfo.apiKey);
    } catch (uploadError) {
      lastError = uploadError.message || String(uploadError);
      errors.push((keyInfo.label || "key") + " / upload: " + compactText_(lastError, 180));
      markGeminiKeyError_(keyInfo, lastError);
      continue;
    }
    for (var i = 0; i < modelOrder.length; i++) {
      try {
        var result = callGeminiWithFile_(prompt, prepared, geminiFile, modelOrder[i], mode, keyInfo.apiKey);
        markGeminiKeyUsed_(keyInfo);
        return { result: result, model: modelOrder[i], keySource: getGeminiKeySource_(keyInfo) };
      } catch (error) {
        lastError = error.message || String(error);
        errors.push((keyInfo.label || "key") + " / " + modelOrder[i] + ": " + compactText_(lastError, 180));
        markGeminiKeyError_(keyInfo, lastError);
        if (isQuotaErrorText_(lastError)) quotaModels.push(modelOrder[i]);
      }
    }
  }
  if (quotaModels.length === modelOrder.length && modelOrder.length > 0) {
    throw new Error("Gemini dang het han muc su dung cho tat ca model da thu (" + modelOrder.join(", ") + "). Hay doi API key con quota, nang/gia han billing trong Google AI Studio, hoac thu lai sau it phut. Neu moi doi key, cap nhat Apps Script roi Deploy lai.");
  }
  throw new Error(compactText_(lastError || ("Tat ca key/model Gemini deu chua dung duoc. " + errors.join(" | ")), 900));
}

function callGeminiWithFile_(prompt, prepared, geminiFile, model, mode, apiKey) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(apiKey);
  var isGrading = String(mode || "") === "gradeStudentWork";
  var sysInstruction = isGrading
    ? [
        "Ban la tro ly cham bai cua giao vien Viet Nam.",
        "Hay doc bai lam hoc sinh trong file dinh kem, so sanh voi de bai, dap an va thang diem giao vien cung cap.",
        "Bat buoc cham theo dap an/thang diem cua giao vien. Khong tu tao dap an moi neu giao vien da co dap an.",
        "Neu khong thay dap an/thang diem ro rang, hay ghi can giao vien cham lai va khong tu cho diem.",
        "Chi cham nhap de giao vien duyet lai, khong khang dinh qua muc neu chu viet/anh mo.",
        "Bat buoc tra ve ngan gon theo mau: Diem de xuat: x/10, Nhan xet: ..., Cau dung/chua dung: ...",
        "Khong chao hoi. Khong dung Markdown code fence."
      ].join(" ")
    : [
        "Ban la AI giao duc Viet Nam chuyen nghiep.",
        "Hay doc ky tai lieu duoc dinh kem va tao bai kiem tra nhanh dung voi noi dung tai lieu.",
        "Dap an/giai thich bat buoc boc trong <div class='teacher-only'>...</div> o cuoi.",
        "Khong chao hoi. Khong dung Markdown code fence.",
        "Neu co noi dung Toan, trinh bay bang van ban thuong, khong dung LaTeX, khong dung $, \\cdot, \\frac."
      ].join(" ");

  var payload = {
    systemInstruction: { parts: [{ text: sysInstruction }] },
    contents: [{
      role: "user",
      parts: [
        {
          text: [
            "Ten file: " + prepared.name,
            "Dinh dang: " + prepared.mimeType,
            "Yeu cau cua giao vien: " + (prompt || "Hay tao 5 cau trac nghiem A, B, C, D kem dap an chi tiet.")
          ].join("\n")
        },
        {
          file_data: { mime_type: geminiFile.mimeType || prepared.mimeType, file_uri: geminiFile.uri }
        }
      ]
    }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 4096 }
  };

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var text = response.getContentText();
  if (response.getResponseCode() >= 300) throw new Error(formatGeminiHttpError_(response.getResponseCode(), text, model, "tao noi dung"));

  var json = JSON.parse(text);
  if (json.error) throw new Error("Loi tu AI: " + json.error.message);
  
  return json.candidates[0].content.parts[0].text;
}

function normalizeGeminiKeyText_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeGeminiSubjectKey_(subject) {
  var text = normalizeGeminiKeyText_(subject);
  if (!text) return "";
  if (text === "tatca" || text === "all" || text === "chung" || text === "default") return "chung";
  if (text.indexOf("toan") !== -1) return "toan";
  if (text.indexOf("nguvan") !== -1 || text === "van") return "van";
  if (text.indexOf("khtn") !== -1 || text.indexOf("khoahoctunhien") !== -1) return "khtn";
  if (text.indexOf("lsdl") !== -1 || text.indexOf("lichsudialy") !== -1 || text.indexOf("lichsudia") !== -1) return "lsdl";
  if (text.indexOf("gdcd") !== -1 || text.indexOf("giaoduccongdan") !== -1) return "gdcd";
  if (text.indexOf("gddp") !== -1 || text.indexOf("giaoducdiaphuong") !== -1) return "gddp";
  if (text.indexOf("congnghe") !== -1 || text === "cnghe") return "congnghe";
  return text;
}

function normalizeGeminiGradeKey_(grade) {
  var text = normalizeGeminiKeyText_(grade);
  if (!text || text === "tatca" || text === "all" || text === "chung") return "chung";
  var match = text.match(/[6-9]/);
  return match ? match[0] : text;
}

function getGeminiRequestSubject_(context) {
  context = context || {};
  if (context.subject) return context.subject;
  if (context.mon) return context.mon;
  if (context.subjectName) return context.subjectName;
  if (context.lessonSubject) return context.lessonSubject;
  if (context.lesson && context.lesson.subject) return context.lesson.subject;
  if (context.material && context.material.subject) return context.material.subject;
  return "";
}

function getGeminiRequestGrade_(context) {
  context = context || {};
  if (context.grade) return context.grade;
  if (context.khoi) return context.khoi;
  if (context.gradeName) return context.gradeName;
  if (context.classGrade) return context.classGrade;
  if (context.className) return context.className;
  if (context.lesson && context.lesson.grade) return context.lesson.grade;
  if (context.material && context.material.grade) return context.material.grade;
  return "";
}

function getGeminiKeyColumnMap_(headers) {
  var aliases = {
    status: ["trangthai", "status", "battat"],
    grade: ["khoi", "grade", "lop"],
    subject: ["mon", "subject"],
    priority: ["uutien", "priority"],
    key: ["keygemini", "geminikey", "apikey", "key"],
    dailyLimit: ["gioihanngay", "limit", "dailylimit"],
    usedToday: ["dadunghomnay", "dadung", "usedtoday"],
    lastError: ["loigannhat", "lasterror", "loi"],
    note: ["ghichu", "note"]
  };
  var normalizedHeaders = [];
  for (var i = 0; i < headers.length; i++) {
    normalizedHeaders.push(normalizeGeminiKeyText_(headers[i]));
  }
  var col = {};
  for (var field in aliases) {
    col[field] = -1;
    for (var j = 0; j < normalizedHeaders.length; j++) {
      if (aliases[field].indexOf(normalizedHeaders[j]) !== -1) {
        col[field] = j;
        break;
      }
    }
  }
  return col;
}

function getGeminiKeySpreadsheet_() {
  if (String(APPKHOBAI_DATA_SPREADSHEET_ID || "").trim()) {
    return SpreadsheetApp.openById(String(APPKHOBAI_DATA_SPREADSHEET_ID).trim());
  }
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (error) {
    return null;
  }
}

function readGeminiKeyRows_() {
  var ss = getGeminiKeySpreadsheet_();
  if (!ss) return [];
  var sheet = ss.getSheetByName(APPKHOBAI_GEMINI_KEY_SHEET_NAME);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var col = getGeminiKeyColumnMap_(values[0]);
  if (col.key < 0) return [];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var apiKey = String(row[col.key] || "").trim();
    if (!apiKey) continue;
    rows.push({
      sheet: sheet,
      rowNumber: i + 1,
      col: col,
      status: col.status >= 0 ? String(row[col.status] || "").trim() : "",
      grade: col.grade >= 0 ? String(row[col.grade] || "").trim() : "",
      subject: col.subject >= 0 ? String(row[col.subject] || "").trim() : "",
      priority: col.priority >= 0 ? Number(row[col.priority] || 999) : 999,
      apiKey: apiKey,
      dailyLimit: col.dailyLimit >= 0 ? Number(row[col.dailyLimit] || 0) : 0,
      usedToday: col.usedToday >= 0 ? Number(row[col.usedToday] || 0) : 0
    });
  }
  return rows;
}

function isGeminiKeyEnabled_(row) {
  var status = normalizeGeminiKeyText_(row.status);
  return !status || status === "bat" || status === "on" || status === "active" || status === "enabled" || status === "dangdung";
}

function subjectMatchesGeminiKey_(rowSubject, requestedSubject) {
  var rowKey = normalizeGeminiSubjectKey_(rowSubject);
  var requestedKey = normalizeGeminiSubjectKey_(requestedSubject);
  if (!rowKey || !requestedKey) return false;
  if (rowKey === "chung") return true;
  return rowKey === requestedKey;
}

function gradeMatchesGeminiKey_(rowGrade, requestedGrade) {
  var rowKey = normalizeGeminiGradeKey_(rowGrade);
  var requestedKey = normalizeGeminiGradeKey_(requestedGrade);
  if (rowKey === "chung") return true;
  if (!requestedKey || requestedKey === "chung") return false;
  return rowKey === requestedKey;
}

function getGeminiKeyCandidates_(context) {
  var requestedSubject = getGeminiRequestSubject_(context);
  var requestedGrade = getGeminiRequestGrade_(context);
  var candidates = [];
  var rows = [];
  try {
    rows = readGeminiKeyRows_();
  } catch (sheetError) {
    rows = [];
  }

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!isGeminiKeyEnabled_(row)) continue;
    if (row.dailyLimit && row.usedToday >= row.dailyLimit) continue;
    if (!gradeMatchesGeminiKey_(row.grade, requestedGrade)) continue;
    if (!subjectMatchesGeminiKey_(row.subject, requestedSubject)) continue;
    row.label = "sheet dong " + row.rowNumber;
    candidates.push(row);
  }

  candidates.sort(function(a, b) {
    return (a.priority || 999) - (b.priority || 999);
  });

  var propertyGeminiKey = getSecurityProperty_("APP_GEMINI_API_KEY");
  var defaultGeminiKey = propertyGeminiKey || String(APPKHOBAI_GEMINI_API_KEY || "").trim();
  if (defaultGeminiKey) {
    candidates.push({
      apiKey: defaultGeminiKey,
      label: propertyGeminiKey ? "key chung trong Script Properties" : "key chung trong code",
      isDefault: true
    });
  }

  if (!candidates.length) {
    throw new Error("Chua co key Gemini kha dung. Hay them key vao sheet key gemini hoac Script Property APP_GEMINI_API_KEY.");
  }
  return candidates;
}

function markGeminiKeyUsed_(keyInfo) {
  if (!keyInfo || keyInfo.isDefault || !keyInfo.sheet || !keyInfo.col || keyInfo.col.usedToday < 0) return;
  var cell = keyInfo.sheet.getRange(keyInfo.rowNumber, keyInfo.col.usedToday + 1);
  cell.setValue(Number(cell.getValue() || 0) + 1);
  if (keyInfo.col.lastError >= 0) {
    keyInfo.sheet.getRange(keyInfo.rowNumber, keyInfo.col.lastError + 1).setValue("");
  }
}

function markGeminiKeyError_(keyInfo, error) {
  if (!keyInfo || keyInfo.isDefault || !keyInfo.sheet || !keyInfo.col || keyInfo.col.lastError < 0) return;
  var message = String(error && error.message ? error.message : error || "").slice(0, 400);
  keyInfo.sheet.getRange(keyInfo.rowNumber, keyInfo.col.lastError + 1).setValue(message);
}

function getGeminiKeySource_(keyInfo) {
  if (!keyInfo) return null;
  if (keyInfo.isDefault) return { source: "code" };
  return {
    source: "sheet",
    rowNumber: keyInfo.rowNumber,
    grade: keyInfo.grade || "",
    subject: keyInfo.subject || "",
    priority: keyInfo.priority || 999
  };
}

function compactText_(value, maxLength) {
  var text = String(value || "").replace(/\s+/g, " ").trim();
  var limit = maxLength || 500;
  if (text.length <= limit) return text;
  return text.substring(0, limit - 3) + "...";
}

function isQuotaErrorText_(text) {
  return /AI_QUOTA_EXHAUSTED|quota|rate limit|RESOURCE_EXHAUSTED|GenerateRequestsPer|429/i.test(String(text || ""));
}

function extractRetryDelay_(jsonText) {
  var match = String(jsonText || "").match(/"retryDelay"\s*:\s*"([^"]+)"/);
  return match ? match[1] : "";
}

function getGeminiErrorMessage_(jsonText) {
  try {
    var parsed = JSON.parse(jsonText || "{}");
    if (parsed && parsed.error && parsed.error.message) return parsed.error.message;
  } catch (parseError) {}
  return jsonText;
}

function formatGeminiHttpError_(status, bodyText, model, phase) {
  var body = String(bodyText || "");
  var apiMessage = getGeminiErrorMessage_(body);
  var retryDelay = extractRetryDelay_(body);
  var modelText = model ? " (" + model + ")" : "";
  if (status === 429 || isQuotaErrorText_(body + " " + apiMessage)) {
    return "AI_QUOTA_EXHAUSTED: Gemini dang het han muc su dung" + modelText + ". " +
      (retryDelay ? "Google goi y thu lai sau " + retryDelay + ". " : "") +
      "Hay doi API key con quota, nang/gia han billing trong Google AI Studio, hoac thu lai sau it phut.";
  }
  if (/API key not valid|PERMISSION_DENIED|permission|forbidden|403/i.test(body + " " + apiMessage)) {
    return "Gemini chua nhan API key hoac API key khong co quyen su dung" + modelText + ". Hay kiem tra lai API key trong Apps Script.";
  }
  return "Gemini bao loi HTTP " + status + modelText + " khi " + (phase || "goi AI") + ": " + compactText_(apiMessage, 500);
}

function cleanErrorForClient_(error) {
  var message = error && error.message ? error.message : String(error || "");
  if (isQuotaErrorText_(message)) {
    return "Gemini dang het han muc su dung. Hay doi API key con quota, nang/gia han billing trong Google AI Studio, hoac thu lai sau it phut.";
  }
  return compactText_(message, 900);
}

function getHeader_(response, name) {
  var headers = response.getAllHeaders();
  var target = name.toLowerCase();
  for (var key in headers) {
    if (String(key).toLowerCase() === target) return headers[key];
  }
  return "";
}

function handleCreateStudentListPdf_(data) {
  if (!Array.isArray(data.rows) || !data.rows.length) {
    throw new Error("Thieu du lieu danh sach hoc sinh de tao PDF.");
  }

  var folderId = data.folderId || APPKHOBAI_MASTER_DRIVE_FOLDER_ID;
  var folder = DriveApp.getFolderById(folderId);
  var requestedName = String(data.filename || "danh-sach-hoc-sinh.pdf").replace(/\.pdf$/i, "");
  var pdfFilename = getUniqueFileName_(folder, requestedName + ".pdf");
  var doc = DocumentApp.create(pdfFilename.replace(/\.pdf$/i, ""));
  var docFile = DriveApp.getFileById(doc.getId());

  try {
    var rows = data.rows || [];
    var title = String(data.title || (rows[0] && rows[0][0]) || "DANH SACH HOC SINH");
    var tableRows = rows.slice(1);
    var numCols = tableRows.reduce(function(max, row) {
      return Math.max(max, Array.isArray(row) ? row.length : 0);
    }, 1);
    var values = tableRows.map(function(row) {
      var safeRow = Array.isArray(row) ? row : [];
      var output = [];
      for (var col = 0; col < numCols; col++) {
        var text = String(safeRow[col] == null ? "" : safeRow[col]);
        output.push(text || " ");
      }
      return output;
    });
    if (!values.length) values = [["Khong co du lieu"]];

    var body = doc.getBody();
    body.clear();
    body.setMarginTop(28).setMarginBottom(28).setMarginLeft(22).setMarginRight(22);

    var titleParagraph = body.appendParagraph(title);
    titleParagraph.setBold(true);
    titleParagraph.setFontFamily("Times New Roman");
    titleParagraph.setFontSize(13);
    titleParagraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    titleParagraph.setSpacingAfter(10);

    var table = body.appendTable(values);
    table.setBorderColor("#000000");
    table.setBorderWidth(0.5);

    var fontSize = numCols > 10 ? 6 : (numCols > 7 ? 7 : 9);
    for (var r = 0; r < table.getNumRows(); r++) {
      var row = table.getRow(r);
      for (var c = 0; c < row.getNumCells(); c++) {
        var cell = row.getCell(c);
        cell.setBackgroundColor("#ffffff");
        cell.setPaddingTop(2).setPaddingBottom(2).setPaddingLeft(2).setPaddingRight(2);
        var textElement = cell.editAsText();
        textElement.setFontFamily("Times New Roman");
        textElement.setFontSize(fontSize);
        textElement.setBold(r === 0);
      }
    }

    doc.saveAndClose();
    var pdfFile = folder.createFile(docFile.getAs("application/pdf").setName(pdfFilename));
    try {
      pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareError) {}

    return json_({
      status: "success",
      url: pdfFile.getUrl(),
      fileId: pdfFile.getId(),
      filename: pdfFilename
    });
  } finally {
    try {
      docFile.setTrashed(true);
    } catch (trashError) {}
  }
}

function testCreateStudentListPdf() {
  var result = handleCreateStudentListPdf_({
    folderId: "1rSQB_aAM4oY_NcZY_sqBESAK1u5v87za",
    filename: "test-danh-sach-hoc-sinh.pdf",
    title: "TEST DANH SACH HOC SINH",
    rows: [
      ["TEST DANH SACH HOC SINH", "", "", ""],
      ["STT", "Ho va ten", "Lop", "Ma hoc sinh"],
      ["1", "Nguyen Van A", "6", "HS26001"],
      ["2", "Tran Thi B", "7", "HS26002"]
    ]
  });
  Logger.log(result.getContent());
}

function handleCreateStudentListSheet_(data) {
  if (!Array.isArray(data.rows) || !data.rows.length) {
    throw new Error("Thieu du lieu danh sach hoc sinh de tao Google Sheet.");
  }

  var folderId = data.folderId || APPKHOBAI_MASTER_DRIVE_FOLDER_ID;
  var folder = DriveApp.getFolderById(folderId);
  var rows = data.rows || [];
  var title = String(data.title || (rows[0] && rows[0][0]) || "DANH SACH HOC SINH");
  var requestedName = String(data.filename || title || "danh-sach-hoc-sinh").replace(/\.xlsx$/i, "").trim();
  var sheetName = getUniqueFileName_(folder, requestedName || "danh-sach-hoc-sinh");
  var numCols = rows.reduce(function(max, row) {
    return Math.max(max, Array.isArray(row) ? row.length : 0);
  }, 1);
  var values = rows.map(function(row) {
    var safeRow = Array.isArray(row) ? row : [];
    var output = [];
    for (var col = 0; col < numCols; col++) {
      output.push(String(safeRow[col] == null ? "" : safeRow[col]));
    }
    return output;
  });

  var spreadsheet = SpreadsheetApp.create(sheetName, Math.max(values.length, 2), numCols);
  var spreadsheetFile = DriveApp.getFileById(spreadsheet.getId());

  try {
    folder.addFile(spreadsheetFile);
    DriveApp.getRootFolder().removeFile(spreadsheetFile);
  } catch (moveError) {}

  var sheet = spreadsheet.getSheets()[0];
  sheet.setName("Danh sach hoc sinh");
  sheet.getRange(1, 1, values.length, numCols).setValues(values);

  if (values.length >= 1) {
    if (numCols > 1) sheet.getRange(1, 1, 1, numCols).merge();
    sheet.getRange(1, 1)
      .setValue(title)
      .setFontFamily("Times New Roman")
      .setFontSize(14)
      .setFontWeight("bold")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
    sheet.setRowHeight(1, 30);
  }

  if (values.length >= 2) {
    sheet.getRange(2, 1, 1, numCols)
      .setFontFamily("Times New Roman")
      .setFontWeight("bold")
      .setBackground("#dbeafe")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setWrap(true);
    sheet.setFrozenRows(2);
  }

  if (values.length > 2) {
    sheet.getRange(3, 1, values.length - 2, numCols)
      .setFontFamily("Times New Roman")
      .setVerticalAlignment("middle")
      .setWrap(true);
  }

  if (values.length >= 2) {
    sheet.getRange(2, 1, values.length - 1, numCols)
      .setBorder(true, true, true, true, true, true, "#94a3b8", SpreadsheetApp.BorderStyle.SOLID);
  }

  sheet.autoResizeColumns(1, numCols);
  for (var column = 1; column <= numCols; column++) {
    var width = sheet.getColumnWidth(column);
    sheet.setColumnWidth(column, Math.max(70, Math.min(width, 260)));
  }
  sheet.setColumnWidth(1, 45);

  try {
    spreadsheetFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareError) {}

  SpreadsheetApp.flush();
  return json_({
    status: "success",
    url: spreadsheet.getUrl(),
    fileId: spreadsheet.getId(),
    filename: sheetName
  });
}

function testCreateStudentListSheet() {
  var result = handleCreateStudentListSheet_({
    folderId: "1rSQB_aAM4oY_NcZY_sqBESAK1u5v87za",
    filename: "test-danh-sach-hoc-sinh",
    title: "TEST DANH SACH HOC SINH",
    rows: [
      ["TEST DANH SACH HOC SINH", "", "", ""],
      ["STT", "Ho va ten", "Lop", "Ma hoc sinh"],
      ["1", "Nguyen Van A", "6", "HS26001"],
      ["2", "Tran Thi B", "7", "HS26002"]
    ]
  });
  Logger.log(result.getContent());
}

function getStudentMailboxSheet_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty("APPKHOBAI_STUDENT_MAILBOX_SPREADSHEET_ID");
  var spreadsheet = null;
  if (spreadsheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    } catch (openError) {
      properties.deleteProperty("APPKHOBAI_STUDENT_MAILBOX_SPREADSHEET_ID");
    }
  }

  if (!spreadsheet) {
    var folder = DriveApp.getFolderById(APPKHOBAI_STUDENT_MAILBOX_FOLDER_ID);
    var files = folder.getFilesByName(APPKHOBAI_STUDENT_MAILBOX_SHEET_NAME);
    if (files.hasNext()) {
      spreadsheet = SpreadsheetApp.openById(files.next().getId());
    } else {
      spreadsheet = SpreadsheetApp.create(APPKHOBAI_STUDENT_MAILBOX_SHEET_NAME);
      var spreadsheetFile = DriveApp.getFileById(spreadsheet.getId());
      try {
        folder.addFile(spreadsheetFile);
        DriveApp.getRootFolder().removeFile(spreadsheetFile);
      } catch (moveError) {}
    }
    properties.setProperty("APPKHOBAI_STUDENT_MAILBOX_SPREADSHEET_ID", spreadsheet.getId());
  }

  var sheet = spreadsheet.getSheetByName(APPKHOBAI_STUDENT_MAILBOX_SHEET_NAME) || spreadsheet.getSheets()[0];
  sheet.setName(APPKHOBAI_STUDENT_MAILBOX_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).setValues([APPKHOBAI_STUDENT_MAILBOX_HEADERS]);
    sheet.getRange(1, 1, 1, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#dbeafe")
      .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length, 130);
    sheet.setColumnWidth(1, 210);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(8, 260);
    sheet.setColumnWidth(9, 420);
  }
  return sheet;
}

function normalizeMailboxCode_(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function mailboxRowToObject_(row, accessCode) {
  var readBy = String(row[10] || "").split(",").map(normalizeMailboxCode_).filter(Boolean);
  return {
    id: String(row[0] || ""),
    createdAt: Number(row[1]) || 0,
    schoolYear: String(row[2] || ""),
    recipientType: String(row[3] || ""),
    recipientValue: String(row[4] || ""),
    recipientLabel: String(row[5] || ""),
    category: String(row[6] || "general"),
    title: String(row[7] || ""),
    body: String(row[8] || ""),
    linkUrl: String(row[9] || ""),
    isRead: readBy.indexOf(normalizeMailboxCode_(accessCode)) >= 0,
    sender: String(row[11] || "Admin")
  };
}

function handleSendStudentMailboxMessage_(data) {
  var title = String(data.title || "").trim();
  var body = String(data.body || "").trim();
  var recipientType = String(data.recipientType || "student").trim().toLowerCase();
  var recipientValue = recipientType === "student"
    ? normalizeMailboxCode_(data.recipientValue)
    : String(data.recipientValue || "").trim();
  if (!title || !body) throw new Error("Thieu tieu de hoac noi dung thu.");
  if (["student", "class", "all"].indexOf(recipientType) < 0) throw new Error("Kieu nguoi nhan khong hop le.");
  if (recipientType !== "all" && !recipientValue) throw new Error("Chua chon nguoi nhan.");

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getStudentMailboxSheet_();
    var id = Utilities.getUuid();
    sheet.appendRow([
      id,
      new Date().getTime(),
      String(data.schoolYear || ""),
      recipientType,
      recipientValue,
      String(data.recipientLabel || recipientValue || "Toan truong"),
      String(data.category || "general"),
      title,
      body,
      String(data.linkUrl || ""),
      "",
      String(data.sender || "Admin")
    ]);
    appendAuditLog_("gui_thu", data, { id: id, recipientType: recipientType, recipientValue: recipientValue, title: title });
    return json_({ status: "success", id: id });
  } finally {
    lock.releaseLock();
  }
}

function handleGetStudentMailboxMessages_(data) {
  var student = requireStudentSession_(data);
  var accessCode = normalizeMailboxCode_(student.accessCode);
  var className = String(student.className || '').trim();
  var schoolYear = String(student.schoolYear || '').trim();
  if (!accessCode) throw new Error("Thieu ma hoc sinh de doc hop thu.");
  var sheet = getStudentMailboxSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return json_({ status: "success", messages: [] });
  var rows = sheet.getRange(2, 1, lastRow - 1, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).getValues();
  var messages = rows.filter(function(row) {
    var rowSchoolYear = String(row[2] || "").trim();
    var recipientType = String(row[3] || "").trim().toLowerCase();
    var recipientValue = String(row[4] || "").trim();
    if (schoolYear && rowSchoolYear && schoolYear !== rowSchoolYear) return false;
    if (recipientType === "all") return true;
    if (recipientType === "class") return className && recipientValue === className;
    return recipientType === "student" && normalizeMailboxCode_(recipientValue) === accessCode;
  }).map(function(row) {
    return mailboxRowToObject_(row, accessCode);
  }).sort(function(a, b) {
    return b.createdAt - a.createdAt;
  }).slice(0, 100);
  return json_({ status: "success", messages: messages });
}

function handleMarkStudentMailboxMessageRead_(data) {
  var student = requireStudentSession_(data);
  var messageId = String(data.messageId || '').trim();
  var accessCode = normalizeMailboxCode_(student.accessCode);
  if (!messageId || !accessCode) throw new Error("Thieu ma thu hoac ma hoc sinh.");
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getStudentMailboxSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return json_({ status: "success" });
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var index = 0; index < ids.length; index++) {
      if (String(ids[index][0] || "") !== messageId) continue;
      var rowNumber = index + 2;
      var recipientRow = sheet.getRange(rowNumber, 1, 1, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).getValues()[0];
      if (!studentMayReadMailboxRow_(student, recipientRow)) throw new Error('Không có quyền đọc thư này.');
      var readCell = sheet.getRange(rowNumber, 11);
      var readBy = String(readCell.getValue() || "").split(",").map(normalizeMailboxCode_).filter(Boolean);
      if (readBy.indexOf(accessCode) < 0) {
        readBy.push(accessCode);
        readCell.setValue(readBy.join(","));
      }
      return json_({ status: "success" });
    }
    throw new Error("Khong tim thay thu.");
  } finally {
    lock.releaseLock();
  }
}

function handleDeleteStudentMailboxMessages_(data) {
  var mode = String(data.mode || "filter").trim().toLowerCase();
  var category = String(data.category || "all").trim().toLowerCase();
  var fromTime = Number(data.fromTime) || 0;
  var toTime = Number(data.toTime) || 0;
  if (mode !== "all" && category === "all" && !fromTime && !toTime) {
    throw new Error("Chua chon loai thu hoac khoang thoi gian can xoa.");
  }
  if (fromTime && toTime && fromTime > toTime) {
    throw new Error("Khoang thoi gian xoa khong hop le.");
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getStudentMailboxSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return json_({ status: "success", deletedCount: 0 });
    var rows = sheet.getRange(2, 1, lastRow - 1, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).getValues();
    var rowsToDelete = [];
    for (var index = 0; index < rows.length; index++) {
      var row = rows[index];
      var createdAt = Number(row[1]) || 0;
      var rowCategory = String(row[6] || "general").trim().toLowerCase();
      var matches = mode === "all"
        || (
          (category === "all" || rowCategory === category)
          && (!fromTime || createdAt >= fromTime)
          && (!toTime || createdAt <= toTime)
        );
      if (matches) rowsToDelete.push(index + 2);
    }
    if (!rowsToDelete.length) return json_({ status: "success", deletedCount: 0 });
    createMailboxSafetyBackup_("truoc-xoa-thu", rows);
    var deletedCount = 0, deletionWarning = '';
    for (var deleteIndex = rowsToDelete.length - 1; deleteIndex >= 0; deleteIndex--) {
      try { sheet.deleteRow(rowsToDelete[deleteIndex]); deletedCount++; }
      catch (deleteError) {
        if (!deletedCount) throw deleteError;
        deletionWarning = 'Xóa chưa hoàn tất. Cần kiểm tra lại danh sách và thử lại phần còn lại.';
        break;
      }
    }
    var auditWarning = appendAuditLog_("xoa_thu_hang_loat", data, { deletedCount: deletedCount, mode: mode, category: category, fromTime: fromTime, toTime: toTime }) === false
      ? 'Chưa ghi được nhật ký thao tác.' : '';
    return json_({ status: "success", deletedCount: deletedCount, remainingCount: rowsToDelete.length - deletedCount, warning: deletionWarning || auditWarning });
  } finally {
    lock.releaseLock();
  }
}

function getOperationsSpreadsheet_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty("APPKHOBAI_OPERATIONS_SPREADSHEET_ID");
  var spreadsheet = null;
  if (spreadsheetId) {
    try { spreadsheet = SpreadsheetApp.openById(spreadsheetId); } catch (error) {}
  }
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create("VAN HANH KHO HOC LIEU");
    var folder = DriveApp.getFolderById(APPKHOBAI_STUDENT_MAILBOX_FOLDER_ID);
    var file = DriveApp.getFileById(spreadsheet.getId());
    try { folder.addFile(file); DriveApp.getRootFolder().removeFile(file); } catch (moveError) {}
    properties.setProperty("APPKHOBAI_OPERATIONS_SPREADSHEET_ID", spreadsheet.getId());
  }
  return spreadsheet;
}

function getAuditSheet_() {
  var spreadsheet = getOperationsSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(APPKHOBAI_AUDIT_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(APPKHOBAI_AUDIT_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["TIME", "ACTION", "ACTOR", "DETAILS"]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#dbeafe");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 170);
    sheet.setColumnWidth(2, 190);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(4, 600);
  }
  return sheet;
}

function appendAuditLog_(action, data, details) {
  try {
    getAuditSheet_().appendRow([new Date().getTime(), String(action || ""), String(data && data.actor ? data.actor : "Admin"), JSON.stringify(details || {})]);
    return true;
  } catch (error) {
    console.warn('Audit log unavailable: ' + error.message);
    return false;
  }
}

function handleListAuditLogs_(data) {
  var sheet = getAuditSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return json_({ status: "success", logs: [] });
  var limit = Math.max(1, Math.min(Number(data.limit) || 200, 1000));
  var startRow = Math.max(2, lastRow - limit + 1);
  var rows = sheet.getRange(startRow, 1, lastRow - startRow + 1, 4).getValues();
  var logs = rows.map(function(row, index) {
    var details = {};
    try { details = JSON.parse(String(row[3] || "{}")); } catch (error) { details = { text: String(row[3] || "") }; }
    return { id: String(startRow + index), createdAt: Number(row[0]) || 0, action: String(row[1] || ""), actor: String(row[2] || ""), details: details };
  }).reverse();
  return json_({ status: "success", logs: logs });
}

function getBackupFolder_() {
  var root = DriveApp.getFolderById(APPKHOBAI_STUDENT_MAILBOX_FOLDER_ID);
  var folders = root.getFoldersByName(APPKHOBAI_BACKUP_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : root.createFolder(APPKHOBAI_BACKUP_FOLDER_NAME);
}

function handleCreateSystemBackup_(data) {
  if (!data.snapshot || typeof data.snapshot !== "object") throw new Error("Thieu du lieu sao luu.");
  var jobId = String(data.snapshot.maintenanceJobId || '');
  if (jobId && !/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) throw new Error('Mã công việc sao lưu không hợp lệ.');
  var exportLock = LockService.getScriptLock(); exportLock.waitLock(10000);
  try {
  var reason = String(data.reason || "thu-cong").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || "thu-cong";
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh", "yyyyMMdd-HHmmss");
  var filename = jobId ? 'backup-' + jobId + '.json' : "backup-" + timestamp + "-" + reason + ".json";
  var folder = getBackupFolder_();
  if (jobId) {
    var matching = folder.getFilesByName(filename);
    if (matching.hasNext()) {
      var existing = matching.next(), saved = JSON.parse(existing.getBlob().getDataAsString('UTF-8'));
      if (JSON.stringify(saved.snapshot.manifest.checksums) !== JSON.stringify(data.snapshot.manifest.checksums)) throw new Error('Công việc đã xuất dữ liệu khác. Cần đối soát.');
      return json_({ status: 'success', id: existing.getId(), name: filename, createdAt: saved.createdAt, url: existing.getUrl(), replayed: true });
    }
  }
  var mailboxSheet = getStudentMailboxSheet_();
  var mailboxRows = mailboxSheet.getLastRow() > 1
    ? mailboxSheet.getRange(2, 1, mailboxSheet.getLastRow() - 1, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).getValues()
    : [];
  var payload = { version: 1, createdAt: new Date().getTime(), reason: reason, actor: String(data.actor || "Admin"), snapshot: data.snapshot, mailboxRows: mailboxRows };
  var file = folder.createFile(filename, JSON.stringify(payload), MimeType.PLAIN_TEXT);
  try { appendAuditLog_("tao_sao_luu", data, { fileId: file.getId(), filename: filename, reason: reason }); } catch (auditError) { console.warn('Backup created; audit needs retry: ' + auditError.message); }
  return json_({ status: "success", id: file.getId(), name: filename, createdAt: payload.createdAt, url: file.getUrl() });
  } finally { exportLock.releaseLock(); }
}

function createMailboxSafetyBackup_(reason, rows) {
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyyMMdd-HHmmss');
  var payload = { version: 1, createdAt: Date.now(), reason: reason, snapshot: {}, mailboxRows: rows || [] };
  return getBackupFolder_().createFile('backup-' + timestamp + '-' + reason + '.json', JSON.stringify(payload), MimeType.PLAIN_TEXT);
}

function handleListSystemBackups_() {
  var files = getBackupFolder_().getFiles();
  var backups = [];
  while (files.hasNext()) {
    var file = files.next();
    if (file.getName().slice(-5).toLowerCase() !== ".json") continue;
    backups.push({ id: file.getId(), name: file.getName(), createdAt: file.getDateCreated().getTime(), size: file.getSize(), url: file.getUrl() });
  }
  backups.sort(function(a, b) { return b.createdAt - a.createdAt; });
  return json_({ status: "success", backups: backups.slice(0, 100) });
}

function handleGetSystemBackup_(data) {
  var fileId = String(data.fileId || "").trim();
  if (!fileId) throw new Error("Chua chon ban sao luu.");
  var parsed = JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString("UTF-8"));
  appendAuditLog_("doc_sao_luu_de_phuc_hoi", data, { fileId: fileId, reason: parsed.reason || "" });
  return json_({ status: "success", backup: parsed });
}

function handleRestoreMailboxFromBackup_(data) {
  if (!Array.isArray(data.mailboxRows) || data.mailboxRows.some(function(row) { return !Array.isArray(row) || row.length !== APPKHOBAI_STUDENT_MAILBOX_HEADERS.length; })) throw new Error('Dữ liệu hộp thư không hợp lệ.');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var rows = data.mailboxRows; var sheet = getStudentMailboxSheet_();
    var restoreKey = data.restoreJobId ? 'MAILBOX_RESTORE_' + String(data.restoreJobId) : '';
    var restoreProperties = PropertiesService.getScriptProperties();
    if (restoreKey) {
      requireIdentityBridge_(data);
      if (!/^[a-f0-9]{64}$/.test(String(data.restoreChecksum || ''))) throw new Error('Thiếu checksum phục hồi.');
      var finishedChecksum = restoreProperties.getProperty(restoreKey);
      if (finishedChecksum) {
        if (finishedChecksum !== data.restoreChecksum) throw new Error('Mã phục hồi đã dùng cho dữ liệu khác.');
        return json_({ status: 'success', restoredCount: rows.length, replayed: true });
      }
    }
    var count = Math.max(0, sheet.getLastRow() - 1);
    var oldRows = count ? sheet.getRange(2, 1, count, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).getValues() : [];
    createMailboxSafetyBackup_('truoc-phuc-hoi-hop-thu', oldRows);
    try {
      if (sheet.getMaxRows() < rows.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
      if (rows.length) sheet.getRange(2, 1, rows.length, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).setValues(rows);
      if (count > rows.length) sheet.getRange(rows.length + 2, 1, count - rows.length, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).clearContent();
      SpreadsheetApp.flush();
    } catch (error) {
      if (oldRows.length) sheet.getRange(2, 1, oldRows.length, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).setValues(oldRows);
      if (rows.length > count) sheet.getRange(count + 2, 1, rows.length - count, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).clearContent();
      throw error;
    }
    if (restoreKey) restoreProperties.setProperty(restoreKey, data.restoreChecksum);
    try { appendAuditLog_('phuc_hoi_hop_thu', data, { restoredCount: rows.length }); } catch (auditError) { console.warn('Mailbox restored; audit pending.'); }
    return json_({ status: 'success', restoredCount: rows.length });
  } finally { lock.releaseLock(); }
}

function handleListAdminMailboxMessages_(data) {
  var sheet = getStudentMailboxSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return json_({ status: "success", messages: [] });
  var rows = sheet.getRange(2, 1, lastRow - 1, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).getValues();
  var messages = rows.map(function(row) {
    var readBy = String(row[10] || "").split(",").map(normalizeMailboxCode_).filter(Boolean);
    return { id: String(row[0] || ""), createdAt: Number(row[1]) || 0, schoolYear: String(row[2] || ""), recipientType: String(row[3] || ""), recipientValue: String(row[4] || ""), recipientLabel: String(row[5] || ""), category: String(row[6] || ""), title: String(row[7] || ""), body: String(row[8] || ""), linkUrl: String(row[9] || ""), readBy: readBy, readCount: readBy.length, sender: String(row[11] || "Admin") };
  }).sort(function(a, b) { return b.createdAt - a.createdAt; });
  return json_({ status: "success", messages: messages.slice(0, Math.max(1, Math.min(Number(data.limit) || 300, 1000))) });
}

function findMailboxRowById_(sheet, messageId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var finder = sheet.getRange(2, 1, lastRow - 1, 1).createTextFinder(messageId).matchEntireCell(true).findNext();
  return finder ? finder.getRow() : 0;
}

function handleDeleteStudentMailboxMessage_(data) {
  var messageId = String(data.messageId || "").trim();
  if (!messageId) throw new Error("Thieu ma thu can xoa.");
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    // Resolve the ID after taking the same lock used by bulk delete and restore.
    var sheet = getStudentMailboxSheet_();
    var rowNumber = findMailboxRowById_(sheet, messageId);
    if (!rowNumber) return json_({ status: "success", alreadyDeleted: true });
    var title = String(sheet.getRange(rowNumber, 8).getValue() || "");
    sheet.deleteRow(rowNumber);
    var auditWarning = '';
    try {
      if (appendAuditLog_("xoa_mot_thu", data, { messageId: messageId, title: title }) === false) auditWarning = 'Đã xóa thư, nhưng chưa ghi được nhật ký thao tác.';
    }
    catch (auditError) { auditWarning = 'Đã xóa thư, nhưng chưa ghi được nhật ký thao tác.'; }
    return json_({ status: "success", auditWarning: auditWarning });
  } finally { lock.releaseLock(); }
}

function handleResendStudentMailboxMessage_(data) {
  var messageId = String(data.messageId || "").trim();
  if (!messageId) throw new Error("Thieu ma thu can gui lai.");
  var unreadCodes = Array.isArray(data.unreadCodes) ? data.unreadCodes.map(normalizeMailboxCode_).filter(Boolean) : [];
  if (!unreadCodes.length) throw new Error("Khong co hoc sinh chua doc de gui lai.");
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sheet = getStudentMailboxSheet_();
    var rowNumber = findMailboxRowById_(sheet, messageId);
    if (!rowNumber) throw new Error("Khong tim thay thu.");
    var row = sheet.getRange(rowNumber, 1, 1, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).getValues()[0];
    var readBy = String(row[10] || '').split(',').map(normalizeMailboxCode_);
    var selected = {};
    unreadCodes = unreadCodes.filter(function(code) {
      if (selected[code] || readBy.indexOf(code) !== -1) return false;
      selected[code] = true; return true;
    });
    if (!unreadCodes.length) return json_({ status: 'success', sentCount: 0 });
    var newRows = unreadCodes.map(function(code) {
      return [Utilities.getUuid(), Date.now(), row[2], 'student', code, code, row[6], '[Gui lai] ' + row[7], row[8], row[9], '', row[11]];
    });
    var lastRow = sheet.getLastRow();
    if (sheet.getMaxRows() < lastRow + newRows.length) sheet.insertRowsAfter(sheet.getMaxRows(), lastRow + newRows.length - sheet.getMaxRows());
    sheet.getRange(lastRow + 1, 1, newRows.length, APPKHOBAI_STUDENT_MAILBOX_HEADERS.length).setValues(newRows);
    var auditWarning = appendAuditLog_('gui_lai_thu_chua_doc', data, { messageId: messageId, count: newRows.length }) === false
      ? 'Đã gửi lại thư, nhưng chưa ghi được nhật ký thao tác.' : '';
    return json_({ status: 'success', sentCount: newRows.length, auditWarning: auditWarning });
  } finally { lock.releaseLock(); }
}

function handleCreateGoogleDocFromHtml_(data) {
  if (!data.html) throw new Error("Thieu noi dung HTML de tao Google Doc.");

  // Answer archives always use an independent private folder. A public parent
  // could otherwise keep granting inherited link access after setSharing(PRIVATE).
  var properties = PropertiesService.getScriptProperties();
  var folderId = properties.getProperty('PRIVATE_QUIZ_ARCHIVE_FOLDER_ID');
  if (!folderId) {
    var privateFolder = DriveApp.createFolder('Kho hoc lieu - De va dap an rieng');
    privateFolder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    folderId = privateFolder.getId();
    properties.setProperty('PRIVATE_QUIZ_ARCHIVE_FOLDER_ID', folderId);
  }
  var folder = DriveApp.getFolderById(folderId);
  var filename = getUniqueFileName_(folder, String(data.filename || "de-kiem-tra").replace(/\.gdoc$/i, ""));
  var doc = DocumentApp.create(filename);
  var docFile = DriveApp.getFileById(doc.getId());

  try {
    folder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);
  } catch (moveError) {}

  var body = doc.getBody();
  body.clear();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(54).setMarginRight(54);

  var parsed = parseQuizHtmlForDoc_(data.html);
  var school = body.appendParagraph("THCS NGUYEN AN NINH - KHO HOC LIEU SO");
  school.setAlignment(DocumentApp.HorizontalAlignment.CENTER)
    .setFontSize(9)
    .setForegroundColor("#64748b")
    .setBold(true);

  var title = body.appendParagraph(parsed.title || filename);
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER)
    .setFontSize(16)
    .setForegroundColor("#1e3a8a")
    .setBold(true);

  if (parsed.meta) {
    var meta = body.appendParagraph(parsed.meta);
    meta.setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(10)
      .setForegroundColor("#475569")
      .setItalic(true);
  }

  body.appendHorizontalRule();
  appendBeautifulQuizContentToDoc_(body, parsed.contentHtml || data.html);

  doc.saveAndClose();
  docFile.setSharing(data.archiveAudience === 'student' ? DriveApp.Access.ANYONE_WITH_LINK : DriveApp.Access.PRIVATE,
    data.archiveAudience === 'student' ? DriveApp.Permission.VIEW : DriveApp.Permission.NONE);

  return json_({
    status: "success",
    url: docFile.getUrl(),
    fileId: docFile.getId(),
    filename: filename
  });
}

function auditQuizDocSharing_(data) {
  if (!Array.isArray(data.fileIds) || data.fileIds.length < 1 || data.fileIds.length > 100) throw new Error('Chọn từ 1 đến 100 tài liệu mỗi lượt.');
  var results = [];
  var privateFolderId = PropertiesService.getScriptProperties().getProperty('PRIVATE_QUIZ_ARCHIVE_FOLDER_ID');
  for (var i = 0; i < data.fileIds.length; i++) {
    var id = String(data.fileIds[i]);
    try {
      if (!/^[\w-]{10,200}$/.test(id)) throw new Error('Mã tài liệu không hợp lệ.');
      var file = DriveApp.getFileById(id);
      if (file.getMimeType() !== MimeType.GOOGLE_DOCS || !/(_De_|DE_KIEM_TRA|de-kiem-tra|De-hoc-sinh)/i.test(file.getName())) throw new Error('Tệp chưa được xác nhận là tài liệu đề kiểm tra.');
      var parents = file.getParents(), allowed = false;
      while (parents.hasNext()) { var parentId = parents.next().getId(); if (parentId === APPKHOBAI_MASTER_DRIVE_FOLDER_ID || parentId === APPKHOBAI_QUIZ_DRIVE_FOLDER_ID || parentId === privateFolderId) allowed = true; }
      if (!allowed) throw new Error('Tệp không nằm trong kho đề được phép.');
      var access = String(file.getSharingAccess());
      if (data.dryRun === false) {
        if (!privateFolderId) throw new Error('Tạo một bản lưu đề riêng trước để khởi tạo thư mục riêng.');
        file.moveTo(DriveApp.getFolderById(privateFolderId));
        file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      }
      results.push({ fileId: id, filename: file.getName(), sharingBefore: access, revoked: data.dryRun === false, success: true });
    } catch (error) { results.push({ fileId: id, success: false, error: error.message }); }
  }
  return json_({ status: 'success', dryRun: data.dryRun !== false, results: results });
}

function appendBeautifulQuizContentToDoc_(body, html) {
  var lines = getCleanQuizDocLines_(html);
  if (!lines.length) {
    body.appendParagraph("(Chua co noi dung de kiem tra.)").setForegroundColor("#94a3b8").setItalic(true);
    return;
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var normalized = foldDocText_(line);
    if (!line.trim()) {
      body.appendParagraph("");
      continue;
    }

    if (isTeacherAnswerLine_(normalized)) {
      appendTeacherAnswerBox_(body, lines.slice(i));
      break;
    }

    if (isMajorQuizHeading_(normalized)) {
      appendDocHeading_(body, line);
      continue;
    }

    if (/^cau\s*\d+\b/.test(normalized)) {
      appendQuestionParagraph_(body, line);
      continue;
    }

    if (/^[a-d]\s*[.)]\s*/.test(normalized)) {
      appendOptionParagraph_(body, line);
      continue;
    }

    if (/^bai\s*\d+\b/.test(normalized) || /^[a-z]\)\s*/.test(normalized)) {
      appendEssayParagraph_(body, line);
      continue;
    }

    appendNormalParagraph_(body, line);
  }
}

function getCleanQuizDocLines_(html) {
  var cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ");

  cleaned = decodeHtmlEntities_(cleaned)
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  cleaned = cleaned
    .replace(/([^\n])\s*((?:Cau|Câu)\s*\d{1,3}\s*[:.)-]?)/g, "$1\n$2")
    .replace(/([^\n])\s*([A-D])\s*[.)]\s+/g, "$1\n$2. ")
    .replace(/([^\n])\s*((?:TRAC NGHIEM|TRẮC NGHIỆM|TU LUAN|TỰ LUẬN|PHAN DAP AN|PHẦN ĐÁP ÁN)\b)/gi, "$1\n$2")
    .replace(/([^\n])\s*((?:DAP AN|ĐÁP ÁN)\s*(?:VA|VÀ|:|-))/gi, "$1\n$2");

  return cleaned.split(/\n/).map(function(line) {
    return beautifyDocMathText_(String(line || "").replace(/\s+/g, " ").trim());
  }).filter(function(line, index, arr) {
    return line || (index > 0 && arr[index - 1]);
  });
}

function beautifyDocMathText_(text) {
  var cleaned = String(text || "")
    .replace(/\\\\/g, "\\")
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\\[/g, "")
    .replace(/\\\]/g, "")
    .replace(/\\left\b/g, "")
    .replace(/\\right\b/g, "")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}")
    .replace(/\\lbrace\b/g, "{")
    .replace(/\\rbrace\b/g, "}")
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\mathrm\{([^}]*)\}/g, "$1")
    .replace(/\\in\b/g, "\u2208")
    .replace(/\\notin\b/g, "\u2209")
    .replace(/\\mid\b/g, "|")
    .replace(/\\ne(q)?\b/g, "\u2260")
    .replace(/\\le(q)?\b/g, "\u2264")
    .replace(/\\ge(q)?\b/g, "\u2265")
    .replace(/\\times\b/g, "\u00d7")
    .replace(/\\cdot\b/g, "\u00b7")
    .replace(/\\dots\b/g, "...")
    .replace(/\\mathbb\{N\}/g, "\u2115")
    .replace(/\\overline\{([^}]+)\}/g, "$1")
    .replace(/\\[,;:!]/g, " ")
    .replace(/([0-9a-zA-Z])\s+\*\s+([0-9a-zA-Z])/g, "$1 \u00d7 $2")
    .replace(/\s+/g, " ")
    .trim();
  return convertDocPowers_(cleaned);
}

function convertDocPowers_(text) {
  return String(text || "")
    .replace(/\^\{([0-9+\-=()*]{1,8})\}/g, function(_, exp) { return toSuperscript_(exp); })
    .replace(/\^([0-9+\-=*]{1,4})/g, function(_, exp) { return toSuperscript_(exp); });
}

function toSuperscript_(value) {
  var map = {
    "0": "\u2070",
    "1": "\u00b9",
    "2": "\u00b2",
    "3": "\u00b3",
    "4": "\u2074",
    "5": "\u2075",
    "6": "\u2076",
    "7": "\u2077",
    "8": "\u2078",
    "9": "\u2079",
    "+": "\u207a",
    "-": "\u207b",
    "=": "\u207c",
    "(": "\u207d",
    ")": "\u207e",
    "*": "*"
  };
  return String(value || "").split("").map(function(ch) {
    return map[ch] || ch;
  }).join("");
}
function appendDocHeading_(body, text) {
  var p = body.appendParagraph(text);
  p.setBold(true)
    .setFontSize(13)
    .setForegroundColor("#0f766e")
    .setSpacingBefore(12)
    .setSpacingAfter(4);
  return p;
}

function appendQuestionParagraph_(body, text) {
  var p = body.appendParagraph(text);
  p.setBold(true)
    .setFontSize(11.5)
    .setForegroundColor("#111827")
    .setSpacingBefore(8)
    .setSpacingAfter(2);
  return p;
}

function appendOptionParagraph_(body, text) {
  var p = body.appendParagraph(text);
  p.setFontSize(11)
    .setForegroundColor("#111827")
    .setIndentStart(18)
    .setIndentFirstLine(0)
    .setSpacingBefore(1)
    .setSpacingAfter(1);
  var optionRun = p.editAsText();
  optionRun.setBold(0, Math.min(1, text.length - 1), true);
  return p;
}

function appendEssayParagraph_(body, text) {
  var p = body.appendParagraph(text);
  p.setFontSize(11)
    .setForegroundColor("#111827")
    .setSpacingBefore(4)
    .setSpacingAfter(2);
  if (/^bai\s*\d+\b/.test(foldDocText_(text))) p.setBold(true);
  return p;
}

function appendNormalParagraph_(body, text) {
  var p = body.appendParagraph(text);
  p.setFontSize(11)
    .setForegroundColor("#111827")
    .setSpacingAfter(2);
  return p;
}

function appendTeacherAnswerBox_(body, answerLines) {
  var table = body.appendTable();
  table.setBorderColor("#fb7185").setBorderWidth(1);
  var row = table.appendTableRow();
  var cell = row.appendTableCell();
  cell.setBackgroundColor("#fff1f2");
  cell.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);

  var title = cell.appendParagraph("PHAN DAP AN - CHI GIAO VIEN");
  title.setBold(true).setFontSize(11).setForegroundColor("#be123c").setSpacingAfter(6);

  for (var i = 0; i < answerLines.length; i++) {
    var line = answerLines[i];
    if (!line.trim()) {
      cell.appendParagraph("");
      continue;
    }
    var p = cell.appendParagraph(line);
    p.setFontSize(10.5).setForegroundColor("#111827").setSpacingAfter(1);
    var normalized = foldDocText_(line);
    if (isMajorQuizHeading_(normalized) || isTeacherAnswerLine_(normalized)) {
      p.setBold(true).setForegroundColor("#be123c").setSpacingBefore(4);
    }
  }
}

function foldDocText_(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function isTeacherAnswerLine_(normalized) {
  return /^(phan\s*dap\s*an|dap\s*an\s*(?:va|:|-)|goi\s*y\s*cham)\b/.test(normalized);
}

function isMajorQuizHeading_(normalized) {
  return /^(trac\s*nghiem|tu\s*luan|phan\s*(i|ii|1|2)\b)/.test(normalized);
}

function parseQuizHtmlForDoc_(html) {
  var titleMatch = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  var metaMatch = String(html).match(/<div[^>]*class=["'][^"']*meta[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  var contentMatch = String(html).match(/<div[^>]*class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/body>/i);
  return {
    title: cleanDocText_(titleMatch ? titleMatch[1] : ""),
    meta: cleanDocText_(metaMatch ? metaMatch[1] : ""),
    contentHtml: contentMatch ? contentMatch[1] : html
  };
}

function appendHtmlContentToDoc_(body, html) {
  var cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ");

  cleaned = decodeHtmlEntities_(cleaned)
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) {
    body.appendParagraph("(Chua co noi dung de kiem tra.)").setForegroundColor("#94a3b8").setItalic(true);
    return;
  }

  var lines = cleaned.split(/\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) {
      body.appendParagraph("");
      continue;
    }
    var paragraph = body.appendParagraph(line);
    paragraph.setFontSize(11).setForegroundColor("#111827");

    if (/^(TRAC NGHIEM|TRẮC NGHIỆM|TU LUAN|TỰ LUẬN|DAP AN|ĐÁP ÁN|PHAN DAP AN|PHẦN ĐÁP ÁN)/i.test(line)) {
      paragraph.setBold(true).setForegroundColor("#1d4ed8").setSpacingBefore(8);
    } else if (/^(Cau|Câu)\s*\d+/i.test(line)) {
      paragraph.setBold(true).setSpacingBefore(6);
    }
  }
}

function cleanDocText_(html) {
  return decodeHtmlEntities_(String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtmlEntities_(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function requireIdentityBridge_(data) {
  var expected = getSecurityProperty_('APP_IDENTITY_BRIDGE_TOKEN');
  if (!expected || String(data.identityBridgeToken || '') !== expected) throw new Error('Không có quyền máy chủ xác thực.');
}
function handleGetSessionIdentity_(data) {
  requireIdentityBridge_(data);
  var role = requireStaffSession_(data);
  var token = String(data.adminSessionToken || data.staffSessionToken || '');
  var identity = role === 'teacher' ? getTeacherSessionProfile_(data) : { role: role, expiresAt: Number(CacheService.getScriptCache().get('staff-session-expiry:' + token) || 0) };
  if (!(identity.expiresAt > Date.now())) throw new Error('Đăng nhập lại sau khi cập nhật máy chủ.');
  return json_({ status: 'success', identity: identity });
}
function recordLoginAttempt_(key) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache(); var name = 'login-attempt:' + key;
    var count = Number(cache.get(name) || 0);
    if (count >= 10) throw new Error('Thử đăng nhập quá nhiều lần. Hãy thử lại sau 15 phút.');
    cache.put(name, String(count + 1), 900);
  } finally { lock.releaseLock(); }
}
function storeStudentSession_(student) {
  student.expiresAt = Date.now() + APPKHOBAI_ADMIN_SESSION_SECONDS * 1000;
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('student-session:' + token, JSON.stringify(student), APPKHOBAI_ADMIN_SESSION_SECONDS);
  return json_({ status: 'success', studentSessionToken: token, studentProfile: student, expiresAt: student.expiresAt });
}

function handleRegistrationAdminAction_(data) {
  requireAdminSession_(data);
  var allowed = ['listPending', 'listStudents', 'markDropout', 'markExistingRegistration', 'deleteRegistration', 'syncStudent', 'syncSchoolYearClasses', 'syncCurrentSchoolYear'];
  if (allowed.indexOf(data.registrationAction) < 0) throw new Error('Thao tác đăng ký không được hỗ trợ.');
  var url = getSecurityProperty_('APP_REGISTRATION_WEB_APP_URL');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) throw new Error('Chưa cấu hình APP_REGISTRATION_WEB_APP_URL.');
  var params = Object.assign({}, data.params || {}, { action: data.registrationAction, adminSessionToken: data.adminSessionToken, callback: '' });
  var response = UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify(params), muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Máy chủ đăng ký chưa phản hồi.');
  var result = JSON.parse(response.getContentText() || '{}');
  if (!result.success) throw new Error(result.message || 'Chưa cập nhật được Sheet.');
  return json_({ status: 'success', result: result });
}
function createVerifiedStudentSession_(data) {
  requireIdentityBridge_(data);
  if (!data.student || !data.student.id || !data.student.accessCode) throw new Error('Thiếu hồ sơ học sinh đã xác thực.');
  return storeStudentSession_(data.student);
}
function createStudentSession_(data) {
  var code = normalizeMailboxCode_(data.accessCode);
  if (!/^HS[0-9]{3,15}$/.test(code)) throw new Error('Mã học sinh không hợp lệ.');
  recordLoginAttempt_('student:' + code);
  var sheet = SpreadsheetApp.openById(APPKHOBAI_DATA_SPREADSHEET_ID).getSheetByName('Data');
  var rows = sheet.getDataRange().getValues().slice(1);
  var row = rows.find(function(item) { return normalizeMailboxCode_(item[49]) === code && !String(item[36] || '').trim(); });
  if (!row) throw new Error('Không xác thực được mã học sinh trên máy chủ. Cần đồng bộ mã với Sheet.');
  CacheService.getScriptCache().remove('login-attempt:student:' + code);
  return storeStudentSession_({ accessCode: code, fullName: String(row[1] || ''), className: String(row[51] || row[6] || ''),
    schoolYear: String(row[52] || row[7] || ''), schoolCode: String(row[54] || '') });
}
function requireStudentSession_(data) {
  var token = String(data.studentSessionToken || '').trim();
  var cached = token ? CacheService.getScriptCache().get('student-session:' + token) : '';
  var student; try { student = JSON.parse(cached || 'null'); } catch (error) {}
  if (!student || !student.accessCode || student.expiresAt && student.expiresAt <= Date.now()) throw new Error('Phiên học sinh đã hết hạn. Hãy đăng nhập lại.');
  return student;
}
function studentMayReadMailboxRow_(student, row) {
  if (row[2] && String(row[2]) !== String(student.schoolYear)) return false;
  var type = String(row[3]).toLowerCase();
  return type === 'all' || (type === 'class' && String(row[4]) === String(student.className))
    || (type === 'student' && normalizeMailboxCode_(row[4]) === normalizeMailboxCode_(student.accessCode));
}
function createUploadPermit_(data) {
  var student = requireStudentSession_(data);
  var folderId = String(data.folderId || '');
  if ([APPKHOBAI_IMAGE_DRIVE_FOLDER_ID, APPKHOBAI_STUDENT_SUBMISSION_FOLDER_ID].indexOf(folderId) < 0) throw new Error('Không có quyền tải vào thư mục này.');
  var mime = String(data.mimeType || '').toLowerCase();
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) throw new Error('Bài nộp/hồ sơ chỉ nhận JPG, PNG, WebP hoặc PDF.');
  var bytes = Number(data.bytes || 0);
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > 20 * 1024 * 1024) throw new Error('Tệp vượt giới hạn 20 MB hoặc bị rỗng.');
  recordLoginAttempt_('upload:' + student.accessCode);
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('upload-permit:' + token, JSON.stringify({ folderId: folderId, mimeType: mime,
    bytes: bytes, filename: String(data.filename || ''), accessCode: student.accessCode }), 600);
  return json_({ status: 'success', uploadPermit: token });
}
function consumeUploadPermit_(data, folderId) {
  var student = requireStudentSession_(data); var token = String(data.uploadPermit || '');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache(); var permit;
    try { permit = JSON.parse(cache.get('upload-permit:' + token) || 'null'); } catch (error) {}
    if (!permit || permit.accessCode !== student.accessCode || permit.folderId !== folderId
      || permit.mimeType !== String(data.mimeType || '').toLowerCase() || permit.filename !== String(data.filename || '')) throw new Error('Quyền tải tệp không hợp lệ hoặc đã dùng.');
    if (Utilities.base64Decode(data.base64).length !== permit.bytes) throw new Error('Dung lượng tệp không khớp quyền tải.');
    cache.remove('upload-permit:' + token);
  } finally { lock.releaseLock(); }
}
