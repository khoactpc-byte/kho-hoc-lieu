export const GRADES = ['6', '7', '8', '9'];
export const SUBJECTS = [
  'Toán', 'Ngữ Văn', 'Khoa học tự nhiên', 'Lịch sử & Địa Lý', 
  'Giáo dục công dân', 'Giáo dục địa phương', 'Công nghệ', 'HĐTT'
];
export const TOTAL_LESSONS = 35;
export const SCHOOL_YEARS = Array.from({length: 11}, (_, i) => `${2025 + i}-${2026 + i}`);

export const GOOGLE_API_KEY = 'AIzaSyAQwyUzt2jb8kBh_S4V2_SjuFKZi5K3Mc4';
export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' }
];
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export const TEXTBOOK_FOLDERS = {
  '6': '1Y7JgYgb4WlFNZUQ-caMsFk-VKXn2oz_u',
  '7': '1q7NGreGMkI8jzMptcx-f8fgkWUep1WDI',
  '8': '1KQL9MN9Q_yhKlGLK_UlZNZ1ICulQOszx',
  '9': '1X5pIlxQekZEBR8wNyApSY_ukig8YG9vd'
};

export const MASTER_DRIVE_FOLDER_ID = '1Cl_WOAr09kXsmL3pBRnbQS49vt1ya7DK';
export const IMAGE_DRIVE_FOLDER_ID = '1AnglegF_ekb6d1Tvtqi8WZjKgZ4l32Xk'; 
export const STUDENT_SUBMISSION_FOLDER_ID = '1Sn1wmYiuW4P0IzhOWfWDyhf2BW4IGQFk';
export const TEACHER_PLAN_FOLDER_ID = '13K9gbg-jpJ2RjsmZsc8pJwyPrkjgUznv';
export const QUIZ_DRIVE_FOLDER_ID = '1IlstZlmh3uC_PIooSlMfHnZ--HlomM0d';

export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzioyqvN2yR45AZAcF1nmcOjg5VOUTEtJ8-_ZLkPUW7mo8Pb_rWj1Ezb-GTghGwCZlYDQ/exec";
export const APPS_SCRIPT_SECRET_TOKEN = "NGUYENANNINH_KHOA_2026";
export const BACKGROUND_URL = '/hinh-nen.jpg';
export const IS_LOCAL_PREVIEW = window.location.protocol === 'file:';

export const getWeekData = (numStr) => {
  const n = parseInt(numStr);
  if (n === 10) return { isExam: true, top: "Kiểm tra", main: "KT_GK1", bg: "bg-rose-50", border: "border-rose-400 hover:border-rose-500", text: "text-rose-600", textHover: "group-hover:text-rose-700" };
  if (n === 18) return { isExam: true, top: "Kiểm tra", main: "KT_CK1", bg: "bg-purple-50", border: "border-purple-400 hover:border-purple-500", text: "text-purple-600", textHover: "group-hover:text-purple-700" };
  if (n === 26) return { isExam: true, top: "Kiểm tra", main: "KT_GK2", bg: "bg-orange-50", border: "border-orange-400 hover:border-orange-500", text: "text-orange-600", textHover: "group-hover:text-orange-700" };
  if (n === 35) return { isExam: true, top: "Kiểm tra", main: "KT_CK2", bg: "bg-red-50", border: "border-red-500 hover:border-red-600", text: "text-red-600", textHover: "group-hover:text-red-700" };
  return { isExam: false, top: "Tuần học", main: numStr, bg: "bg-white/80", border: "border-white hover:border-blue-500", text: "text-slate-700", textHover: "group-hover:text-blue-600" };
};

export const getWeekDisplayName = (numStr) => {
  const d = getWeekData(numStr);
  return d.isExam ? d.main : `Tuần ${numStr}`;
};

export const typesetMath = (root) => {
  if (!root || !window.MathJax?.typesetPromise) return;
  window.setTimeout(() => {
    try {
      window.MathJax.typesetClear?.([root]);
      window.MathJax.typesetPromise([root]).catch(() => undefined);
    } catch {
      return;
    }
  }, 0);
};

export const removeAccents = (str) => {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
};

