var APPKHOBAI_GEMINI_API_KEY = "AIzaSyCBMtpUiqVBauvIBqVenyrwNhP1vaMAe10";
var APPKHOBAI_DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
var APPKHOBAI_ALLOWED_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-lite"
];
var APPKHOBAI_MAX_AI_FILE_BYTES = 20 * 1024 * 1024;
var APPKHOBAI_MASTER_DRIVE_FOLDER_ID = "1Cl_WOAr09kXsmL3pBRnbQS49vt1ya7DK";
var APPKHOBAI_SCRIPT_VERSION = "2026-05-20-gemini-server-proxy-v1";

// --- MÃ BẢO MẬT ĐÃ ĐƯỢC THÊM VÀO ---
var SECRET_TOKEN = "NGUYENANNINH_KHOA_2026"; 

// Hàm giúp kiểm tra kết nối Web App.
function doGet(e) {
  return ContentService.createTextOutput("KET NOI MAY CHU THANH CONG. Version: " + APPKHOBAI_SCRIPT_VERSION);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || "{}");

    // --- BƯỚC CHẶN 1: KIỂM TRA MÃ BẢO MẬT TỪ FRONTEND ---
    if (data.secretToken !== SECRET_TOKEN) {
      return json_({ status: "error", message: "Từ chối truy cập: Sai mã bảo mật hệ thống." });
    }

    // 1. GỌI AI
    if (data.action === "gemini") {
      return handleGeminiProxy_(data);
    }

    if (data.action === "askAI" || data.action === "gradeStudentWork") {
      if (data.action === "gradeStudentWork") data.mode = "gradeStudentWork";
      return handleAskAI_(data);
    }

    // 2. ẨN FILE / ĐỔI TÊN KHỎI KHO CHUNG
    if (data.action === "deleteFile" || data.action === "rename") {
      var fileToHide = DriveApp.getFileById(data.fileId);
      if (fileToHide.getName().indexOf("[CHO_XOA] ") !== 0) {
        fileToHide.setName("[CHO_XOA] " + fileToHide.getName());
      }
      return json_({ status: "success" });
    }

    // 3. TAO GOOGLE DOC DEP TU NOI DUNG HTML BAI KIEM TRA
    if (data.action === "createGoogleDocFromHtml") {
      return handleCreateGoogleDocFromHtml_(data);
    }

    // --- BƯỚC CHẶN 2: CHỐNG BƠM RÁC VÀO KHO DRIVE CHUNG ---
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
    var folder = DriveApp.getFolderById(folderId);
    var decodedData = Utilities.base64Decode(data.base64);
    var uniqueFilename = getUniqueFileName_(folder, data.filename);
    var newFile = folder.createFile(Utilities.newBlob(decodedData, data.mimeType, uniqueFilename));
    
    try {
      newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareError) {}

    return json_({ status: "success", url: newFile.getUrl(), fileId: newFile.getId(), filename: uniqueFilename });
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

// --- CÁC HÀM XỬ LÝ AI CỦA THẦY ĐƯỢC GIỮ NGUYÊN HOÀN TOÀN ---

function handleAskAI_(data) {
  if (!APPKHOBAI_GEMINI_API_KEY) throw new Error("Chua cau hinh GEMINI_API_KEY.");
  if (!data.fileId) throw new Error("Thieu fileId.");

  var file = DriveApp.getFileById(data.fileId);
  var prepared = prepareFileForAI_(file);

  if (prepared.bytes.length > APPKHOBAI_MAX_AI_FILE_BYTES) {
    throw new Error("File lon hon 20MB sau khi chuan bi. Hay tach file nho hon hoac tai len tai lieu ngan gon hon.");
  }

  var fileData = uploadGeminiFile_(prepared.name, prepared.mimeType, prepared.bytes);
  var modelOrder = getGeminiModelOrder_(data.model);
  var resultInfo = callGeminiWithFileFallback_(data.prompt || "", prepared, fileData, modelOrder, data.mode || "");

  return json_({
    status: "success",
    result: resultInfo.result,
    fileName: prepared.name,
    mimeType: prepared.mimeType,
    model: resultInfo.model
  });
}