export const formatTextbookName = (name) => {
    let clean = removeAccents(name.replace(/\.[^/.]+$/, "").replace(/\[.*?\]/g, ""));
    let isT1 = /tap\s*1|-1/i.test(clean);
    let isT2 = /tap\s*2|-2/i.test(clean);
    let volStr = isT1 ? '-1' : (isT2 ? '-2' : '');

    if (/toan/i.test(clean)) return 'Toán' + volStr;
    if (/van/i.test(clean)) return 'Ngữ Văn' + volStr;
    if (/khtn/i.test(clean) || /khoa hoc/i.test(clean)) return 'KHTN' + volStr;
    if (/lich su/i.test(clean) || /dia/i.test(clean) || /ls&dl/i.test(clean)) return 'LS&ĐL' + volStr;
    if (/cong dan/i.test(clean) || /gdcd/i.test(clean)) return 'GDCD' + volStr;
    if (/dia phuong/i.test(clean) || /gddp/i.test(clean)) return 'GDĐP' + volStr;
    if (/cong nghe/i.test(clean)) return 'Công nghệ' + volStr;
    if (/tin hoc/i.test(clean) || /tin/i.test(clean)) return 'Tin học' + volStr;
    if (/am nhac/i.test(clean) || /nhac/i.test(clean)) return 'Âm nhạc' + volStr;
    if (/mi thuat/i.test(clean) || /my thuat/i.test(clean)) return 'Mĩ thuật' + volStr;
    if (/tieng anh/i.test(clean) || /anh/i.test(clean)) return 'Tiếng Anh' + volStr;
    if (/the chat/i.test(clean) || /gdct/i.test(clean)) return 'GDTC' + volStr;
    if (/hoat dong/i.test(clean) || /hdtn/i.test(clean) || /hdtt/i.test(clean)) return 'HĐTT' + volStr;
    
    let fallback = name.replace(/\.[^/.]+$/, "").replace(/\[.*?\]/g, "").trim();
    return fallback.substring(0, 15) + (fallback.length > 15 ? '...' : '');
};

export const getSubjectShortName = (subject) => {
  switch(subject) {
    case 'Khoa học tự nhiên': return 'KHTN';
    case 'Lịch sử & Địa Lý': return 'LS&ĐL';
    case 'Giáo dục công dân': return 'GDCD';
    case 'Giáo dục địa phương': return 'GDĐP';
    default: return subject;
  }
};

export const getSubjectRank = (filename) => {
  const normalized = removeAccents(filename);
  if (normalized.includes('toan')) return 1;
  if (normalized.includes('van')) return 2;
  if (normalized.includes('khoa hoc') || normalized.includes('khtn')) return 3;
  if (normalized.includes('lich su') || normalized.includes('dia ly') || normalized.includes('dia li')) return 4;
  if (normalized.includes('cong dan') || normalized.includes('gdcd')) return 5;
  if (normalized.includes('dia phuong') || normalized.includes('gddp')) return 6;
  if (normalized.includes('cong nghe')) return 7;
  return 99;
};

export const getYouTubeId = (url) => {
  if (!url) return '';
  const match = String(url).match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
  return match ? match[1] : '';
};

export const isYouTubeUrl = (url) => Boolean(getYouTubeId(url));

export const getEmbedUrl = (url) => {
  if (!url) return '';
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  const ytMatch = getYouTubeId(url);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch}`;
  return url;
};

export const getYouTubeWatchUrl = (url) => {
  const id = getYouTubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : url;
};

export const getDefaultLinkTitle = (url) => {
  if (isYouTubeUrl(url)) return 'Video YouTube';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') || 'Link bài học';
  } catch {
    return 'Link bài học';
  }
};

export const extractDriveFileId = (url) => {
  if (!url) return '';
  const match = String(url).match(/\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
};

export const getDriveDisplayName = (name) => String(name || '').replace(/\[.*?\]_/, '').trim();
export const getDriveBaseName = (name) => getDriveDisplayName(name).replace(/\.[^/.]+$/, '').trim();
export const cleanDriveTitle = (name) => getDriveBaseName(name).toLowerCase();

export const normalizeServiceErrorMessage = (message) => {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'May chu bao loi khong xac dinh.';
  if (/429|quota|RESOURCE_EXHAUSTED|rate limit|GenerateRequestsPer|exceeded your current quota/i.test(raw)) {
    return 'Gemini dang het han muc su dung. Hay doi API key con quota, nang/gia han billing trong Google AI Studio, hoac thu lai sau it phut.';
  }
  if (/API key not valid|PERMISSION_DENIED|forbidden|403/i.test(raw)) {
    return 'Gemini chua nhan API key hoac API key khong co quyen su dung. Hay kiem tra lai API key trong Apps Script.';
  }
  if (raw.length <= 900) return raw;
  return `${raw.slice(0, 897)}...`;
};

export const postAppsScript = async (payload) => {
  const resp = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secretToken: APPS_SCRIPT_SECRET_TOKEN, ...payload })
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error(normalizeServiceErrorMessage(text || 'May chu Apps Script khong tra JSON.'), { cause: e }); }
  if (data.status === 'error') throw new Error(normalizeServiceErrorMessage(data.message || 'May chu bao loi.'));
  return data;
};