function handleGeminiProxy_(data) {
  if (!APPKHOBAI_GEMINI_API_KEY) throw new Error("Chua cau hinh GEMINI_API_KEY.");

  var contents = Array.isArray(data.contents) ? data.contents : [];
  if (!contents.length) throw new Error("Thieu noi dung de goi Gemini.");

  var payload = {
    contents: contents,
    generationConfig: data.generationConfig || { temperature: 0.35, maxOutputTokens: 4096 }
  };
  if (data.systemInstruction) payload.systemInstruction = data.systemInstruction;

  var resultInfo = callGeminiPayloadFallback_(payload, getGeminiModelOrder_(data.modelId || data.model));
  var text = extractGeminiText_(resultInfo.response);
  return json_({
    status: "success",
    model: resultInfo.model,
    text: text,
    result: text,
    candidates: resultInfo.response.candidates || [],
    promptFeedback: resultInfo.response.promptFeedback || null
  });
}

function callGeminiPayloadFallback_(payload, modelOrder) {
  var lastError = "";
  var quotaModels = [];
  for (var i = 0; i < modelOrder.length; i++) {
    try {
      return { response: callGeminiPayload_(payload, modelOrder[i]), model: modelOrder[i] };
    } catch (error) {
      lastError = error.message || String(error);
      if (isQuotaErrorText_(lastError)) quotaModels.push(modelOrder[i]);
    }
  }
  if (quotaModels.length === modelOrder.length && modelOrder.length > 0) {
    throw new Error("Gemini dang het han muc su dung cho tat ca model da thu (" + modelOrder.join(", ") + "). Hay doi API key con quota, nang/gia han billing trong Google AI Studio, hoac thu lai sau it phut. Neu moi doi key, cap nhat Apps Script roi Deploy lai.");
  }
  throw new Error(compactText_(lastError || "Tat ca model Gemini deu chua dung duoc.", 900));
}

function callGeminiPayload_(payload, model) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(APPKHOBAI_GEMINI_API_KEY);
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

function uploadGeminiFile_(displayName, mimeType, bytes) {
  var startUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + encodeURIComponent(APPKHOBAI_GEMINI_API_KEY);
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

function callGeminiWithFileFallback_(prompt, prepared, geminiFile, modelOrder, mode) {
  var lastError = "";
  var errors = [];
  var quotaModels = [];
  for (var i = 0; i < modelOrder.length; i++) {
    try {
      return { result: callGeminiWithFile_(prompt, prepared, geminiFile, modelOrder[i], mode), model: modelOrder[i] };
    } catch (error) {
      lastError = error.message || String(error);
      errors.push(modelOrder[i] + ": " + compactText_(lastError, 240));
      if (isQuotaErrorText_(lastError)) quotaModels.push(modelOrder[i]);
    }
  }
  if (quotaModels.length === modelOrder.length && modelOrder.length > 0) {
    throw new Error("Gemini dang het han muc su dung cho tat ca model da thu (" + modelOrder.join(", ") + "). Hay doi API key con quota, nang/gia han billing trong Google AI Studio, hoac thu lai sau it phut. Neu moi doi key, cap nhat Apps Script roi Deploy lai.");
  }
  throw new Error(compactText_(lastError || ("Tat ca model Gemini deu chua dung duoc. " + errors.join(" | ")), 900));
}

function callGeminiWithFile_(prompt, prepared, geminiFile, model, mode) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(APPKHOBAI_GEMINI_API_KEY);
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

function handleCreateGoogleDocFromHtml_(data) {
  if (!data.html) throw new Error("Thieu noi dung HTML de tao Google Doc.");

  var folderId = data.folderId || APPKHOBAI_MASTER_DRIVE_FOLDER_ID;
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
  try {
    docFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareError) {}

  return json_({
    status: "success",
    url: docFile.getUrl(),
    fileId: docFile.getId(),
    filename: filename
  });
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
