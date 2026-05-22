import React, { lazy, Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  BookOpen, User, GraduationCap, Lock, ChevronRight, ChevronLeft, 
  FileText, Link as LinkIcon, MonitorPlay, Plus, Trash2, Home, 
  Image as ImageIcon, Save, Loader2, CheckCircle2, Folder, X, 
  ExternalLink, Copy, Download, Library, Bell, Settings, Newspaper, 
  Calendar, Clock, Sparkles, UploadCloud, RefreshCw, ListChecks, Maximize, 
  Minimize, ArrowUpAZ, ArrowDownAZ, Bold, Italic, Underline, Palette, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Camera, ArrowUp, 
  ArrowDown, ChevronDown, ChevronUp, Pin, Briefcase, Pencil, Eye 
} from 'lucide-react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, updateDoc, getDoc, deleteField } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { auth, db, appId } from './config/firebase';
import { 
  GRADES, SUBJECTS, TOTAL_LESSONS, SCHOOL_YEARS, 
  GOOGLE_API_KEY, GEMINI_MODELS, DEFAULT_GEMINI_MODEL, 
  TEXTBOOK_FOLDERS, MASTER_DRIVE_FOLDER_ID, IMAGE_DRIVE_FOLDER_ID, 
  STUDENT_SUBMISSION_FOLDER_ID, TEACHER_PLAN_FOLDER_ID, QUIZ_DRIVE_FOLDER_ID,
  APPS_SCRIPT_URL, APPS_SCRIPT_SECRET_TOKEN, BACKGROUND_URL, IS_LOCAL_PREVIEW, 
  getWeekData, getWeekDisplayName, typesetMath, removeAccents, 
  formatTextbookName, getSubjectShortName, getSubjectRank, 
  getYouTubeId, isYouTubeUrl, getEmbedUrl, getYouTubeWatchUrl, 
  getDefaultLinkTitle, extractDriveFileId, getDriveDisplayName, 
  getDriveBaseName, cleanDriveTitle, normalizeServiceErrorMessage, postAppsScript 
} from './utils/helpers';
import {
  buildSelfQuizQuestionsForStudent,
  extractEssayTextFromHtml,
  filterQuizResultsForContext,
  getDefaultSelfQuizDraft,
  gradeSelfQuizSubmission,
  makeEmptySelfQuizQuestion,
  normalizeQuizText,
  normalizeSelfQuizDraft,
  parseSelfQuizFromHtml,
  stripHtmlToText
} from './utils/selfQuiz';
import ClassOpsManager from './components/ClassOpsManager';
import SimpleScheduleTable from './components/SimpleScheduleTable';
import scorebookTemplate from './data/scorebookTemplate.json';

const SelfQuizTeacherTools = lazy(() => import('./components/SelfQuizTeacherTools'));
const HocSinhManager = lazy(() => import('./components/HocSinhManager'));
const ScorebookWorkspace = lazy(() => import('./components/ScorebookWorkspace'));
const AdminSettingsWorkspace = lazy(() => import('./components/AdminSettingsWorkspace'));

const REGISTRATION_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby6e5ya2k105Oe7i65k9viysIZbHKOF-9CosueiNy1GvnHJbVw1lHB_0eezSxO91ls/exec';
const ADDRESS_DIRECTORY_CACHE_KEY = 'khl-address-directory-v2';

const STUDENT_PROFILE_EDIT_FIELDS = [
  { key: 'fullName', label: 'Họ và tên' },
  { key: 'birthDate', label: 'Ngày sinh' },
  { key: 'identityCode', label: 'Mã định danh' },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'province', label: 'Tỉnh / Thành' },
  { key: 'ward', label: 'Xã / Phường' },
  { key: 'address', label: 'Số nhà / Khu phố' },
  { key: 'householdProvince', label: 'Tỉnh / Thành HK' },
  { key: 'householdWard', label: 'Xã / Phường HK' },
  { key: 'householdAddress', label: 'Số nhà / Khu phố HK' },
  { key: 'fatherName', label: 'Tên cha' },
  { key: 'fatherBirthYear', label: 'Năm sinh cha' },
  { key: 'fatherJob', label: 'Nghề nghiệp cha' },
  { key: 'fatherPhone', label: 'SĐT cha' },
  { key: 'motherName', label: 'Tên mẹ' },
  { key: 'motherBirthYear', label: 'Năm sinh mẹ' },
  { key: 'motherJob', label: 'Nghề nghiệp mẹ' },
  { key: 'motherPhone', label: 'SĐT mẹ' },
  { key: 'temporaryStatus', label: 'Tình trạng tạm trú' },
  { key: 'transport', label: 'Đi xe' }
];

const STUDENT_PROFILE_IMAGE_FIELDS = [
  { key: 'portraitUrl', label: 'Ảnh thẻ', filename: 'anh_the' },
  { key: 'birthCertificateUrl', label: 'Ảnh khai sinh', filename: 'khai_sinh' },
  { key: 'identityCardUrl', label: 'Ảnh căn cước', filename: 'can_cuoc' },
  { key: 'transcriptUrl', label: 'Ảnh học bạ', filename: 'hoc_ba' }
];

const STUDENT_PROFILE_FIELD_LABELS = Object.fromEntries(
  [...STUDENT_PROFILE_EDIT_FIELDS, ...STUDENT_PROFILE_IMAGE_FIELDS].map(field => [field.key, field.label])
);

const firstProfileDocumentUrl = (value = '') => String(value || '').split(/\s*,\s*|\n+/).map(item => item.trim()).filter(Boolean)[0] || '';
const getStudentProfileImageUrl = (value = '') => {
  const firstUrl = firstProfileDocumentUrl(value);
  const fileId = extractDriveFileId(firstUrl);
  return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w900` : firstUrl;
};
const getStudentProfileEmbedUrl = (value = '') => {
  const firstUrl = firstProfileDocumentUrl(value);
  const fileId = extractDriveFileId(firstUrl);
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : '';
};

const revokePreviewUrls = (value) => {
  const urls = Array.isArray(value) ? value : [value];
  urls.filter(Boolean).forEach(url => URL.revokeObjectURL(url));
};

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const loadImageElementFromFile = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => resolve({ image, url });
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Khong doc duoc anh.'));
  };
  image.src = url;
});

const distanceBetweenPoints = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));

const solveLinearSystem = (matrix, values) => {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    if (Math.abs(rows[pivot][col]) < 1e-8) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divisor = rows[col][col];
    for (let item = col; item <= size; item += 1) rows[col][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let item = col; item <= size; item += 1) rows[row][item] -= factor * rows[col][item];
    }
  }
  return rows.map(row => row[size]);
};

const getProjectiveTransform = (from, to) => {
  const matrix = [];
  const values = [];
  from.forEach((point, index) => {
    const target = to[index];
    const x = point.x;
    const y = point.y;
    const u = target.x;
    const v = target.y;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  });
  const h = solveLinearSystem(matrix, values);
  return h ? [...h, 1] : null;
};

const findDocumentCorners = (imageData, width, height) => {
  const source = imageData.data;
  const gray = new Uint8ClampedArray(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = (source[offset] * 0.299) + (source[offset + 1] * 0.587) + (source[offset + 2] * 0.114);
  }

  let count = 0;
  let sum = 0;
  let squareSum = 0;
  let maxMagnitude = 0;
  const marginX = Math.max(8, Math.floor(width * 0.025));
  const marginY = Math.max(8, Math.floor(height * 0.025));
  for (let y = marginY; y < height - marginY; y += 2) {
    for (let x = marginX; x < width - marginX; x += 2) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - (2 * gray[i - 1]) - gray[i + width - 1] + gray[i - width + 1] + (2 * gray[i + 1]) + gray[i + width + 1];
      const gy = -gray[i - width - 1] - (2 * gray[i - width]) - gray[i - width + 1] + gray[i + width - 1] + (2 * gray[i + width]) + gray[i + width + 1];
      const magnitude = Math.hypot(gx, gy);
      sum += magnitude;
      squareSum += magnitude * magnitude;
      maxMagnitude = Math.max(maxMagnitude, magnitude);
      count += 1;
    }
  }
  const mean = count ? sum / count : 0;
  const deviation = Math.sqrt(Math.max(0, (squareSum / Math.max(count, 1)) - (mean * mean)));
  const threshold = Math.max(36, mean + deviation * 1.15, maxMagnitude * 0.16);
  const corners = {
    tl: { score: Infinity, point: null },
    tr: { score: -Infinity, point: null },
    br: { score: -Infinity, point: null },
    bl: { score: -Infinity, point: null }
  };
  let strongPoints = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = marginY; y < height - marginY; y += 2) {
    for (let x = marginX; x < width - marginX; x += 2) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - (2 * gray[i - 1]) - gray[i + width - 1] + gray[i - width + 1] + (2 * gray[i + 1]) + gray[i + width + 1];
      const gy = -gray[i - width - 1] - (2 * gray[i - width]) - gray[i - width + 1] + gray[i + width - 1] + (2 * gray[i + width]) + gray[i + width + 1];
      if (Math.hypot(gx, gy) < threshold) continue;
      strongPoints += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const tlScore = x + y;
      const trScore = x - y;
      const brScore = x + y;
      const blScore = y - x;
      if (tlScore < corners.tl.score) corners.tl = { score: tlScore, point: { x, y } };
      if (trScore > corners.tr.score) corners.tr = { score: trScore, point: { x, y } };
      if (brScore > corners.br.score) corners.br = { score: brScore, point: { x, y } };
      if (blScore > corners.bl.score) corners.bl = { score: blScore, point: { x, y } };
    }
  }

  if (strongPoints < 60 || !corners.tl.point || !corners.tr.point || !corners.br.point || !corners.bl.point) {
    const padX = Math.floor(width * 0.04);
    const padY = Math.floor(height * 0.04);
    return [
      { x: padX, y: padY },
      { x: width - padX, y: padY },
      { x: width - padX, y: height - padY },
      { x: padX, y: height - padY }
    ];
  }

  const areaWidth = Math.max(1, maxX - minX);
  const areaHeight = Math.max(1, maxY - minY);
  if (areaWidth * areaHeight < width * height * 0.18) {
    const padX = Math.floor(width * 0.04);
    const padY = Math.floor(height * 0.04);
    return [
      { x: padX, y: padY },
      { x: width - padX, y: padY },
      { x: width - padX, y: height - padY },
      { x: padX, y: height - padY }
    ];
  }

  return [corners.tl.point, corners.tr.point, corners.br.point, corners.bl.point];
};

const enhanceScannedImageData = (imageData, mode = 'document') => {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);
  for (let index = 0; index < data.length; index += 4) {
    const lum = Math.round((data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114));
    histogram[lum] += 1;
  }
  const total = imageData.width * imageData.height;
  const percentile = (ratio) => {
    const target = total * ratio;
    let seen = 0;
    for (let value = 0; value < 256; value += 1) {
      seen += histogram[value];
      if (seen >= target) return value;
    }
    return 255;
  };
  const low = percentile(mode === 'photo' ? 0.01 : 0.03);
  const high = Math.max(low + 24, percentile(mode === 'photo' ? 0.985 : 0.965));
  for (let index = 0; index < data.length; index += 4) {
    if (mode === 'photo') {
      for (let channel = 0; channel < 3; channel += 1) {
        const normalized = ((data[index + channel] - low) / (high - low)) * 255;
        data[index + channel] = clampNumber(((normalized - 128) * 1.06) + 134, 0, 255);
      }
    } else {
      const lum = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
      const normalized = ((lum - low) / (high - low)) * 255;
      const lifted = ((normalized - 128) * 1.18) + 144;
      const value = clampNumber(lifted, 0, 255);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
  }
  return imageData;
};

const rotateCanvasByDegrees = (canvas, degrees) => {
  const radians = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const nextWidth = Math.ceil((canvas.width * cos) + (canvas.height * sin));
  const nextHeight = Math.ceil((canvas.width * sin) + (canvas.height * cos));
  const rotated = document.createElement('canvas');
  rotated.width = nextWidth;
  rotated.height = nextHeight;
  const ctx = rotated.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, nextWidth, nextHeight);
  ctx.translate(nextWidth / 2, nextHeight / 2);
  ctx.rotate(radians);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return rotated;
};

const estimateCanvasSkewAngle = (canvas) => {
  const maxSampleWidth = 720;
  const scale = Math.min(1, maxSampleWidth / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const points = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 360));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4;
      const lum = (data[offset] * 0.299) + (data[offset + 1] * 0.587) + (data[offset + 2] * 0.114);
      if (lum < 190) points.push({ x, y });
    }
  }
  if (points.length < 120) return 0;
  const centerX = width / 2;
  const centerY = height / 2;
  let bestAngle = 0;
  let bestScore = -Infinity;
  for (let angle = -8; angle <= 8; angle += 0.5) {
    const radians = (angle * Math.PI) / 180;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);
    const bins = new Uint16Array(height + width);
    points.forEach(point => {
      const projectedY = Math.round(((point.x - centerX) * sin) + ((point.y - centerY) * cos) + centerY);
      if (projectedY >= 0 && projectedY < bins.length) bins[projectedY] += 1;
    });
    let score = 0;
    for (let index = 1; index < bins.length; index += 1) {
      const diff = bins[index] - bins[index - 1];
      score += diff * diff;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return Math.abs(bestAngle) >= 0.7 ? bestAngle : 0;
};

const orientScannedCanvas = (canvas, orientation = 'auto') => {
  let nextCanvas = canvas;
  if (orientation === 'portrait' && nextCanvas.width > nextCanvas.height) {
    nextCanvas = rotateCanvasByDegrees(nextCanvas, 90);
  }
  if (orientation === 'landscape' && nextCanvas.height > nextCanvas.width) {
    nextCanvas = rotateCanvasByDegrees(nextCanvas, 90);
  }
  return nextCanvas;
};

const scanDocumentImageFile = async (file, { mode = 'document', orientation = 'auto' } = {}) => {
  const { image, url } = await loadImageElementFromFile(file);
  try {
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    sourceCtx.drawImage(image, 0, 0, width, height);
    const sourceImageData = sourceCtx.getImageData(0, 0, width, height);
    const corners = findDocumentCorners(sourceImageData, width, height);
    const topWidth = distanceBetweenPoints(corners[0], corners[1]);
    const bottomWidth = distanceBetweenPoints(corners[3], corners[2]);
    const leftHeight = distanceBetweenPoints(corners[0], corners[3]);
    const rightHeight = distanceBetweenPoints(corners[1], corners[2]);
    let outputWidth = Math.round(Math.max(topWidth, bottomWidth));
    let outputHeight = Math.round(Math.max(leftHeight, rightHeight));
    const outputScale = Math.min(1, maxDimension / Math.max(outputWidth, outputHeight));
    outputWidth = Math.max(320, Math.round(outputWidth * outputScale));
    outputHeight = Math.max(320, Math.round(outputHeight * outputScale));
    const destCorners = [
      { x: 0, y: 0 },
      { x: outputWidth - 1, y: 0 },
      { x: outputWidth - 1, y: outputHeight - 1 },
      { x: 0, y: outputHeight - 1 }
    ];
    const transform = getProjectiveTransform(destCorners, corners);
    if (!transform) throw new Error('Khong tinh duoc goc scan.');

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    const outputCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
    const outputImageData = outputCtx.createImageData(outputWidth, outputHeight);
    const sourceData = sourceImageData.data;
    const destData = outputImageData.data;
    for (let y = 0; y < outputHeight; y += 1) {
      for (let x = 0; x < outputWidth; x += 1) {
        const denominator = (transform[6] * x) + (transform[7] * y) + 1;
        const sx = clampNumber(((transform[0] * x) + (transform[1] * y) + transform[2]) / denominator, 0, width - 1);
        const sy = clampNumber(((transform[3] * x) + (transform[4] * y) + transform[5]) / denominator, 0, height - 1);
        const ix = Math.floor(sx);
        const iy = Math.floor(sy);
        const fx = sx - ix;
        const fy = sy - iy;
        const ix2 = Math.min(ix + 1, width - 1);
        const iy2 = Math.min(iy + 1, height - 1);
        const p00 = (iy * width + ix) * 4;
        const p10 = (iy * width + ix2) * 4;
        const p01 = (iy2 * width + ix) * 4;
        const p11 = (iy2 * width + ix2) * 4;
        const target = (y * outputWidth + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          const top = sourceData[p00 + channel] * (1 - fx) + sourceData[p10 + channel] * fx;
          const bottom = sourceData[p01 + channel] * (1 - fx) + sourceData[p11 + channel] * fx;
          destData[target + channel] = top * (1 - fy) + bottom * fy;
        }
      }
    }
    enhanceScannedImageData(outputImageData, mode);
    outputCtx.putImageData(outputImageData, 0, 0);
    let finalCanvas = outputCanvas;
    if (mode !== 'photo') {
      const skewAngle = estimateCanvasSkewAngle(finalCanvas);
      if (skewAngle) finalCanvas = rotateCanvasByDegrees(finalCanvas, -skewAngle);
    }
    finalCanvas = orientScannedCanvas(finalCanvas, orientation);
    const blob = await new Promise(resolve => finalCanvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('Khong tao duoc anh scan.');
    const cleanName = String(file.name || 'anh.jpg').replace(/\.[^.]+$/, '');
    return {
      file: new File([blob], `${cleanName}_scan.jpg`, { type: 'image/jpeg', lastModified: Date.now() }),
      url: URL.createObjectURL(blob),
      corners
    };
  } finally {
    URL.revokeObjectURL(url);
  }
};

const getStudentDisplayName = (fullName = '', compact = false) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Học sinh';
  if (!compact) return parts.join(' ');
  const last = parts[parts.length - 1] || '';
  const before = parts.length > 1 ? parts[parts.length - 2]?.slice(0, 1) : '';
  return before ? `${before} ${last}` : last;
};

const uniqueTextItems = (items = []) => [...new Set(items.map(item => String(item || '').trim()).filter(Boolean))];
const cleanDocId = (value) => String(value || 'default').replace(/[^\w-]+/g, '_');
const compactSchoolYearLabel = (schoolYear = '') => String(schoolYear || '').replace(/\s*-\s*/g, '-').trim();
const getGradeFromClassName = (className = '') => {
  const match = String(className || '').trim().match(/(?:^|\D)(1[0-2]|[1-9])(?:\D|$)/);
  return match ? match[1] : '';
};
const getGivenNameSortKey = (fullName = '') => {
  const parts = removeAccents(String(fullName || '').toLowerCase()).split(/\s+/).filter(Boolean);
  return `${parts[parts.length - 1] || ''} ${parts.join(' ')}`.trim();
};
const parseScoreNumber = (value) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};
const formatScoreNumber = (value) => {
  if (!Number.isFinite(value)) return '';
  return (Math.round(value * 10) / 10).toFixed(1);
};
const formatScoreDisplayValue = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const parsed = parseScoreNumber(text);
  return parsed === null ? text : formatScoreNumber(parsed);
};
const normalizeScoreInput = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const parsed = parseScoreNumber(normalized);
  if (parsed === null) return normalized;
  return formatScoreNumber(Math.min(10, Math.max(0, parsed)));
};
const getStudentYearIdentityKey = (student = {}) => {
  const accessCode = String(student.accessCode || student.studentAccessCode || '').trim().toUpperCase();
  if (accessCode) return `code:${accessCode}`;
  const identityCode = String(student.identityCode || '').replace(/\D/g, '');
  if (identityCode) return `id:${identityCode}`;
  const name = removeAccents(String(student.fullName || student.studentName || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
  const birth = String(student.birthDate || '').replace(/\D/g, '');
  return name ? `name:${name}:${birth}` : '';
};
const getQuickScoreKind = (scoreIndex) => {
  if (scoreIndex <= 3) return 'tx';
  if (scoreIndex === 4) return 'gk';
  if (scoreIndex === 5) return 'ck';
  if (scoreIndex === 6) return 'dtb';
  return 'dtbcn';
};
const getQuickScoreColumnWidth = (scoreIndex) => ({
  tx: 38,
  gk: 40,
  ck: 42,
  dtb: 44,
  dtbcn: 56
}[getQuickScoreKind(scoreIndex)] || 40);
const getQuickScoreTextClass = (scoreIndex) => ({
  tx: 'font-normal text-black',
  gk: 'font-black text-black',
  ck: 'font-black text-purple-800',
  dtb: 'font-black text-red-600',
  dtbcn: 'font-black text-red-600'
}[getQuickScoreKind(scoreIndex)] || 'font-bold text-slate-700');
const QUICK_SCORE_SUBJECTS = [
  { key: 'ngu_van', label: 'Văn', pageIndex: 0, academic: true, txCount: 4 },
  { key: 'toan', label: 'Toán', pageIndex: 1, academic: true, txCount: 4 },
  { key: 'gdcd', label: 'GDCD', pageIndex: 3, academic: true, txCount: 2 },
  { key: 'lsdl', label: 'LS-ĐL', pageIndex: 4, academic: true, txCount: 4 },
  { key: 'khtn', label: 'KHTN', pageIndex: 5, academic: true, txCount: 4 },
  { key: 'cong_nghe', label: 'Công nghệ', pageIndex: 6, academic: true, txCount: 2 }
];

const QUICK_SCORE_LABELS = {
  0: 'TX1',
  1: 'TX2',
  2: 'TX3',
  3: 'TX4',
  4: 'GK',
  5: 'CK',
  6: 'DTB',
  7: 'DTBCN'
};

const getQuickSubjectKeyFromName = (subjectName = '') => {
  const folded = removeAccents(String(subjectName || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
  if (!folded) return '';
  if (folded.includes('toan')) return 'toan';
  if (folded.includes('nguvan') || folded.includes('van')) return 'ngu_van';
  if (folded.includes('gdcd') || folded.includes('giaoduccongdan')) return 'gdcd';
  if (folded.includes('lsdl') || folded.includes('lichsuvadialy') || folded.includes('lichsudialy') || folded.includes('lichsu') || folded.includes('dialy')) return 'lsdl';
  if (folded.includes('khtn') || folded.includes('khoahoctunhien')) return 'khtn';
  if (folded.includes('congnghe')) return 'cong_nghe';
  return '';
};

const pickAttendanceBiasedScore = (scores = [], absenceRatio = 0.5) => {
  const sorted = [...scores].sort((a, b) => a - b);
  const ratio = Math.min(1, Math.max(0, Number.isFinite(absenceRatio) ? absenceRatio : 0.5));
  if (sorted.length <= 1) return sorted[0] ?? 0;
  if (sorted.length === 2) {
    const upperChance = 0.75 - (ratio * 0.5);
    return Math.random() < upperChance ? sorted[1] : sorted[0];
  }
  if (ratio <= 0.33) return Math.random() < 0.65 ? sorted[2] : (Math.random() < 0.7 ? sorted[1] : sorted[0]);
  if (ratio >= 0.67) return Math.random() < 0.65 ? sorted[0] : (Math.random() < 0.7 ? sorted[1] : sorted[2]);
  return Math.random() < 0.5 ? sorted[1] : (Math.random() < 0.5 ? sorted[0] : sorted[2]);
};

const formatQuickRandomScore = (score, scoreIndex) => {
  if (scoreIndex <= 3) return formatScoreNumber(score);
  if (scoreIndex !== 4 && scoreIndex !== 5) return formatScoreNumber(score);
  const decimal = [0.25, 0.5, 0.75][Math.floor(Math.random() * 3)];
  return formatScoreNumber(Math.min(10, score + decimal));
};

const getRandomQuickScore = (subjectKey = '', absenceRatio = 0.5, scoreIndex = 0) => {
  const random = Math.random();
  const rules = {
    toan: { low: 0.2, high: 0.1 },
    ngu_van: { low: 0.15, high: 0.15 },
    default: { low: 0.1, high: 0.5 }
  };
  const rule = rules[subjectKey] || rules.default;
  const middleChance = 1 - rule.low - rule.high;
  if (random < rule.low) return formatQuickRandomScore(pickAttendanceBiasedScore([3, 4], absenceRatio), scoreIndex);
  if (random < rule.low + middleChance) return formatQuickRandomScore(pickAttendanceBiasedScore([5, 6, 7], absenceRatio), scoreIndex);
  return formatQuickRandomScore(pickAttendanceBiasedScore([8, 9], absenceRatio), scoreIndex);
};

const loadRegistrationJsonp = (params = {}) => new Promise((resolve, reject) => {
  const callbackName = `__khlRegistration_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const script = document.createElement('script');
  const cleanup = () => {
    delete window[callbackName];
    script.remove();
  };
  const timeout = window.setTimeout(() => {
    cleanup();
    reject(new Error('Không tải được dữ liệu địa chỉ'));
  }, 9000);

  window[callbackName] = (data) => {
    window.clearTimeout(timeout);
    cleanup();
    resolve(data || {});
  };

  const url = new URL(REGISTRATION_WEB_APP_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('callback', callbackName);
  url.searchParams.set('t', Date.now());
  script.src = url.toString();
  script.onerror = () => {
    window.clearTimeout(timeout);
    cleanup();
    reject(new Error('Không tải được dữ liệu địa chỉ'));
  };
  document.body.appendChild(script);
});

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loginRole, setLoginRole] = useState(null); 
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [confirmModal, setConfirmModal] = useState({ show: false, message: '', onConfirm: null });
  const [modalMode, setModalMode] = useState('teacher');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isAdminPassEnabled, setIsAdminPassEnabled] = useState(true);
  const [adminPass, setAdminPass] = useState('123321');
  const [isTeacherPassEnabled, setIsTeacherPassEnabled] = useState(false);
  const [teacherPass, setTeacherPass] = useState('');
  const [isStudentCodeEnabled, setIsStudentCodeEnabled] = useState(true);
  const [currentSchoolYear, setCurrentSchoolYear] = useState('2025-2026'); 
  const [principalName, setPrincipalName] = useState('');
  const [inputYearLocks, setInputYearLocks] = useState({});
  const [transcriptStartDates, setTranscriptStartDates] = useState({});
  const [transcriptEndDates, setTranscriptEndDates] = useState({});
  const [transcriptGrade9EndDates, setTranscriptGrade9EndDates] = useState({});
  const [nanTeachers, setNanTeachers] = useState([]);
  const [classTeacherAssignments, setClassTeacherAssignments] = useState({});
  const [isAdminTextbookExpanded, setIsAdminTextbookExpanded] = useState(false);
  const [showStudentDatabase, setShowStudentDatabase] = useState(false);
  const [showClassOps, setShowClassOps] = useState(false);
  const [classOpsView, setClassOpsView] = useState('schedule');
  const [showScheduleWorkspace, setShowScheduleWorkspace] = useState(false);
  const [showAttendanceWorkspace, setShowAttendanceWorkspace] = useState(false);
  const [showLearningResultsWorkspace, setShowLearningResultsWorkspace] = useState(false);
  const [scorebookGrade, setScorebookGrade] = useState(null);
  const [scorebookInitialMode, setScorebookInitialMode] = useState('scorebook');
  const [quickScoreGrade, setQuickScoreGrade] = useState(String(GRADES?.[0] || '6'));
  const [quickScorebookEdits, setQuickScorebookEdits] = useState({});
  const [quickScoreSources, setQuickScoreSources] = useState({});
  const [quickInputDrafts, setQuickInputDrafts] = useState({});
  const [attendanceDocs, setAttendanceDocs] = useState([]);
  const [quickVisibleSemesters, setQuickVisibleSemesters] = useState({ hki: true, hkii: true });
  const [quickVisibleSubjects, setQuickVisibleSubjects] = useState(() => (
    QUICK_SCORE_SUBJECTS.reduce((acc, subject) => ({ ...acc, [subject.key]: true }), {})
  ));
  const [quickScoreLockedContext, setQuickScoreLockedContext] = useState(null);
  const [quickScorebookSavingKey, setQuickScorebookSavingKey] = useState('');
  const [showAdminCheckWorkspace, setShowAdminCheckWorkspace] = useState(false);
  const [showPasswordWorkspace, setShowPasswordWorkspace] = useState(false);
  const [showAdminSettingsWorkspace, setShowAdminSettingsWorkspace] = useState(false);
  const [mobileHomeTab, setMobileHomeTab] = useState('notifications'); 
  const [teacherTab, setTeacherTab] = useState('giang_day');
  const [newsList, setNewsList] = useState([]);
  const [viewingNews, setViewingNews] = useState(null);
  const [showAddNews, setShowAddNews] = useState(false);
  const [editingNews, setEditingNews] = useState(null);
  const [newsTitle, setNewsTitle] = useState('');
  const [isSubmittingNews, setIsSubmittingNews] = useState(false);
  const newsContentRef = useRef(null);
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isTextbookExpanded, setIsTextbookExpanded] = useState(window.innerWidth >= 640); 
  const [textbookFiles, setTextbookFiles] = useState([]);
  const [isLoadingTextbooks, setIsLoadingTextbooks] = useState(false);
  const [allMaterials, setAllMaterials] = useState([]);
  const [allNotes, setAllNotes] = useState([]);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showCommonLibraryWorkspace, setShowCommonLibraryWorkspace] = useState(false);
  const [uploadTab, setUploadTab] = useState('manual');
  const [manualFiles, setManualFiles] = useState([]);
  const [lessonFilesMap, setLessonFilesMap] = useState({});
  const [linkData, setLinkData] = useState({ title: '', url: '', lesson: '1', type: 'pdf' });
  const [showInlineLink, setShowInlineLink] = useState(false);
  const [inlineLinkData, setInlineLinkData] = useState({ title: '', url: '', type: 'link' });
  const [inlineFiles, setInlineFiles] = useState([]); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [noteHtml, setNoteHtml] = useState('');
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [quizHtml, setQuizHtml] = useState('');
  const [quizQuestionHtml, setQuizQuestionHtml] = useState('');
  const [quizAnswerHtml, setQuizAnswerHtml] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizTeacherTab, setQuizTeacherTab] = useState('compose');
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [showQuizEditor, setShowQuizEditor] = useState(false);
  const [showStudentQuizPanel, setShowStudentQuizPanel] = useState(true);
  const [showQuizComposeWorkspace, setShowQuizComposeWorkspace] = useState(false);
  const [showQuizWorkWorkspace, setShowQuizWorkWorkspace] = useState(false);
  const [showQuizArchive, setShowQuizArchive] = useState(false);
  const [quizPublishNow, setQuizPublishNow] = useState(false);
  const [quizPublishAt, setQuizPublishAt] = useState('');
  const [showQuizPublishModal, setShowQuizPublishModal] = useState(false);
  const [quizPublishModalAt, setQuizPublishModalAt] = useState('');
  const [pendingQuizContent, setPendingQuizContent] = useState('');
  const [pendingQuizDeliveryMode, setPendingQuizDeliveryMode] = useState('manual');
  const [pendingQuizScoreTarget, setPendingQuizScoreTarget] = useState(null);
  const [quizScoreTarget, setQuizScoreTarget] = useState(null);
  const [scoreTargetEdits, setScoreTargetEdits] = useState({});
  const [isSavingQuiz, setIsSavingQuiz] = useState(false);
  const [quizSaveSuccess, setQuizSaveSuccess] = useState(false);
  const [quizDocStatus, setQuizDocStatus] = useState({ state: '', message: '', url: '' });
  const [quizData, setQuizData] = useState(null);
  const [quizDeliveryMode, setQuizDeliveryMode] = useState('manual');
  const [showSelfQuizBuilder, setShowSelfQuizBuilder] = useState(false);
  const [selfQuizDraft, setSelfQuizDraft] = useState({ questions: [], shuffleQuestions: true, shuffleOptions: true, showScoreAfterSubmit: true, allowRetake: true });
  const [showQuizResults, setShowQuizResults] = useState(false);
  const [allQuizResults, setAllQuizResults] = useState([]);
  const [allHandwrittenSubmissions, setAllHandwrittenSubmissions] = useState([]);
  const [showHandwrittenSubmissions, setShowHandwrittenSubmissions] = useState(false);
  const [handwrittenViewerIndex, setHandwrittenViewerIndex] = useState(0);
  const [gradingSubmissionId, setGradingSubmissionId] = useState('');
  const [submissionGradeDrafts, setSubmissionGradeDrafts] = useState({});
  const [allStudents, setAllStudents] = useState([]);
  const [studentProfileRequestCount, setStudentProfileRequestCount] = useState(0);
  const [studentProfileRequests, setStudentProfileRequests] = useState([]);
  const [currentStudent, setCurrentStudent] = useState(null);
  const [showStudentProfileModal, setShowStudentProfileModal] = useState(false);
  const [studentProfileDraft, setStudentProfileDraft] = useState({});
  const [studentProfileImages, setStudentProfileImages] = useState({});
  const [studentProfileImagePreviews, setStudentProfileImagePreviews] = useState({});
  const [isSubmittingProfileRequest, setIsSubmittingProfileRequest] = useState(false);
  const [addressDirectory, setAddressDirectory] = useState({ provinces: [], communes: {} });
  const [showStudentAccessModal, setShowStudentAccessModal] = useState(false);
  const [studentAccessCode, setStudentAccessCode] = useState('');
  const [studentForgotMode, setStudentForgotMode] = useState(false);
  const [studentForgotName, setStudentForgotName] = useState('');
  const [studentForgotVerify, setStudentForgotVerify] = useState('');
  const [studentFoundCode, setStudentFoundCode] = useState('');
  const [studentQuizName, setStudentQuizName] = useState('');
  const [studentQuizAnswers, setStudentQuizAnswers] = useState({});
  const [studentQuizResult, setStudentQuizResult] = useState(null);
  const [showStudentWorkReview, setShowStudentWorkReview] = useState(false);
  const [studentQuizWarning, setStudentQuizWarning] = useState('');
  const [isSubmittingSelfQuiz, setIsSubmittingSelfQuiz] = useState(false);
  const [quizFiles, setQuizFiles] = useState([]);
  const [quizAttachments, setQuizAttachments] = useState([]);
  const [showQuizToolbar, setShowQuizToolbar] = useState(false);
  const [showQuizAttachment, setShowQuizAttachment] = useState(false);
  const [isPreviousQuizLoaded, setIsPreviousQuizLoaded] = useState(false);
  const autoSaveTimeoutRef = useRef(null);
  const studentQuizNameRef = useRef(null);
  const studentSubmitNameRef = useRef(null);
  const studentSubmitSectionRef = useRef(null);
  const autoGradingIdsRef = useRef(new Set());
  const submissionFilePickerActiveRef = useRef(false);
  const autoSelfQuizSubmitKeyRef = useRef('');
  const autoEssayLockKeyRef = useRef('');
  const essayPromptRef = useRef(null);
  const [isPastingImage, setIsPastingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageOwner, setSelectedImageOwner] = useState('lesson');
  const [imagePopupPos, setImagePopupPos] = useState({ x: 0, y: 0 });
  const contentEditableRef = useRef(null);
  const quizEditorRef = useRef(null);
  const quizAnswerEditorRef = useRef(null);
  const studentContentRef = useRef(null);
  const studentQuizContentRef = useRef(null);
  const studentWorkReviewRef = useRef(null);
  const quickQuizPreviewRef = useRef(null);
  const aiResponseContentRef = useRef(null);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [showQuickQuizPreview, setShowQuickQuizPreview] = useState(false);
  const [showMobileToolbar, setShowMobileToolbar] = useState(false);
  const [viewingMaterial, setViewingMaterial] = useState(null);
  const [driveFiles, setDriveFiles] = useState([]);
  const [driveSort, setDriveSort] = useState({ key: 'name', direction: 'asc' });
  const [materialSort, setMaterialSort] = useState('asc');
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [driveError, setDriveError] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiContextContent, setAiContextContent] = useState('');
  const [aiPrompt, setAiPrompt] = useState('Hãy tạo một đề gồm 5 câu hỏi trắc nghiệm và 1 bài tự luận dựa trên nội dung tôi cung cấp, kèm đáp án và biểu điểm rõ từng câu/từng ý.');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isGeneratingQuizAnswer, setIsGeneratingQuizAnswer] = useState(false);
  const [aiError, setAiError] = useState('');
  const [selectedGeminiModel, setSelectedGeminiModel] = useState(() => localStorage.getItem('khohoclieu-gemini-model') || DEFAULT_GEMINI_MODEL);
  const [aiSelectedLessons, setAiSelectedLessons] = useState([]);
  const [aiToolTab, setAiToolTab] = useState('quick');
  const [showAiLessonPicker, setShowAiLessonPicker] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [submissionFile, setSubmissionFile] = useState(null);
  const [submissionPreviewUrl, setSubmissionPreviewUrl] = useState('');
  const [isSubmittingWork, setIsSubmittingWork] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [planFile, setPlanFile] = useState(null);
  const [isUploadingPlan, setIsUploadingPlan] = useState(false);
  const [planStatus, setPlanStatus] = useState('');
  const [planSubject, setPlanSubject] = useState(''); 
  const [allQuizzes, setAllQuizzes] = useState([]);
  const [nowMs, setNowMs] = useState(Date.now());

  const noteId = selectedGrade && selectedSubject && selectedLesson ? `g${selectedGrade}_${selectedSubject.replace(/\s/g, '')}_l${selectedLesson}` : null;
  const quizId = selectedGrade && selectedSubject && selectedLesson && currentSchoolYear ? `${currentSchoolYear}_g${selectedGrade}_${selectedSubject.replace(/\s/g, '')}_l${selectedLesson}` : null;
  const currentSchoolYearKey = useMemo(() => compactSchoolYearLabel(currentSchoolYear), [currentSchoolYear]);
  const isCurrentSchoolYearInputLocked = useMemo(() => Boolean(inputYearLocks?.[currentSchoolYearKey]), [inputYearLocks, currentSchoolYearKey]);
  const canWriteCurrentSchoolYear = !isCurrentSchoolYearInputLocked;
  const activeStudentProfile = useMemo(() => {
    if (!currentStudent?.id) return currentStudent;
    const identityKey = getStudentYearIdentityKey(currentStudent);
    const sameYearMatch = identityKey
      ? allStudents.find(student => String(student.schoolYear || '') === String(currentSchoolYear || '') && getStudentYearIdentityKey(student) === identityKey)
      : null;
    return sameYearMatch || allStudents.find(student => student.id === currentStudent.id) || currentStudent;
  }, [allStudents, currentStudent, currentSchoolYear]);
  const activeStudentPendingProfileRequests = useMemo(() => {
    if (!activeStudentProfile?.id && !currentStudent?.id) return [];
    const studentId = String(activeStudentProfile?.id || currentStudent?.id || '').trim();
    const accessCode = String(activeStudentProfile?.accessCode || currentStudent?.accessCode || '').trim().toUpperCase();
    return studentProfileRequests
      .filter(request => (request.status || 'pending') === 'pending')
      .filter(request => {
        const requestStudentId = String(request.studentId || '').trim();
        const requestAccessCode = String(request.accessCode || '').trim().toUpperCase();
        if (studentId && requestStudentId && requestStudentId === studentId) return true;
        if (accessCode && requestAccessCode && requestAccessCode === accessCode) return true;
        return false;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [activeStudentProfile, currentStudent, studentProfileRequests]);
  const activeStudentPendingProfileFieldLabels = useMemo(() => {
    const keys = [...new Set(activeStudentPendingProfileRequests.flatMap(request => Object.keys(request.changes || {})))];
    return keys.map(key => STUDENT_PROFILE_FIELD_LABELS[key] || key);
  }, [activeStudentPendingProfileRequests]);
  const activeStudentPendingProfileFieldKeys = useMemo(() => (
    new Set(activeStudentPendingProfileRequests.flatMap(request => Object.keys(request.changes || {})))
  ), [activeStudentPendingProfileRequests]);
  const activeStudentPendingProfileChanges = useMemo(() => (
    activeStudentPendingProfileRequests.reduce((acc, request) => ({
      ...acc,
      ...(request.changes || {})
    }), {})
  ), [activeStudentPendingProfileRequests]);
  useEffect(() => {
    if (!showStudentProfileModal || !activeStudentProfile) return;
    setStudentProfileDraft(Object.fromEntries(STUDENT_PROFILE_EDIT_FIELDS.map(field => [
      field.key,
      activeStudentPendingProfileChanges[field.key] ?? activeStudentProfile[field.key] ?? ''
    ])));
    setStudentProfileImages({});
    setStudentProfileImagePreviews(prev => {
      Object.values(prev || {}).forEach(revokePreviewUrls);
      return {};
    });
  }, [showStudentProfileModal, activeStudentProfile, activeStudentPendingProfileChanges]);
  const derivedProvinceOptions = useMemo(() => uniqueTextItems([
    ...addressDirectory.provinces,
    ...allStudents.flatMap(student => [student.province, student.householdProvince]),
    activeStudentProfile?.province,
    activeStudentProfile?.householdProvince,
    studentProfileDraft.province,
    studentProfileDraft.householdProvince
  ]).sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })), [addressDirectory.provinces, allStudents, activeStudentProfile, studentProfileDraft.province, studentProfileDraft.householdProvince]);
  const getStudentProfileWardOptions = useCallback((province = '', currentValue = '', household = false) => {
    const sheetOptions = addressDirectory.communes[String(province || '').trim()] || [];
    const studentOptions = allStudents
      .filter(student => !province || student.province === province || student.householdProvince === province)
      .flatMap(student => household ? [student.householdWard, student.ward] : [student.ward, student.householdWard]);
    return uniqueTextItems([...sheetOptions, ...studentOptions, currentValue])
      .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
  }, [addressDirectory.communes, allStudents]);
  const currentWardOptions = useMemo(() => getStudentProfileWardOptions(studentProfileDraft.province, studentProfileDraft.ward, false), [getStudentProfileWardOptions, studentProfileDraft.province, studentProfileDraft.ward]);
  const householdWardOptions = useMemo(() => getStudentProfileWardOptions(studentProfileDraft.householdProvince, studentProfileDraft.householdWard, true), [getStudentProfileWardOptions, studentProfileDraft.householdProvince, studentProfileDraft.householdWard]);
  const activeStudentGrade = useMemo(() => {
    return String(activeStudentProfile?.className || '').match(/[1-9]\d*/)?.[0] || '';
  }, [activeStudentProfile]);
  const activeStudentIdentityKey = useMemo(() => {
    const code = String(activeStudentProfile?.accessCode || currentStudent?.accessCode || '').trim().toUpperCase();
    if (code) return `code-${code}`;
    if (activeStudentProfile?.id || currentStudent?.id) return `id-${activeStudentProfile?.id || currentStudent?.id}`;
    const nameKey = removeAccents(String(activeStudentProfile?.fullName || currentStudent?.fullName || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
    return nameKey || 'guest';
  }, [activeStudentProfile, currentStudent]);
  const studentCanAccessCurrentGradeQuiz = useMemo(() => {
    if (role !== 'student' || !activeStudentGrade || !selectedGrade) return true;
    return String(selectedGrade) === String(activeStudentGrade);
  }, [role, activeStudentGrade, selectedGrade]);
  const previousSchoolYear = useMemo(() => {
    const years = String(currentSchoolYear || '').match(/\d{4}/g);
    if (!years || years.length < 2) return '';
    return `${Number(years[0]) - 1}-${Number(years[1]) - 1}`;
  }, [currentSchoolYear]);
  const previousQuizId = selectedGrade && selectedSubject && selectedLesson && previousSchoolYear ? `${previousSchoolYear}_g${selectedGrade}_${selectedSubject.replace(/\s/g, '')}_l${selectedLesson}` : null;

  useEffect(() => { return () => { if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current); }; }, []);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (role && !selectedGrade && window.innerWidth >= 640 && !selectedLesson && !selectedSubject) { setSelectedGrade('6'); setIsTextbookExpanded(true); } }, [role, selectedGrade, selectedLesson, selectedSubject]);

  const showNotification = useCallback((message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  }, []);

  const loadStudentProfileCommunes = useCallback(async (province) => {
    const provinceName = String(province || '').trim();
    if (!provinceName || addressDirectory.communes[provinceName]) return;
    try {
      const data = await loadRegistrationJsonp({ action: 'communes', province: provinceName });
      const items = uniqueTextItems(data.items || data.communes || []);
      setAddressDirectory(prev => ({
        ...prev,
        communes: {
          ...prev.communes,
          [provinceName]: items
        }
      }));
    } catch (error) {
      setAddressDirectory(prev => ({
        ...prev,
        communes: {
          ...prev.communes,
          [provinceName]: []
        }
      }));
    }
  }, [addressDirectory.communes]);

  const handleStudentProfileFieldChange = useCallback((key, value) => {
    const nextValue = key === 'fullName' ? String(value || '').toLocaleUpperCase('vi-VN') : value;
    setStudentProfileDraft(prev => {
      const next = { ...prev, [key]: nextValue };
      if (key === 'province' && prev.province !== nextValue) next.ward = '';
      if (key === 'householdProvince' && prev.householdProvince !== nextValue) next.householdWard = '';
      return next;
    });
  }, []);

  useEffect(() => {
    if (!showStudentProfileModal || addressDirectory.provinces.length) return;
    try {
      const cached = JSON.parse(localStorage.getItem(ADDRESS_DIRECTORY_CACHE_KEY) || 'null');
      if (cached?.provinces?.length) {
        setAddressDirectory({
          provinces: uniqueTextItems(cached.provinces),
          communes: cached.communes || {}
        });
        return;
      }
    } catch {}
    let active = true;
    loadRegistrationJsonp({ action: 'addressDirectory' })
      .then(data => {
        if (!active) return;
        if (data.provinces?.length || data.communes) {
          const nextDirectory = {
            provinces: uniqueTextItems(data.provinces || data.items || []),
            communes: data.communes || {}
          };
          setAddressDirectory(nextDirectory);
          localStorage.setItem(ADDRESS_DIRECTORY_CACHE_KEY, JSON.stringify(nextDirectory));
          return;
        }
        return loadRegistrationJsonp({ action: 'provinces' }).then(fallback => {
          if (!active) return;
          const items = uniqueTextItems(fallback.items || fallback.provinces || []);
          setAddressDirectory(prev => ({ ...prev, provinces: items }));
        });
      })
      .catch(() => {
        loadRegistrationJsonp({ action: 'provinces' })
          .then(fallback => {
            if (!active) return;
            const items = uniqueTextItems(fallback.items || fallback.provinces || []);
            setAddressDirectory(prev => ({ ...prev, provinces: items }));
          })
          .catch(() => {});
      });
    return () => { active = false; };
  }, [showStudentProfileModal, addressDirectory.provinces.length]);

  useEffect(() => {
    if (!showStudentProfileModal) return;
    loadStudentProfileCommunes(studentProfileDraft.province);
    loadStudentProfileCommunes(studentProfileDraft.householdProvince);
  }, [showStudentProfileModal, studentProfileDraft.province, studentProfileDraft.householdProvince, loadStudentProfileCommunes]);

  const normalizeStudentLookup = (value = '') => removeAccents(String(value || '').trim().toLowerCase()).replace(/\s+/g, ' ');
  const getStudentVerifyTail = (student = {}) => {
    const identityDigits = String(student.identityCode || '').replace(/\D/g, '');
    if (identityDigits) return identityDigits.slice(-2);
    const birthDigits = String(student.birthDate || '').replace(/\D/g, '');
    return birthDigits.slice(-2);
  };
  const normalizeStudentAccessSuffix = (value = '') => String(value || '').toUpperCase().replace(/\s/g, '').replace(/^HS/, '').replace(/\D/g, '');
  const getStudentAccessLoginCode = (value = studentAccessCode) => {
    const suffix = normalizeStudentAccessSuffix(value);
    return suffix ? `HS${suffix}` : '';
  };
  const openStudentArea = (student = {}) => {
    const grade = String(student.className || '').match(/[1-9]\d*/)?.[0];
    if (grade) setSelectedGrade(grade);
    setCurrentStudent(student?.id ? student : null);
    if (student.fullName) {
      setStudentName(student.fullName);
      setStudentQuizName(student.fullName);
    }
    setRole('student');
    setLoginRole('student');
    setShowStudentAccessModal(false);
    setStudentAccessCode('');
    setStudentForgotMode(false);
    setStudentFoundCode('');
    showNotification(student.fullName ? `Chào ${student.fullName}!` : 'Đã vào giao diện học sinh.');
  };
  const handleStudentCodeLogin = () => {
    const suffix = normalizeStudentAccessSuffix(studentAccessCode);
    const code = getStudentAccessLoginCode(suffix);
    const codeDigits = suffix;
    if (!suffix) {
      showNotification('Em nhập mã HS hoặc mã định danh trước nhé.', 'error');
      return;
    }
    const candidates = allStudents.filter(item => {
      if ((item.status || 'active') === 'dropped') return false;
      const accessCode = String(item.accessCode || '').toUpperCase().replace(/\s/g, '');
      const identityCode = String(item.identityCode || '').replace(/\D/g, '');
      return accessCode === code || (!!codeDigits && identityCode === codeDigits);
    });
    const student = candidates.find(item => String(item.schoolYear || '') === String(currentSchoolYear || '')) || candidates[0];
    if (!student) {
      showNotification('Không tìm thấy mã HS/mã định danh hoặc tài khoản đã ngưng học.', 'error');
      return;
    }
    openStudentArea(student);
  };
  const handleFindStudentCode = () => {
    const nameNeedle = normalizeStudentLookup(studentForgotName);
    const verifyTail = String(studentForgotVerify || '').replace(/\D/g, '').slice(-2);
    if (!nameNeedle || verifyTail.length !== 2) {
      showNotification('Nhập họ tên và đúng 2 số xác minh nhé.', 'error');
      return;
    }
    const matches = allStudents.filter(student => {
      if ((student.status || 'active') === 'dropped') return false;
      const sameName = normalizeStudentLookup(student.fullName) === nameNeedle;
      return sameName && getStudentVerifyTail(student) === verifyTail;
    });
    if (matches.length === 1) {
      setStudentFoundCode(matches[0].accessCode || '');
      setStudentAccessCode(normalizeStudentAccessSuffix(matches[0].accessCode || ''));
      setStudentName(matches[0].fullName || '');
      showNotification('Đã tìm thấy mã học sinh.');
    } else if (matches.length > 1) {
      setStudentFoundCode(matches.map(item => item.accessCode).filter(Boolean).join(', '));
      showNotification('Có nhiều bạn trùng thông tin, hãy báo giáo viên kiểm tra thêm.', 'error');
    } else {
      setStudentFoundCode('');
      showNotification('Chưa tìm thấy. Kiểm tra lại họ tên và 2 số cuối.', 'error');
    }
  };

  const applyStudentProfileImageFile = (key, file) => {
    setStudentProfileImages(prev => ({ ...prev, [key]: file || null }));
    setStudentProfileImagePreviews(prev => {
      revokePreviewUrls(prev?.[key]);
      return { ...prev, [key]: file ? URL.createObjectURL(file) : '' };
    });
  };

  const applySubmissionFile = (file) => {
    setSubmissionFile(file || null);
    setSubmissionStatus('');
  };

  const handleStudentProfileImageChange = (key, file) => {
    applyStudentProfileImageFile(key, file || null);
  };

  const applyStudentProfileImageFiles = (key, files = [], append = false) => {
    const nextFiles = Array.from(files || []).filter(Boolean);
    if (!nextFiles.length) return;
    setStudentProfileImages(prev => ({
      ...prev,
      [key]: append ? [...(Array.isArray(prev[key]) ? prev[key] : (prev[key] ? [prev[key]] : [])), ...nextFiles] : nextFiles
    }));
    setStudentProfileImagePreviews(prev => {
      revokePreviewUrls(prev?.[key]);
      const previousFiles = append ? (Array.isArray(studentProfileImages[key]) ? studentProfileImages[key] : (studentProfileImages[key] ? [studentProfileImages[key]] : [])) : [];
      return { ...prev, [key]: [...previousFiles, ...nextFiles].map(file => URL.createObjectURL(file)) };
    });
  };

  const mergeImageFilesForUpload = async (files = [], field = {}) => {
    const imageFiles = Array.from(files || []).filter(Boolean);
    if (imageFiles.length <= 1) return imageFiles[0] || null;
    const loaded = await Promise.all(imageFiles.map(file => loadImageElementFromFile(file)));
    try {
      const maxWidth = 1200;
      const gap = 24;
      const parts = loaded.map(({ image }) => {
        const naturalWidth = image.naturalWidth || image.width || maxWidth;
        const naturalHeight = image.naturalHeight || image.height || maxWidth;
        const scale = Math.min(1, maxWidth / naturalWidth);
        return {
          image,
          width: Math.max(1, Math.round(naturalWidth * scale)),
          height: Math.max(1, Math.round(naturalHeight * scale))
        };
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(...parts.map(part => part.width), 1);
      canvas.height = parts.reduce((sum, part) => sum + part.height, 0) + gap * Math.max(0, parts.length - 1);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      let y = 0;
      parts.forEach((part) => {
        const x = Math.round((canvas.width - part.width) / 2);
        ctx.drawImage(part.image, x, y, part.width, part.height);
        y += part.height + gap;
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Khong ghep duoc anh hoc ba.');
      return new File([blob], `${field.filename || field.key || 'hoc_ba'}_ghep.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
      loaded.forEach(({ url }) => URL.revokeObjectURL(url));
    }
  };

  const fileToBase64Payload = (file, field = {}) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    const filenameTag = field.filename || field.key || 'anh';
    reader.onload = () => resolve({
      filename: `[HS_${activeStudentProfile?.accessCode || activeStudentProfile?.id || 'hoc-sinh'}]_${filenameTag}_${file.name}`,
      mimeType: file.type,
      base64: String(reader.result || '').split(',')[1],
      folderId: IMAGE_DRIVE_FOLDER_ID
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const submitStudentProfileRequest = async () => {
    if (!activeStudentProfile?.id || isSubmittingProfileRequest) return;
    setIsSubmittingProfileRequest(true);
    try {
      const uploadedImageChanges = {};
      for (const field of STUDENT_PROFILE_IMAGE_FIELDS) {
        const imageFiles = Array.isArray(studentProfileImages[field.key])
          ? studentProfileImages[field.key]
          : (studentProfileImages[field.key] ? [studentProfileImages[field.key]] : []);
        if (!imageFiles.length) continue;
        const imageFile = field.key === 'transcriptUrl'
          ? await mergeImageFilesForUpload(imageFiles, field)
          : imageFiles[0];
        if (!imageFile) continue;
        const uploadPayload = await fileToBase64Payload(imageFile, field);
        const uploadRes = await postAppsScript(uploadPayload);
        if (uploadRes.status !== 'success') throw new Error(uploadRes.message || `Chưa tải được ${field.label.toLowerCase()}`);
        uploadedImageChanges[field.key] = uploadRes.webViewLink || uploadRes.url || (uploadRes.fileId ? `https://drive.google.com/file/d/${uploadRes.fileId}/view` : '');
      }
      const changes = {};
      STUDENT_PROFILE_EDIT_FIELDS.forEach(field => {
        const currentValue = String(activeStudentProfile[field.key] || '').trim();
        const nextValue = String(studentProfileDraft[field.key] || '').trim();
        if (nextValue !== currentValue) changes[field.key] = nextValue;
      });
      Object.assign(changes, uploadedImageChanges);
      if (Object.keys(changes).length === 0) {
        showNotification(activeStudentPendingProfileRequests.length > 0 ? 'Yêu cầu của em đang chờ admin duyệt rồi.' : 'Chưa có thông tin nào thay đổi.', 'error');
        return;
      }
      const requestPayload = {
        studentId: activeStudentProfile.id,
        studentName: activeStudentProfile.fullName || '',
        accessCode: activeStudentProfile.accessCode || '',
        className: activeStudentProfile.className || '',
        schoolYear: activeStudentProfile.schoolYear || currentSchoolYear,
        changes: {
          ...activeStudentPendingProfileChanges,
          ...changes
        },
        status: 'pending',
        updatedAt: Date.now()
      };
      const existingRequest = activeStudentPendingProfileRequests[0];
      if (existingRequest?.id) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests', existingRequest.id), {
          ...requestPayload,
          createdAt: existingRequest.createdAt || Date.now()
        }, { merge: true });
        await Promise.all(activeStudentPendingProfileRequests.slice(1).map(request => (
          request.id ? deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests', request.id)) : Promise.resolve()
        )));
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests'), {
          ...requestPayload,
          createdAt: Date.now()
        });
      }
      setShowStudentProfileModal(false);
      showNotification(existingRequest?.id ? 'Đã cập nhật yêu cầu đang chờ duyệt.' : 'Đã gửi yêu cầu sửa hồ sơ. Admin duyệt xong mới cập nhật.');
    } catch (error) {
      showNotification(`Chưa gửi được yêu cầu sửa: ${error.message}`, 'error');
    } finally {
      setIsSubmittingProfileRequest(false);
    }
  };

  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const escapeAttr = (value = '') => escapeHtml(value);
  const VIETNAM_TIME_OFFSET_MS = 7 * 60 * 60 * 1000;
  const parseVietnamDateTimeLocal = (value = '') => {
    if (!value) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const raw = String(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (match) {
      const [, year, month, day, hour, minute] = match.map(Number);
      return Date.UTC(year, month - 1, day, hour - 7, minute);
    }
    const parsed = new Date(raw).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };
  const formatVietnamDateTimeLocal = (value) => {
    const ms = parseVietnamDateTimeLocal(value);
    if (!ms) return '';
    return new Date(ms + VIETNAM_TIME_OFFSET_MS).toISOString().slice(0, 16);
  };
  const formatCountdown = (ms = 0) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, '0');
    if (days > 0) return `${days} ngày ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };
  const getQuizArchiveName = () => `[DE_KIEM_TRA_${currentSchoolYear}]_K${selectedGrade}_${removeAccents(selectedSubject || '').replace(/\s+/g, '_')}_B${selectedLesson}`;
  const getDrivePreviewUrl = (url = '', fileId = '') => {
    const id = fileId || extractDriveFileId(url);
    return id ? `https://drive.google.com/file/d/${id}/preview` : url;
  };
  const extractQuizAttachments = useCallback((html = '') => {
    if (!html || typeof document === 'undefined') return [];
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return Array.from(tmp.querySelectorAll('[data-quiz-attachment-id]')).map(node => ({
      id: node.getAttribute('data-quiz-attachment-id') || '',
      title: node.getAttribute('data-title') || 'Tài liệu đính kèm',
      url: node.getAttribute('data-url') || '',
      previewUrl: node.getAttribute('data-preview-url') || node.querySelector('iframe')?.getAttribute('src') || '',
    })).filter(item => item.id);
  }, []);

  const sortedTextbooks = useMemo(() => {
    return [...textbookFiles].sort((a, b) => {
      const rankA = getSubjectRank(a.name); const rankB = getSubjectRank(b.name);
      if (rankA !== rankB) return rankA - rankB; return a.name.localeCompare(b.name);
    });
  }, [textbookFiles]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof window !== 'undefined' && typeof window.__initial_auth_token !== 'undefined' && window.__initial_auth_token) {
          await signInWithCustomToken(auth, window.__initial_auth_token);
        } else { await signInAnonymously(auth); }
      } catch (e) {}
    };
    initAuth();
    const unsubAuth = onAuthStateChanged(auth, setUser); return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubNews = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'news'), (snapshot) => { const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); docs.sort((a, b) => (b.sortOrder ?? b.createdAt ?? 0) - (a.sortOrder ?? a.createdAt ?? 0)); setNewsList(docs); });
    const unsubMats = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'materials'), (snapshot) => { const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); setAllMaterials(docs); });
    const unsubNotes = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'lesson_notes'), (snapshot) => { const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); setAllNotes(docs); });
    const unsubQuizzes = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'lesson_quizzes'), (snapshot) => { const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); setAllQuizzes(docs); });
    const unsubQuizResults = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'quiz_results'), (snapshot) => { const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); setAllQuizResults(docs); });
    const unsubHandwrittenSubmissions = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'handwritten_submissions'), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      docs.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
      setAllHandwrittenSubmissions(docs);
    });
    const unsubStudents = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'students'), (snapshot) => { const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })); setAllStudents(docs); });
    const unsubAttendance = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'class_attendance'), (snapshot) => { const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); setAttendanceDocs(docs); });
    const unsubProfileRequests = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests'), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const pendingDocs = docs.filter(item => (item.status || 'pending') === 'pending');
      setStudentProfileRequests(docs);
      setStudentProfileRequestCount(pendingDocs.length);
    });
    const unsubSettings = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      if (data.schoolYear) setCurrentSchoolYear(data.schoolYear);
      setIsAdminPassEnabled(true);
      if (typeof data.adminPass === 'string') setAdminPass(data.adminPass);
      if (typeof data.isTeacherPassEnabled === 'boolean') setIsTeacherPassEnabled(data.isTeacherPassEnabled);
      if (typeof data.teacherPass === 'string') setTeacherPass(data.teacherPass);
      if (typeof data.isStudentCodeEnabled === 'boolean') setIsStudentCodeEnabled(data.isStudentCodeEnabled);
      if (typeof data.principalName === 'string') setPrincipalName(data.principalName);
      if (data.inputYearLocks && typeof data.inputYearLocks === 'object') setInputYearLocks(data.inputYearLocks);
      if (data.transcriptStartDates && typeof data.transcriptStartDates === 'object') setTranscriptStartDates(data.transcriptStartDates);
      if (data.transcriptEndDates && typeof data.transcriptEndDates === 'object') setTranscriptEndDates(data.transcriptEndDates);
      if (data.transcriptGrade9EndDates && typeof data.transcriptGrade9EndDates === 'object') setTranscriptGrade9EndDates(data.transcriptGrade9EndDates);
      if (Array.isArray(data.nanTeachers)) setNanTeachers(data.nanTeachers);
      if (data.classTeacherAssignments && typeof data.classTeacherAssignments === 'object') setClassTeacherAssignments(data.classTeacherAssignments);
    });
    return () => { unsubNews(); unsubMats(); unsubNotes(); unsubQuizzes(); unsubQuizResults(); unsubHandwrittenSubmissions(); unsubStudents(); unsubAttendance(); unsubProfileRequests(); unsubSettings(); };
  }, [user]);

  const getScorebookDocIdForGrade = useCallback((grade) => (
    cleanDocId(`${currentSchoolYear || 'nam-hoc'}_${scorebookTemplate.sourceFile || 'so-diem'}_khoi_${grade || 'tat-ca'}`)
  ), [currentSchoolYear]);

  const getScorebookStudentsForGrade = useCallback((grade) => {
    return [...(Array.isArray(allStudents) ? allStudents : [])]
      .filter(student => (student.status || 'active') !== 'dropped')
      .filter(student => String(getGradeFromClassName(student.className || student.grade || '')) === String(grade))
      .filter(student => !student.schoolYear || String(student.schoolYear) === String(currentSchoolYear))
      .sort((a, b) => {
        const classCompare = String(a.className || '').localeCompare(String(b.className || ''), 'vi', { numeric: true, sensitivity: 'base' });
        if (classCompare) return classCompare;
        return getGivenNameSortKey(a.fullName).localeCompare(getGivenNameSortKey(b.fullName), 'vi', { sensitivity: 'base' });
      })
      .slice(0, 40);
  }, [allStudents, currentSchoolYear]);

  const quickScorebookDocId = useMemo(() => getScorebookDocIdForGrade(quickScoreGrade), [getScorebookDocIdForGrade, quickScoreGrade]);

  const quickScoreStudents = useMemo(() => getScorebookStudentsForGrade(quickScoreGrade), [getScorebookStudentsForGrade, quickScoreGrade]);

  const quickAbsenceRatioByStudentId = useMemo(() => {
    const counts = {};
    const studentsById = new Map(quickScoreStudents.map(student => [student.id, student]));
    attendanceDocs.forEach((item) => {
      if (item.schoolYear && String(item.schoolYear) !== String(currentSchoolYear || '')) return;
      const docGrade = getGradeFromClassName(item.className || '') || item.className || '';
      if (String(docGrade) !== String(quickScoreGrade || '')) return;
      Object.entries(item.records || {}).forEach(([recordKey, record]) => {
        if (record?.status !== 'CP' && record?.status !== 'KP') return;
        const studentId = record?.studentId || recordKey;
        if (!studentsById.has(studentId)) return;
        counts[studentId] = (counts[studentId] || 0) + 1;
      });
    });

    const absenceCounts = quickScoreStudents.map(student => counts[student.id] || 0);
    const minAbsence = absenceCounts.length ? Math.min(...absenceCounts) : 0;
    const maxAbsence = absenceCounts.length ? Math.max(...absenceCounts) : 0;
    return quickScoreStudents.reduce((acc, student) => {
      acc[student.id] = maxAbsence > minAbsence
        ? ((counts[student.id] || 0) - minAbsence) / (maxAbsence - minAbsence)
        : 0.5;
      return acc;
    }, {});
  }, [attendanceDocs, currentSchoolYear, quickScoreGrade, quickScoreStudents]);

  useEffect(() => {
    if (!user || (!isAdmin && !quickScoreLockedContext) || !showLearningResultsWorkspace || !quickScoreGrade) {
      setQuickScorebookEdits({});
      setQuickScoreSources({});
      setQuickInputDrafts({});
      return undefined;
    }
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', quickScorebookDocId);
    return onSnapshot(ref, (docSnap) => {
      const data = docSnap.exists() ? (docSnap.data() || {}) : {};
      setQuickScorebookEdits(data.edits && typeof data.edits === 'object' ? data.edits : {});
      setQuickScoreSources(data.scoreSources && typeof data.scoreSources === 'object' ? data.scoreSources : {});
    });
  }, [user, isAdmin, quickScoreLockedContext, showLearningResultsWorkspace, quickScoreGrade, quickScorebookDocId]);

  const getQuickScoreKey = useCallback((semester, pageIndex, rowIndex, scoreIndex) => `custom:${semester}Score:${pageIndex}:r${rowIndex}:s${scoreIndex}`, []);

  const findQuickScoreStudentRowIndex = useCallback((studentRecord = {}) => {
    const recordId = String(studentRecord.studentId || studentRecord.id || '').trim();
    const recordCode = String(studentRecord.studentAccessCode || studentRecord.accessCode || '').trim().toUpperCase();
    const recordName = removeAccents(String(studentRecord.studentName || studentRecord.fullName || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
    return quickScoreStudents.findIndex(student => {
      const studentId = String(student.id || '').trim();
      const studentCode = String(student.accessCode || student.studentAccessCode || '').trim().toUpperCase();
      const studentName = removeAccents(String(student.fullName || student.studentName || '').toLowerCase()).replace(/[^a-z0-9]/g, '');
      return (recordId && studentId && recordId === studentId)
        || (recordCode && studentCode && recordCode === studentCode)
        || (recordName && studentName && recordName === studentName);
    });
  }, [quickScoreStudents]);

  const quickQuizScoreKeySet = useMemo(() => {
    const keySet = new Set();
    const records = [...allQuizResults, ...allHandwrittenSubmissions];
    records.forEach((record) => {
      if (String(record.schoolYear || '') !== String(currentSchoolYear || '')) return;
      if (String(record.grade || '') !== String(quickScoreGrade || '')) return;
      const target = record.scoreTarget || {};
      if (!target.semester || target.pageIndex === undefined || target.scoreIndex === undefined) return;
      const rowIndex = findQuickScoreStudentRowIndex(record);
      if (rowIndex < 0) return;
      keySet.add(getQuickScoreKey(target.semester, target.pageIndex, rowIndex, target.scoreIndex));
    });
    Object.entries(quickScoreSources || {}).forEach(([key, value]) => {
      if (value?.source === 'quiz') keySet.add(key);
      if (value?.source === 'manualCleared') keySet.delete(key);
    });
    return keySet;
  }, [allQuizResults, allHandwrittenSubmissions, currentSchoolYear, quickScoreGrade, findQuickScoreStudentRowIndex, getQuickScoreKey, quickScoreSources]);

  const quizScoreSubject = useMemo(() => (
    QUICK_SCORE_SUBJECTS.find(subject => subject.key === getQuickSubjectKeyFromName(selectedSubject)) || null
  ), [selectedSubject]);

  const quizScoreSemester = useMemo(() => (Number(selectedLesson || 1) <= 18 ? 'hki' : 'hkii'), [selectedLesson]);

  const quizScoreTargetOptions = useMemo(() => {
    if (!quizScoreSubject || !selectedGrade) return [];
    const rows = getScorebookStudentsForGrade(selectedGrade);
    const columns = [
      ...Array.from({ length: quizScoreSubject.txCount || 4 }, (_, idx) => ({ label: `TX${idx + 1}`, scoreIndex: idx })),
      { label: 'GK', scoreIndex: 4 },
      { label: 'CK', scoreIndex: 5 },
      { label: 'ĐTB', scoreIndex: 6 }
    ];
    return columns.map(column => {
      const used = rows.some((_, rowIndex) => {
        const key = getQuickScoreKey(quizScoreSemester, quizScoreSubject.pageIndex, rowIndex, column.scoreIndex);
        return String(scoreTargetEdits[key] || '').trim() !== '';
      });
      return { ...column, used };
    });
  }, [quizScoreSubject, selectedGrade, getScorebookStudentsForGrade, getQuickScoreKey, quizScoreSemester, scoreTargetEdits]);

  const getQuickScoreInputValue = useCallback((semester, pageIndex, rowIndex, scoreIndex) => (
    String(quickScorebookEdits[getQuickScoreKey(semester, pageIndex, rowIndex, scoreIndex)] || '').trim()
  ), [quickScorebookEdits, getQuickScoreKey]);

  const getQuickSemesterTermAverage = useCallback((semester, pageIndex, rowIndex) => {
    const txScores = [0, 1, 2, 3]
      .map(scoreIndex => parseScoreNumber(getQuickScoreInputValue(semester, pageIndex, rowIndex, scoreIndex)))
      .filter(value => value !== null);
    const midterm = parseScoreNumber(getQuickScoreInputValue(semester, pageIndex, rowIndex, 4));
    const final = parseScoreNumber(getQuickScoreInputValue(semester, pageIndex, rowIndex, 5));
    if (!txScores.length || midterm === null || final === null) return '';
    const total = txScores.reduce((sum, value) => sum + value, 0) + (2 * midterm) + (3 * final);
    return formatScoreNumber(total / (txScores.length + 5));
  }, [getQuickScoreInputValue]);

  const getQuickSemesterScoreResult = useCallback((semester, pageIndex, rowIndex, scoreIndex = semester === 'hkii' ? 7 : 6) => {
    const saved = getQuickScoreInputValue(semester, pageIndex, rowIndex, scoreIndex);
    if (saved !== '') return formatScoreDisplayValue(saved);
    if (scoreIndex === 6) return getQuickSemesterTermAverage(semester, pageIndex, rowIndex);
    if (semester === 'hkii' && scoreIndex === 7) {
      const hkiAverage = parseScoreNumber(getQuickSemesterScoreResult('hki', pageIndex, rowIndex, 6));
      const hkiiAverage = parseScoreNumber(getQuickSemesterScoreResult('hkii', pageIndex, rowIndex, 6));
      if (hkiAverage === null || hkiiAverage === null) return '';
      return formatScoreNumber((hkiAverage + (2 * hkiiAverage)) / 3);
    }
    return '';
  }, [getQuickScoreInputValue, getQuickSemesterTermAverage]);

  const getQuickAcademicResult = useCallback((rowIndex, semester = 'hki') => {
    const scores = QUICK_SCORE_SUBJECTS
      .filter(subject => subject.academic)
      .map(subject => parseScoreNumber(semester === 'fullYear'
        ? getQuickSemesterScoreResult('hkii', subject.pageIndex, rowIndex, 7)
        : getQuickSemesterScoreResult(semester, subject.pageIndex, rowIndex, 6)))
      .filter(value => value !== null);
    if (!scores.length) return '';
    if (scores.filter(score => score >= 8).length >= 5 && scores.every(score => score >= 6.5)) return 'Tốt';
    if (scores.filter(score => score >= 6.5).length >= 5 && scores.every(score => score >= 5)) return 'Khá';
    if (scores.filter(score => score >= 5).length >= 5 && scores.every(score => score >= 3.5)) return 'Đạt';
    return 'Chưa đạt';
  }, [getQuickSemesterScoreResult]);

  const quickSelectedSubjects = useMemo(
    () => QUICK_SCORE_SUBJECTS.filter(subject => quickVisibleSubjects[subject.key]),
    [quickVisibleSubjects]
  );
  const quickSelectedSemesters = useMemo(() => {
    const list = [];
    if (quickVisibleSemesters.hki) list.push({ key: 'hki', label: 'HK1' });
    if (quickVisibleSemesters.hkii) list.push({ key: 'hkii', label: 'HK2' });
    return list;
  }, [quickVisibleSemesters]);

  const quickVisibleScoreColumns = useMemo(() => {
    return quickSelectedSubjects.flatMap((subject) => (
      quickSelectedSemesters.flatMap((semester) => {
        const txColumns = Array.from({ length: subject.txCount || 4 }, (_, idx) => ({
          id: `${subject.key}-${semester.key}-tx${idx + 1}`,
          semester: semester.key,
          semesterLabel: semester.label,
          subjectKey: subject.key,
          subjectLabel: subject.label,
          pageIndex: subject.pageIndex,
          scoreIndex: idx,
          header: `TX${idx + 1}`,
          editable: true
        }));
        return [
          ...txColumns,
          {
            id: `${subject.key}-${semester.key}-gk`,
            semester: semester.key,
            semesterLabel: semester.label,
            subjectKey: subject.key,
            subjectLabel: subject.label,
            pageIndex: subject.pageIndex,
            scoreIndex: 4,
            header: 'GK',
            editable: true
          },
          {
            id: `${subject.key}-${semester.key}-ck`,
            semester: semester.key,
            semesterLabel: semester.label,
            subjectKey: subject.key,
            subjectLabel: subject.label,
            pageIndex: subject.pageIndex,
            scoreIndex: 5,
            header: 'CK',
            editable: true
          },
          {
            id: `${subject.key}-${semester.key}-dtb`,
            semester: semester.key,
            semesterLabel: semester.label,
            subjectKey: subject.key,
            subjectLabel: subject.label,
            pageIndex: subject.pageIndex,
            scoreIndex: 6,
            header: 'ĐTB',
            editable: false
          }
        ];
      })
    ));
  }, [quickSelectedSemesters, quickSelectedSubjects]);

  const quickSubjectColSpan = useMemo(() => {
    return quickSelectedSubjects.reduce((acc, subject) => {
      const total = quickSelectedSemesters.length * ((subject.txCount || 4) + 3);
      acc[subject.key] = total;
      return acc;
    }, {});
  }, [quickSelectedSemesters, quickSelectedSubjects]);

  const quickVisibleScoreColumnsBySubject = useMemo(() => {
    return quickSelectedSubjects.flatMap((subject) => (
      quickSelectedSemesters.flatMap((semester) => {
        const txColumns = Array.from({ length: subject.txCount || 4 }, (_, idx) => ({
          id: `${subject.key}-${semester.key}-tx${idx + 1}`,
          semester: semester.key,
          subjectKey: subject.key,
          pageIndex: subject.pageIndex,
          scoreIndex: idx,
          editable: true
        }));
        return [
          ...txColumns,
          {
            id: `${subject.key}-${semester.key}-gk`,
            semester: semester.key,
            subjectKey: subject.key,
            pageIndex: subject.pageIndex,
            scoreIndex: 4,
            editable: true
          },
          {
            id: `${subject.key}-${semester.key}-ck`,
            semester: semester.key,
            subjectKey: subject.key,
            pageIndex: subject.pageIndex,
            scoreIndex: 5,
            editable: true
          },
          {
            id: `${subject.key}-${semester.key}-dtb`,
            semester: semester.key,
            subjectKey: subject.key,
            pageIndex: subject.pageIndex,
            scoreIndex: 6,
            editable: false
          },
          ...(semester.key === 'hkii'
            ? [{
              id: `${subject.key}-${semester.key}-dtbcn`,
              semester: semester.key,
              subjectKey: subject.key,
              pageIndex: subject.pageIndex,
              scoreIndex: 7,
              editable: false
            }]
            : [])
        ];
      })
    ));
  }, [quickSelectedSemesters, quickSelectedSubjects]);

  const quickSubjectColSpanBySubject = useMemo(() => {
    return quickSelectedSubjects.reduce((acc, subject) => {
      const total = quickSelectedSemesters.reduce((sum, semester) => (
        sum + (subject.txCount || 4) + 3 + (semester.key === 'hkii' ? 1 : 0)
      ), 0);
      acc[subject.key] = total;
      return acc;
    }, {});
  }, [quickSelectedSemesters, quickSelectedSubjects]);

  const allQuickSubjectsVisible = useMemo(
    () => QUICK_SCORE_SUBJECTS.every((subject) => quickVisibleSubjects[subject.key]),
    [quickVisibleSubjects]
  );

  const openQuickScoreWorkspace = useCallback(({ grade, subjectName, subjectKey, locked = false } = {}) => {
    const nextGrade = String(grade || quickScoreGrade || GRADES?.[0] || '6');
    const resolvedSubjectKey = subjectKey || getQuickSubjectKeyFromName(subjectName);
    const resolvedSubject = QUICK_SCORE_SUBJECTS.find(subject => subject.key === resolvedSubjectKey);
    if (locked && !resolvedSubject) {
      showNotification('Môn này chưa có bảng nhập điểm nhanh. Thầy cô chọn Toán, Văn, GDCD, LS-ĐL, KHTN hoặc Công nghệ.', 'error');
      return;
    }
    setQuickScoreGrade(nextGrade);
    setQuickVisibleSemesters({ hki: true, hkii: true });
    setQuickVisibleSubjects(QUICK_SCORE_SUBJECTS.reduce((acc, subject) => ({
      ...acc,
      [subject.key]: resolvedSubject ? subject.key === resolvedSubject.key : true
    }), {}));
    setQuickScoreLockedContext(locked && resolvedSubject ? {
      grade: nextGrade,
      subjectKey: resolvedSubject.key,
      subjectLabel: resolvedSubject.label
    } : null);
    setShowLearningResultsWorkspace(true);
  }, [quickScoreGrade, showNotification]);

  const saveQuickScoreValue = useCallback(async (semester, pageIndex, rowIndex, scoreIndex, rawValue) => {
    if (!user) return false;
    if (!canWriteCurrentSchoolYear) {
      showNotification(`Năm học ${currentSchoolYear} đang khóa nhập liệu. Admin mở khóa mới sửa điểm được.`, 'error');
      return false;
    }
    const key = getQuickScoreKey(semester, pageIndex, rowIndex, scoreIndex);
    const nextValue = normalizeScoreInput(rawValue);
    const previousEdits = { ...(quickScorebookEdits || {}) };
    const previousSources = { ...(quickScoreSources || {}) };
    const nextEdits = { ...previousEdits };
    const nextSources = { ...previousSources };
    if (nextValue) nextEdits[key] = nextValue;
    else delete nextEdits[key];
    if (nextValue) nextSources[key] = { source: 'manual', updatedAt: Date.now() };
    else if (quickQuizScoreKeySet.has(key)) nextSources[key] = { source: 'manualCleared', updatedAt: Date.now() };
    else delete nextSources[key];
    setQuickScorebookEdits(nextEdits);
    setQuickScoreSources(nextSources);
    setQuickScorebookSavingKey(key);
    const scorebookRef = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', quickScorebookDocId);
    try {
      const basePayload = {
        grade: String(quickScoreGrade || ''),
        schoolYear: currentSchoolYear || '',
        sourceFile: scorebookTemplate.sourceFile || '',
        updatedAt: Date.now(),
        authorId: user.uid
      };
      if (nextValue) {
        await setDoc(scorebookRef, {
          ...basePayload,
          edits: { [key]: nextValue },
          scoreSources: { [key]: nextSources[key] }
        }, { merge: true });
      } else {
        await setDoc(scorebookRef, {
          ...basePayload,
          edits: { [key]: deleteField() },
          scoreSources: { [key]: nextSources[key] || deleteField() }
        }, { merge: true });
      }
      return true;
    } catch (error) {
      setQuickScorebookEdits(previousEdits);
      setQuickScoreSources(previousSources);
      showNotification(`Chưa lưu được ô điểm nhanh: ${error.message}`, 'error');
      return false;
    } finally {
      setQuickScorebookSavingKey((prev) => (prev === key ? '' : prev));
    }
  }, [user, canWriteCurrentSchoolYear, getQuickScoreKey, quickScorebookEdits, quickScoreSources, quickQuizScoreKeySet, quickScorebookDocId, quickScoreGrade, currentSchoolYear, showNotification]);

  const fillMissingQuickScores = useCallback(async () => {
    if (!user) return;
    if (!canWriteCurrentSchoolYear) {
      showNotification(`N\u0103m h\u1ecdc ${currentSchoolYear} \u0111ang kh\u00f3a nh\u1eadp li\u1ec7u. Admin m\u1edf kh\u00f3a m\u1edbi s\u1eeda \u0111i\u1ec3m \u0111\u01b0\u1ee3c.`, 'error');
      return;
    }
    if (!quickScoreStudents.length || !quickVisibleScoreColumnsBySubject.length) {
      showNotification('Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u \u0111\u1ec3 cho \u0111i\u1ec3m.', 'error');
      return;
    }

    const fillEdits = {};
    const fillSources = {};
    quickScoreStudents.forEach((student, rowIndex) => {
      if (!student) return;
      quickVisibleScoreColumnsBySubject.forEach((column) => {
        if (!column.editable) return;
        const key = getQuickScoreKey(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
        if (quickQuizScoreKeySet.has(key)) return;
        fillEdits[key] = getRandomQuickScore(column.subjectKey, quickAbsenceRatioByStudentId[student.id], column.scoreIndex);
        fillSources[key] = { source: 'random', updatedAt: Date.now() };
      });
    });

    const fillCount = Object.keys(fillEdits).length;
    if (!fillCount) {
      showNotification('Kh\u00f4ng c\u00f2n \u00f4 \u0111i\u1ec3m tr\u1ed1ng trong ph\u1ea1m vi \u0111ang hi\u1ec3n th\u1ecb.');
      return;
    }

    const previousEdits = { ...(quickScorebookEdits || {}) };
    const previousSources = { ...(quickScoreSources || {}) };
    setQuickScorebookEdits({ ...previousEdits, ...fillEdits });
    setQuickScoreSources({ ...previousSources, ...fillSources });
    setQuickInputDrafts((prev) => {
      const nextDrafts = { ...prev };
      Object.keys(fillEdits).forEach((key) => delete nextDrafts[key]);
      return nextDrafts;
    });
    setQuickScorebookSavingKey('random-fill');

    const scorebookRef = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', quickScorebookDocId);
    try {
      await setDoc(scorebookRef, {
        grade: String(quickScoreGrade || ''),
        schoolYear: currentSchoolYear || '',
        sourceFile: scorebookTemplate.sourceFile || '',
        updatedAt: Date.now(),
        authorId: user.uid,
        edits: fillEdits,
        scoreSources: fillSources
      }, { merge: true });
      showNotification(`\u0110\u00e3 cho \u0111i\u1ec3m ng\u1eabu nhi\u00ean ${fillCount} \u00f4 trong ph\u1ea1m vi \u0111ang m\u1edf.`);
    } catch (error) {
      setQuickScorebookEdits(previousEdits);
      setQuickScoreSources(previousSources);
      showNotification(`Ch\u01b0a l\u01b0u \u0111\u01b0\u1ee3c \u0111i\u1ec3m ng\u1eabu nhi\u00ean: ${error.message}`, 'error');
    } finally {
      setQuickScorebookSavingKey((prev) => (prev === 'random-fill' ? '' : prev));
    }
  }, [
    user,
    canWriteCurrentSchoolYear,
    currentSchoolYear,
    quickScoreStudents,
    quickVisibleScoreColumnsBySubject,
    quickScorebookEdits,
    quickScoreSources,
    quickInputDrafts,
    quickAbsenceRatioByStudentId,
    quickQuizScoreKeySet,
    getQuickScoreKey,
    quickScorebookDocId,
    quickScoreGrade,
    showNotification
  ]);

  const clearVisibleQuickScores = useCallback(async () => {
    if (!user) return;
    if (!canWriteCurrentSchoolYear) {
      showNotification(`N\u0103m h\u1ecdc ${currentSchoolYear} \u0111ang kh\u00f3a nh\u1eadp li\u1ec7u. Admin m\u1edf kh\u00f3a m\u1edbi s\u1eeda \u0111i\u1ec3m \u0111\u01b0\u1ee3c.`, 'error');
      return;
    }
    if (!quickScoreStudents.length || !quickVisibleScoreColumnsBySubject.length) {
      showNotification('Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u \u0111\u1ec3 x\u00f3a \u0111i\u1ec3m.', 'error');
      return;
    }

    const deleteEdits = {};
    const deleteSources = {};
    const keysToClear = [];
    quickScoreStudents.forEach((student, rowIndex) => {
      if (!student) return;
      quickVisibleScoreColumnsBySubject.forEach((column) => {
        const key = getQuickScoreKey(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
        if (quickQuizScoreKeySet.has(key)) return;
        if (!quickScorebookEdits[key] && !quickInputDrafts[key]) return;
        keysToClear.push(key);
        deleteEdits[key] = deleteField();
        deleteSources[key] = deleteField();
      });
    });

    if (!keysToClear.length) {
      showNotification('Kh\u00f4ng c\u00f3 \u00f4 \u0111i\u1ec3m n\u00e0o \u0111\u1ec3 x\u00f3a trong ph\u1ea1m vi \u0111ang hi\u1ec3n th\u1ecb.');
      return;
    }

    const previousEdits = { ...(quickScorebookEdits || {}) };
    const previousSources = { ...(quickScoreSources || {}) };
    setQuickScorebookEdits((prev) => {
      const nextEdits = { ...(prev || {}) };
      keysToClear.forEach((key) => delete nextEdits[key]);
      return nextEdits;
    });
    setQuickScoreSources((prev) => {
      const nextSources = { ...(prev || {}) };
      keysToClear.forEach((key) => delete nextSources[key]);
      return nextSources;
    });
    setQuickInputDrafts((prev) => {
      const nextDrafts = { ...(prev || {}) };
      keysToClear.forEach((key) => delete nextDrafts[key]);
      return nextDrafts;
    });
    setQuickScorebookSavingKey('clear-visible');

    const scorebookRef = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', quickScorebookDocId);
    try {
      await setDoc(scorebookRef, {
        grade: String(quickScoreGrade || ''),
        schoolYear: currentSchoolYear || '',
        sourceFile: scorebookTemplate.sourceFile || '',
        updatedAt: Date.now(),
        authorId: user.uid,
        edits: deleteEdits,
        scoreSources: deleteSources
      }, { merge: true });
      showNotification(`\u0110\u00e3 x\u00f3a ${keysToClear.length} \u00f4 \u0111i\u1ec3m trong ph\u1ea1m vi \u0111ang m\u1edf.`);
    } catch (error) {
      setQuickScorebookEdits(previousEdits);
      setQuickScoreSources(previousSources);
      showNotification(`Ch\u01b0a x\u00f3a \u0111\u01b0\u1ee3c \u0111i\u1ec3m: ${error.message}`, 'error');
    } finally {
      setQuickScorebookSavingKey((prev) => (prev === 'clear-visible' ? '' : prev));
    }
  }, [
    user,
    canWriteCurrentSchoolYear,
    currentSchoolYear,
    quickScoreStudents,
    quickVisibleScoreColumnsBySubject,
    quickScorebookEdits,
    quickScoreSources,
    quickInputDrafts,
    quickQuizScoreKeySet,
    getQuickScoreKey,
    quickScorebookDocId,
    quickScoreGrade,
    showNotification
  ]);

  useEffect(() => {
    if (!user || !noteId) { setNoteHtml(''); setIsLoadingNote(false); setAutoSaveStatus(''); return; }
    setIsLoadingNote(true); setAutoSaveStatus('');
    const unsubNote = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'lesson_notes', noteId), (docSnap) => {
      const content = docSnap.exists() ? (docSnap.data().content || '') : ''; setNoteHtml(content); setIsLoadingNote(false);
    }, () => { setIsLoadingNote(false); setNoteHtml('<p style="color: #f59e0b; font-weight: bold;">Đường truyền mạng yếu, hệ thống đang làm việc ở chế độ ngoại tuyến...</p>'); });
    return () => unsubNote();
  }, [user, noteId]);

  const splitQuizContent = useCallback((html = '') => {
    if (typeof document === 'undefined') return { question: String(html || ''), answer: '' };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(html || '');
    const answerBlocks = Array.from(wrapper.querySelectorAll('.teacher-only'));
    const answer = answerBlocks.map(node => node.innerHTML).join('<p><br></p>');
    answerBlocks.forEach(node => node.remove());
    return { question: wrapper.innerHTML, answer };
  }, []);

  const composeQuizContent = useCallback((questionHtml = quizQuestionHtml, answerHtml = quizAnswerHtml) => {
    const question = String(questionHtml || '').trim();
    const answer = String(answerHtml || '').trim();
    return `${question}${answer ? `<div class="teacher-only">${answer}</div>` : ''}`;
  }, [quizQuestionHtml, quizAnswerHtml]);

  const syncQuizPartsFromContent = useCallback((content = '') => {
    const parts = splitQuizContent(content);
    const cleanedParts = {
      question: humanizeHtmlString(parts.question),
      answer: humanizeHtmlString(parts.answer)
    };
    setQuizQuestionHtml(cleanedParts.question);
    setQuizAnswerHtml(cleanedParts.answer);
    if (quizEditorRef.current) quizEditorRef.current.innerHTML = cleanedParts.question || '';
    if (quizAnswerEditorRef.current) quizAnswerEditorRef.current.innerHTML = cleanedParts.answer || '';
    return cleanedParts;
  }, [splitQuizContent]);

  const getCurrentQuizContent = useCallback(() => composeQuizContent(
    quizEditorRef.current?.innerHTML ?? quizQuestionHtml,
    quizAnswerEditorRef.current?.innerHTML ?? quizAnswerHtml
  ), [composeQuizContent, quizQuestionHtml, quizAnswerHtml]);

  const refreshQuizHtmlFromEditors = useCallback(() => {
    const questionHtml = quizEditorRef.current?.innerHTML ?? quizQuestionHtml;
    const answerHtml = quizAnswerEditorRef.current?.innerHTML ?? quizAnswerHtml;
    const content = composeQuizContent(questionHtml, answerHtml);
    setQuizQuestionHtml(questionHtml);
    setQuizAnswerHtml(answerHtml);
    setQuizHtml(content);
    return content;
  }, [composeQuizContent, quizQuestionHtml, quizAnswerHtml]);

  useEffect(() => {
    if (!user || !quizId) {
      setQuizHtml('');
      setQuizQuestionHtml('');
      setQuizAnswerHtml('');
      setQuizTitle('');
      setIsLoadingQuiz(false);
      setQuizPublishNow(false);
      setQuizPublishAt('');
      setQuizAttachments([]);
      setQuizData(null);
      setQuizDeliveryMode('manual');
      setQuizScoreTarget(null);
      setSelfQuizDraft({ questions: [], shuffleQuestions: true, shuffleOptions: true, showScoreAfterSubmit: true, allowRetake: true });
      return;
    }
    setIsLoadingQuiz(true);
    const unsubQuiz = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'lesson_quizzes', quizId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const content = data.content || '';
        setQuizHtml(content);
        syncQuizPartsFromContent(content);
        setQuizTitle(data.title || '');
        setQuizAttachments(extractQuizAttachments(data.content || ''));
        setQuizPublishNow(!!data.isPublished);
        setQuizPublishAt(formatVietnamDateTimeLocal(data.publishAt));
        setQuizData(data.quizData || null);
        setQuizDeliveryMode(data.deliveryMode || (data.quizData?.questions?.length ? 'auto' : 'manual'));
        setQuizScoreTarget(data.scoreTarget || null);
        setSelfQuizDraft(data.quizData || { questions: [], shuffleQuestions: true, shuffleOptions: true, showScoreAfterSubmit: true, allowRetake: true });
        setQuizDocStatus(data.quizDocUrl ? { state: 'success', message: 'Đã có Google Doc đề kiểm tra', url: data.quizDocUrl } : { state: '', message: '', url: '' });
      } else {
        setQuizHtml('');
        setQuizQuestionHtml('');
        setQuizAnswerHtml('');
        setQuizTitle('');
        syncQuizPartsFromContent('');
        setQuizAttachments([]);
        setQuizPublishNow(false);
        setQuizPublishAt('');
        setQuizData(null);
        setQuizDeliveryMode('manual');
        setQuizScoreTarget(null);
        setSelfQuizDraft({ questions: [], shuffleQuestions: true, shuffleOptions: true, showScoreAfterSubmit: true, allowRetake: true });
        setQuizDocStatus({ state: '', message: '', url: '' });
      }
      setIsLoadingQuiz(false);
    }, () => { setIsLoadingQuiz(false); setQuizHtml(''); setQuizQuestionHtml(''); setQuizAnswerHtml(''); setQuizTitle(''); setQuizData(null); setQuizDeliveryMode('manual'); setQuizScoreTarget(null); });
    return () => unsubQuiz();
  }, [user, quizId, extractQuizAttachments, syncQuizPartsFromContent]);

  const activeSelfQuiz = useMemo(() => (quizDeliveryMode === 'auto' && quizData?.questions?.length ? quizData : null), [quizData, quizDeliveryMode]);
  const studentEssayText = useMemo(() => extractEssayTextFromHtml(quizHtml), [quizHtml]);
  const studentQuizDraftKey = useMemo(() => quizId ? `khohoclieu-self-quiz-draft-${quizId}-${activeStudentIdentityKey}` : '', [quizId, activeStudentIdentityKey]);

  useEffect(() => {
    if (role !== 'teacher' || !contentEditableRef.current || !noteId) return;
    if (isLoadingNote) { contentEditableRef.current.innerHTML = '<p style="color: #94a3b8; font-style: italic; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;">Đang tải dữ liệu bài học...</p>'; contentEditableRef.current.removeAttribute('data-loaded-id'); return; }
    const currentHtml = contentEditableRef.current.innerHTML || '';
    const shouldRefreshEditor =
      contentEditableRef.current.getAttribute('data-loaded-id') !== noteId ||
      (!currentHtml.trim() && String(noteHtml || '').trim()) ||
      currentHtml.includes('Đang tải dữ liệu bài học');
    if (shouldRefreshEditor) {
      contentEditableRef.current.innerHTML = humanizeHtmlString(noteHtml || '');
      contentEditableRef.current.setAttribute('data-loaded-id', noteId);
    }
  }, [role, noteHtml, noteId, isLoadingNote]);

  useEffect(() => {
    if (role !== 'teacher' || !quizEditorRef.current || !quizId || !showQuizComposeWorkspace) return;
    if (isLoadingQuiz) { quizEditorRef.current.innerHTML = '<p style="color: #94a3b8; font-style: italic;">Đang tải bài kiểm tra...</p>'; quizEditorRef.current.removeAttribute('data-loaded-id'); return; }
    if (quizEditorRef.current.getAttribute('data-loaded-id') !== quizId) { syncQuizPartsFromContent(quizHtml || ''); quizEditorRef.current.setAttribute('data-loaded-id', quizId); setQuizAttachments(extractQuizAttachments(quizHtml || '')); }
  }, [role, quizHtml, quizId, isLoadingQuiz, showQuizComposeWorkspace, extractQuizAttachments]);

  useEffect(() => { if (role !== 'teacher') typesetMath(studentContentRef.current); }, [noteHtml, role, selectedGrade, selectedSubject, selectedLesson]);
  useEffect(() => { if (role !== 'teacher') typesetMath(studentQuizContentRef.current); }, [quizHtml, quizData, studentQuizAnswers, studentQuizResult, role, selectedGrade, selectedSubject, selectedLesson]);
  useEffect(() => { if (role === 'teacher' && showQuickQuizPreview) typesetMath(quickQuizPreviewRef.current); }, [quizHtml, quizData, role, showQuickQuizPreview, selectedGrade, selectedSubject, selectedLesson]);
  useEffect(() => { if (role === 'teacher' && showHandwrittenSubmissions) typesetMath(essayPromptRef.current); }, [studentEssayText, role, showHandwrittenSubmissions]);
  useEffect(() => {
    setStudentQuizAnswers({});
    setStudentQuizResult(null);
    setStudentQuizWarning('');
  }, [quizId, quizData, activeStudentIdentityKey]);
  useEffect(() => {
    if (role !== 'student') return;
    const profileName = activeStudentProfile?.fullName || currentStudent?.fullName || '';
    setStudentQuizName(profileName);
    setStudentName(profileName);
    setStudentQuizResult(null);
    setStudentQuizWarning('');
    setSubmissionFile(null);
    setSubmissionStatus('');
  }, [role, activeStudentIdentityKey, activeStudentProfile?.fullName, currentStudent?.fullName]);
  useEffect(() => {
    autoSelfQuizSubmitKeyRef.current = '';
    autoEssayLockKeyRef.current = '';
    submissionFilePickerActiveRef.current = false;
  }, [quizId]);
  useEffect(() => {
    if (!studentQuizDraftKey || role === 'teacher') return;
    try {
      const saved = JSON.parse(localStorage.getItem(studentQuizDraftKey) || '{}');
      const profileName = activeStudentProfile?.fullName || currentStudent?.fullName || '';
      if (profileName) setStudentQuizName(profileName);
      else if (saved.name) setStudentQuizName(saved.name);
      if (saved.answers && typeof saved.answers === 'object') setStudentQuizAnswers(saved.answers);
    } catch (e) {}
  }, [studentQuizDraftKey, role, activeStudentProfile?.fullName, currentStudent?.fullName]);
  useEffect(() => {
    if (!studentQuizDraftKey || role === 'teacher' || studentQuizResult) return;
    try {
      localStorage.setItem(studentQuizDraftKey, JSON.stringify({ name: activeStudentProfile?.fullName || currentStudent?.fullName || studentQuizName, answers: studentQuizAnswers, updatedAt: Date.now() }));
    } catch (e) {}
  }, [studentQuizDraftKey, role, studentQuizName, studentQuizAnswers, studentQuizResult, activeStudentProfile?.fullName, currentStudent?.fullName]);
  useEffect(() => {
    if (!submissionFile) {
      setSubmissionPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(submissionFile);
    setSubmissionPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [submissionFile]);
  useEffect(() => {
    const clearFilePickerFlag = () => {
      window.setTimeout(() => {
        submissionFilePickerActiveRef.current = false;
      }, 1200);
    };
    window.addEventListener('focus', clearFilePickerFlag);
    return () => window.removeEventListener('focus', clearFilePickerFlag);
  }, []);
  useEffect(() => {
    const hasQuizDraft = activeSelfQuiz && !studentQuizResult && (studentQuizName.trim() || Object.keys(studentQuizAnswers).length > 0);
    const hasManualDraft = role === 'student' && (studentName.trim() || submissionFile);
    if (!hasQuizDraft && !hasManualDraft) return undefined;
    const warnBeforeLeave = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [activeSelfQuiz, studentQuizResult, studentQuizName, studentQuizAnswers, role, studentName, submissionFile]);
  useEffect(() => { if (showAiModal && aiResponse) typesetMath(aiResponseContentRef.current); }, [showAiModal, aiResponse]);

  const handleToggleRole = () => {
    if (role === 'teacher' && contentEditableRef.current) { setNoteHtml(contentEditableRef.current.innerHTML); setSelectedImage(null); }
    const newRole = role === 'teacher' ? 'student' : 'teacher';
    if (newRole === 'teacher') {
      requestAnimationFrame(() => {
        if (contentEditableRef.current && noteId) {
          contentEditableRef.current.innerHTML = humanizeHtmlString(noteHtml || '');
          contentEditableRef.current.setAttribute('data-loaded-id', noteId);
        }
      });
    }
    setRole(newRole);
  };

  const handleUpdateSchoolYear = async (year) => {
     setCurrentSchoolYear(year); if (!user) return;
     try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { schoolYear: year }, { merge: true }); showNotification(`Đã cập nhật hệ thống thành năm học ${year}`); } catch (e) { showNotification("Lỗi cập nhật năm học", "error"); }
  };

  const updateGlobalSetting = async (key, value) => {
    if (key === 'isAdminPassEnabled') {
      setIsAdminPassEnabled(true);
      if (!user) return;
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { isAdminPassEnabled: true }, { merge: true });
        showNotification('Đã khóa mật khẩu admin.');
      } catch (e) {
        showNotification('Chưa lưu được thiết lập.', 'error');
      }
      return;
    }
    if (key === 'adminPass') setAdminPass(value);
    if (key === 'isTeacherPassEnabled') setIsTeacherPassEnabled(value);
    if (key === 'teacherPass') setTeacherPass(value);
    if (key === 'isStudentCodeEnabled') setIsStudentCodeEnabled(value);
    if (key === 'schoolYear') setCurrentSchoolYear(value);
    if (key === 'principalName') setPrincipalName(value);
    if (key === 'inputYearLocks') setInputYearLocks(value && typeof value === 'object' ? value : {});
    if (key === 'transcriptStartDates') setTranscriptStartDates(value && typeof value === 'object' ? value : {});
    if (key === 'transcriptEndDates') setTranscriptEndDates(value && typeof value === 'object' ? value : {});
    if (key === 'transcriptGrade9EndDates') setTranscriptGrade9EndDates(value && typeof value === 'object' ? value : {});
    if (key === 'nanTeachers') setNanTeachers(Array.isArray(value) ? value : []);
    if (key === 'classTeacherAssignments') setClassTeacherAssignments(value && typeof value === 'object' ? value : {});
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), { [key]: value }, { merge: true });
      showNotification('Đã lưu thiết lập.');
    } catch (e) {
      showNotification('Chưa lưu được thiết lập.', 'error');
    }
  };

  useEffect(() => {
    const fetchSGK = async () => {
      if (!selectedGrade) return; const fId = TEXTBOOK_FOLDERS[selectedGrade]; if (!fId) { setTextbookFiles([]); return; }
      setIsLoadingTextbooks(true);
      try { const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q='${fId}'+in+parents+and+trashed=false&key=${GOOGLE_API_KEY}&fields=files(id,name,mimeType,webViewLink,iconLink)`); const data = await resp.json(); if (data.files) setTextbookFiles(data.files); } catch (e) {} finally { setIsLoadingTextbooks(false); }
    };
    fetchSGK();
  }, [selectedGrade]);

  const fetchDriveData = useCallback(async () => {
    if (!role || role !== 'teacher' || !selectedGrade || !selectedSubject) return;
    setIsLoadingDrive(true); setDriveError('');
    try {
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q='${MASTER_DRIVE_FOLDER_ID}'+in+parents+and+trashed=false&pageSize=1000&key=${GOOGLE_API_KEY}&fields=files(id,name,mimeType,webViewLink,description)`);
      const data = await resp.json();
      if (data.files) {
        const searchTag = `[K${selectedGrade}_${selectedSubject}`;
        const filtered = data.files.filter(f => f.name.includes(searchTag) && !f.name.startsWith('[CHO_XOA]'));
        setDriveFiles(filtered);
        const visibleDriveIds = new Set(filtered.map(f => f.id));
        const stalePinnedMaterials = allMaterials.filter(m => String(m.grade) === String(selectedGrade) && String(m.subject) === String(selectedSubject) && m.driveFileId && !visibleDriveIds.has(m.driveFileId) );
        if (stalePinnedMaterials.length > 0 && user && role === 'teacher') { await Promise.all(stalePinnedMaterials.map(m => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'materials', m.id)) )); }
      }
    } catch (e) { setDriveError('Lỗi kết nối API Drive.'); } finally { setIsLoadingDrive(false); }
  }, [role, selectedGrade, selectedSubject, allMaterials, user]);

  useEffect(() => { fetchDriveData(); }, [fetchDriveData]);

  const openTeacherLogin = () => {
    if (isTeacherPassEnabled) {
      setModalMode('teacher');
      setPasswordInput('');
      setErrorMsg('');
      setShowPasswordModal(true);
      return;
    }
    setRole('teacher');
    setLoginRole('teacher');
  };

  const handleLogin = () => {
    if (modalMode === 'admin') {
      if (passwordInput === adminPass) {
        setIsAdmin(true);
        setRole('admin');
        setShowPasswordModal(false);
        showNotification("Đã vào Quản trị");
      } else {
        setErrorMsg('Mật khẩu không chính xác!');
      }
    } else if (modalMode === 'teacher') {
      if (!teacherPass.trim()) {
        setErrorMsg('Admin đã bật mật khẩu giáo viên nhưng chưa đặt mật khẩu.');
      } else if (passwordInput === teacherPass) {
        setRole('teacher');
        setLoginRole('teacher');
        setShowPasswordModal(false);
        showNotification("Xin chào Giáo viên!");
      } else {
        setErrorMsg('Mật khẩu giáo viên không chính xác!');
      }
    }
    setPasswordInput('');
  };

  const handleLogoutAdmin = () => { setIsAdmin(false); setRole(null); setLoginRole(null); setCurrentStudent(null); setShowClassOps(false); resetNavigationWithClean(); showNotification("Đã thoát Quản trị"); };

  useEffect(() => {
    if (!showAddNews || !newsContentRef.current) return;
    newsContentRef.current.innerHTML = editingNews?.content || '';
  }, [showAddNews, editingNews]);

  const openNewsForm = (news = null) => {
    setEditingNews(news);
    setNewsTitle(news?.title || '');
    setShowAddNews(true);
    window.setTimeout(() => {
      if (newsContentRef.current) newsContentRef.current.innerHTML = news?.content || '';
    }, 0);
  };

  const closeNewsForm = () => {
    setShowAddNews(false);
    setEditingNews(null);
    setNewsTitle('');
    if (newsContentRef.current) newsContentRef.current.innerHTML = '';
  };

  const handleAddNews = async () => {
    const content = newsContentRef.current?.innerHTML?.trim();
    if (!user || !newsTitle.trim() || !content || content === '<br>') { showNotification("Vui lòng nhập đủ Tiêu đề và Nội dung!", "error"); return; }
    setIsSubmittingNews(true);
    try {
      if (editingNews?.id) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', editingNews.id), {
          title: newsTitle,
          content: newsContentRef.current.innerHTML,
          updatedAt: Date.now(),
          updatedBy: user.uid
        });
        if (viewingNews?.id === editingNews.id) setViewingNews(prev => prev ? ({ ...prev, title: newsTitle, content: newsContentRef.current.innerHTML, updatedAt: Date.now() }) : prev);
        showNotification("Đã cập nhật bản tin!");
      } else {
        const now = Date.now();
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'news'), { title: newsTitle, content: newsContentRef.current.innerHTML, createdAt: now, sortOrder: now, authorId: user.uid, isPinned: false, isHot: false });
        showNotification("Đã đăng tin thành công!");
      }
      closeNewsForm();
    } catch (e) { showNotification(editingNews?.id ? "Lỗi cập nhật tin" : "Lỗi đăng tin", "error"); } finally { setIsSubmittingNews(false); }
  };

  const handleDeleteNews = async (id) => { setConfirmModal({ show: true, message: 'Bạn có chắc chắn muốn xóa bản tin này?', onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', id)); showNotification("Đã xóa bản tin"); } }); };

  const handleTogglePinNews = async (e, n) => { e.stopPropagation(); try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', n.id), { isPinned: !n.isPinned }); showNotification(n.isPinned ? "Đã bỏ ghim bản tin" : "Đã ghim bản tin lên thông báo khẩn!"); } catch(err) { showNotification("Lỗi khi ghim tin", "error"); } };

  const handleToggleHotNews = async (e, n) => { e.stopPropagation(); try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', n.id), { isHot: !n.isHot }); showNotification(n.isHot ? "Đã bỏ tin nóng" : "Đã đánh dấu tin nóng!"); } catch(err) { showNotification("Lỗi khi cập nhật tin nóng", "error"); } };

  const handleEditNews = (e, n) => {
    e.stopPropagation();
    setViewingNews(null);
    openNewsForm(n);
  };

  const handleMoveNews = async (e, n, direction) => {
    e.stopPropagation();
    const currentIndex = newsList.findIndex(item => item.id === n.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const target = newsList[targetIndex];
    if (currentIndex < 0 || !target) return;
    const currentOrder = n.sortOrder ?? n.createdAt ?? Date.now();
    const targetOrder = target.sortOrder ?? target.createdAt ?? Date.now();
    try {
      await Promise.all([
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', n.id), { sortOrder: targetOrder }),
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'news', target.id), { sortOrder: currentOrder })
      ]);
      showNotification("Đã đổi thứ tự bản tin");
    } catch (err) {
      showNotification("Lỗi khi đổi thứ tự tin", "error");
    }
  };

  const handleSelectDriveFile = async (file) => {
    if (!user) { showNotification("Phiên đăng nhập hết hạn", "error"); return; }
    let fType = 'link'; const mime = file.mimeType.toLowerCase();
    if (mime.includes('pdf')) fType = 'pdf'; else if (mime.includes('presentation') || file.name.includes('.ppt')) fType = 'ppt'; else if (mime.includes('image')) fType = 'image';
    let title = file.name.replace(/\[.*?\]_/, '').replace(/\.[^/.]+$/, "");
    try { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'materials'), { grade: String(selectedGrade), subject: String(selectedSubject), lesson: String(selectedLesson), title: title, url: file.webViewLink, driveFileId: file.id, type: fType, createdAt: Date.now(), authorId: user.uid }); showNotification("Đã ghim tài liệu thành công!"); } catch(e) { showNotification("Lỗi ghim tài liệu", "error"); }
  };

  const getMaterialsForDriveFile = useCallback((file, { currentOnly = true } = {}) => {
    const fileId = file.id || extractDriveFileId(file.webViewLink);
    const fileTitle = cleanDriveTitle(file.name);
    return allMaterials.filter(m => !currentOnly || (String(m.grade) === String(selectedGrade) && String(m.subject) === String(selectedSubject))).filter(m => { const materialFileId = m.driveFileId || extractDriveFileId(m.url); if (fileId && materialFileId) return fileId === materialFileId; if (!currentOnly) return false; return cleanDriveTitle(m.title) === fileTitle; });
  }, [allMaterials, selectedGrade, selectedSubject]);

  const getPinnedLessonsForDriveFile = useCallback((file) => { const lessons = getMaterialsForDriveFile(file).map(m => Number(m.lesson)).filter(Boolean); return [...new Set(lessons)].sort((a, b) => a - b).map(lesson => getWeekDisplayName(String(lesson))); }, [getMaterialsForDriveFile]);

  const handleHideFromDrive = async (file) => {
    if (!user || role !== 'teacher') return;
    setConfirmModal({ show: true, message: `File này sẽ được đổi tên thêm [CHO_XOA] ở phía trước để ẩn khỏi Kho chung. File vẫn còn trong Google Drive để thầy cô có thể xóa tay sau. Bạn có chắc chắn?`, onConfirm: async () => { const oldName = file.name; setDriveFiles(prev => prev.filter(f => f.id !== file.id)); showNotification("Đang ẩn file khỏi Kho chung...", "success"); try { const res = await postAppsScript({ action: 'rename', fileId: file.id }); if (res.status === 'success') { const linkedMaterials = getMaterialsForDriveFile(file, { currentOnly: false }); if (linkedMaterials.length > 0) { await Promise.all(linkedMaterials.map(m => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'materials', m.id)) )); } showNotification(`Đã ẩn file "${oldName.replace(/\[.*?\]_/, '')}" khỏi Kho chung${linkedMaterials.length ? ` và gỡ ${linkedMaterials.length} ghim` : ''}.`); } else { showNotification(`Lỗi: ${res.message}`, "error"); fetchDriveData(); } } catch (e) { fetchDriveData(); } } });
  };

  const handleEditorInput = () => { if (role !== 'teacher' || !noteId) return; if (contentEditableRef.current) setNoteHtml(contentEditableRef.current.innerHTML); setAutoSaveStatus('Đang chờ lưu...'); if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current); autoSaveTimeoutRef.current = setTimeout(() => { handleAutoSave(); }, 2000); };

  const handleAutoSave = async () => {
     if (!contentEditableRef.current || !noteId || !user) return;
     setAutoSaveStatus('Đang lưu...');
     try { const savedContent = contentEditableRef.current.innerHTML; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lesson_notes', noteId), { content: savedContent, updatedAt: Date.now(), authorId: user.uid, grade: String(selectedGrade), subject: String(selectedSubject), lesson: String(selectedLesson) }); setNoteHtml(savedContent); contentEditableRef.current.setAttribute('data-loaded-id', noteId); setAutoSaveStatus('☁️ Đã lưu tự động'); setTimeout(() => setAutoSaveStatus(''), 4000); } catch (e) { setAutoSaveStatus('Lỗi lưu tự động'); }
  };

  const handleSaveNote = async () => {
    if (!contentEditableRef.current || !noteId || !user) return; if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current); setIsSavingNote(true);
    try { const savedContent = contentEditableRef.current.innerHTML; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lesson_notes', noteId), { content: savedContent, updatedAt: Date.now(), authorId: user.uid, grade: String(selectedGrade), subject: String(selectedSubject), lesson: String(selectedLesson) }); setNoteHtml(savedContent); setAllNotes(prev => { const note = { id: noteId, content: savedContent, grade: String(selectedGrade), subject: String(selectedSubject), lesson: String(selectedLesson), updatedAt: Date.now() }; const others = prev.filter(n => n.id !== noteId); return [...others, note]; }); contentEditableRef.current.setAttribute('data-loaded-id', noteId); setSaveSuccess(true); setAutoSaveStatus(''); setTimeout(() => setSaveSuccess(false), 3000); showNotification('Đã lưu bài học thành công!'); } catch (e) { showNotification('Lỗi lưu bài học: ' + e.message, 'error'); } finally { setIsSavingNote(false); }
  };

  const handleQuizEditorInput = () => { if (quizEditorRef.current) refreshQuizHtmlFromEditors(); };
  const handleQuizAnswerInput = () => { if (quizAnswerEditorRef.current) refreshQuizHtmlFromEditors(); };

  const hasScoringGuide = (html = '') => {
    const text = removeAccents(stripHtmlToText(html)).toLowerCase();
    return /(\d+(?:[,.]\d+)?)\s*diem/.test(text) && /(bieu diem|thang diem|diem tung y|moi cau|moi y|tong diem|rubric)/.test(text);
  };

  const buildQuizAnswerPrompt = (questionHtml = '', answerHtml = '') => {
    const questionText = stripHtmlToText(questionHtml);
    const answerText = stripHtmlToText(answerHtml);
    return `Ban la giao vien ${selectedSubject} lop ${selectedGrade}. Hay tao PHAN DAP AN VA BIEU DIEM cho de kiem tra sau.

YEU CAU BAT BUOC:
- Khong tao lai de, chi viet dap an, goi y cham va bieu diem.
- Tong diem la 10 diem.
- Neu toan bo de la trac nghiem: lay 10 diem chia deu cho so cau trac nghiem.
- Neu de co ca trac nghiem va tu luan: phan trac nghiem tong 5 diem chia deu cho cac cau trac nghiem; phan tu luan tong 5 diem chia deu theo cau va y.
- Neu toan bo de la tu luan: tu chia 10 diem theo cau va theo tung y, ghi ro moi y bao nhieu diem.
- Moi cau/ moi y phai co diem ro rang de AI cham bai ve sau.
- Dung dinh dang ngan gon, ro rang, co tieu de "DAP AN - BIEU DIEM".
${getFormulaFormatInstruction()}

DE KIEM TRA:
${questionText || '(Chua co noi dung de)'}

DAP AN GIAO VIEN DA CO NEU CO:
${answerText || '(Chua co dap an, hay tu tao dap an dung va bieu diem)'}`;
  };

  const normalizeMathDelimiters = (value = '') => String(value)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => `\\[${math.trim()}\\]`)
    .replace(/(^|[^\\])\$([^\n$]+?)\$/g, (_, prefix, math) => `${prefix}\\(${math.trim()}\\)`);

  const OVERLINE_TOKEN_START = '\uE000OVERLINE:';
  const OVERLINE_TOKEN_END = '\uE001';

  const renderOverlineTokens = (html = '') => String(html || '')
    .replace(/\uE000OVERLINE:([^\uE001]+)\uE001/g, (_, text) => (
      `<span style="text-decoration:overline;text-decoration-thickness:1px;text-decoration-skip-ink:none;">${text}</span>`
    ));

  const humanizeLatexText = (value = '') => {
    const convert = (raw = '') => String(raw || '')
      .replace(/\\\\/g, '\\')
      .replace(/\\mathbb\{N\}/g, 'ℕ')
      .replace(/\\mathbb\{Z\}/g, 'ℤ')
      .replace(/\\mathbb\{Q\}/g, 'ℚ')
      .replace(/\\mathbb\{R\}/g, 'ℝ')
      .replace(/\\notin\b/g, '∉')
      .replace(/\\in\b/g, '∈')
      .replace(/\\leq?\b/g, '≤')
      .replace(/\\geq?\b/g, '≥')
      .replace(/\\neq?\b/g, '≠')
      .replace(/\\times\b/g, '×')
      .replace(/\\cdot\b/g, '·')
      .replace(/\\mid\b/g, '|')
      .replace(/\\cup\b/g, '∪')
      .replace(/\\cap\b/g, '∩')
      .replace(/\\emptyset\b/g, '∅')
      .replace(/\\varnothing\b/g, '∅')
      .replace(/\\overline\{([^{}]+)\}/g, (_, text) => `${OVERLINE_TOKEN_START}${text}${OVERLINE_TOKEN_END}`)
      .replace(/\\dots\b/g, '…')
      .replace(/\\ldots\b/g, '…')
      .replace(/\\cdots\b/g, '⋯')
      .replace(/\\ast\b/g, '*')
      .replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/\\left/g, '')
      .replace(/\\right/g, '')
      .replace(/\\,/g, ' ')
      .replace(/\\;/g, ';')
      .replace(/\\:/g, ':')
      .replace(/\\\{/g, '{')
      .replace(/\\\}/g, '}')
      .replace(/\\\(/g, '')
      .replace(/\\\)/g, '')
      .replace(/\\\[/g, '')
      .replace(/\\\]/g, '')
      .replace(/\\([A-Za-z]+)/g, '$1');

    return convert(value)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => convert(math))
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => convert(math));
  };

  const humanizeHtmlString = (html = '') => {
    if (typeof document === 'undefined') return humanizeLatexText(html);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(html || '');
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => { node.nodeValue = humanizeLatexText(node.nodeValue); });
    return renderOverlineTokens(wrapper.innerHTML);
  };

  const textToPasteHtml = (text = '') => {
    const normalized = humanizeLatexText(normalizeMathDelimiters(text.replace(/\r\n/g, '\n')));
    const escaped = renderOverlineTokens(escapeHtml(normalized)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^###\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/^##\s+(.+)$/gm, '<strong>$1</strong>')
      .replace(/^#\s+(.+)$/gm, '<strong>$1</strong>'));
    return escaped.split('\n').map(line => line.trim() ? `<div>${line}</div>` : '<div><br></div>').join('');
  };

  const formatEssayPromptHtml = (text = '') => {
    const normalized = normalizeMathDelimiters(String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\\\\/g, '\\')
      .trim());
    if (!normalized) return '';
    return normalized.split('\n').map(rawLine => {
      const line = rawLine.trim();
      if (!line) return '<div style="height:10px"></div>';
      const escaped = escapeHtml(line);
      const folded = removeAccents(line).toLowerCase();
      if (/^tu\s*luan\b/.test(folded)) {
        return `<div style="font-weight:900;font-size:15px;color:#0f172a;margin:4px 0 16px 0;">${escaped}</div>`;
      }
      if (/^bai\s*\d+\b/.test(folded)) {
        return `<div style="font-weight:900;color:#1e293b;margin:16px 0 6px 0;">${escaped}</div>`;
      }
      if (/^[a-d]\)/i.test(line)) {
        const marker = escaped.slice(0, 2);
        const rest = escaped.slice(2).trim();
        return `<div style="margin:4px 0 4px 18px;"><strong>${marker}</strong> ${rest}</div>`;
      }
      return `<div style="margin:4px 0;">${escaped}</div>`;
    }).join('');
  };

  const normalizePastedHtml = (html = '') => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.querySelectorAll('script, style, meta, link').forEach(node => node.remove());
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => { node.nodeValue = humanizeLatexText(normalizeMathDelimiters(node.nodeValue)); });
    return renderOverlineTokens(wrapper.innerHTML);
  };

  const insertSmartPaste = (e, target = 'lesson') => {
    const clipboard = e.clipboardData;
    const html = clipboard?.getData('text/html');
    const text = clipboard?.getData('text/plain');
    if (!html && !text) return false;
    e.preventDefault();
    const cleanHtml = html ? normalizePastedHtml(html) : textToPasteHtml(text);
    document.execCommand('insertHTML', false, cleanHtml);
    if (target === 'quiz') handleQuizEditorInput();
    else handleEditorInput();
    return true;
  };

  const buildQuizArchiveHtml = (content = '', publishNowValue = false, publishAtMs = null) => `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Đề kiểm tra ${escapeHtml(selectedSubject)} khối ${escapeHtml(selectedGrade)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: Arial, sans-serif; color: #111827; line-height: 1.6; font-size: 13.5px; }
    .cover { text-align: center; border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 18px; }
    .school { font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 1px; }
    h1 { font-size: 20px; color: #1e3a8a; margin: 8px 0 6px; text-transform: uppercase; }
    .meta { color: #475569; font-size: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 12px; margin-bottom: 18px; }
    .content { padding-top: 4px; }
    img { max-width: 100%; height: auto; }
    iframe { display: none; }
    a { color: #2563eb; word-break: break-word; }
    .teacher-only { display: block; background: #fff1f2; border: 2px dashed #f43f5e; border-radius: 8px; padding: 14px; margin-top: 18px; }
    .teacher-only::before { content: "PHẦN ĐÁP ÁN - CHỈ GIÁO VIÊN"; display: block; color: #be123c; font-weight: 900; margin-bottom: 8px; }
    .quiz-attachment-preview { border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 8px; padding: 10px; margin: 12px 0; }
    .quiz-attachment-preview-title { font-weight: 700; color: #1d4ed8; }
  </style>
</head>
<body>
  <div class="cover">
    <div class="school">THCS Nguyễn An Ninh - Kho học liệu số</div>
    <h1>Đề kiểm tra ${escapeHtml(selectedSubject)} khối ${escapeHtml(selectedGrade)}</h1>
  </div>
  <div class="meta">
    Năm học: ${escapeHtml(currentSchoolYear)} | ${escapeHtml(getWeekDisplayName(selectedLesson))} | Trạng thái: ${publishNowValue ? 'Phát đề ngay' : (publishAtMs ? `Hẹn ${escapeHtml(formatVietnamDateTimeLocal(publishAtMs).replace('T', ' '))} (giờ Việt Nam)` : 'Chưa phát đề')}
  </div>
  <div class="content">${content}</div>
</body>
</html>`;

  const uploadQuizDocSnapshot = async (content, publishNowValue = false, publishAtMs = null) => {
    try {
      const html = buildQuizArchiveHtml(content, publishNowValue, publishAtMs);
      const filename = getQuizArchiveName();
      setQuizDocStatus({ state: 'loading', message: 'Đang tạo Google Doc trên Drive...', url: '' });
      showNotification('Đang tạo Google Doc đề kiểm tra trên Drive...');
      const res = await postAppsScript({
        action: 'createGoogleDocFromHtml',
        filename,
        html,
        folderId: QUIZ_DRIVE_FOLDER_ID,
      });
      if (res.status === 'success') {
        setQuizDocStatus({ state: 'success', message: 'Đã tạo Google Doc đề kiểm tra', url: res.url || '' });
        showNotification('Đã tạo Google Doc đề kiểm tra: ' + (res.url || 'mở trong Drive'));
        return res;
      }
      throw new Error(res.message || 'Apps Script chưa tạo được Google Doc.');
    } catch (docError) {
      setQuizDocStatus({ state: 'error', message: 'Chưa tạo được Google Doc: ' + docError.message, url: '' });
      showNotification('Đã lưu bài kiểm tra, nhưng chưa tạo được Google Doc: ' + docError.message, 'error');
      return null;
    }
  };

  const persistQuiz = async (savedContent, publishNowValue, publishAtValue, extraFields = {}) => {
    if (!canWriteCurrentSchoolYear) {
      showNotification(`Năm học ${currentSchoolYear} đang khóa nhập liệu. Admin mở khóa mới lưu/phát đề được.`, 'error');
      return;
    }
    setIsSavingQuiz(true);
    try {
      const publishAtMs = publishAtValue ? parseVietnamDateTimeLocal(publishAtValue) : null;
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lesson_quizzes', quizId), {
        content: savedContent,
        isPublished: publishNowValue,
        publishAt: publishAtMs,
        updatedAt: Date.now(),
        authorId: user.uid,
        schoolYear: currentSchoolYear,
        grade: String(selectedGrade),
        subject: String(selectedSubject),
        lesson: String(selectedLesson),
        title: (extraFields.title ?? quizTitle).trim() || `${selectedSubject} ${selectedGrade} - ${getWeekDisplayName(selectedLesson)}`,
        ...extraFields
      }, { merge: true });
      setQuizHtml(savedContent);
      setQuizTitle((extraFields.title ?? quizTitle).trim() || `${selectedSubject} ${selectedGrade} - ${getWeekDisplayName(selectedLesson)}`);
      setQuizPublishNow(publishNowValue);
      setQuizPublishAt(publishAtMs ? formatVietnamDateTimeLocal(publishAtMs) : '');
      if (extraFields.deliveryMode) setQuizDeliveryMode(extraFields.deliveryMode);
      if (Object.prototype.hasOwnProperty.call(extraFields, 'scoreTarget')) setQuizScoreTarget(extraFields.scoreTarget || null);
      if (quizEditorRef.current) quizEditorRef.current.setAttribute('data-loaded-id', quizId);
      setQuizSaveSuccess(true);
      setTimeout(() => setQuizSaveSuccess(false), 3000);
      showNotification('Đã lưu bài kiểm tra thành công!');
      if (String(savedContent || '').trim()) {
        const quizDoc = await uploadQuizDocSnapshot(savedContent, publishNowValue, publishAtMs);
        if (quizDoc?.url || quizDoc?.fileId) {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lesson_quizzes', quizId), {
            quizDocUrl: quizDoc.url || '',
            quizDocFileId: quizDoc.fileId || '',
            quizDocName: quizDoc.filename || '',
            quizDocUpdatedAt: Date.now()
          });
        }
      }
    } catch (e) { showNotification('Lỗi lưu bài kiểm tra: ' + e.message, 'error'); } finally { setIsSavingQuiz(false); }
  };

  const openQuizPublishModal = async (savedContent) => {
    setPendingQuizContent(savedContent);
    setPendingQuizDeliveryMode(quizData?.questions?.length ? quizDeliveryMode : 'manual');
    const currentTargetFits = quizScoreTarget
      && quizScoreSubject
      && String(quizScoreTarget.subjectKey || '') === String(quizScoreSubject.key)
      && String(quizScoreTarget.semester || '') === String(quizScoreSemester);
    setPendingQuizScoreTarget(currentTargetFits ? quizScoreTarget : null);
    setScoreTargetEdits({});
    if (selectedGrade) {
      try {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', getScorebookDocIdForGrade(selectedGrade)));
        const data = snap.exists() ? (snap.data() || {}) : {};
        setScoreTargetEdits(data.edits && typeof data.edits === 'object' ? data.edits : {});
      } catch (error) {
        setScoreTargetEdits({});
      }
    }
    setQuizPublishModalAt(quizPublishAt || formatVietnamDateTimeLocal(Date.now()));
    setShowQuizPublishModal(true);
  };

  const handleSaveQuiz = async () => {
    if (!quizEditorRef.current || !quizId || !user) return;
    let savedContent = getCurrentQuizContent();
    if (!String(savedContent || '').trim()) {
      showNotification('Chưa có nội dung bài kiểm tra để lưu.', 'error');
      return;
    }
    const answerContent = quizAnswerEditorRef.current?.innerHTML ?? quizAnswerHtml;
    if (String(stripHtmlToText(answerContent) || '').trim() && !hasScoringGuide(answerContent)) {
      const useAiRubric = window.confirm('Phần đáp án chưa thấy biểu điểm rõ từng câu/từng ý. Bấm OK để AI tự chia điểm, hoặc Hủy nếu thầy cô muốn tự cho điểm.');
      if (useAiRubric) {
        const generatedContent = await handleGenerateQuizAnswer({ silent: true });
        if (!generatedContent) return;
        savedContent = generatedContent;
      }
    }
    await persistQuiz(savedContent, quizPublishNow, quizPublishAt, { title: quizTitle });
  };

  const confirmQuizPublishNow = async () => {
    setShowQuizPublishModal(false);
    await persistQuiz(pendingQuizContent, true, '', { deliveryMode: pendingQuizDeliveryMode, scoreTarget: pendingQuizScoreTarget || null });
  };

  const confirmQuizSchedule = async () => {
    if (!quizPublishModalAt) { showNotification('Vui lòng chọn ngày giờ hẹn phát đề.', 'error'); return; }
    if (!parseVietnamDateTimeLocal(quizPublishModalAt)) { showNotification('Ngày giờ hẹn chưa hợp lệ.', 'error'); return; }
    setShowQuizPublishModal(false);
    await persistQuiz(pendingQuizContent, false, quizPublishModalAt, { deliveryMode: pendingQuizDeliveryMode, scoreTarget: pendingQuizScoreTarget || null });
  };

  const handleClearQuiz = async () => {
    if (!window.confirm('Xóa hết nội dung bài kiểm tra tuần này?')) return;
    if (quizEditorRef.current) {
      quizEditorRef.current.innerHTML = '';
      quizEditorRef.current.setAttribute('data-loaded-id', quizId || '');
    }
    if (quizAnswerEditorRef.current) quizAnswerEditorRef.current.innerHTML = '';
    setQuizHtml('');
    setQuizQuestionHtml('');
    setQuizAnswerHtml('');
    setQuizTitle('');
    setQuizAttachments([]);
    setQuizPublishNow(false);
    setQuizPublishAt('');
    setIsPreviousQuizLoaded(false);
    setQuizData(null);
    setQuizDeliveryMode('manual');
    setQuizScoreTarget(null);
    setSelfQuizDraft(getDefaultSelfQuizDraft());
    if (quizId && user) await persistQuiz('', false, '', { quizData: null, scoreTarget: null });
  };

  const handleToggleQuizPublish = async () => {
    if (!quizId || !user) {
      showNotification('Chưa thể bật bài kiểm tra. Thầy cô kiểm tra lại đăng nhập, khối, môn và tuần.', 'error');
      return;
    }
    const savedContent = getCurrentQuizContent();
    const isVisibleNow = isQuizVisibleForStudents({ content: savedContent, isPublished: quizPublishNow, publishAt: quizPublishAt });
    if ((isVisibleNow || quizPublishAt) && String(savedContent || '').trim()) {
      await persistQuiz(savedContent, false, '');
      return;
    }
    if (!String(savedContent || '').trim()) {
      showNotification('Chưa có nội dung bài kiểm tra để bật cho học sinh.', 'error');
      return;
    }
    openQuizPublishModal(savedContent);
  };

  const openQuickQuizPreview = () => {
    if (quizEditorRef.current || quizAnswerEditorRef.current) refreshQuizHtmlFromEditors();
    const content = getCurrentQuizContent();
    if (!String(stripHtmlToText(content) || '').trim()) {
      showNotification('Chưa có đề kiểm tra để xem nhanh.', 'error');
      return;
    }
    setShowQuickQuizPreview(true);
  };

  const handleLoadPreviousQuiz = async () => {
    if (!previousQuizId) return;
    if (isPreviousQuizLoaded) {
      setIsPreviousQuizLoaded(false);
      setQuizHtml('');
      setQuizQuestionHtml('');
      setQuizAnswerHtml('');
      setQuizAttachments([]);
      if (quizEditorRef.current) quizEditorRef.current.innerHTML = '';
      if (quizAnswerEditorRef.current) quizAnswerEditorRef.current.innerHTML = '';
      showNotification('Đã bỏ nội dung đề năm trước.');
      return;
    }
    try {
      const prevSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lesson_quizzes', previousQuizId));
      if (!prevSnap.exists() || !prevSnap.data().content) { showNotification(`Chưa có đề năm ${previousSchoolYear} cho bài này.`, 'error'); return; }
      const content = prevSnap.data().content || '';
      setShowQuizEditor(true);
      setQuizHtml(content);
      syncQuizPartsFromContent(content);
      setQuizAttachments(extractQuizAttachments(content));
      setIsPreviousQuizLoaded(true);
      showNotification(`Đã lấy đề năm ${previousSchoolYear}.`);
    } catch (e) { showNotification('Không lấy được đề năm trước.', 'error'); }
  };

  const savedQuizArchive = useMemo(() => {
    return [...allQuizzes]
      .filter(item => String(item.grade || '') === String(selectedGrade || ''))
      .filter(item => String(item.subject || '') === String(selectedSubject || ''))
      .filter(item => String(item.content || '').trim())
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }, [allQuizzes, selectedGrade, selectedSubject]);

  const loadQuizFromArchive = (quiz = {}) => {
    const content = quiz.content || '';
    setQuizHtml(content);
    syncQuizPartsFromContent(content);
    setQuizAttachments(extractQuizAttachments(content));
    setQuizTitle(quiz.title || `${quiz.subject || selectedSubject} ${quiz.grade || selectedGrade} - ${getWeekDisplayName(quiz.lesson || selectedLesson)}`);
    setShowQuizArchive(false);
    showNotification('Đã đưa đề từ kho vào khung soạn.');
  };

  const handleQuizFileUpload = async (e, selectedFiles = null) => {
    e?.preventDefault?.();
    const filesToUpload = selectedFiles || quizFiles;
    if (!quizEditorRef.current || !filesToUpload.length || !user) return;
    setQuizFiles(filesToUpload);
    setIsSubmitting(true); setUploadProgress({ current: 0, total: filesToUpload.length });
    try {
      const addedAttachments = [];
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i]; setUploadProgress(prev => ({ ...prev, current: i + 1 }));
        const base64Data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
        const up = await postAppsScript({ filename: `[KIEMTRA_${currentSchoolYear}_K${selectedGrade}_${selectedSubject}_B${selectedLesson}]_${file.name}`, mimeType: file.type, base64: base64Data, folderId: QUIZ_DRIVE_FOLDER_ID });
        if (up.status === 'success') {
          const title = (up.filename || file.name).replace(/\[.*?\]_/, '');
          const attachmentId = `quiz_attach_${Date.now()}_${i}`;
          const previewUrl = getDrivePreviewUrl(up.url, up.fileId);
          const attachment = { id: attachmentId, title, url: up.url, previewUrl };
          addedAttachments.push(attachment);
          quizEditorRef.current.innerHTML += `<div class="quiz-attachment-preview" data-quiz-attachment-id="${escapeAttr(attachmentId)}" data-title="${escapeAttr(title)}" data-url="${escapeAttr(up.url)}" data-preview-url="${escapeAttr(previewUrl)}"><div class="quiz-attachment-preview-title">\uD83D\uDCCE ${escapeHtml(title)}</div><iframe src="${escapeAttr(previewUrl)}" title="${escapeAttr(title)}" loading="lazy"></iframe><p><a href="${escapeAttr(up.url)}" target="_blank" rel="noopener noreferrer">M\u1edf t\u00e0i li\u1ec7u trong tab m\u1edbi</a></p></div>`;
        }
      }
      handleQuizEditorInput();
      if (addedAttachments.length) setQuizAttachments(prev => [...prev, ...addedAttachments]);
      setQuizFiles([]);
      showNotification('\u0110\u00e3 up file v\u00e0 ch\u00e8n v\u00e0o b\u00e0i ki\u1ec3m tra.');
    } catch (e) { showNotification('L\u1ed7i up file b\u00e0i ki\u1ec3m tra.', 'error'); } finally { setIsSubmitting(false); }
  };

  const handleRemoveQuizAttachment = (attachmentId) => {
    if (quizEditorRef.current) {
      const safeId = window.CSS?.escape ? CSS.escape(attachmentId) : attachmentId.replace(/"/g, '\\"');
      const target = quizEditorRef.current.querySelector(`[data-quiz-attachment-id="${safeId}"]`);
      if (target) target.remove();
      handleQuizEditorInput();
    }
    setQuizAttachments(prev => prev.filter(item => item.id !== attachmentId));
  };

  const handleEditorImageClick = (e, owner = 'lesson') => { if (e.target.tagName === 'IMG') { setSelectedImage(e.target); setSelectedImageOwner(owner); const rect = e.target.getBoundingClientRect(); const containerRect = e.currentTarget.parentElement.getBoundingClientRect(); setImagePopupPos({ x: rect.left - containerRect.left + (rect.width / 2), y: rect.top - containerRect.top - 40 }); } else { setSelectedImage(null); } };

  const handleDeleteSelectedImage = async (e) => { e.preventDefault(); if (!selectedImage) return; const imgSrc = selectedImage.src; selectedImage.remove(); setSelectedImage(null); showNotification("?? x?a ?nh kh?i khung so?n th?o"); const driveIdMatch = imgSrc.match(/id=([^&]+)/); if (driveIdMatch && driveIdMatch[1]) { try { await postAppsScript({ action: 'rename', fileId: driveIdMatch[1] }); } catch (err) {} } selectedImageOwner === 'quiz' ? handleQuizEditorInput() : handleEditorInput(); };

  const extractQuizTextFromImage = async (compressedBase64) => {
    if (IS_LOCAL_PREVIEW) return 'Nội dung đề được OCR từ ảnh dán vào.';
    const base64Data = String(compressedBase64 || '').split(',')[1] || '';
    if (!base64Data) throw new Error('Không đọc được dữ liệu ảnh.');
    const promptText = `Hay OCR anh de kiem tra nay thanh van ban de giao vien co the sua truc tiep trong web.

YEU CAU:
- Chi trich xuat noi dung co trong anh, khong giai bai, khong them dap an neu anh khong co.
- Giu bo cuc cau hoi, dap an A/B/C/D, phan tu luan neu co.
- Neu co cong thuc Toan/KHTN, viet bang ky hieu de doc ngay trong khung soan: ∈, ∉, ≤, ≥, ≠, ℕ, { }, ×... Khong dung cac dau \\( \\), \\[ \\] neu khong bat buoc.
- Neu co bang, viet lai bang dang van ban ro rang.
- Tra ve van ban sach, khong viet loi chao, khong boc trong markdown code block.`;
    const payload = { contents: [{ parts: [{ text: promptText }, { inlineData: { mimeType: 'image/jpeg', data: base64Data } }] }] };
    const { data } = await generateWithGeminiFallback(payload);
    const text = extractAiText(data);
    if (!String(text || '').trim()) throw new Error(getAiEmptyReason(data));
    return String(text).trim();
  };

  const finishImageInsert = (targetType = 'lesson') => {
    if (targetType === 'quiz') handleQuizEditorInput();
    else if (targetType !== 'news') handleEditorInput();
  };

  const applyUploadedImageToEditor = ({ imgId, targetType, compressedBase64, res }) => {
    const targetContainer = targetType === 'news' ? newsContentRef.current : (targetType === 'quiz' ? quizEditorRef.current : contentEditableRef.current);
    const imgEl = targetContainer?.querySelector(`#${imgId}`);
    if (!imgEl) return;

    const remoteUrl = res?.fileId ? `https://drive.google.com/thumbnail?id=${res.fileId}&sz=w1000` : (res?.url || '');
    const keepVisibleLocalImage = () => {
      if (!imgEl.isConnected) return;
      imgEl.src = compressedBase64;
      imgEl.alt = 'Ảnh đã chèn';
      imgEl.style.opacity = '1';
      imgEl.style.filter = 'none';
      imgEl.removeAttribute('id');
      if (remoteUrl) imgEl.dataset.driveSrc = remoteUrl;
      if (res?.fileId) imgEl.dataset.driveFileId = res.fileId;
      finishImageInsert(targetType);
    };

    if (!remoteUrl) {
      keepVisibleLocalImage();
      return;
    }

    let settled = false;
    const applyRemoteImage = () => {
      if (settled || !imgEl.isConnected) return;
      settled = true;
      imgEl.src = remoteUrl;
      imgEl.alt = 'Ảnh đã chèn';
      imgEl.style.opacity = '1';
      imgEl.style.filter = 'none';
      imgEl.removeAttribute('id');
      if (res?.fileId) imgEl.dataset.driveFileId = res.fileId;
      finishImageInsert(targetType);
    };
    const fallbackToLocalImage = () => {
      if (settled) return;
      settled = true;
      keepVisibleLocalImage();
    };

    const probe = new window.Image();
    probe.onload = applyRemoteImage;
    probe.onerror = fallbackToLocalImage;
    probe.src = remoteUrl;
    window.setTimeout(fallbackToLocalImage, 2500);
  };

  const uploadAndInsertImage = async (file, range, target = 'lesson') => {
    const targetType = target === true ? 'news' : target;
    setIsPastingImage(true); const reader = new FileReader();
    reader.onload = async (ev) => {
      const imgId = "img_" + Date.now(); const base64Local = ev.target.result; const img = new window.Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas'); const MAX_W = 1000; let w = img.width; let h = img.height; if (w > MAX_W) { h *= MAX_W / w; w = MAX_W; } canvas.width = w; canvas.height = h; canvas.getContext('2d').drawImage(img, 0, 0, w, h); const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        const selection = window.getSelection(); selection.removeAllRanges(); if (range) { selection.addRange(range); }
        if (targetType === 'quiz') {
          const markerId = `ocr_${imgId}`;
          document.execCommand('insertHTML', false, `<div id="${markerId}" style="padding:12px 14px;border:1px dashed #34d399;border-radius:12px;background:#ecfdf5;color:#047857;font-weight:900;">Đang OCR ảnh đề...</div>`);
          try {
            const extractedText = await extractQuizTextFromImage(compressedBase64);
            const targetContainer = quizEditorRef.current;
            const marker = targetContainer?.querySelector(`#${markerId}`);
            if (marker) marker.outerHTML = textToPasteHtml(extractedText);
            else document.execCommand('insertHTML', false, textToPasteHtml(extractedText));
            handleQuizEditorInput();
            showNotification('Đã OCR ảnh và chèn thành văn bản có thể sửa.');
          } catch (ocrError) {
            const targetContainer = quizEditorRef.current;
            const marker = targetContainer?.querySelector(`#${markerId}`);
            if (marker) marker.outerHTML = `<div style="padding:12px 14px;border:1px dashed #f43f5e;border-radius:12px;background:#fff1f2;color:#be123c;font-weight:900;">Chưa OCR được ảnh: ${escapeHtml(ocrError.message || 'lỗi không xác định')}</div>`;
            showNotification('Chưa OCR được ảnh: ' + (ocrError.message || 'lỗi không xác định'), 'error');
          } finally {
            setIsPastingImage(false);
          }
          return;
        }
        document.execCommand('insertHTML', false, `<img id="${imgId}" src="${compressedBase64}" style="opacity: 0.5; filter: blur(2px); transition: all 0.3s; max-width: 100%; cursor: pointer;" alt="Đang tải ảnh lên hệ thống..." />`);
        try {
          const base64Data = compressedBase64.split(',')[1]; const prefix = targetType === 'news' ? '[TIN_TUC]' : (targetType === 'quiz' ? `[KIEMTRA_${currentSchoolYear}_K${selectedGrade}_${selectedSubject}_B${selectedLesson}]` : `[K${selectedGrade}_${selectedSubject}_B${selectedLesson}]`);
          const res = await postAppsScript({ filename: `${prefix}_ẢnhDán_${Date.now()}.jpg`, mimeType: 'image/jpeg', base64: base64Data, folderId: targetType === 'quiz' ? QUIZ_DRIVE_FOLDER_ID : IMAGE_DRIVE_FOLDER_ID });
          if (res.status === 'success') { applyUploadedImageToEditor({ imgId, targetType, compressedBase64, res }); showNotification("Đã tải và hiển thị ảnh thành công!"); } else { applyUploadedImageToEditor({ imgId, targetType, compressedBase64, res: null }); showNotification("Chưa tải ảnh lên Drive được, ảnh vẫn được giữ trong bài.", "error"); }
        } catch (err) { applyUploadedImageToEditor({ imgId, targetType, compressedBase64, res: null }); showNotification("Chưa tải ảnh lên Drive được, ảnh vẫn được giữ trong bài.", "error"); } finally { setIsPastingImage(false); }
      }; img.src = base64Local;
    }; reader.readAsDataURL(file);
  };

  const handlePaste = async (e) => { const items = e.clipboardData?.items; if (!items || !user) return; let hasImg = false; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { hasImg = true; break; } } if (hasImg) { e.preventDefault(); const selection = window.getSelection(); if (!selection.rangeCount) return; const range = selection.getRangeAt(0); for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { uploadAndInsertImage(items[i].getAsFile(), range, 'lesson'); } } } else if (!insertSmartPaste(e, 'lesson')) { handleEditorInput(); } };
  const handleQuizPaste = async (e) => { const items = e.clipboardData?.items; if (!items || !user) return; let hasImg = false; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { hasImg = true; break; } } if (hasImg) { e.preventDefault(); const selection = window.getSelection(); if (!selection.rangeCount) return; const range = selection.getRangeAt(0); for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { uploadAndInsertImage(items[i].getAsFile(), range, 'quiz'); } } } else if (!insertSmartPaste(e, 'quiz')) { handleQuizEditorInput(); } };
  const handleQuizAnswerPaste = async (e) => {
    if (insertSmartPaste(e, 'quiz')) handleQuizAnswerInput();
    else handleQuizAnswerInput();
  };
  const handlePasteToNews = async (e) => { const items = e.clipboardData?.items; if (!items || !user) return; let hasImg = false; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { hasImg = true; break; } } if (hasImg) { e.preventDefault(); const selection = window.getSelection(); if (!selection.rangeCount) return; const range = selection.getRangeAt(0); for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf('image') !== -1) { uploadAndInsertImage(items[i].getAsFile(), range, true); } } } };
  const handleToolbarImageUpload = (e) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; if (contentEditableRef.current) { contentEditableRef.current.focus(); } const selection = window.getSelection(); let range; if (selection.rangeCount > 0) { range = selection.getRangeAt(0); } else if (contentEditableRef.current) { range = document.createRange(); range.selectNodeContents(contentEditableRef.current); range.collapse(false); } uploadAndInsertImage(file, range, 'lesson'); e.target.value = null; } };
  const handleQuizImageUpload = (e) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; if (quizEditorRef.current) { quizEditorRef.current.focus(); } const selection = window.getSelection(); let range; if (selection.rangeCount > 0) { range = selection.getRangeAt(0); } else if (quizEditorRef.current) { range = document.createRange(); range.selectNodeContents(quizEditorRef.current); range.collapse(false); } uploadAndInsertImage(file, range, 'quiz'); e.target.value = null; } };
  const handleNewsImageUpload = (e) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; if (newsContentRef.current) { newsContentRef.current.focus(); } const selection = window.getSelection(); let range; if (selection.rangeCount > 0) { range = selection.getRangeAt(0); } else if (newsContentRef.current) { range = document.createRange(); range.selectNodeContents(newsContentRef.current); range.collapse(false); } uploadAndInsertImage(file, range, true); e.target.value = null; } };
  const handleLessonFileChange = (lessonNum, files) => { if (!files || files.length === 0) return; setLessonFilesMap(prev => ({ ...prev, [lessonNum]: Array.from(files) })); };
  const removeFileFromLesson = (lessonNum, fileIndex) => { setLessonFilesMap(prev => { const newFiles = [...prev[lessonNum]]; newFiles.splice(fileIndex, 1); if (newFiles.length === 0) { const { [lessonNum]: _, ...rest } = prev; return rest; } return { ...prev, [lessonNum]: newFiles }; }); };

  const handleGlobalUpload = async (e) => {
    e.preventDefault(); if (!user) return;
    if (uploadTab === 'manual') {
      if (manualFiles.length === 0) { showNotification("Vui lòng chọn ít nhất 1 file!", "error"); return; } setIsSubmitting(true); setUploadProgress({ current: 0, total: manualFiles.length });
      for (let i = 0; i < manualFiles.length; i++) {
        const file = manualFiles[i]; setUploadProgress(prev => ({ ...prev, current: i + 1 })); if (file.size > 30 * 1024 * 1024) continue;
        try { const base64Data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file); }); const payload = { filename: `[K${selectedGrade}_${selectedSubject}]_${file.name}`, mimeType: file.type, base64: base64Data, folderId: MASTER_DRIVE_FOLDER_ID }; await postAppsScript(payload); } catch (err) {}
      } setIsSubmitting(false); setManualFiles([]); setShowBulkUpload(false); fetchDriveData(); showNotification("Đã up toàn bộ file lên Kho Chung Drive thành công!");
    } else if (uploadTab === 'bylesson') {
      let tasks = []; Object.keys(lessonFilesMap).forEach(lesson => { lessonFilesMap[lesson].forEach(file => tasks.push({ lesson: String(lesson), file })); });
      if (tasks.length === 0) { showNotification("Vui lòng chọn file cho ít nhất 1 tuần!", "error"); return; } setIsSubmitting(true); setUploadProgress({ current: 0, total: tasks.length });
      for (let i = 0; i < tasks.length; i++) {
        const { lesson, file } = tasks[i]; setUploadProgress(prev => ({ ...prev, current: i + 1 })); if (file.size > 30 * 1024 * 1024) continue;
        try {
          const base64Data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
          const res = await postAppsScript({ filename: `[K${selectedGrade}_${selectedSubject}_B${lesson}]_${file.name}`, mimeType: file.type, base64: base64Data, folderId: MASTER_DRIVE_FOLDER_ID });
          if (res.status === 'success') { let fType = 'link'; const mime = file.type.toLowerCase(); if (mime.includes('pdf')) fType = 'pdf'; else if (mime.includes('presentation') || file.name.includes('.ppt')) fType = 'ppt'; else if (mime.includes('image')) fType = 'image'; const savedTitle = (res.filename || file.name).replace(/\[.*?\]_/, '').replace(/\.[^/.]+$/, ""); await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'materials'), { grade: String(selectedGrade), subject: String(selectedSubject), lesson: String(lesson), title: savedTitle, url: res.url, driveFileId: res.fileId, type: fType, createdAt: Date.now(), authorId: user.uid }); }
        } catch (err) {}
      } setIsSubmitting(false); setLessonFilesMap({}); setShowBulkUpload(false); fetchDriveData(); showNotification("Đã up và TỰ ĐỘNG GHIM tất cả file thành công!");
    } else if (uploadTab === 'link') {
      if (!linkData.url) { showNotification("Vui lòng nhập đường dẫn link!", "error"); return; } setIsSubmitting(true);
      try { const linkTitle = linkData.title.trim() || getDefaultLinkTitle(linkData.url); await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'materials'), { grade: String(selectedGrade), subject: String(selectedSubject), lesson: String(linkData.lesson), title: linkTitle, url: linkData.url, type: linkData.type, createdAt: Date.now(), authorId: user.uid }); showNotification(`Đã ghim link thành công vào Tuần ${linkData.lesson}!`); setLinkData({ title: '', url: '', lesson: linkData.lesson, type: 'pdf' }); setShowBulkUpload(false); } catch (e) {} finally { setIsSubmitting(false); }
    }
  };

  const handleInlineLinkSubmit = async (e) => {
    e.preventDefault(); if (!user || !selectedGrade || !selectedSubject || !selectedLesson) return; if (!inlineLinkData.url) { showNotification("Vui lòng nhập đường dẫn link!", "error"); return; } setIsSubmitting(true);
    try { const linkTitle = inlineLinkData.title.trim() || getDefaultLinkTitle(inlineLinkData.url); await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'materials'), { grade: String(selectedGrade), subject: String(selectedSubject), lesson: String(selectedLesson), title: linkTitle, url: inlineLinkData.url, type: inlineLinkData.type, createdAt: Date.now(), authorId: user.uid }); setInlineLinkData({ title: '', url: '', type: 'link' }); setShowInlineLink(false); showNotification(`Đã thêm link vào bài!`); } catch (err) { showNotification("Lỗi thêm link", "error"); } finally { setIsSubmitting(false); }
  };

  const sortedDriveFiles = useMemo(() => {
    return [...driveFiles].sort((a, b) => {
      if (driveSort.key === 'name') { const direction = driveSort.direction === 'asc' ? 1 : -1; return getDriveDisplayName(a.name).localeCompare(getDriveDisplayName(b.name), 'vi', { numeric: true, sensitivity: 'base' }) * direction; } else if (driveSort.key === 'pinned') { const aLessons = getPinnedLessonsForDriveFile(a); const bLessons = getPinnedLessonsForDriveFile(b); const aPinned = aLessons.length > 0 ? 1 : 0; const bPinned = bLessons.length > 0 ? 1 : 0; if (aPinned !== bPinned) { return driveSort.direction === 'desc' ? bPinned - aPinned : aPinned - bPinned; } if (aPinned === 1 && bPinned === 1) { const minA = Math.min(...aLessons.map(l => parseInt(l.replace(/[^0-9]/g, '')) || Infinity)); const minB = Math.min(...bLessons.map(l => parseInt(l.replace(/[^0-9]/g, '')) || Infinity)); if (minA !== minB) { return minA - minB; } } return getDriveDisplayName(a.name).localeCompare(getDriveDisplayName(b.name), 'vi', { numeric: true, sensitivity: 'base' }); } return 0;
    });
  }, [driveFiles, driveSort, getPinnedLessonsForDriveFile]);

  const isFormulaSubject = useCallback(() => { const normalized = removeAccents(selectedSubject || ''); return normalized.includes('toan') || normalized.includes('khoa hoc tu nhien') || normalized.includes('khtn'); }, [selectedSubject]);
  const getFormulaFormatInstruction = useCallback(() => { if (!isFormulaSubject()) return ''; return `\n\nYEU CAU RIENG CHO TOAN/KHTN CO CONG THUC:\n- Chi tao MOT BAN DUY NHAT de dan vao web cho hoc sinh xem, tuyet doi khong chia thanh PHAN 1/PHAN 2.\n- Khong viet cac tieu de: PHAN 1 - BAN GIAO VIEN DE HINH DUNG, PHAN 2 - BAN DAN VAO WEB CHO HOC SINH.\n- Cong thuc phai trinh bay bang LaTeX de web hien thi dep: cong thuc trong dong dat trong \\( ... \\), cong thuc rieng dong dat trong \\[ ... \\].\n- Van tao day du dap an/goi y cham o cuoi de, nhung phai boc toan bo dap an trong <div class=\"teacher-only\">...</div> de hoc sinh khong thay.`; }, [isFormulaSubject]);

  const extractAiText = (data) => {
    if (!data) return '';
    if (typeof data === 'string') return data;
    const candidates = data.candidates || data.result?.candidates || data.data?.candidates || data.response?.candidates;
    const candidateText = candidates?.flatMap(c => c?.content?.parts || []).map(p => p.text || '').filter(Boolean).join('\n');
    return candidateText || data.text || data.output || data.outputText || data.responseText || data.answer || data.message || data.content || data.result?.text || data.result?.output || data.result?.outputText || data.data?.text || data.data?.output || data.response?.text || data.response?.output || (typeof data.result === 'string' ? data.result : '') || '';
  };

  const getAiEmptyReason = (data) => {
    const candidate = data?.candidates?.[0] || data?.result?.candidates?.[0] || data?.data?.candidates?.[0] || data?.response?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const blockReason = data?.promptFeedback?.blockReason || data?.result?.promptFeedback?.blockReason || data?.data?.promptFeedback?.blockReason;
    if (blockReason) return `AI chặn yêu cầu: ${blockReason}`;
    if (finishReason) return `AI dừng nhưng chưa trả nội dung: ${finishReason}`;
    return 'AI không trả về nội dung văn bản.';
  };

  const generateWithGeminiFallback = async (payload) => {
    try {
      const data = await postAppsScript({
        action: 'gemini',
        modelId: selectedGeminiModel,
        contents: payload.contents,
        systemInstruction: payload.systemInstruction,
        generationConfig: payload.generationConfig
      });
      if (!extractAiText(data)) throw new Error(getAiEmptyReason(data));
      return { data, modelId: data.model || selectedGeminiModel, source: 'apps-script' };
    } catch (error) {
      throw new Error(normalizeServiceErrorMessage(error?.message || error));
    }
  };

  const handleGenerateAI = async () => {
    setIsAiLoading(true); setAiError(''); setAiResponse('');
    if (IS_LOCAL_PREVIEW) { const sample = 'BAI KIEM TRA NHANH\n\nCau 1. Day la noi dung mau...\n<div class="teacher-only">Dap an mau: Cau 1: A.</div>'; setAiResponse(sample); setAiPrompt(sample); setIsAiLoading(false); return; }
    const htmlContent = contentEditableRef.current ? contentEditableRef.current.innerHTML : '';
    const imgRegex = /<img[^>]+src="data:(image\/[^;]+);base64,([^"]+)"[^>]*>/g; let match; const imageParts = [];
    while ((match = imgRegex.exec(htmlContent)) !== null) { imageParts.push({ inlineData: { mimeType: match[1], data: match[2] } }); }
    const formulaInstruction = getFormulaFormatInstruction();
    const sys = `Ban la AI ra de giao duc Viet Nam chuyen nghiep. NGUYEN TAC BAT BUOC:\n1. Tuyet doi khong co cau chao hoi.\n2. Chi tao MOT BAN DE DUY NHAT de dan vao web, khong tao ban giao vien rieng va ban hoc sinh rieng.\n3. Khong viet cac tieu de PHAN 1, PHAN 2, BAN GIAO VIEN, BAN DAN VAO WEB.\n4. Luon tao dap an/goi y cham va BIEU DIEM ro tung cau, tung y o cuoi de; boc toan bo phan nay trong <div class="teacher-only">...</div> de hoc sinh khong thay.\n5. Tong diem la 10. Toan trac nghiem: chia deu 10 diem cho so cau. Vua trac nghiem vua tu luan: trac nghiem 5 diem chia deu, tu luan 5 diem chia deu theo cau/y. Toan tu luan: tu chia 10 diem theo cau/y.\n6. Neu la Toan/KHTN, cong thuc phai dung LaTeX de hien thi dep tren web.${formulaInstruction}`;
    let promptText = `Mon ${selectedSubject} lop ${selectedGrade}. Noi dung nguon:\n${aiContextContent || 'Chuan kien thuc'}\n\nYeu cau cua giao vien:\n${aiPrompt}`;
    if (imageParts.length > 0) promptText += '\n\nVui long doc hieu cac hinh anh duoc dinh kem de trich xuat noi dung.';
    const payload = { contents: [{ parts: [{ text: promptText }, ...imageParts] }], systemInstruction: { parts: [{ text: sys }] } };
    try {
      const { data } = await generateWithGeminiFallback(payload);
      const txt = extractAiText(data);
      if (txt && String(txt).trim()) { setAiResponse(String(txt)); setAiPrompt(String(txt)); } else setAiError('L\u1ed7i: ' + getAiEmptyReason(data));
    } catch (e) { setAiError('L\u1ed7i k\u1ebft n\u1ed1i: ' + e.message); } finally { setIsAiLoading(false); }
  };

  const formatAiText = (text) => { return String(text || '').replace(/\r\n/g, '\n').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>'); };

  const appendAiToEditor = async () => {
    if (!contentEditableRef.current || !aiResponse) return;
    contentEditableRef.current.innerHTML += `<div style="margin-top:20px;padding:15px;background:#f8fafc;border-left:4px solid #3b82f6;border-radius:12px;"><h4 class="ai-suggestion-title" style="color:#1e40af;margin-bottom:10px;">✨ GỢI Ý TỪ TRỢ LÝ AI</h4>${formatAiText(aiResponse)}</div><p><br/></p>`; setShowAiModal(false); setAiResponse('');
    if (noteId && user) { setIsSavingNote(true); try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lesson_notes', noteId), { content: contentEditableRef.current.innerHTML, updatedAt: Date.now(), authorId: user.uid, grade: String(selectedGrade), subject: String(selectedSubject), lesson: String(selectedLesson) }); showNotification("Đã chèn nội dung AI và TỰ ĐỘNG LƯU thành công!"); } catch (e) { showNotification("Lỗi lưu tự động!", "error"); } finally { setIsSavingNote(false); } }
  };

  const appendAiToQuiz = () => {
    const content = aiResponse ? formatAiText(aiResponse) : `<p>${aiPrompt.replace(/\n/g, '<br/>')}</p>`;
    const parts = splitQuizContent(content);
    setShowQuizEditor(true);
    setQuizTeacherTab('compose');
    setShowAiModal(false);
    setTimeout(async () => {
      if (quizEditorRef.current) {
        const nextQuestion = `${quizEditorRef.current.innerHTML.trim() ? `${quizEditorRef.current.innerHTML}<p><br/></p>` : ''}${parts.question}<p><br/></p>`;
        const nextAnswer = `${quizAnswerEditorRef.current?.innerHTML?.trim() ? `${quizAnswerEditorRef.current.innerHTML}<p><br/></p>` : ''}${parts.answer}`;
        quizEditorRef.current.innerHTML = nextQuestion;
        if (quizAnswerEditorRef.current) quizAnswerEditorRef.current.innerHTML = nextAnswer;
        const savedContent = composeQuizContent(nextQuestion, nextAnswer);
        setQuizQuestionHtml(nextQuestion);
        setQuizAnswerHtml(nextAnswer);
        setQuizHtml(savedContent);
        if (quizId && user) {
          await persistQuiz(savedContent, quizPublishNow, quizPublishAt);
        }
      }
    }, 0);
    showNotification('Đã chuyển vào bài kiểm tra và tự lưu.');
  };

  const handleGenerateQuizAnswer = async ({ silent = false } = {}) => {
    const questionHtml = quizEditorRef.current?.innerHTML ?? quizQuestionHtml;
    const answerHtml = quizAnswerEditorRef.current?.innerHTML ?? quizAnswerHtml;
    if (!String(stripHtmlToText(questionHtml) || '').trim()) {
      if (!silent) showNotification('Chưa có nội dung đề để tạo đáp án.', 'error');
      return null;
    }
    setIsGeneratingQuizAnswer(true);
    try {
      const promptText = buildQuizAnswerPrompt(questionHtml, answerHtml);
      if (IS_LOCAL_PREVIEW) {
        const sample = 'DAP AN - BIEU DIEM<br/>Cau 1: A - 1 diem.<br/>Tong diem: 10 diem.';
        if (quizAnswerEditorRef.current) quizAnswerEditorRef.current.innerHTML = sample;
        setQuizAnswerHtml(sample);
        return composeQuizContent(questionHtml, sample);
      }
      const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        systemInstruction: { parts: [{ text: 'Ban la AI giao duc Viet Nam chuyen tao dap an va bieu diem cham bai. Chi tra ve dap an va bieu diem, khong chao hoi.' }] }
      };
      const { data } = await generateWithGeminiFallback(payload);
      const txt = extractAiText(data);
      if (!txt || !String(txt).trim()) throw new Error(getAiEmptyReason(data));
      const answerContent = formatAiText(txt);
      if (quizAnswerEditorRef.current) quizAnswerEditorRef.current.innerHTML = answerContent;
      setQuizAnswerHtml(answerContent);
      const nextContent = composeQuizContent(questionHtml, answerContent);
      setQuizHtml(nextContent);
      if (!silent) showNotification('AI đã tạo đáp án và biểu điểm.');
      return nextContent;
    } catch (error) {
      if (!silent) showNotification('AI chưa tạo được đáp án: ' + (error?.message || String(error)), 'error');
      return null;
    } finally {
      setIsGeneratingQuizAnswer(false);
    }
  };

  const handleOpenAiModal = () => {
    if (!contentEditableRef.current) return; const text = contentEditableRef.current.innerText || ''; const html = contentEditableRef.current.innerHTML || ''; const imgCount = (html.match(/<img/g) || []).length;
    let contextText = text; if (imgCount > 0 && contextText.trim() === '') { contextText = `[Hệ thống đã nhận diện ${imgCount} hình ảnh. Thầy cô có thể dán/gõ thêm nội dung văn bản vào đây nếu muốn...]`; }
    setAiContextContent(contextText); setAiSelectedLessons([Number(selectedLesson || 1)]); setAiToolTab('quick'); setShowAiLessonPicker(false); setShowAiModal(true); setAiResponse('');
  };

  const handleAiPromptTemplateSelect = (templateText) => {
    if (!templateText) return;
    const sourceText = aiToolTab === 'pro'
      ? 'Nguồn đính kèm: hãy dùng toàn bộ nội dung bài giảng và các link/tài liệu đính kèm đã chọn. Nếu tài liệu là link, hãy yêu cầu AI đọc/người dùng dán nội dung từ link khi cần.'
      : 'Nguồn bài giảng: chỉ dùng nội dung bài giảng đang có trong khung, không dùng tài liệu đính kèm.';
    const professionalPrompt = `${sourceText}

Vai trò: Bạn là giáo viên ra đề có kinh nghiệm, bám sát chương trình THCS.

Nhiệm vụ:
${templateText}

Yêu cầu chất lượng:
- Câu hỏi phải đúng trọng tâm bài học, không hỏi lan man ngoài dữ liệu.
- Có đủ mức độ: nhận biết, thông hiểu, vận dụng; nếu phù hợp thêm 1 câu vận dụng cao.
- Diễn đạt rõ ràng, phù hợp học sinh lớp ${selectedGrade}, tránh mơ hồ.
- Không chào hỏi, không giải thích dài dòng.
- Luôn kèm đáp án, gợi ý chấm và biểu điểm rõ từng câu/từng ý ở cuối bài, đặt trong phần riêng cho giáo viên.
- Với Toán/KHTN, công thức cần trình bày dễ đọc và có bản LaTeX khi cần.

Đầu ra mong muốn:
- Tiêu đề đề kiểm tra/ngân hàng câu hỏi.
- Danh sách câu hỏi được đánh số rõ.
- Nếu có trắc nghiệm: mỗi câu có 4 phương án A, B, C, D.
- Nếu có tự luận: ghi yêu cầu chấm, đáp án/gợi ý và thang điểm từng ý.

QUY TAC BAT BUOC:
- Chi tao MOT BAN DUY NHAT, khong ghi PHAN 1/PHAN 2, khong ghi BAN GIAO VIEN/BAN DAN VAO WEB.
- Luon co dap an/goi y cham va bieu diem ro tung cau, tung y o cuoi bai; boc toan bo phan nay trong <div class="teacher-only">...</div> de hoc sinh khong thay.
- Tong diem 10: toan trac nghiem chia deu 10 diem; vua trac nghiem vua tu luan thi trac nghiem 5 diem chia deu va tu luan 5 diem chia theo cau/y; toan tu luan thi tu chia 10 diem theo cau/y.
- Voi Toan/KHTN, cong thuc dung LaTeX \( ... \) hoac \[ ... \].

Giáo viên có thể sửa prompt này trước khi bấm tạo câu hỏi.`;
    setAiPrompt(professionalPrompt);
  };

  const handleCreateSelfQuizDraft = ({ forceOpen = false } = {}) => {
    if (showSelfQuizBuilder && !forceOpen) {
      setShowSelfQuizBuilder(false);
      return;
    }
    if (showSelfQuizBuilder && forceOpen) return;
    const hasExistingDraft = (selfQuizDraft?.questions || []).some(q => q.text?.trim() || (q.options || []).some(opt => opt.text?.trim()));
    if (hasExistingDraft) {
      setShowSelfQuizBuilder(true);
      return;
    }
    const editorHtml = getCurrentQuizContent();
    const editorText = quizEditorRef.current?.innerText || '';
    const source = editorText.trim() ? editorHtml : (quizHtml || editorHtml || '');
    if (!String(source || '').trim()) {
      setSelfQuizDraft(prev => {
        const hasQuestions = (prev?.questions || []).length > 0;
        return hasQuestions ? prev : { ...prev, questions: [makeEmptySelfQuizQuestion()] };
      });
      setShowSelfQuizBuilder(true);
      showNotification('Chưa có nội dung bài kiểm tra để tạo đề tự chấm.', 'error');
      return;
    }
    const parsed = parseSelfQuizFromHtml(source);
    if (!parsed.questions.length) {
      parsed.questions = [makeEmptySelfQuizQuestion()];
      showNotification('Chưa tách được câu trắc nghiệm từ ô soạn. Thầy cô kiểm tra lại định dạng Câu 1, A/B/C/D và phần đáp án.', 'error');
    } else {
      showNotification(`Đã tách được ${parsed.questions.length} câu. Thầy cô kiểm tra đáp án rồi bấm lưu.`);
    }
    setSelfQuizDraft(parsed);
    setShowSelfQuizBuilder(true);
  };
  const updateSelfQuizQuestion = (questionId, patch) => {
    setSelfQuizDraft(prev => ({ ...prev, questions: prev.questions.map(q => q.id === questionId ? { ...q, ...patch } : q) }));
  };
  const updateSelfQuizOption = (questionId, optionId, text) => {
    setSelfQuizDraft(prev => ({ ...prev, questions: prev.questions.map(q => q.id === questionId ? { ...q, options: q.options.map(opt => opt.id === optionId ? { ...opt, text } : opt) } : q) }));
  };
  const addSelfQuizQuestion = () => {
    setSelfQuizDraft(prev => ({ ...prev, questions: [...prev.questions, makeEmptySelfQuizQuestion()] }));
  };
  const removeSelfQuizQuestion = (questionId) => {
    setSelfQuizDraft(prev => ({ ...prev, questions: prev.questions.filter(q => q.id !== questionId) }));
  };
  const handleSaveSelfQuiz = async () => {
    if (!quizId || !user) {
      const message = 'Chưa thể lưu đề tự chấm. Thầy cô kiểm tra lại đăng nhập, khối, môn và tuần.';
      showNotification(message, 'error');
      return { ok: false, message };
    }
    const normalized = normalizeSelfQuizDraft(selfQuizDraft);
    if (!normalized.questions.length) {
      const message = 'Đề tự chấm cần ít nhất 1 câu hỏi hợp lệ.';
      showNotification(message, 'error');
      return { ok: false, message };
    }
    if (normalized.questions.some(q => !q.correctOptionId || !q.options.find(opt => opt.id === q.correctOptionId)?.text)) {
      const missing = normalized.questions
        .map((q, index) => ({ q, index }))
        .filter(({ q }) => !q.correctOptionId || !q.options.find(opt => opt.id === q.correctOptionId)?.text)
        .map(({ index }) => index + 1)
        .join(', ');
      const message = `Câu ${missing} chưa chọn đáp án đúng A/B/C/D.`;
      showNotification(message, 'error');
      return { ok: false, message };
    }
    try {
      const savedContent = getCurrentQuizContent();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'lesson_quizzes', quizId), {
      content: savedContent,
      quizData: normalized,
      updatedAt: Date.now(),
      authorId: user.uid,
      schoolYear: currentSchoolYear,
      grade: String(selectedGrade),
      subject: String(selectedSubject),
      lesson: String(selectedLesson)
    }, { merge: true });
      setQuizHtml(savedContent);
      setQuizData(normalized);
      setSelfQuizDraft(normalized);
      const message = 'Đã lưu đề trắc nghiệm tự chấm.';
      showNotification(message);
      return { ok: true, message };
    } catch (error) {
      console.error('Save self quiz failed:', error);
      const message = `Chưa lưu được đề tự chấm: ${error?.message || 'lỗi không xác định'}`;
      showNotification(message, 'error');
      return { ok: false, message };
    }
  };

  const getLessonOfficialText = useCallback((lesson) => {
    if (String(lesson) === String(selectedLesson) && contentEditableRef.current) { return (contentEditableRef.current.innerText || '').trim(); }
    const found = allNotes.find(n => String(n.grade) === String(selectedGrade) && String(n.subject) === String(selectedSubject) && String(n.lesson) === String(lesson)); return stripHtmlToText(found?.content || '');
  }, [selectedLesson, selectedGrade, selectedSubject, allNotes]);

  const buildGeminiProPrompt = useCallback(() => {
    const lessons = (aiSelectedLessons.length ? aiSelectedLessons : [Number(selectedLesson || 1)]).map(Number).filter(Boolean).sort((a, b) => a - b);
    const lessonBlocks = lessons.map(lesson => {
      const officialText = getLessonOfficialText(lesson) || '(Chưa có nội dung bài giảng chính thức.)';
      const materials = allMaterials.filter(m => String(m.grade) === String(selectedGrade) && String(m.subject) === String(selectedSubject) && String(m.lesson) === String(lesson)).map((m, idx) => `${idx + 1}. ${m.title}\nLink: ${m.url || ''}`).join('\n\n') || '(Không có tài liệu đính kèm.)';
      return `BÀI ${lesson}\n\nNỘI DUNG BÀI GIẢNG:\n${officialText}\n\nTÀI LIỆU ĐÍNH KÈM:\n${materials}`;
    }).join('\n\n==============================\n\n');
    return `Ban la giao vien chuyen mon. Hay tao cau hoi dua tren noi dung sau:

Mon: ${selectedSubject}
Lop: ${selectedGrade}

Yeu cau:
${aiPrompt}

NGUYEN TAC:
- Khong chao hoi.
- Chi tao mot ban duy nhat, khong chia Phan 1/Phan 2.
- Dap an/goi y cham va bieu diem ro tung cau, tung y dat cuoi bai va boc trong <div class="teacher-only">...</div> de hoc sinh khong thay.
- Tong diem 10: toan trac nghiem chia deu 10 diem; vua trac nghiem vua tu luan thi trac nghiem 5 diem chia deu va tu luan 5 diem chia theo cau/y; toan tu luan thi tu chia 10 diem theo cau/y.${getFormulaFormatInstruction()}

DU LIEU BAI HOC:
${lessonBlocks}`;
  }, [aiSelectedLessons, selectedLesson, selectedGrade, selectedSubject, allMaterials, aiPrompt, getFormulaFormatInstruction, getLessonOfficialText]);

  const buildAiLessonSourceText = useCallback(() => {
    const lessons = (aiSelectedLessons.length ? aiSelectedLessons : [Number(selectedLesson || 1)]).map(Number).filter(Boolean).sort((a, b) => a - b);
    return lessons.map(lesson => `BAI ${lesson}\n${getLessonOfficialText(lesson) || '(Chua co noi dung bai giang.)'}`).join('\n\n------------------------------\n\n');
  }, [aiSelectedLessons, selectedLesson, getLessonOfficialText]);

  const copyTextSafely = async (text) => {
    const textarea = document.createElement('textarea'); textarea.value = text; textarea.setAttribute('readonly', ''); textarea.style.position = 'fixed'; textarea.style.left = '-9999px'; textarea.style.top = '0'; document.body.appendChild(textarea); textarea.focus(); textarea.select(); textarea.setSelectionRange(0, text.length); let copied = false; try { copied = document.execCommand('copy'); } catch (e) { copied = false; } document.body.removeChild(textarea); if (copied) return true; if (navigator.clipboard && window.isSecureContext) { try { await navigator.clipboard.writeText(text); return true; } catch (e) {} } return false;
  };

  useEffect(() => { if (showAiModal && aiToolTab === 'pro') setAiContextContent(buildGeminiProPrompt()); }, [showAiModal, aiToolTab, buildGeminiProPrompt]);
  useEffect(() => { if (showAiModal && aiToolTab === 'quick' && showAiLessonPicker) setAiContextContent(buildAiLessonSourceText()); }, [showAiModal, aiToolTab, showAiLessonPicker, buildAiLessonSourceText]);

  const copyPromptAndOpen = async (targetName, targetUrl) => {
    const prompt = aiToolTab === 'pro' && aiContextContent.trim() ? aiContextContent : buildGeminiProPrompt(); setAiContextContent(prompt);
    const copied = await copyTextSafely(prompt);
    if (copied) { window.alert(`✨ ĐÃ SAO CHÉP PROMPT THÀNH CÔNG!\n\nHệ thống sẽ mở ${targetName}. Nhấn [Ctrl + V] vào khung chat để AI ra đề.`); window.open(targetUrl, '_blank', 'noopener,noreferrer'); } else { window.alert(`⚠️ TRÌNH DUYỆT CHẶN COPY TỰ ĐỘNG\n\nVui lòng bôi đen đoạn chữ và copy thủ công.`); window.open(targetUrl, '_blank', 'noopener,noreferrer'); }
  };

  const handleOpenChatGptPrompt = () => copyPromptAndOpen('ChatGPT', 'https://chatgpt.com/');
  const handleCopyGeminiProPrompt = () => copyPromptAndOpen('Gemini', 'https://gemini.google.com/app');

  const buildEssayPointGuide = (essayText = '') => {
    const lines = normalizeQuizText(essayText).split('\n').map(line => line.trim()).filter(Boolean);
    const sections = [];
    let current = null;
    const readPoint = (line = '') => {
      const folded = removeAccents(String(line || '').toLowerCase());
      const match = folded.match(/(\d+(?:[,.]\d+)?)\s*diem/);
      const value = match ? Number(String(match[1]).replace(',', '.')) : 0;
      return Number.isFinite(value) ? value : 0;
    };
    const readSection = (line = '') => {
      const folded = removeAccents(String(line || '').toLowerCase());
      const match = folded.match(/^(?:bai|cau)\s*(\d{1,2})\b/);
      const points = readPoint(line);
      if (!match || points <= 0) return null;
      return { label: `Bai ${Number(match[1])}`, points, parts: [] };
    };
    const commit = () => {
      if (!current) return;
      const partCount = current.parts.length || 1;
      const pointPerPart = Math.round((current.points / partCount) * 100) / 100;
      sections.push({
        ...current,
        pointPerPart,
        partCount
      });
    };
    lines.forEach(line => {
      const section = readSection(line);
      if (section) {
        commit();
        current = section;
        return;
      }
      if (current && /^[a-z]\)/i.test(removeAccents(line))) current.parts.push(line);
    });
    commit();
    if (!sections.length) return 'Chua tach duoc thang diem tu dong. Neu thay de co "Bai 1 (3 diem)" thi chia diem theo so y a/b/c trong bai do.';
    return sections.map(section => {
      const parts = section.parts.length
        ? section.parts.map((part, index) => `${String.fromCharCode(97 + index)}) ${section.pointPerPart} diem`).join('; ')
        : `ca bai ${section.points} diem`;
      return `${section.label}: ${section.points} diem, ${section.partCount} y => ${parts}.`;
    }).join('\n');
  };

  const formatVietnamPointScore = (value) => {
    const rounded = Math.round((Number(value) || 0) * 100) / 100;
    const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, '');
    return text;
  };

  const getSelfQuizCorrectCount = (result = null) => {
    const answers = Array.isArray(result?.answers) ? result.answers : [];
    if (answers.length) return answers.filter(answer => answer.isCorrect).length;
    return Number(result?.score || 0);
  };

  const getSelfQuizQuestionCount = (result = null) => {
    const answers = Array.isArray(result?.answers) ? result.answers : [];
    return answers.length || Number(result?.total || 0) || 0;
  };

  const getSelfQuizScorePoint = (result = null) => getSelfQuizCorrectCount(result) * 0.25;

  const buildHandwrittenGradingPrompt = (submission = {}, selfQuizResult = null) => [
    `ĐÂY LÀ TÁC VỤ CHẤM BÀI HỌC SINH, KHÔNG PHẢI TÁC VỤ TẠO ĐỀ. KHÔNG TẠO ĐỀ MỚI.`,
    `Hãy chấm bài viết tay của học sinh theo ĐÁP ÁN VÀ THANG ĐIỂM CÓ SẴN của giáo viên.`,
    `Ngữ cảnh: Năm học ${submission.schoolYear || currentSchoolYear}, Khối ${submission.grade || selectedGrade}, môn ${submission.subject || selectedSubject}, bài/tuần ${submission.lesson || selectedLesson}.`,
    `Họ tên học sinh: ${submission.studentName || 'không rõ'}.`,
    selfQuizResult
      ? `TRẮC NGHIỆM ĐÃ LƯU: điểm trắc nghiệm của học sinh là ${formatVietnamPointScore(getSelfQuizScorePoint(selfQuizResult))}/4 điểm. Học sinh đúng ${getSelfQuizCorrectCount(selfQuizResult)}/${getSelfQuizQuestionCount(selfQuizResult)} câu, nhưng khi thống kê điểm phải ghi theo dạng điểm ${formatVietnamPointScore(getSelfQuizScorePoint(selfQuizResult))}/4, không được ghi ${getSelfQuizCorrectCount(selfQuizResult)}/${getSelfQuizQuestionCount(selfQuizResult)} như điểm. Phần này học sinh ĐÃ LÀM trên web, không được báo là chưa làm trắc nghiệm.`
      : `CHƯA TÌM THẤY ĐIỂM TRẮC NGHIỆM LƯU TRÊN WEB cho học sinh này. Nếu bài có phần trắc nghiệm trên web, hãy ghi cần giáo viên kiểm tra lại, không tự kết luận học sinh chưa làm.`,
    `Nội dung đề, đáp án và thang điểm của giáo viên:`,
    stripHtmlToText(quizHtml || '').slice(0, 6000) || '(Không có nội dung đề trong hệ thống.)',
    `THANG ĐIỂM TỰ LUẬN TỰ ĐỘNG RÚT RA TỪ ĐỀ:`,
    buildEssayPointGuide(studentEssayText),
    `NGUYÊN TẮC CHẤM BẮT BUỘC:`,
    `1. Phải tìm phần đáp án/gợi ý chấm/thang điểm trong nội dung giáo viên đã soạn. Đây là chuẩn để chấm.`,
    `2. Không tự tạo đáp án mới nếu đề đã có đáp án.`,
    `3. Nếu không thấy đáp án/thang điểm rõ ràng, hãy ghi "Cần giáo viên chấm lại: chưa thấy đáp án/thang điểm" và không tự cho điểm.`,
    `4. Nếu học sinh làm cách khác nhưng đúng ý theo đáp án/thang điểm, có thể cho điểm phù hợp và ghi rõ lý do.`,
    `5. Nếu chữ viết/ảnh mờ không đọc được, ghi rõ cần giáo viên xem lại.`,
    `6. Nếu đã có điểm trắc nghiệm đã lưu, chỉ chấm phần tự luận/viết tay trong file, sau đó cộng với điểm trắc nghiệm quy đổi để ra điểm tổng.`,
    `7. Khi đề ghi "Bài/Câu X (n điểm)" và có các ý a), b), c), hãy chia đều n điểm cho các ý trong bài/câu đó. Ví dụ Bài 1 (3 điểm) có 3 ý thì mỗi ý 1 điểm; Bài 2 (3 điểm) có 2 ý thì mỗi ý 1,5 điểm.`,
    `Yêu cầu trả lời bằng tiếng Việt có dấu, ngắn gọn, để giáo viên duyệt lại.`,
    `Định dạng bắt buộc:`,
    selfQuizResult
      ? `Điểm trắc nghiệm đã có: ${formatVietnamPointScore(getSelfQuizScorePoint(selfQuizResult))}/4`
      : `Điểm trắc nghiệm đã có: chưa tìm thấy`,
    `Điểm tự luận/viết tay đề xuất: x/y`,
    `Điểm tổng đề xuất: x/10`,
    `Nhận xét: ...`,
    `Câu đúng/chưa đúng: ...`,
    `Nếu ảnh/file mờ quá, không đọc được, hãy ghi rõ "Cần giáo viên chấm lại" và không tự suy đoán điểm.`
  ].join('\n\n');

  const extractAiScore = (text = '') => {
    const normalized = String(text || '').replace(',', '.');
    const folded = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
    const match = folded.match(/diem\s*tu\s*luan(?:\/viet\s*tay)?(?:\s*de\s*xuat)?\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i)
      || folded.match(/(?:diem(?:\s*de\s*xuat)?|score)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i)
      || folded.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*10\b/);
    if (!match) return { score: '', maxScore: '10' };
    return { score: match[1] || '', maxScore: match[2] || '10' };
  };

  const normalizeNameKey = (name = '') => removeAccents(String(name || '').toLowerCase()).replace(/[^a-z0-9]/g, '');

  const findScorebookRowIndexForStudent = useCallback((studentRecord = {}, grade = selectedGrade) => {
    const rows = getScorebookStudentsForGrade(grade);
    const recordId = String(studentRecord.studentId || studentRecord.id || '').trim();
    const recordCode = String(studentRecord.studentAccessCode || studentRecord.accessCode || '').trim().toUpperCase();
    const recordName = normalizeNameKey(studentRecord.studentName || studentRecord.fullName || '');
    return rows.findIndex(student => {
      const studentId = String(student.id || '').trim();
      const studentCode = String(student.accessCode || student.studentAccessCode || '').trim().toUpperCase();
      const studentName = normalizeNameKey(student.fullName || student.studentName || '');
      return (recordId && studentId && recordId === studentId)
        || (recordCode && studentCode && recordCode === studentCode)
        || (recordName && studentName && recordName === studentName);
    });
  }, [getScorebookStudentsForGrade, selectedGrade]);

  const findScorebookStudentsByAttemptKey = useCallback((studentKey = '', grade = selectedGrade) => {
    const key = String(studentKey || '').trim();
    if (!key) return [];
    const keyUpper = key.toUpperCase();
    const keyName = normalizeNameKey(key);
    return getScorebookStudentsForGrade(grade).filter(student => {
      const studentId = String(student.id || '').trim();
      const studentCode = String(student.accessCode || student.studentAccessCode || '').trim().toUpperCase();
      const studentName = normalizeNameKey(student.fullName || student.studentName || '');
      return (studentId && studentId === key)
        || (studentCode && studentCode === keyUpper)
        || (studentName && studentName === keyName);
    });
  }, [getScorebookStudentsForGrade, selectedGrade]);

  const normalizeQuizScoreForScorebook = useCallback((score, maxScore = 10) => {
    const scoreNumber = parseScoreNumber(score);
    const maxNumber = parseScoreNumber(maxScore) || 10;
    if (scoreNumber === null || !maxNumber) return '';
    return normalizeScoreInput(maxNumber === 10 ? scoreNumber : (scoreNumber / maxNumber) * 10);
  }, []);

  const writeQuizScoreToScorebook = useCallback(async ({ target = quizScoreTarget, studentRecord = {}, score, maxScore = 10, overwriteExisting = false } = {}) => {
    if (!user || !canWriteCurrentSchoolYear || !target?.semester || target.pageIndex === undefined || target.scoreIndex === undefined) return false;
    const grade = String(target.grade || studentRecord.grade || selectedGrade || '');
    const rowIndex = findScorebookRowIndexForStudent(studentRecord, grade);
    const nextScore = normalizeQuizScoreForScorebook(score, maxScore);
    if (!grade || rowIndex < 0 || !nextScore) return false;
    const scorebookDocId = getScorebookDocIdForGrade(grade);
    const scoreKey = getQuickScoreKey(target.semester, target.pageIndex, rowIndex, target.scoreIndex);
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', scorebookDocId);
    try {
      const snap = await getDoc(ref);
      const data = snap.exists() ? (snap.data() || {}) : {};
      const currentEdits = data.edits && typeof data.edits === 'object' ? data.edits : {};
      if (!overwriteExisting && String(currentEdits[scoreKey] || '').trim()) return false;
      const nextEdits = { ...currentEdits, [scoreKey]: nextScore };
      await setDoc(ref, {
        grade,
        schoolYear: currentSchoolYear || '',
        sourceFile: scorebookTemplate.sourceFile || '',
        edits: nextEdits,
        scoreSources: { [scoreKey]: { source: 'quiz', updatedAt: Date.now() } },
        updatedAt: Date.now(),
        authorId: user.uid
      }, { merge: true });
      if (scorebookDocId === quickScorebookDocId) {
        setQuickScorebookEdits(prev => ({ ...(prev || {}), [scoreKey]: nextScore }));
        setQuickScoreSources(prev => ({ ...(prev || {}), [scoreKey]: { source: 'quiz', updatedAt: Date.now() } }));
      }
      return true;
    } catch (error) {
      return false;
    }
  }, [user, canWriteCurrentSchoolYear, quizScoreTarget, selectedGrade, findScorebookRowIndexForStudent, normalizeQuizScoreForScorebook, getScorebookDocIdForGrade, getQuickScoreKey, currentSchoolYear, quickScorebookDocId]);

  const getCurrentQuizScoreTargets = useCallback((records = []) => {
    const candidates = [
      quizScoreTarget,
      ...records.map(record => record?.scoreTarget),
      ...allQuizzes
        .filter(q => String(q.grade) === String(selectedGrade))
        .filter(q => String(q.subject) === String(selectedSubject))
        .filter(q => String(q.lesson) === String(selectedLesson))
        .filter(q => String(q.schoolYear || currentSchoolYear) === String(currentSchoolYear))
        .map(q => q.scoreTarget)
    ];
    const seen = new Set();
    return candidates
      .filter(target => target?.semester && target.pageIndex !== undefined && target.scoreIndex !== undefined)
      .map(target => ({ ...target, grade: String(target.grade || selectedGrade || '') }))
      .filter(target => {
        const key = `${target.grade}|${target.semester}|${target.pageIndex}|${target.scoreIndex}`;
        if (!target.grade || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [quizScoreTarget, allQuizzes, selectedGrade, selectedSubject, selectedLesson, currentSchoolYear]);

  const clearQuizScoresFromScorebook = useCallback(async ({ target = quizScoreTarget, targets = null, records = [] } = {}) => {
    if (!user || !canWriteCurrentSchoolYear) return false;
    const activeTargets = (Array.isArray(targets) && targets.length ? targets : [target])
      .filter(item => item?.semester && item.pageIndex !== undefined && item.scoreIndex !== undefined);
    if (!activeTargets.length || !records.length) return false;
    const groups = new Map();
    activeTargets.forEach(item => {
      const grade = String(item.grade || selectedGrade || '');
      if (!grade) return;
      const scorebookDocId = getScorebookDocIdForGrade(grade);
      const keys = records.flatMap(record => {
        const rowIndex = findScorebookRowIndexForStudent(record, grade);
        if (rowIndex < 0) return [];
        const scoreKey = getQuickScoreKey(item.semester, item.pageIndex, rowIndex, item.scoreIndex);
        const legacyScoreKey = scoreKey.replace(/^custom:/, '');
        return scoreKey === legacyScoreKey ? [scoreKey] : [scoreKey, legacyScoreKey];
      }).filter(Boolean);
      if (!keys.length) return;
      const current = groups.get(scorebookDocId) || { grade, keys: new Set() };
      keys.forEach(key => current.keys.add(key));
      groups.set(scorebookDocId, current);
    });
    if (!groups.size) return false;
    let cleared = false;
    for (const [scorebookDocId, group] of groups.entries()) {
      const keys = [...group.keys];
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', scorebookDocId);
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const updates = keys.reduce((acc, key) => ({ ...acc, [`edits.${key}`]: deleteField(), [`scoreSources.${key}`]: deleteField() }), {});
          await updateDoc(ref, updates);
        }
        await setDoc(ref, {
          grade: group.grade,
          schoolYear: currentSchoolYear || '',
          sourceFile: scorebookTemplate.sourceFile || '',
          updatedAt: Date.now(),
          authorId: user.uid
        }, { merge: true });
        if (scorebookDocId === quickScorebookDocId) {
          setQuickScorebookEdits(prev => {
            const next = { ...(prev || {}) };
            keys.forEach(key => { delete next[key]; });
            return next;
          });
          setQuickScoreSources(prev => {
            const next = { ...(prev || {}) };
            keys.forEach(key => { delete next[key]; });
            return next;
          });
        }
        setQuickInputDrafts(prev => {
          const next = { ...(prev || {}) };
          keys.forEach(key => { delete next[key]; });
          return next;
        });
        cleared = true;
      } catch (error) {
        // Continue clearing the remaining grade documents; stale score cleanup should be best-effort.
      }
    }
    return cleared;
  }, [user, canWriteCurrentSchoolYear, quizScoreTarget, selectedGrade, findScorebookRowIndexForStudent, getScorebookDocIdForGrade, getQuickScoreKey, currentSchoolYear, quickScorebookDocId]);

  const findSelfQuizResultForSubmission = (submission = {}) => {
    const nameKey = normalizeNameKey(submission.studentName);
    const codeKey = String(submission.studentAccessCode || '').trim().toUpperCase();
    const candidates = currentQuizResults
      .filter(result => {
        if (String(result.quizId || '') !== String(submission.quizId || quizId || '')) return false;
        const sameCode = codeKey && String(result.studentAccessCode || '').trim().toUpperCase() === codeKey;
        const sameName = nameKey && normalizeNameKey(result.studentName) === nameKey;
        return sameCode || sameName;
      })
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    return candidates[0] || null;
  };

  const runAiGradingForSubmission = async (submissionOrId, options = {}) => {
    const submission = typeof submissionOrId === 'string'
      ? allHandwrittenSubmissions.find(item => item.id === submissionOrId)
      : submissionOrId;
    if (!submission?.id || !submission.fileId) {
      if (!options.silent) showNotification('Bài nộp này chưa có file để AI chấm.', 'error');
      return;
    }
    setGradingSubmissionId(submission.id);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'handwritten_submissions', submission.id), {
        aiStatus: 'grading',
        aiStartedAt: Date.now()
      }, { merge: true });
      const selfQuizResult = findSelfQuizResultForSubmission(submission);
      const gradingPayload = {
        fileId: submission.fileId,
        model: selectedGeminiModel,
        prompt: buildHandwrittenGradingPrompt(submission, selfQuizResult)
      };
      let res;
      try {
        res = await postAppsScript({ action: 'gradeStudentWork', ...gradingPayload });
      } catch (actionError) {
        const message = actionError.message || String(actionError);
        if (!/gradeStudentWork|khong dung action|không đúng action|thiếu base64|thieu base64/i.test(message)) throw actionError;
        res = await postAppsScript({ action: 'askAI', mode: 'gradeStudentWork', ...gradingPayload });
      }
      const aiText = res.result || res.text || '';
      const parsed = extractAiScore(aiText);
      const submissionDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'handwritten_submissions', submission.id);
      const latestSubmissionSnap = await getDoc(submissionDocRef);
      const latestSubmission = latestSubmissionSnap.exists() ? latestSubmissionSnap.data() : null;
      if (latestSubmission && latestSubmission.fileId && latestSubmission.fileId !== submission.fileId) return;
      await setDoc(submissionDocRef, {
        aiStatus: 'graded',
        status: 'ai_graded',
        aiScore: parsed.score,
        aiMaxScore: parsed.maxScore,
        aiComment: aiText,
        aiModel: res.model || selectedGeminiModel,
        aiGradedAt: Date.now()
      }, { merge: true });
      if (!options.silent) showNotification('AI đã chấm nháp, giáo viên xem lại rồi lưu điểm.');
    } catch (error) {
      const cleanMessage = normalizeServiceErrorMessage(error.message || String(error));
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'handwritten_submissions', submission.id), {
        aiStatus: 'error',
        aiError: cleanMessage,
        aiFailedAt: Date.now()
      }, { merge: true }).catch(() => {});
      if (!options.silent) showNotification('AI chua cham duoc: ' + cleanMessage, 'error');
    } finally {
      setGradingSubmissionId('');
    }
  };

  const handleGradeNextSubmission = async () => {
    const next = [...currentHandwrittenSubmissions]
      .filter(item => !['graded', 'grading'].includes(item.aiStatus) && item.fileId)
      .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))[0];
    if (!next) {
      showNotification('Không còn bài đang chờ AI trong bài này.');
      return;
    }
    await runAiGradingForSubmission(next);
  };

  const updateSubmissionGradeDraft = (id, key, value) => {
    setSubmissionGradeDrafts(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
  };

  const saveTeacherGradeForSubmission = async (submission) => {
    if (!submission?.id) return;
    if (!canWriteCurrentSchoolYear) {
      showNotification(`Năm học ${currentSchoolYear} đang khóa nhập liệu. Admin mở khóa mới lưu điểm được.`, 'error');
      return;
    }
    const draft = submissionGradeDrafts[submission.id] || {};
    const teacherScore = String(draft.teacherScore ?? submission.teacherScore ?? submission.aiScore ?? '').trim();
    const teacherMaxScore = String(draft.teacherMaxScore ?? submission.teacherMaxScore ?? submission.aiMaxScore ?? '10').trim();
    const teacherComment = String(draft.teacherComment ?? submission.teacherComment ?? '').trim();
    if (!teacherScore) {
      showNotification('Thầy cô nhập điểm trước khi lưu.', 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'handwritten_submissions', submission.id), {
        status: 'teacher_reviewed',
        teacherScore,
        teacherMaxScore,
        teacherComment,
        reviewedAt: Date.now(),
        reviewedBy: user?.uid || ''
      }, { merge: true });
      await writeQuizScoreToScorebook({ studentRecord: submission, score: teacherScore, maxScore: teacherMaxScore, overwriteExisting: true });
      showNotification('Đã lưu điểm giáo viên.');
    } catch (error) {
      showNotification('Chưa lưu được điểm: ' + error.message, 'error');
    }
  };

  const hasHandwrittenScore = (submission = {}) => {
    const score = submission.teacherScore ?? submission.aiScore;
    return score !== undefined && score !== null && String(score).trim() !== '';
  };

  const isHandwrittenSubmissionLocked = (submission = {}) => {
    if (!submission?.id) return false;
    return hasHandwrittenScore(submission);
  };

  const markSubmissionFilePickerActive = () => {
    if (studentEssaySubmitted) return;
    submissionFilePickerActiveRef.current = true;
    window.setTimeout(() => {
      submissionFilePickerActiveRef.current = false;
    }, 120000);
  };

  const finishSubmissionFilePicker = () => {
    window.setTimeout(() => {
      submissionFilePickerActiveRef.current = false;
    }, 1200);
  };

  const handleSelectSubmissionFile = (file) => {
    finishSubmissionFilePicker();
    applySubmissionFile(file || null);
  };

  const clearSubmissionFile = () => {
    setSubmissionFile(null);
    setSubmissionStatus('');
  };

  const handleStudentSubmit = async () => {
    if (!canWriteCurrentSchoolYear) {
      setSubmissionStatus(`Nam hoc ${currentSchoolYear} dang khoa nhap lieu. Em bao giao vien/admin mo khoa neu can nop bai.`);
      return;
    }
    if (!studentName.trim()) {
      setSubmissionStatus('Chua nhap ho ten. Em nhap ho ten roi nop lai nhe.');
      studentSubmitNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => studentSubmitNameRef.current?.focus(), 250);
      return;
    }
    if (!submissionFile) {
      setSubmissionStatus('Chua chon tep bai lam.');
      studentSubmitSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (submissionFile.size > 25 * 1024 * 1024) {
      setSubmissionStatus('File qua lon! (Duoi 25MB).');
      return;
    }

    const currentStudentAccessCode = String(activeStudentProfile?.accessCode || currentStudent?.accessCode || '').trim().toUpperCase();
    const currentStudentNameKey = normalizeNameKey(activeStudentProfile?.fullName || currentStudent?.fullName || studentName);
    const matchingManualSubmissions = currentHandwrittenSubmissions
      .filter(submission => {
        const submissionCode = String(submission.studentAccessCode || '').trim().toUpperCase();
        const submissionNameKey = normalizeNameKey(submission.studentName);
        if (currentStudentAccessCode) {
          return (submissionCode && currentStudentAccessCode === submissionCode)
            || (!submissionCode && currentStudentNameKey && submissionNameKey && currentStudentNameKey === submissionNameKey);
        }
        return currentStudentNameKey && submissionNameKey && currentStudentNameKey === submissionNameKey;
      })
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    const existingManualSubmission = matchingManualSubmissions[0] || null;

    if (existingManualSubmission) {
      setSubmissionStatus('Em đã gửi bài rồi. Bài đang chờ giáo viên chấm nên không nộp lại nữa. Nếu cần nộp lại, hãy báo giáo viên bấm Reset/Làm lại để mở khóa.');
      studentSubmitSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsSubmittingWork(true);
    setSubmissionStatus('');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const cleanName = studentName.trim();
          const payload = {
            filename: `[${currentSchoolYear}]_[K${selectedGrade}]_[${selectedSubject}]_[B${selectedLesson}]_${cleanName}_${submissionFile.name}`,
            mimeType: submissionFile.type,
            base64: reader.result.split(',')[1],
            folderId: STUDENT_SUBMISSION_FOLDER_ID
          };
          const res = await postAppsScript(payload);
          if (res.status === 'success') {
            const submissionPayload = {
              quizId: quizId || '',
              schoolYear: currentSchoolYear,
              grade: String(selectedGrade || ''),
              subject: String(selectedSubject || ''),
              lesson: String(selectedLesson || ''),
              scoreTarget: quizScoreTarget || null,
              studentId: activeStudentProfile?.id || currentStudent?.id || '',
              studentAccessCode: activeStudentProfile?.accessCode || currentStudent?.accessCode || '',
              studentName: cleanName,
              fileName: res.filename || submissionFile.name,
              fileUrl: res.url || '',
              fileId: res.fileId || '',
              mimeType: submissionFile.type || '',
              fileSize: submissionFile.size || 0,
              status: 'queued',
              aiStatus: 'queued',
              submittedAt: Date.now(),
              submittedBy: user?.uid || ''
            };
            let savedSubmissionId = '';
            const submissionRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'handwritten_submissions'), submissionPayload);
            savedSubmissionId = submissionRef.id;
            setSubmissionStatus('Đã gửi bài. Chờ giáo viên chấm bài.');
            setSubmissionFile(null);
            setStudentName(activeStudentProfile?.fullName || '');
            runAiGradingForSubmission({ ...submissionPayload, id: savedSubmissionId }, { silent: true });
          } else {
            setSubmissionStatus('Loi tai len');
          }
        } catch (e) {
          setSubmissionStatus('Loi ket noi');
        } finally {
          setIsSubmittingWork(false);
        }
      };
      reader.readAsDataURL(submissionFile);
    } catch (e) {
      setSubmissionStatus('Loi he thong');
      setIsSubmittingWork(false);
    }
  };

  const handleTeacherPlanUpload = async () => {
    const uploadSubject = planSubject || selectedSubject;
    if (!planFile || !uploadSubject) return; if (planFile.size > 25 * 1024 * 1024) { setPlanStatus('❌ File quá lớn!'); return; }
    setIsUploadingPlan(true); setPlanStatus('');
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try { const payload = { filename: `[KHBD_${currentSchoolYear}]_[K${selectedGrade}]_[${uploadSubject}]_${planFile.name}`, mimeType: planFile.type, base64: reader.result.split(',')[1], folderId: TEACHER_PLAN_FOLDER_ID }; const res = await postAppsScript(payload); if (res.status === 'success') { setPlanStatus('🎉 Đã nộp Kế hoạch Bài dạy thành công!'); setPlanFile(null); setPlanSubject(uploadSubject); } else setPlanStatus('❌ Lỗi tải lên'); } catch (e) { setPlanStatus('❌ Lỗi kết nối'); } finally { setIsUploadingPlan(false); }
      }; reader.readAsDataURL(planFile);
    } catch (e) { setPlanStatus('❌ Lỗi hệ thống'); setIsUploadingPlan(false); }
  };

  const uploadInlineMaterials = async (files = [], { successMessage = 'Đã up và ghim file vào bài thành công!' } = {}) => {
    if (!user) return 0;
    const filesToUpload = Array.from(files || []).filter(Boolean);
    if (filesToUpload.length === 0) { showNotification("Vui lòng chọn file!", "error"); return 0; }
    setIsSubmitting(true); setUploadProgress({ current: 0, total: filesToUpload.length });
    let successCount = 0;
    for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i]; setUploadProgress(prev => ({ ...prev, current: i + 1 })); if (file.size > 30 * 1024 * 1024) continue;
        try { const safeName = file.name || `AnhDan_${Date.now()}_${i + 1}.jpg`; const base64Data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file); }); const payload = { filename: `[K${selectedGrade}_${selectedSubject}_B${selectedLesson}]_${safeName}`, mimeType: file.type || 'image/jpeg', base64: base64Data, folderId: MASTER_DRIVE_FOLDER_ID }; const res = await postAppsScript(payload); if (res.status === 'success') { let fType = 'link'; const mime = String(file.type || '').toLowerCase(); if (mime.includes('pdf')) fType = 'pdf'; else if (mime.includes('presentation') || safeName.includes('.ppt')) fType = 'ppt'; else if (mime.includes('image')) fType = 'image'; const savedTitle = (res.filename || safeName).replace(/\[.*?\]_/, '').replace(/\.[^/.]+$/, ""); await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'materials'), { grade: String(selectedGrade), subject: String(selectedSubject), lesson: String(selectedLesson), title: savedTitle, url: res.url, driveFileId: res.fileId, type: fType, createdAt: Date.now(), authorId: user.uid }); successCount++; } } catch (err) {}
    }
    setIsSubmitting(false);
    if (successCount > 0) { setShowInlineLink(false); showNotification(successMessage); }
    else showNotification("Chưa up được file vào Drive.", "error");
    return successCount;
  };

  const handleInlineUpload = async (e) => {
    e.preventDefault();
    const successCount = await uploadInlineMaterials(inlineFiles);
    if (successCount > 0) setInlineFiles([]);
  };

  const handleInlineLinkPaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items.filter(item => item.type?.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    await uploadInlineMaterials(imageFiles, { successMessage: 'Đã dán ảnh, tải lên Drive và ghim vào bài.' });
  };

  const handleDeleteMaterial = async (id) => { if (role !== 'teacher') return; setConfirmModal({ show: true, message: 'Gỡ tài liệu này khỏi bài học?', onConfirm: async () => { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'materials', id)); showNotification("Đã gỡ tài liệu"); } }); };
  const resetNavigationWithClean = () => { setSelectedGrade(null); setSelectedSubject(null); setSelectedLesson(null); setViewingMaterial(null); setShowCommonLibraryWorkspace(false); setTeacherTab('giang_day'); setPlanSubject(''); setIsTextbookExpanded(window.innerWidth >= 640); };
  const handleCopyLink = async (url) => { try { await navigator.clipboard.writeText(url); showNotification("Đã copy liên kết tải tài liệu"); } catch (err) { const t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); showNotification("Đã copy liên kết tải tài liệu"); } catch (e) {} document.body.removeChild(t); } };
  const renderIcon = (type) => { switch(type) { case 'pdf': return <FileText className="w-6 h-6 text-red-500" />; case 'ppt': return <MonitorPlay className="w-6 h-6 text-orange-500" />; case 'image': return <ImageIcon className="w-6 h-6 text-green-500" />; default: return <LinkIcon className="w-6 h-6 text-blue-500" />; } };

  const getSubjectCardStyle = (index) => {
    const styles = [
      'bg-blue-50/80 border-blue-100 hover:border-blue-300 hover:bg-blue-100 text-blue-800',
      'bg-emerald-50/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-100 text-emerald-800',
      'bg-amber-50/80 border-amber-100 hover:border-amber-300 hover:bg-amber-100 text-amber-800',
      'bg-rose-50/80 border-rose-100 hover:border-rose-300 hover:bg-rose-100 text-rose-800',
      'bg-indigo-50/80 border-indigo-100 hover:border-indigo-300 hover:bg-indigo-100 text-indigo-800',
      'bg-cyan-50/80 border-cyan-100 hover:border-cyan-300 hover:bg-cyan-100 text-cyan-800',
      'bg-violet-50/80 border-violet-100 hover:border-violet-300 hover:bg-violet-100 text-violet-800'
    ];
    return styles[index % styles.length];
  };

  const currentMaterialsFiltered = useMemo(() => { return allMaterials.filter(m => String(m.grade) === String(selectedGrade) && String(m.subject) === String(selectedSubject) && String(m.lesson) === String(selectedLesson)); }, [allMaterials, selectedGrade, selectedSubject, selectedLesson]);
  const sortedCurrentMaterials = useMemo(() => { return [...currentMaterialsFiltered].sort((a, b) => { const direction = materialSort === 'asc' ? 1 : -1; return (a.title || '').localeCompare(b.title || '', 'vi') * direction; }); }, [currentMaterialsFiltered, materialSort]);
  const isQuizVisibleForStudents = useCallback((quiz) => {
    if (!quiz?.content) return false;
    const publishAtMs = parseVietnamDateTimeLocal(quiz.publishAt);
    return !!quiz.isPublished || (!!publishAtMs && nowMs >= publishAtMs);
  }, [nowMs]);
  const currentQuizVisibleForStudents = useMemo(() => isQuizVisibleForStudents({ content: quizHtml, isPublished: quizPublishNow, publishAt: quizPublishAt }), [quizHtml, quizPublishNow, quizPublishAt, isQuizVisibleForStudents]);
  const shuffledSelfQuizQuestions = useMemo(() => {
    return buildSelfQuizQuestionsForStudent(activeSelfQuiz);
  }, [activeSelfQuiz, quizId]);
  const currentQuizResults = useMemo(() => {
    return filterQuizResultsForContext(allQuizResults, { quizId, schoolYear: currentSchoolYear, grade: selectedGrade, subject: selectedSubject, lesson: selectedLesson });
  }, [allQuizResults, quizId, currentSchoolYear, selectedGrade, selectedSubject, selectedLesson]);
  const currentHandwrittenSubmissions = useMemo(() => {
    return allHandwrittenSubmissions
      .filter(item => String(item.schoolYear || '') === String(currentSchoolYear || ''))
      .filter(item => String(item.grade || '') === String(selectedGrade || ''))
      .filter(item => String(item.subject || '') === String(selectedSubject || ''))
      .filter(item => String(item.lesson || '') === String(selectedLesson || ''))
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  }, [allHandwrittenSubmissions, currentSchoolYear, selectedGrade, selectedSubject, selectedLesson]);
  const selectedHandwrittenSubmission = currentHandwrittenSubmissions[handwrittenViewerIndex] || null;
  const activeStudentWorkKeys = useMemo(() => {
    const code = String(activeStudentProfile?.accessCode || currentStudent?.accessCode || '').trim().toUpperCase();
    const names = [
      activeStudentProfile?.fullName,
      currentStudent?.fullName
    ].map(name => normalizeNameKey(name)).filter(Boolean);
    return { code, names: [...new Set(names)] };
  }, [activeStudentProfile, currentStudent]);
  const isCurrentStudentRecord = useCallback((record = {}) => {
    const recordCode = String(record.studentAccessCode || record.accessCode || '').trim().toUpperCase();
    const recordName = normalizeNameKey(record.studentName || record.fullName || '');
    if (activeStudentWorkKeys.code) {
      if (recordCode) return activeStudentWorkKeys.code === recordCode;
      return !!recordName && activeStudentWorkKeys.names.includes(recordName);
    }
    return !!recordName && activeStudentWorkKeys.names.includes(recordName);
  }, [activeStudentWorkKeys]);
  const studentSavedQuizResult = useMemo(() => {
    return [...currentQuizResults].filter(isCurrentStudentRecord).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0] || null;
  }, [currentQuizResults, isCurrentStudentRecord]);
  const studentSavedHandwrittenSubmission = useMemo(() => {
    return [...currentHandwrittenSubmissions].filter(isCurrentStudentRecord).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0] || null;
  }, [currentHandwrittenSubmissions, isCurrentStudentRecord]);
  const studentSelfQuizSubmitted = !!studentSavedQuizResult || !!studentQuizResult;
  const studentEssaySubmitted = !!studentSavedHandwrittenSubmission;
  const studentReviewQuizResult = studentSavedQuizResult || studentQuizResult;
  const studentReviewEssayReady = isHandwrittenSubmissionLocked(studentSavedHandwrittenSubmission);
  const studentWorkReviewReady = !!studentReviewQuizResult || studentReviewEssayReady;
  const formatPointScore = formatVietnamPointScore;
  const studentWorkReviewScore = useMemo(() => {
    const quizScore = getSelfQuizScorePoint(studentReviewQuizResult);
    const hasQuizScore = !!studentReviewQuizResult;
    const essayScore = Number((studentSavedHandwrittenSubmission?.teacherScore ?? studentSavedHandwrittenSubmission?.aiScore) || 0);
    const hasEssayScore = (studentSavedHandwrittenSubmission?.teacherScore ?? studentSavedHandwrittenSubmission?.aiScore) !== undefined
      && (studentSavedHandwrittenSubmission?.teacherScore ?? studentSavedHandwrittenSubmission?.aiScore) !== null
      && String(studentSavedHandwrittenSubmission?.teacherScore ?? studentSavedHandwrittenSubmission?.aiScore).trim() !== '';
    return {
      quizScore,
      hasQuizScore,
      essayScore,
      hasEssayScore,
      totalScore: quizScore + essayScore,
      hasTotalScore: hasQuizScore || hasEssayScore
    };
  }, [studentReviewQuizResult, studentSavedHandwrittenSubmission]);

  const lockStudentEssayForLeaving = async () => {
    if (!user || !quizId || !studentEssayText || studentEssaySubmitted || !canWriteCurrentSchoolYear) return;
    const lockName = (activeStudentProfile?.fullName || currentStudent?.fullName || studentName || '').trim();
    const currentStudentAccessCode = String(activeStudentProfile?.accessCode || currentStudent?.accessCode || '').trim().toUpperCase();
    const currentStudentNameKey = normalizeNameKey(lockName);
    const alreadyLockedOrSubmitted = currentHandwrittenSubmissions.some(submission => {
      const submissionCode = String(submission.studentAccessCode || '').trim().toUpperCase();
      const submissionNameKey = normalizeNameKey(submission.studentName);
      if (currentStudentAccessCode) {
        return (submissionCode && currentStudentAccessCode === submissionCode)
          || (!submissionCode && currentStudentNameKey && submissionNameKey && currentStudentNameKey === submissionNameKey);
      }
      return currentStudentNameKey && submissionNameKey && currentStudentNameKey === submissionNameKey;
    });
    if (alreadyLockedOrSubmitted) return;
    const submissionPayload = {
      quizId: quizId || '',
      schoolYear: currentSchoolYear,
      grade: String(selectedGrade || ''),
      subject: String(selectedSubject || ''),
      lesson: String(selectedLesson || ''),
      scoreTarget: quizScoreTarget || null,
      studentId: activeStudentProfile?.id || currentStudent?.id || '',
      studentAccessCode: activeStudentProfile?.accessCode || currentStudent?.accessCode || '',
      studentName: lockName || 'Học sinh',
      fileName: 'Em đã thoát ra ngoài',
      fileUrl: '',
      fileId: '',
      mimeType: '',
      fileSize: 0,
      status: 'left_page',
      aiStatus: 'left_page',
      exitReason: 'student_left_page',
      teacherComment: 'Em đã thoát ra ngoài trong khi làm bài tự luận.',
      submittedAt: Date.now(),
      submittedBy: user?.uid || ''
    };
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'handwritten_submissions'), submissionPayload);
      setSubmissionFile(null);
      setSubmissionStatus('Em đã thoát ra ngoài nên bài tự luận đã bị khóa. Hãy báo giáo viên nếu cần mở lại.');
    } catch (error) {
      setSubmissionStatus('Chưa khóa được bài khi thoát ra ngoài. Em báo giáo viên kiểm tra lại.');
    }
  };

  useEffect(() => {
    if (role !== 'teacher' && showStudentWorkReview) typesetMath(studentWorkReviewRef.current);
  }, [role, showStudentWorkReview, studentReviewQuizResult, studentSavedHandwrittenSubmission]);

  useEffect(() => {
    setHandwrittenViewerIndex(prev => {
      const lastIndex = Math.max(currentHandwrittenSubmissions.length - 1, 0);
      return Math.min(Math.max(prev, 0), lastIndex);
    });
  }, [currentHandwrittenSubmissions.length]);

  useEffect(() => {
    if (!user || role !== 'teacher' || gradingSubmissionId) return;
    const next = [...currentHandwrittenSubmissions]
      .filter(item => item.fileId && !['graded', 'grading', 'error'].includes(item.aiStatus) && !autoGradingIdsRef.current.has(item.id))
      .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))[0];
    if (!next) return;
    autoGradingIdsRef.current.add(next.id);
    runAiGradingForSubmission(next, { silent: true }).finally(() => {
      autoGradingIdsRef.current.delete(next.id);
    });
  }, [user, role, currentHandwrittenSubmissions, gradingSubmissionId]);

  const openSelfQuizTeacherTab = () => {
    setShowQuizWorkWorkspace(true);
    setQuizTeacherTab('work');
    setShowQuizResults(false);
    setShowHandwrittenSubmissions(false);
    handleCreateSelfQuizDraft({ forceOpen: true });
  };

  const openAutoWorkTeacherTab = () => {
    setShowQuizWorkWorkspace(true);
    setQuizTeacherTab('work');
    setShowQuizResults(false);
    setShowSelfQuizBuilder(false);
    setShowHandwrittenSubmissions(false);
  };

  const openHandwrittenTeacherTab = () => {
    setShowQuizWorkWorkspace(true);
    setQuizTeacherTab('work');
    setShowHandwrittenSubmissions(true);
    setShowSelfQuizBuilder(false);
    setShowQuizResults(false);
  };

  const openHandwrittenSubmissionByKey = (studentKey) => {
    const key = String(studentKey || '').trim();
    if (key) {
      const index = currentHandwrittenSubmissions.findIndex(submission => {
        const code = String(submission.studentAccessCode || '').trim().toUpperCase();
        const submissionKey = code || normalizeNameKey(submission.studentName);
        return submissionKey === key;
      });
      if (index >= 0) setHandwrittenViewerIndex(index);
    }
    setShowQuizWorkWorkspace(true);
    setShowHandwrittenSubmissions(true);
    setQuizTeacherTab('work');
    setShowSelfQuizBuilder(false);
    setShowQuizResults(false);
  };

  const openScoreTeacherTab = () => {
    setShowQuizWorkWorkspace(true);
    setQuizTeacherTab('work');
    setShowQuizResults(true);
    setShowSelfQuizBuilder(false);
    setShowHandwrittenSubmissions(pendingHandwrittenSubmissionCount > 0);
  };

  const resetQuizAttemptsForCurrentLesson = () => {
    const total = currentQuizResults.length + currentHandwrittenSubmissions.length;
    const resetRecords = [...currentQuizResults, ...currentHandwrittenSubmissions];
    const scoreTargets = getCurrentQuizScoreTargets(resetRecords);
    const scoreCleanupRecords = scoreTargets.length ? getScorebookStudentsForGrade(selectedGrade) : [];
    if (!total && !scoreCleanupRecords.length) {
      showNotification('Chưa có lượt nộp nào để xóa.');
      return;
    }
    setConfirmModal({
      show: true,
      message: `Cho học sinh làm lại bài này?\nHệ thống sẽ xóa ${currentQuizResults.length} lượt trắc nghiệm, ${currentHandwrittenSubmissions.length} bài tự luận và dọn cột điểm nhanh đang gắn với bài hiện tại.`,
      onConfirm: async () => {
        try {
          await clearQuizScoresFromScorebook({ records: scoreCleanupRecords.length ? scoreCleanupRecords : resetRecords, targets: scoreTargets });
          await Promise.all([
            ...currentQuizResults.map(result => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quiz_results', result.id))),
            ...currentHandwrittenSubmissions.map(submission => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'handwritten_submissions', submission.id)))
          ]);
          setStudentQuizResult(null);
          setSubmissionGradeDrafts({});
          setHandwrittenViewerIndex(0);
          showNotification('Đã xóa lượt nộp cũ. Học sinh có thể làm lại.');
        } catch (error) {
          showNotification('Chưa xóa được lượt nộp: ' + error.message, 'error');
        }
      }
    });
  };

  const resetQuizAttemptsForStudent = (studentKey, studentNameLabel = '') => {
    const key = String(studentKey || '').trim();
    if (!key) return;
    const matchesKey = (record = {}) => {
      const code = String(record.studentAccessCode || record.accessCode || '').trim().toUpperCase();
      const recordKey = code || normalizeNameKey(record.studentName || record.fullName || '');
      return recordKey === key;
    };
    const quizAttempts = currentQuizResults.filter(matchesKey);
    const essayAttempts = currentHandwrittenSubmissions.filter(matchesKey);
    const scoreTargets = getCurrentQuizScoreTargets([...quizAttempts, ...essayAttempts]);
    const scorebookStudentRecords = findScorebookStudentsByAttemptKey(key, selectedGrade);
    const total = quizAttempts.length + essayAttempts.length;
    if (!total && (!scoreTargets.length || !scorebookStudentRecords.length)) {
      showNotification('Học sinh này chưa có lượt nộp hoặc điểm gắn bài kiểm tra để cho làm lại.');
      return;
    }
    setConfirmModal({
      show: true,
      message: `Cho ${studentNameLabel || 'học sinh này'} làm lại bài này?\nHệ thống sẽ xóa ${quizAttempts.length} lượt trắc nghiệm, ${essayAttempts.length} bài tự luận và dọn ô điểm nhanh đang gắn với riêng em này.`,
      onConfirm: async () => {
        try {
          const resetRecords = [...quizAttempts, ...essayAttempts, ...scorebookStudentRecords];
          await clearQuizScoresFromScorebook({ records: resetRecords, targets: scoreTargets });
          await Promise.all([
            ...quizAttempts.map(result => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'quiz_results', result.id))),
            ...essayAttempts.map(submission => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'handwritten_submissions', submission.id)))
          ]);
          setSubmissionGradeDrafts(prev => {
            const next = { ...prev };
            essayAttempts.forEach(submission => { delete next[submission.id]; });
            return next;
          });
          showNotification(`Đã cho ${studentNameLabel || 'học sinh'} làm lại.`);
        } catch (error) {
          showNotification('Chưa cho học sinh làm lại được: ' + error.message, 'error');
        }
      }
    });
  };

  const handleSubmitSelfQuiz = async (options = {}) => {
    const autoSubmit = options?.autoSubmit === true;
    if (!activeSelfQuiz || !quizId || !user) return;
    if (!canWriteCurrentSchoolYear) {
      showNotification(`Năm học ${currentSchoolYear} đang khóa nhập liệu. Em chưa thể nộp bài.`, 'error');
      return;
    }
    if (!studentCanAccessCurrentGradeQuiz) {
      showNotification('Em chỉ làm bài kiểm tra ở khối của mình nhé.', 'error');
      return;
    }
    const submitStudentName = (activeStudentProfile?.fullName || currentStudent?.fullName || studentQuizName || '').trim();
    if (!submitStudentName) {
      if (autoSubmit) return;
      const warning = 'Chưa nhập họ tên. Em nhập họ tên rồi nộp lại nhé.';
      setStudentQuizWarning(warning);
      showNotification(warning, 'error');
      studentQuizNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => studentQuizNameRef.current?.focus(), 250);
      return;
    }
    if (studentSavedQuizResult) {
      const warning = 'Em đã nộp phần trắc nghiệm rồi. Mỗi học sinh chỉ làm 1 lần.';
      setStudentQuizWarning(warning);
      showNotification(warning, 'error');
      studentQuizNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const currentStudentAccessCode = String(activeStudentProfile?.accessCode || currentStudent?.accessCode || '').trim().toUpperCase();
    const currentStudentNameKey = normalizeNameKey(submitStudentName);
    const alreadySubmitted = currentQuizResults.some(result => {
      const resultCode = String(result.studentAccessCode || '').trim().toUpperCase();
      const resultNameKey = normalizeNameKey(result.studentName);
      if (currentStudentAccessCode) {
        return (resultCode && currentStudentAccessCode === resultCode)
          || (!resultCode && currentStudentNameKey && resultNameKey && currentStudentNameKey === resultNameKey);
      }
      return currentStudentNameKey && resultNameKey && currentStudentNameKey === resultNameKey;
    });
    if (alreadySubmitted) {
      const warning = 'Em đã nộp bài này rồi. Mỗi học sinh chỉ làm 1 lần.';
      setStudentQuizWarning(warning);
      showNotification(warning, 'error');
      studentQuizNameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const unanswered = activeSelfQuiz.questions.filter(q => !studentQuizAnswers[q.id]);
    if (unanswered.length > 0 && !autoSubmit) {
      const warning = `Còn ${unanswered.length} câu chưa chọn đáp án.`;
      setStudentQuizWarning(warning);
      showNotification(warning, 'error');
      return;
    }
    setStudentQuizWarning(autoSubmit ? 'Em đã thoát ra ngoài nên hệ thống đã tự nộp bài trắc nghiệm.' : '');
    setIsSubmittingSelfQuiz(true);
    try {
      const result = gradeSelfQuizSubmission({
        quizData: activeSelfQuiz,
        answersByQuestionId: studentQuizAnswers,
        quizId,
        studentName: submitStudentName,
        grade: selectedGrade,
        subject: selectedSubject,
        lesson: selectedLesson,
        schoolYear: currentSchoolYear,
        userId: user.uid
      });
      result.studentId = activeStudentProfile?.id || currentStudent?.id || '';
      result.studentAccessCode = activeStudentProfile?.accessCode || currentStudent?.accessCode || '';
      result.scoreTarget = quizScoreTarget || null;
      if (autoSubmit) {
        result.autoSubmitted = true;
        result.exitReason = 'student_left_page';
        result.teacherNote = 'Học sinh đã thoát ra ngoài khi đang làm trắc nghiệm. Hệ thống tự nộp phần đã làm.';
      }
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'quiz_results'), result);
      await writeQuizScoreToScorebook({ studentRecord: result, score: result.score, maxScore: result.total || 10, overwriteExisting: true });
      setStudentQuizResult(result);
      if (studentQuizDraftKey) localStorage.removeItem(studentQuizDraftKey);
      showNotification('Đã nộp bài và lưu điểm.');
      if (activeSelfQuiz.allowRetake === false) setStudentQuizAnswers({});
    } catch (e) {
      showNotification('Chưa lưu được điểm: ' + e.message, 'error');
    } finally {
      setIsSubmittingSelfQuiz(false);
    }
  };
  const quizPublishAtMs = useMemo(() => parseVietnamDateTimeLocal(quizPublishAt), [quizPublishAt]);
  const scheduledQuizPending = !!quizHtml && !currentQuizVisibleForStudents && !!quizPublishAtMs && quizPublishAtMs > nowMs;
  const studentCurrentQuizVisible = currentQuizVisibleForStudents && studentCanAccessCurrentGradeQuiz;
  const studentScheduledQuizPending = scheduledQuizPending && studentCanAccessCurrentGradeQuiz;
  useEffect(() => {
    if (role === 'student' && studentCurrentQuizVisible) setShowStudentQuizPanel(true);
  }, [role, quizId, studentCurrentQuizVisible]);
  useEffect(() => {
    if (role !== 'student' || !studentCurrentQuizVisible || !quizId || !canWriteCurrentSchoolYear) return undefined;
    const exitKey = `${quizId}:${activeStudentProfile?.accessCode || currentStudent?.accessCode || normalizeNameKey(studentQuizName || studentName) || user?.uid || 'student'}`;
    const handleStudentExit = () => {
      if (submissionFilePickerActiveRef.current) return;
      if (activeSelfQuiz && !studentSelfQuizSubmitted && !isSubmittingSelfQuiz && autoSelfQuizSubmitKeyRef.current !== exitKey) {
        autoSelfQuizSubmitKeyRef.current = exitKey;
        handleSubmitSelfQuiz({ autoSubmit: true });
      }
      if (studentEssayText && !studentEssaySubmitted && !isSubmittingWork && autoEssayLockKeyRef.current !== exitKey) {
        autoEssayLockKeyRef.current = exitKey;
        lockStudentEssayForLeaving();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleStudentExit();
    };
    const handlePageHide = () => handleStudentExit();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [role, studentCurrentQuizVisible, quizId, canWriteCurrentSchoolYear, activeStudentProfile, currentStudent, studentQuizName, studentName, user, activeSelfQuiz, studentSelfQuizSubmitted, isSubmittingSelfQuiz, studentEssayText, studentEssaySubmitted, isSubmittingWork, handleSubmitSelfQuiz, lockStudentEssayForLeaving]);
  const scheduledQuizCountdownText = useMemo(() => formatCountdown((quizPublishAtMs || 0) - nowMs), [quizPublishAtMs, nowMs]);
  const quizScoreCount = useMemo(() => {
    const keys = new Set();
    [...currentQuizResults, ...currentHandwrittenSubmissions].forEach(record => {
      const code = String(record.studentAccessCode || record.accessCode || '').trim().toUpperCase();
      const nameKey = normalizeNameKey(record.studentName || record.fullName || '');
      keys.add(code || nameKey || record.id || `${record.submittedAt || ''}-${keys.size}`);
    });
    return keys.size;
  }, [currentQuizResults, currentHandwrittenSubmissions]);
  const pendingHandwrittenSubmissionCount = useMemo(() => (
    currentHandwrittenSubmissions.filter(submission => submission.status !== 'teacher_reviewed').length
  ), [currentHandwrittenSubmissions]);
  const quizHasQuickContent = useMemo(() => !!String(stripHtmlToText(composeQuizContent()) || '').trim(), [composeQuizContent, quizQuestionHtml, quizAnswerHtml]);
  const quizPublishAction = useMemo(() => {
    const isOpenOrScheduled = currentQuizVisibleForStudents || !!quizPublishAt;
    return {
      label: isOpenOrScheduled ? 'Ẩn đề' : 'Phát đề',
      icon: isOpenOrScheduled ? 'hide' : 'publish',
      className: isOpenOrScheduled
        ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-600 hover:text-white'
        : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
    };
  }, [currentQuizVisibleForStudents, quizPublishAt]);
  const quizLessonMetaMap = useMemo(() => {
    const map = {};
    if (role === 'student' && !studentCanAccessCurrentGradeQuiz) return map;
    allQuizzes
      .filter(q => String(q.grade) === String(selectedGrade) && String(q.subject) === String(selectedSubject) && String(q.schoolYear || currentSchoolYear) === String(currentSchoolYear) && isQuizVisibleForStudents(q))
      .forEach(q => {
        const target = q.scoreTarget || {};
        const scoreLabel = target.label || QUICK_SCORE_LABELS[target.scoreIndex] || '';
        map[String(q.lesson)] = {
          scoreLabel,
          semesterLabel: target.semesterLabel || (target.semester === 'hki' ? 'HK1' : (target.semester === 'hkii' ? 'HK2' : '')),
          subjectLabel: target.subjectLabel || ''
        };
      });
    return map;
  }, [allQuizzes, selectedGrade, selectedSubject, currentSchoolYear, isQuizVisibleForStudents, role, studentCanAccessCurrentGradeQuiz]);
  const quizLessonSet = useMemo(() => new Set(Object.keys(quizLessonMetaMap)), [quizLessonMetaMap]);
  const studentCompletedQuizLessonSet = useMemo(() => {
    if (role !== 'student') return new Set();
    const completed = new Set();
    const matchesContext = (record = {}) => (
      String(record.schoolYear || '') === String(currentSchoolYear || '') &&
      String(record.grade || '') === String(selectedGrade || '') &&
      String(record.subject || '') === String(selectedSubject || '') &&
      record.lesson !== undefined &&
      isCurrentStudentRecord(record)
    );
    allQuizResults.forEach(result => {
      if (matchesContext(result)) completed.add(String(result.lesson));
    });
    allHandwrittenSubmissions.forEach(submission => {
      if (matchesContext(submission)) completed.add(String(submission.lesson));
    });
    return completed;
  }, [role, allQuizResults, allHandwrittenSubmissions, currentSchoolYear, selectedGrade, selectedSubject, isCurrentStudentRecord]);
  const pinnedNewsFeed = useMemo(() => newsList.filter(n => n.isPinned).sort((a, b) => (b.sortOrder ?? b.createdAt ?? 0) - (a.sortOrder ?? a.createdAt ?? 0)).map(n => ({ ...n, isAuto: false, timestamp: n.createdAt })), [newsList]);
  const combinedFeedSorted = useMemo(() => {
    const materialItems = [...allMaterials].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 4).map(m => ({ id: `m_${m.id}`, isAuto: true, iconType: 'material', targetGrade: m.grade, targetSubject: m.subject, targetLesson: m.lesson, title: `TÀI LIỆU MỚI: ${m.subject} ${m.grade} - ${getWeekDisplayName(m.lesson)}`, content: `<p>Vừa cập nhật: <b>${m.title}</b></p>`, timestamp: m.createdAt }));
    const noteItems = [...allNotes].filter(n => n.grade).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4).map(n => ({ id: `n_${n.id}`, isAuto: true, iconType: 'note', targetGrade: n.grade, targetSubject: n.subject, targetLesson: n.lesson, title: `GV đã up bài học: ${n.subject} ${n.grade} - ${getWeekDisplayName(n.lesson)}`, content: '<p>Nội dung bài học vừa được cập nhật.</p>', timestamp: n.updatedAt }));
    const quizItems = [...allQuizzes].filter(q => q.grade && String(q.schoolYear || currentSchoolYear) === String(currentSchoolYear) && isQuizVisibleForStudents(q) && (role !== 'student' || !activeStudentGrade || String(q.grade) === String(activeStudentGrade))).sort((a, b) => (b.updatedAt || b.publishAt || 0) - (a.updatedAt || a.publishAt || 0)).slice(0, 4).map(q => ({ id: `q_${q.id}`, isAuto: true, iconType: 'quiz', targetGrade: q.grade, targetSubject: q.subject, targetLesson: q.lesson, title: `GV đã up bài kiểm tra: ${q.subject} ${q.grade} - ${getWeekDisplayName(q.lesson)}`, content: '<p>Bài kiểm tra đã sẵn sàng.</p>', timestamp: q.updatedAt || q.publishAt }));
    return [...materialItems, ...noteItems, ...quizItems].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 4);
  }, [allMaterials, allNotes, allQuizzes, currentSchoolYear, isQuizVisibleForStudents, role, activeStudentGrade]);

  const renderNewsAdminActions = (n) => {
    const newsIndex = newsList.findIndex(item => item.id === n.id);
    const baseButton = 'transition-colors p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-25 disabled:hover:bg-transparent';
    return isAdmin ? (
      <div className="flex items-center gap-1 pl-2 border-l border-slate-200/60">
        <button type="button" onClick={(e) => handleEditNews(e, n)} className={`${baseButton} text-slate-400 hover:text-blue-600`} title="Sửa bản tin">
          <Pencil className="w-4 h-4" />
        </button>
        <button type="button" onClick={(e) => handleMoveNews(e, n, 'up')} disabled={newsIndex <= 0} className={`${baseButton} text-slate-400 hover:text-emerald-600`} title="Đưa tin lên">
          <ArrowUp className="w-4 h-4" />
        </button>
        <button type="button" onClick={(e) => handleMoveNews(e, n, 'down')} disabled={newsIndex < 0 || newsIndex >= newsList.length - 1} className={`${baseButton} text-slate-400 hover:text-emerald-600`} title="Đưa tin xuống">
          <ArrowDown className="w-4 h-4" />
        </button>
        <button type="button" onClick={(e) => handleToggleHotNews(e, n)} className={`${baseButton} ${n.isHot ? 'text-rose-500' : 'text-slate-300'} hover:text-rose-600`} title="Tin nóng">
          <Sparkles className="w-4 h-4" fill={n.isHot ? 'currentColor' : 'none'} />
        </button>
        <button type="button" onClick={(e) => handleTogglePinNews(e, n)} className={`${baseButton} ${n.isPinned ? 'text-blue-500' : 'text-slate-300'} hover:text-blue-600`} title="Ghim lên thông báo khẩn">
          <Pin className="w-4 h-4" fill={n.isPinned ? 'currentColor' : 'none'} />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteNews(n.id); }} className={`${baseButton} text-slate-300 hover:text-rose-500`} title="Xóa tin">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    ) : null;
  };

  const moveQuickScoreInputFocus = useCallback((event, rowIndex, columnIndex, direction) => {
    const container = event.currentTarget.closest('[data-quick-score-scope]');
    if (!container) return;
    const inputs = Array.from(container.querySelectorAll('input[data-quick-score-input="true"]'));
    const currentIndex = inputs.indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    let target = null;
    if (direction === 'left') target = inputs[currentIndex - 1] || null;
    if (direction === 'right') target = inputs[currentIndex + 1] || null;
    if (direction === 'up' || direction === 'down') {
      const step = direction === 'down' ? 1 : -1;
      for (let nextRow = rowIndex + step; nextRow >= 0 && nextRow < quickScoreStudents.length; nextRow += step) {
        target = container.querySelector(`input[data-quick-score-input="true"][data-quick-row="${nextRow}"][data-quick-col="${columnIndex}"]`);
        if (target) break;
      }
    }
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.select?.();
  }, [quickScoreStudents.length]);

  const handleQuickScoreInputKeyDown = useCallback((event, rowIndex, columnIndex) => {
    const keyMap = {
      Enter: 'down',
      ArrowDown: 'down',
      ArrowUp: 'up',
      ArrowLeft: 'left',
      ArrowRight: 'right'
    };
    const direction = keyMap[event.key];
    if (!direction || event.isComposing) return;
    moveQuickScoreInputFocus(event, rowIndex, columnIndex, direction);
  }, [moveQuickScoreInputFocus]);

  const renderTeacherQuickScorePanel = () => (
    <>
      <style>{`
        @media (max-width: 639px) {
          html:has(.teacher-quick-score-landscape),
          body:has(.teacher-quick-score-landscape) {
            overflow: hidden !important;
          }
          .teacher-quick-score-landscape {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vh !important;
            height: 100vw !important;
            width: 100dvh !important;
            height: 100dvw !important;
            max-width: none !important;
            max-height: none !important;
            transform: rotate(90deg) translateY(-100%) !important;
            transform-origin: top left;
            overflow: hidden !important;
            padding: 6px !important;
            border-radius: 0 !important;
          }
          .teacher-quick-score-toolbar {
            min-height: 42px;
            margin-bottom: 6px !important;
            padding-bottom: 6px !important;
          }
          .teacher-quick-score-title {
            max-width: 210px;
          }
          .teacher-quick-score-title-main {
            font-size: 11px !important;
            line-height: 1.1 !important;
          }
          .teacher-quick-score-table-wrap {
            max-height: calc(100dvw - 54px) !important;
          }
        }
      `}</style>
      <div className="teacher-quick-score-landscape fixed inset-0 z-[260] m-0 flex h-[100dvh] w-screen flex-col rounded-none border-0 bg-white p-2 shadow-2xl sm:static sm:mt-4 sm:block sm:h-auto sm:w-auto sm:rounded-2xl sm:border sm:border-slate-200 sm:p-4 sm:shadow-sm">
      <div className="teacher-quick-score-toolbar mb-2 flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-slate-100 pb-2 sm:mb-3 sm:flex-wrap sm:border-b-0 sm:pb-0">
        <div className="teacher-quick-score-title min-w-0">
          <div className="teacher-quick-score-title-main font-black text-slate-900 uppercase text-sm">Bảng nhập điểm nhanh</div>
          <div className="text-[11px] font-bold text-slate-500">Khối {quickScoreGrade} · {quickScoreLockedContext?.subjectLabel || selectedSubject}</div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:flex-wrap sm:gap-2">
          {quickScorebookSavingKey && <div className="text-xs font-black text-emerald-700 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang lưu...</div>}
          <button type="button" onClick={() => setQuickVisibleSemesters({ hki: !quickVisibleSemesters.hki, hkii: quickVisibleSemesters.hkii })} className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSemesters.hki ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200'}`}>HK1</button>
          <button type="button" onClick={() => setQuickVisibleSemesters({ hki: quickVisibleSemesters.hki, hkii: !quickVisibleSemesters.hkii })} className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSemesters.hkii ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200'}`}>HK2</button>
          <button type="button" onClick={() => { setShowLearningResultsWorkspace(false); setQuickScoreLockedContext(null); }} className="h-8 rounded-lg border border-rose-100 bg-rose-50 px-3 text-[11px] font-black uppercase text-rose-600">Đóng</button>
        </div>
      </div>
      {!canWriteCurrentSchoolYear && (
        <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black uppercase text-rose-700">
          Năm học {currentSchoolYear} đang khóa nhập điểm
        </div>
      )}

      <div data-quick-score-scope="teacher" className="teacher-quick-score-table-wrap min-h-0 flex-1 overflow-auto rounded-xl border border-slate-300 overscroll-contain sm:max-h-[70vh]">
        <table className="min-w-max w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              <th rowSpan={3} className="sticky left-0 z-[70] min-w-[156px] max-w-[156px] border border-slate-400 bg-slate-100 px-2 py-1 text-left font-black shadow-[4px_0_0_#f8fafc]">Họ và tên</th>
              {quickSelectedSubjects.map((subject) => (
                <th key={`teacher-quick-subject-${subject.key}`} colSpan={quickSubjectColSpanBySubject[subject.key] || 0} className="border-x-4 border-y-2 border-slate-600 px-1 py-1 text-center font-black">{subject.label}</th>
              ))}
              <th rowSpan={3} className="min-w-[56px] border border-slate-400 px-1 py-1 text-center font-black">KQ HK1</th>
              <th rowSpan={3} className="min-w-[56px] border border-slate-400 px-1 py-1 text-center font-black">KQ HK2</th>
              <th rowSpan={3} className="min-w-[64px] border border-slate-400 px-1 py-1 text-center font-black">KQ Cả năm</th>
            </tr>
            <tr className="bg-slate-50">
              {quickSelectedSubjects.flatMap((subject) => (
                quickSelectedSemesters.map((semester, semesterIndex) => {
                  const isSubjectStart = semesterIndex === 0;
                  const isSubjectEnd = semesterIndex === quickSelectedSemesters.length - 1;
                  return (
                    <th key={`teacher-quick-semester-head-${subject.key}-${semester.key}`} colSpan={(subject.txCount || 4) + 3 + (semester.key === 'hkii' ? 1 : 0)} className={`border border-slate-300 px-1 py-1 text-center font-black ${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}${semester.key === 'hki' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'}`}>
                      {semester.label}
                    </th>
                  );
                })
              ))}
            </tr>
            <tr className="bg-slate-50">
              {quickSelectedSubjects.flatMap((subject) => (
                quickSelectedSemesters.flatMap((semester, semesterIndex) => {
                  const labels = [...Array.from({ length: subject.txCount || 4 }, (_, idx) => `TX${idx + 1}`), 'GK', 'CK', 'ĐTB', ...(semester.key === 'hkii' ? ['ĐTBCN'] : [])];
                  return labels.map((label, labelIndex) => {
                    const isSubjectStart = semesterIndex === 0 && labelIndex === 0;
                    const isSubjectEnd = semesterIndex === quickSelectedSemesters.length - 1 && labelIndex === labels.length - 1;
                    const scoreIndex = label.startsWith('TX') ? Number(label.replace('TX', '')) - 1 : (label === 'GK' ? 4 : (label === 'CK' ? 5 : (label === 'ĐTB' ? 6 : 7)));
                    return (
                      <th key={`teacher-quick-col-head-${subject.key}-${semester.key}-${label}`} style={{ minWidth: getQuickScoreColumnWidth(scoreIndex), width: getQuickScoreColumnWidth(scoreIndex) }} className={`border border-slate-300 px-1 py-1 text-center font-black ${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}${semester.key === 'hki' ? 'bg-amber-50' : 'bg-sky-50'}`}>
                        {label}
                      </th>
                    );
                  });
                })
              ))}
            </tr>
          </thead>
          <tbody>
            {quickScoreStudents.map((student, rowIndex) => (
              <tr key={`teacher-quick-row-${student.id || rowIndex}`} className={rowIndex % 2 ? 'bg-white' : 'bg-slate-50/30'}>
                <td className="sticky left-0 z-[60] min-w-[156px] max-w-[156px] border border-slate-300 bg-white px-2 py-1 font-bold whitespace-nowrap overflow-hidden text-ellipsis shadow-[4px_0_0_#ffffff]">{student.fullName || ''}</td>
                {quickVisibleScoreColumnsBySubject.map((column, columnIndex) => {
                  const editKey = getQuickScoreKey(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
                  const manualValue = getQuickScoreInputValue(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
                  const fallbackValue = column.scoreIndex === 6 ? getQuickSemesterTermAverage(column.semester, column.pageIndex, rowIndex) : (column.scoreIndex === 7 ? getQuickSemesterScoreResult('hkii', column.pageIndex, rowIndex, 7) : '');
                  const draftValue = quickInputDrafts[editKey];
                  const displayValue = draftValue !== undefined ? draftValue : formatScoreDisplayValue(manualValue || fallbackValue);
                  const previousColumn = columnIndex > 0 ? quickVisibleScoreColumnsBySubject[columnIndex - 1] : null;
                  const nextColumn = columnIndex < quickVisibleScoreColumnsBySubject.length - 1 ? quickVisibleScoreColumnsBySubject[columnIndex + 1] : null;
                  const isSubjectStart = !previousColumn || previousColumn.subjectKey !== column.subjectKey;
                  const isSubjectEnd = !nextColumn || nextColumn.subjectKey !== column.subjectKey;
                  const subjectDividerClass = `${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}`;
                  const semesterBgClass = column.semester === 'hki' ? 'bg-amber-50/65' : 'bg-sky-50/65';
                  const scoreTextClass = getQuickScoreTextClass(column.scoreIndex);
                  const columnWidth = getQuickScoreColumnWidth(column.scoreIndex);
                  const isQuizScore = quickQuizScoreKeySet.has(editKey);
                  if (!column.editable) {
                    return (
                      <td key={`teacher-quick-score-${student.id || rowIndex}-${column.id}`} style={{ minWidth: columnWidth, width: columnWidth }} className={`relative border border-slate-300 px-1 py-0.5 text-center ${scoreTextClass} ${semesterBgClass} ${subjectDividerClass}`}>
                        {displayValue}
                        {isQuizScore && <button type="button" title="Điểm từ bài kiểm tra" aria-label="Điểm từ bài kiểm tra" className="absolute right-0 top-0 z-10 h-2.5 w-2.5 rounded-bl-md bg-rose-600" />}
                      </td>
                    );
                  }
                  return (
                    <td key={`teacher-quick-score-${student.id || rowIndex}-${column.id}`} style={{ minWidth: columnWidth, width: columnWidth }} className={`relative border border-slate-300 p-0 ${subjectDividerClass}`}>
                      <input
                        data-quick-score-input="true"
                        data-quick-row={rowIndex}
                        data-quick-col={columnIndex}
                        disabled={!canWriteCurrentSchoolYear}
                        title={!canWriteCurrentSchoolYear ? `Năm học ${currentSchoolYear} đang khóa nhập điểm` : undefined}
                        value={displayValue}
                        onChange={(event) => {
                        const rawDraft = event.target.value;
                        const parsedDraft = parseScoreNumber(rawDraft);
                        const nextDraft = parsedDraft === null ? rawDraft : (parsedDraft > 10 ? '10' : (parsedDraft < 0 ? '0' : rawDraft));
                        setQuickInputDrafts(prev => ({ ...prev, [editKey]: nextDraft }));
                      }} onKeyDown={(event) => handleQuickScoreInputKeyDown(event, rowIndex, columnIndex)} onBlur={async (event) => {
                        const next = event.target.value;
                        const saved = await saveQuickScoreValue(column.semester, column.pageIndex, rowIndex, column.scoreIndex, next);
                        if (saved) {
                          setQuickInputDrafts((prev) => {
                            const nextDrafts = { ...prev };
                            delete nextDrafts[editKey];
                            return nextDrafts;
                          });
                        }
                      }} placeholder="-" className={`w-full h-8 sm:h-6 border-0 px-0.5 text-center text-[16px] sm:text-[11px] outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${scoreTextClass} ${manualValue ? 'bg-violet-50/70' : semesterBgClass} focus:bg-yellow-50`} />
                      {isQuizScore && <button type="button" title="Điểm từ bài kiểm tra" aria-label="Điểm từ bài kiểm tra" className="absolute right-0 top-0 z-10 h-2.5 w-2.5 rounded-bl-md bg-rose-600" />}
                    </td>
                  );
                })}
                <td className="border border-slate-300 px-2 py-0.5 text-center font-black text-slate-700">{getQuickAcademicResult(rowIndex, 'hki')}</td>
                <td className="border border-slate-300 px-2 py-0.5 text-center font-black text-slate-700">{getQuickAcademicResult(rowIndex, 'hkii')}</td>
                <td className="border border-slate-300 px-2 py-0.5 text-center font-black text-slate-700">{getQuickAcademicResult(rowIndex, 'fullYear')}</td>
              </tr>
            ))}
            {!quickSelectedSemesters.length || !quickSelectedSubjects.length ? <tr><td colSpan={4} className="border border-slate-200 px-3 py-4 text-center text-sm font-bold text-slate-500">Hãy chọn ít nhất 1 học kỳ.</td></tr> : null}
            {!quickScoreStudents.length && (
              <tr>
                <td colSpan={1 + quickVisibleScoreColumnsBySubject.length + 3} className="border border-slate-200 px-3 py-4 text-center text-sm font-bold text-slate-500">Chưa có danh sách học sinh khối {quickScoreGrade} cho năm học {currentSchoolYear}.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );

  const pageBackgroundStyle = {
    backgroundColor: '#e0f2fe',
    backgroundImage: `linear-gradient(rgba(255,255,255,0.06), rgba(255,255,255,0.06)), url(${BACKGROUND_URL})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed'
  };
  const hideMainHeaderForWorkspace = !!(
    (showLearningResultsWorkspace && quickScoreLockedContext) ||
    showQuizComposeWorkspace ||
    showQuizWorkWorkspace ||
    showCommonLibraryWorkspace ||
    !!scorebookGrade ||
    showAdminSettingsWorkspace ||
    showClassOps ||
    showQuickQuizPreview ||
    viewingNews ||
    viewingMaterial
  );

  const MainBackground = () => null;

  // --- KẾT THÚC PHẦN 1 - CHUYỂN SANG PHẦN 2 BÊN DƯỚI ---
  // --- UI GIAO DIỆN CHÍNH ---
  // --- UI GIAO DIỆN CHÍNH ---
  if (!role || role === 'admin') {
    return (
      <div className="min-h-screen flex flex-col relative font-sans" style={pageBackgroundStyle}><MainBackground />
        
        {toast.show && (
          <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none flex justify-center">
            <div className={`mt-3 mx-4 px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3 border border-white/20 backdrop-blur-md animate-in slide-in-from-top-4 duration-500 overflow-hidden max-w-lg w-full ${toast.type === 'success' ? 'bg-emerald-500/95 text-white' : 'bg-rose-500/95 text-white'}`}>
              {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" /> : <X className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
              <marquee scrollamount="4" className="text-[11px] sm:text-xs font-black uppercase tracking-widest leading-none pt-0.5 whitespace-nowrap">{toast.message}</marquee>
            </div>
          </div>
        )}

        {confirmModal.show && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 border border-white/20">
              <h3 className="text-xl font-black text-slate-800 mb-4">Xác nhận</h3>
              <p className="text-slate-600 font-bold mb-8 whitespace-pre-wrap">{confirmModal.message}</p>
              <div className="flex space-x-3">
                <button onClick={() => setConfirmModal({ show: false, message: '', onConfirm: null })} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-colors">Hủy</button>
                <button onClick={() => { confirmModal.onConfirm(); setConfirmModal({ show: false, message: '', onConfirm: null }); }} className="flex-1 py-3 bg-rose-600 text-white rounded-2xl font-black shadow-lg hover:bg-rose-700 transition-all">Đồng ý</button>
              </div>
            </div>
          </div>
        )}

        <div className={`flex-1 flex flex-col items-center pt-3 px-4 pb-3 sm:pb-4 relative z-10 w-full mx-auto min-h-0 ${isAdmin ? 'max-w-none' : 'max-w-7xl'}`}>
          <div className="text-center mb-3 sm:mb-6 drop-shadow-lg leading-tight shrink-0">
            <h1 className="text-[13px] sm:text-xl md:text-2xl font-black text-blue-950 uppercase tracking-widest mb-1 sm:mb-2 leading-snug">
                <span className="block sm:inline">TT Học tập cộng đồng</span>
                <span className="hidden sm:inline"> </span>
                <span className="block sm:inline">phường Trung Mỹ Tây</span>
            </h1>
            <h1 className="text-lg sm:text-xl md:text-2xl font-black text-blue-950 uppercase">Trường THCS Nguyễn An Ninh</h1>
          </div>

          {isAdmin && (
              <div className="admin-settings-panel w-full max-w-none mb-6 bg-white/90 p-5 rounded-3xl shadow-xl border border-blue-200 space-y-6">
                  <div className="flex justify-between items-center border-b border-blue-100 pb-3">
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase tracking-widest"><Settings className="w-4 h-4 text-blue-600"/> Quản trị hệ thống</h3>
                      <button onClick={handleLogoutAdmin} className="bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white px-4 py-2 rounded-xl text-xs font-black transition-colors uppercase flex items-center gap-1.5"><X className="w-4 h-4"/> Thoát Quản Trị</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => setShowStudentDatabase(true)}
                      className="min-h-[112px] bg-indigo-50/80 border border-indigo-100 rounded-2xl p-4 text-left flex flex-col justify-between gap-3 hover:bg-indigo-100 transition-colors"
                    >
                      <div>
                        <div className="font-black text-sm text-indigo-900">Mở Database học sinh</div>
                        <div className="text-xs text-indigo-700/70 font-bold mt-0.5 leading-snug">Hồ sơ, mã học sinh, ảnh giấy tờ và phụ huynh</div>
                      </div>
                      {studentProfileRequestCount > 0 && <div className="self-start rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-black text-white">{studentProfileRequestCount} yêu cầu</div>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAttendanceWorkspace(true)}
                      className="min-h-[112px] bg-cyan-50/80 border border-cyan-100 rounded-2xl p-4 text-left flex flex-col justify-between gap-3 hover:bg-cyan-100 transition-colors"
                    >
                      <div>
                        <div className="font-black text-sm text-cyan-900">Mở Điểm danh</div>
                        <div className="text-xs text-cyan-700/70 font-bold mt-0.5 leading-snug">Theo tháng trên máy tính, theo tuần trên điện thoại</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowScheduleWorkspace(true)}
                      className="min-h-[112px] bg-emerald-50/80 border border-emerald-100 rounded-2xl p-4 text-left flex flex-col justify-between gap-3 hover:bg-emerald-100 transition-colors"
                    >
                      <div>
                        <div className="font-black text-sm text-emerald-900">Mở Thời khóa biểu</div>
                        <div className="text-xs text-emerald-700/70 font-bold mt-0.5 leading-snug">Xếp môn học theo lớp và thứ trong tuần</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => openQuickScoreWorkspace({ locked: false })}
                      className="min-h-[112px] bg-violet-50/80 border border-violet-100 rounded-2xl p-4 text-left flex flex-col justify-between gap-3 hover:bg-violet-100 transition-colors"
                    >
                      <div>
                        <div className="font-black text-sm text-violet-900">Mở Kết quả học tập</div>
                        <div className="text-xs text-violet-700/70 font-bold mt-0.5 leading-snug">Sổ điểm và học bạ theo 4 khối</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAdminCheckWorkspace(true)}
                      className="min-h-[112px] bg-amber-50/80 border border-amber-100 rounded-2xl p-4 text-left flex flex-col justify-between gap-3 hover:bg-amber-100 transition-colors"
                    >
                      <div>
                        <div className="font-black text-sm text-amber-900">Mở Kiểm tra</div>
                        <div className="text-xs text-amber-700/70 font-bold mt-0.5 leading-snug">Thống kê up bài và học sinh chưa làm</div>
                      </div>
                    </button>
                      <button
                        type="button"
                        onClick={() => setShowAdminSettingsWorkspace(true)}
                        className="min-h-[112px] bg-blue-50/80 border border-blue-100 rounded-2xl p-4 text-left flex flex-col justify-between gap-3 hover:bg-blue-100 transition-colors"
                      >
                          <div className="mb-3">
                              <div className="font-black text-sm text-blue-900">Mở Cài đặt</div>
                              <div className="text-xs text-blue-700/70 font-bold mt-0.5 leading-snug">Năm học, hiệu trưởng và giáo viên theo lớp</div>
                          </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPasswordWorkspace(true)}
                        className="min-h-[112px] bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left flex flex-col justify-between gap-3 hover:bg-slate-100 transition-colors"
                      >
                        <div>
                          <div className="font-black text-sm text-slate-800">Mở Quản lý mật khẩu</div>
                          <div className="text-xs text-slate-500 font-bold mt-0.5 leading-snug">Giáo viên, admin và mã học sinh</div>
                        </div>
                      </button>
                    <button
                      type="button"
                      onClick={() => setIsAdminTextbookExpanded(!isAdminTextbookExpanded)}
                      className="min-h-[112px] bg-emerald-50/80 border border-emerald-100 rounded-2xl p-4 text-left flex flex-col justify-between gap-3 hover:bg-emerald-100 transition-colors"
                    >
                      <div>
                        <div className="font-black text-sm text-emerald-900">{isAdminTextbookExpanded ? 'Thu gọn Kho Sách Giáo Khoa' : 'Mở Kho Sách Giáo Khoa'}</div>
                        <div className="text-xs text-emerald-700/70 font-bold mt-0.5 leading-snug">Mở nhanh kho Drive SGK để chỉnh sửa file</div>
                      </div>
                    </button>
                  </div>
                  <div className="mt-3">
                     {isAdminTextbookExpanded && (
                         <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 animate-in slide-in-from-top-2">
                             {GRADES.map(g => (
                                <a key={g} href={`https://drive.google.com/drive/folders/${TEXTBOOK_FOLDERS[g]}?usp=drive_link`} target="_blank" rel="noopener noreferrer" className="bg-white border border-emerald-200 p-3 rounded-xl flex flex-col items-center justify-center hover:border-emerald-500 hover:shadow-md transition-all group">
                                   <Folder className="w-6 h-6 text-emerald-400 group-hover:text-emerald-600 mb-1.5 transition-colors" />
                                   <span className="font-black text-emerald-800 text-xs uppercase">SGK Lớp {g}</span>
                                </a>
                             ))}
                         </div>
                     )}
                  </div>
              </div>
          )}

          {isAdmin && showAdminSettingsWorkspace && (
            <Suspense fallback={<div className="fixed inset-0 z-[120] bg-white flex items-center justify-center text-sm font-black text-blue-700">Đang mở cài đặt...</div>}>
              <AdminSettingsWorkspace
                currentSchoolYear={currentSchoolYear}
                schoolYears={SCHOOL_YEARS}
                principalName={principalName}
                inputYearLocks={inputYearLocks}
                transcriptStartDates={transcriptStartDates}
                transcriptEndDates={transcriptEndDates}
                transcriptGrade9EndDates={transcriptGrade9EndDates}
                nanTeachers={nanTeachers}
                classTeacherAssignments={classTeacherAssignments}
                subjects={SUBJECTS}
                grades={GRADES}
                onClose={() => setShowAdminSettingsWorkspace(false)}
                onSaveSetting={updateGlobalSetting}
                showNotification={showNotification}
              />
            </Suspense>
          )}

          {isAdmin && showStudentDatabase && (
            <div className="fixed inset-0 z-[80] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-2 sm:p-3">
              <div className="w-full max-w-none mx-auto">
                <Suspense fallback={<div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-4 text-xs font-black text-indigo-700">Đang mở database học sinh...</div>}>
                  <HocSinhManager
                    students={allStudents}
                    currentSchoolYear={currentSchoolYear}
                    user={user}
                    showNotification={showNotification}
                    onBack={() => setShowStudentDatabase(false)}
                    onOpenAttendance={() => {
                      setShowStudentDatabase(false);
                      setShowAttendanceWorkspace(true);
                    }}
                  />
                </Suspense>
              </div>
            </div>
          )}
          {(isAdmin || quickScoreLockedContext) && showLearningResultsWorkspace && (
            <div className="fixed inset-0 z-[120] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-2 sm:p-3">
              <div className="w-full max-w-none mx-auto space-y-3">
                <div className="sticky top-0 z-10 rounded-3xl border border-violet-100 bg-white/95 px-4 sm:px-6 py-4 shadow-lg backdrop-blur flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-black text-violet-950 text-base sm:text-xl uppercase tracking-tight flex items-center gap-2">
                      <GraduationCap className="w-5 h-5 text-violet-600" /> Kết quả học tập
                    </h3>
                    <div className="text-[10px] sm:text-xs font-bold text-violet-700/70 truncate">Quản lý sổ điểm và học bạ theo khối trong năm học {currentSchoolYear}</div>
                  </div>
                  <button type="button" onClick={() => { setShowLearningResultsWorkspace(false); setQuickScoreLockedContext(null); }} title="Đóng" className="shrink-0 w-11 h-11 rounded-full bg-rose-600 text-white shadow-lg flex items-center justify-center hover:bg-rose-700">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {isAdmin && !quickScoreLockedContext && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <div className="rounded-3xl border border-violet-100 bg-white p-4 sm:p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <FileText className="w-5 h-5 text-violet-600" />
                      <div>
                        <div className="font-black text-violet-950 uppercase">Sổ điểm</div>
                        <div className="text-xs font-bold text-violet-700/70">Mỗi khối một bảng sổ điểm riêng</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {GRADES.map(grade => (
                        <button key={`scorebook-${grade}`} type="button" onClick={() => { setScorebookInitialMode('scorebook'); setScorebookGrade(String(grade)); }} className="min-h-[110px] rounded-2xl border border-violet-100 bg-violet-50 text-violet-800 p-3 flex flex-col items-center justify-center gap-2 hover:bg-violet-600 hover:text-white transition-colors">
                          <FileText className="w-6 h-6" />
                          <span className="text-xs font-black uppercase">Khối {grade}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-blue-100 bg-white p-4 sm:p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="w-5 h-5 text-blue-600" />
                      <div>
                        <div className="font-black text-blue-950 uppercase">Học bạ</div>
                        <div className="text-xs font-bold text-blue-700/70">Mỗi khối một khu học bạ riêng</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {GRADES.map(grade => (
                        <button key={`transcript-${grade}`} type="button" onClick={() => { setScorebookInitialMode('transcript'); setScorebookGrade(String(grade)); }} className="min-h-[110px] rounded-2xl border border-blue-100 bg-blue-50 text-blue-800 p-3 flex flex-col items-center justify-center gap-2 hover:bg-blue-600 hover:text-white transition-colors">
                          <BookOpen className="w-6 h-6" />
                          <span className="text-xs font-black uppercase">Khối {grade}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>}

                <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="font-black text-slate-900 uppercase">Bảng nhập điểm nhanh (liên thông sổ chính)</div>
                      <div className="text-xs font-bold text-slate-500 mt-1">Sửa ở đây sẽ cập nhật vào sổ điểm của khối đã chọn, và ngược lại.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {quickScorebookSavingKey && <div className="text-xs font-black text-emerald-700 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang lưu...</div>}
                      {isAdmin && <button
                        type="button"
                        onClick={fillMissingQuickScores}
                        disabled={!!quickScorebookSavingKey || !quickScoreStudents.length || !canWriteCurrentSchoolYear}
                        className="h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black uppercase text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> {'Cho \u0111i\u1ec3m'}
                      </button>}
                      {isAdmin && <button
                        type="button"
                        onClick={clearVisibleQuickScores}
                        disabled={!!quickScorebookSavingKey || !quickScoreStudents.length || !canWriteCurrentSchoolYear}
                        className="h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black uppercase text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {'X\u00f3a'}
                      </button>}
                      {isAdmin && <button
                        type="button"
                        onClick={() => { setScorebookInitialMode('scorebook'); setScorebookGrade(String(quickScoreGrade)); }}
                        className="h-10 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black uppercase text-violet-700 hover:bg-violet-100"
                      >
                        Mở sổ khối {quickScoreGrade}
                      </button>}
                    </div>
                  </div>

                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  {quickScoreLockedContext && (
                    <div className="flex flex-wrap gap-2">
                      <span className="h-8 rounded-lg border border-violet-200 bg-violet-50 px-3 inline-flex items-center text-[11px] font-black uppercase text-violet-800">Khối {quickScoreLockedContext.grade}</span>
                      <span className="h-8 rounded-lg border border-blue-200 bg-blue-50 px-3 inline-flex items-center text-[11px] font-black uppercase text-blue-800">{quickScoreLockedContext.subjectLabel}</span>
                    </div>
                  )}
                  <div className={`${quickScoreLockedContext ? 'hidden' : 'flex'} flex-wrap gap-2`}>
                    {GRADES.map((grade) => (
                      <button
                        key={`quick-grade-${grade}`}
                        type="button"
                        onClick={() => setQuickScoreGrade(String(grade))}
                        className={`h-9 rounded-lg px-3 text-xs font-black uppercase border transition-colors ${String(quickScoreGrade) === String(grade) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-700'}`}
                      >
                        Khối {grade}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={() => setQuickVisibleSemesters({ hki: !quickVisibleSemesters.hki, hkii: quickVisibleSemesters.hkii })} className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSemesters.hki ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200'}`}>HK1</button>
                    <button type="button" onClick={() => setQuickVisibleSemesters({ hki: quickVisibleSemesters.hki, hkii: !quickVisibleSemesters.hkii })} className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSemesters.hkii ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200'}`}>HK2</button>

                  <div className={`${quickScoreLockedContext ? 'hidden' : 'flex'} flex-wrap gap-2`}>
                    <button
                      type="button"
                      onClick={() => setQuickVisibleSubjects(
                        QUICK_SCORE_SUBJECTS.reduce(
                          (acc, subject) => ({ ...acc, [subject.key]: !allQuickSubjectsVisible }),
                          {}
                        )
                      )}
                      className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black uppercase text-slate-700 hover:border-violet-300"
                    >
                      {allQuickSubjectsVisible ? 'Đóng tất cả môn' : 'Mở tất cả môn'}
                    </button>
                    {QUICK_SCORE_SUBJECTS.map((subject) => (
                      <button
                        key={`quick-subject-toggle-${subject.key}`}
                        type="button"
                        onClick={() => setQuickVisibleSubjects(prev => ({ ...prev, [subject.key]: !prev[subject.key] }))}
                        className={`h-8 rounded-lg border px-3 text-[11px] font-black uppercase ${quickVisibleSubjects[subject.key] ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}
                      >
                        {subject.label}
                      </button>
                    ))}
                  </div>
                  </div>
                  </div>
                  {!canWriteCurrentSchoolYear && (
                    <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase text-rose-700">
                      Năm học {currentSchoolYear} đang khóa nhập điểm
                    </div>
                  )}

                  <div data-quick-score-scope="admin" className="overflow-auto rounded-2xl border border-slate-300">
                    <table className="min-w-max w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-100">
                          <th rowSpan={3} className="sticky left-0 z-[70] min-w-[156px] max-w-[156px] border border-slate-400 bg-slate-100 px-2 py-1 text-left font-black shadow-[4px_0_0_#f8fafc]">Họ và tên</th>
                          {quickSelectedSubjects.map((subject) => (
                            <th key={`quick-subject-${subject.key}`} colSpan={quickSubjectColSpanBySubject[subject.key] || 0} className="border-x-4 border-y-2 border-slate-600 px-1 py-1 text-center font-black">
                              {subject.label}
                            </th>
                          ))}
                          <th rowSpan={3} className="min-w-[56px] border border-slate-400 px-1 py-1 text-center font-black">KQ HK1</th>
                          <th rowSpan={3} className="min-w-[56px] border border-slate-400 px-1 py-1 text-center font-black">KQ HK2</th>
                          <th rowSpan={3} className="min-w-[64px] border border-slate-400 px-1 py-1 text-center font-black">KQ Cả năm</th>
                        </tr>
                        <tr className="bg-slate-50">
                          {quickSelectedSubjects.flatMap((subject) => (
                            quickSelectedSemesters.map((semester, semesterIndex) => {
                              const isSubjectStart = semesterIndex === 0;
                              const isSubjectEnd = semesterIndex === quickSelectedSemesters.length - 1;
                              return (
                              <th
                                key={`quick-semester-head-${subject.key}-${semester.key}`}
                                colSpan={(subject.txCount || 4) + 3 + (semester.key === 'hkii' ? 1 : 0)}
                                className={`border border-slate-300 px-1 py-1 text-center font-black ${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}${semester.key === 'hki' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'}`}
                              >
                                {semester.label}
                              </th>
                              );
                            })
                          ))}
                        </tr>
                        <tr className="bg-slate-50">
                          {quickSelectedSubjects.flatMap((subject) => (
                            quickSelectedSemesters.flatMap((semester, semesterIndex) => {
                              const labels = [
                                ...Array.from({ length: subject.txCount || 4 }, (_, idx) => `TX${idx + 1}`),
                                'GK',
                                'CK',
                                'ĐTB',
                                ...(semester.key === 'hkii' ? ['ĐTBCN'] : [])
                              ];
                              return labels.map((label, labelIndex) => {
                                const isSubjectStart = semesterIndex === 0 && labelIndex === 0;
                                const isSubjectEnd = semesterIndex === quickSelectedSemesters.length - 1 && labelIndex === labels.length - 1;
                                const scoreIndex = label.startsWith('TX') ? Number(label.replace('TX', '')) - 1 : (label === 'GK' ? 4 : (label === 'CK' ? 5 : (label === 'ĐTB' ? 6 : 7)));
                                return (
                                <th
                                  key={`quick-col-head-${subject.key}-${semester.key}-${label}`}
                                  style={{ minWidth: getQuickScoreColumnWidth(scoreIndex), width: getQuickScoreColumnWidth(scoreIndex) }}
                                  className={`border border-slate-300 px-1 py-1 text-center font-black ${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}${semester.key === 'hki' ? 'bg-amber-50' : 'bg-sky-50'}`}
                                >
                                  {label}
                                </th>
                                );
                              });
                            })
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {quickScoreStudents.map((student, rowIndex) => (
                          <tr key={`quick-row-${student.id || rowIndex}`} className={rowIndex % 2 ? 'bg-white' : 'bg-slate-50/30'}>
                            <td className="sticky left-0 z-[60] min-w-[156px] max-w-[156px] border border-slate-300 bg-white px-2 py-1 font-bold whitespace-nowrap overflow-hidden text-ellipsis shadow-[4px_0_0_#ffffff]">{student.fullName || ''}</td>
                            {quickVisibleScoreColumnsBySubject.map((column, columnIndex) => {
                              const editKey = getQuickScoreKey(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
                              const manualValue = getQuickScoreInputValue(column.semester, column.pageIndex, rowIndex, column.scoreIndex);
                              const fallbackValue = column.scoreIndex === 6
                                ? getQuickSemesterTermAverage(column.semester, column.pageIndex, rowIndex)
                                : (column.scoreIndex === 7
                                  ? getQuickSemesterScoreResult('hkii', column.pageIndex, rowIndex, 7)
                                  : '');
                              const draftValue = quickInputDrafts[editKey];
                              const displayValue = draftValue !== undefined ? draftValue : formatScoreDisplayValue(manualValue || fallbackValue);
                              const previousColumn = columnIndex > 0 ? quickVisibleScoreColumnsBySubject[columnIndex - 1] : null;
                              const nextColumn = columnIndex < quickVisibleScoreColumnsBySubject.length - 1 ? quickVisibleScoreColumnsBySubject[columnIndex + 1] : null;
                              const isSubjectStart = !previousColumn || previousColumn.subjectKey !== column.subjectKey;
                              const isSubjectEnd = !nextColumn || nextColumn.subjectKey !== column.subjectKey;
                              const subjectDividerClass = `${isSubjectStart ? 'border-l-4 border-l-slate-600 ' : ''}${isSubjectEnd ? 'border-r-4 border-r-slate-600 ' : ''}`;
                              const semesterBgClass = column.semester === 'hki' ? 'bg-amber-50/65' : 'bg-sky-50/65';
                              const scoreTextClass = getQuickScoreTextClass(column.scoreIndex);
                              const columnWidth = getQuickScoreColumnWidth(column.scoreIndex);
                              const isQuizScore = quickQuizScoreKeySet.has(editKey);
                              if (!column.editable) {
                                return (
                                  <td
                                    key={`quick-score-${student.id || rowIndex}-${column.id}`}
                                    style={{ minWidth: columnWidth, width: columnWidth }}
                                    className={`relative border border-slate-300 px-1 py-0.5 text-center ${scoreTextClass} ${semesterBgClass} ${subjectDividerClass}`}
                                  >
                                    {displayValue}
                                    {isQuizScore && <button type="button" title="Điểm từ bài kiểm tra" aria-label="Điểm từ bài kiểm tra" className="absolute right-0 top-0 z-10 h-2.5 w-2.5 rounded-bl-md bg-rose-600" />}
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={`quick-score-${student.id || rowIndex}-${column.id}`}
                                  style={{ minWidth: columnWidth, width: columnWidth }}
                                  className={`relative border border-slate-300 p-0 ${subjectDividerClass}`}
                                >
                                  <input
                                    data-quick-score-input="true"
                                    data-quick-row={rowIndex}
                                    data-quick-col={columnIndex}
                                    disabled={!canWriteCurrentSchoolYear}
                                    title={!canWriteCurrentSchoolYear ? `Năm học ${currentSchoolYear} đang khóa nhập điểm` : undefined}
                                    value={displayValue}
                                    onChange={(event) => {
                                      const rawDraft = event.target.value;
                                      const parsedDraft = parseScoreNumber(rawDraft);
                                      const nextDraft = parsedDraft === null ? rawDraft : (parsedDraft > 10 ? '10' : (parsedDraft < 0 ? '0' : rawDraft));
                                      setQuickInputDrafts(prev => ({ ...prev, [editKey]: nextDraft }));
                                    }}
                                    onKeyDown={(event) => handleQuickScoreInputKeyDown(event, rowIndex, columnIndex)}
                                    onBlur={async (event) => {
                                      const next = event.target.value;
                                      const saved = await saveQuickScoreValue(column.semester, column.pageIndex, rowIndex, column.scoreIndex, next);
                                      if (saved) {
                                        setQuickInputDrafts((prev) => {
                                          const nextDrafts = { ...prev };
                                          delete nextDrafts[editKey];
                                          return nextDrafts;
                                        });
                                      }
                                    }}
                                    placeholder="-"
                                    className={`w-full h-6 border-0 px-0.5 text-center outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${scoreTextClass} ${manualValue ? 'bg-violet-50/70' : semesterBgClass} focus:bg-yellow-50`}
                                  />
                                  {isQuizScore && <button type="button" title="Điểm từ bài kiểm tra" aria-label="Điểm từ bài kiểm tra" className="absolute right-0 top-0 z-10 h-2.5 w-2.5 rounded-bl-md bg-rose-600" />}
                                </td>
                              );
                            })}
                            <td className="border border-slate-300 px-2 py-0.5 text-center font-black text-slate-700">{getQuickAcademicResult(rowIndex, 'hki')}</td>
                            <td className="border border-slate-300 px-2 py-0.5 text-center font-black text-slate-700">{getQuickAcademicResult(rowIndex, 'hkii')}</td>
                            <td className="border border-slate-300 px-2 py-0.5 text-center font-black text-slate-700">{getQuickAcademicResult(rowIndex, 'fullYear')}</td>
                          </tr>
                        ))}
                        {!quickSelectedSemesters.length || !quickSelectedSubjects.length ? (
                          <tr>
                            <td colSpan={1 + 3} className="border border-slate-200 px-3 py-4 text-center text-sm font-bold text-slate-500">
                              Hãy chọn ít nhất 1 học kỳ và 1 môn để mở bảng nhập điểm.
                            </td>
                          </tr>
                        ) : null}
                        {!quickScoreStudents.length && (
                          <tr>
                            <td colSpan={1 + quickVisibleScoreColumnsBySubject.length + 3} className="border border-slate-200 px-3 py-4 text-center text-sm font-bold text-slate-500">
                              Chưa có danh sách học sinh khối {quickScoreGrade} cho năm học {currentSchoolYear}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
          {isAdmin && scorebookGrade && (
            <Suspense fallback={<div className="fixed inset-0 z-[140] bg-white flex items-center justify-center text-sm font-black text-violet-700">Đang mở sổ điểm...</div>}>
                <ScorebookWorkspace
                grade={scorebookGrade}
                initialMode={scorebookInitialMode}
                currentSchoolYear={currentSchoolYear}
                principalName={principalName}
                transcriptStartDates={transcriptStartDates}
                transcriptEndDates={transcriptEndDates}
                transcriptGrade9EndDates={transcriptGrade9EndDates}
                nanTeachers={nanTeachers}
                classTeacherAssignments={classTeacherAssignments}
                students={allStudents}
                user={user}
                onSaveSetting={updateGlobalSetting}
                onGradeChange={setScorebookGrade}
                onClose={() => setScorebookGrade(null)}
                showNotification={showNotification}
              />
            </Suspense>
          )}
          {isAdmin && showAdminCheckWorkspace && (
            <div className="fixed inset-0 z-[120] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-2 sm:p-3">
              <div className="w-full max-w-none mx-auto space-y-3">
                <div className="sticky top-0 z-10 rounded-3xl border border-amber-100 bg-white/95 px-4 sm:px-6 py-4 shadow-lg backdrop-blur flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-black text-amber-950 text-base sm:text-xl uppercase tracking-tight flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-amber-600" /> Kiểm tra
                    </h3>
                    <div className="text-[10px] sm:text-xs font-bold text-amber-700/70 truncate">Theo dõi tiến độ giáo viên up bài và học sinh làm bài kiểm tra</div>
                  </div>
                  <button type="button" onClick={() => setShowAdminCheckWorkspace(false)} title="Đóng" className="shrink-0 w-11 h-11 rounded-full bg-rose-600 text-white shadow-lg flex items-center justify-center hover:bg-rose-700">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <button type="button" onClick={() => showNotification('Thống kê up bài sẽ được nối dữ liệu ở bước sau.')} className="rounded-3xl border border-amber-100 bg-white p-5 sm:p-6 text-left shadow-sm hover:border-amber-300 hover:shadow-md transition-all">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="font-black text-amber-950 text-lg uppercase">Thống kê up bài</div>
                    <div className="mt-2 text-sm font-bold text-slate-600 leading-relaxed">Sau này dùng để xem giáo viên bài nào chưa up, theo khối, môn và tuần/bài.</div>
                  </button>
                  <button type="button" onClick={() => showNotification('Thống kê học sinh chưa làm bài kiểm tra sẽ được nối dữ liệu ở bước sau.')} className="rounded-3xl border border-rose-100 bg-white p-5 sm:p-6 text-left shadow-sm hover:border-rose-300 hover:shadow-md transition-all">
                    <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center mb-4">
                      <ListChecks className="w-6 h-6" />
                    </div>
                    <div className="font-black text-rose-950 text-lg uppercase">Học sinh chưa làm</div>
                    <div className="mt-2 text-sm font-bold text-slate-600 leading-relaxed">Thống kê học sinh có bài kiểm tra đã phát nhưng chưa làm hoặc chưa nộp.</div>
                  </button>
                </div>
              </div>
            </div>
          )}
          {isAdmin && showPasswordWorkspace && (
            <div className="fixed inset-0 z-[120] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-2 sm:p-3">
              <div className="w-full max-w-none mx-auto space-y-3">
                <div className="sticky top-0 z-10 rounded-3xl border border-slate-200 bg-white/95 px-4 sm:px-6 py-4 shadow-lg backdrop-blur flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-black text-slate-900 text-base sm:text-xl uppercase tracking-tight flex items-center gap-2">
                      <Lock className="w-5 h-5 text-slate-700" /> Quản lý mật khẩu
                    </h3>
                    <div className="text-[10px] sm:text-xs font-bold text-slate-500 truncate">Thiết lập mật khẩu giáo viên, admin và yêu cầu mã học sinh</div>
                  </div>
                  <button type="button" onClick={() => setShowPasswordWorkspace(false)} title="Đóng" className="shrink-0 w-11 h-11 rounded-full bg-rose-600 text-white shadow-lg flex items-center justify-center hover:bg-rose-700">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
                    <div className="flex justify-between items-start gap-3 mb-4">
                      <div>
                        <div className="font-black text-emerald-900 uppercase">Mật khẩu giáo viên</div>
                        <div className="text-xs text-emerald-700/70 font-bold mt-1">Bật để yêu cầu giáo viên nhập mật khẩu</div>
                      </div>
                      <button onClick={() => updateGlobalSetting('isTeacherPassEnabled', !isTeacherPassEnabled)} className={`w-12 h-6 rounded-full transition-colors relative shadow-inner flex-shrink-0 ${isTeacherPassEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-md ${isTeacherPassEnabled ? 'left-7' : 'left-1'}`}></div></button>
                    </div>
                    {isTeacherPassEnabled ? <input type="text" placeholder="Nhập mật khẩu cho giáo viên..." className="w-full bg-white border border-emerald-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500 font-black text-sm shadow-sm" value={teacherPass} onChange={(e) => updateGlobalSetting('teacherPass', e.target.value)} /> : <div className="p-3 text-xs font-bold text-slate-400 bg-slate-50 border border-slate-100 rounded-xl text-center">Đang tắt tính năng hỏi mật khẩu</div>}
                  </div>
                  <div className="rounded-3xl border border-rose-100 bg-white p-5 shadow-sm">
                    <div className="flex justify-between items-start gap-3 mb-4">
                      <div>
                        <div className="font-black text-rose-900 uppercase">Mật khẩu admin</div>
                        <div className="text-xs text-rose-700/70 font-bold mt-1">Bật/tắt cửa quản trị</div>
                      </div>
                      <div className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-[10px] font-black uppercase border border-rose-100">Đã khóa</div>
                    </div>
                    <input type="password" placeholder="Nhập mật khẩu admin..." className="w-full bg-white border border-rose-200 p-3 rounded-xl focus:outline-none focus:border-rose-500 font-black text-sm shadow-sm" value={adminPass} onChange={(e) => updateGlobalSetting('adminPass', e.target.value)} />
                  </div>
                  <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm">
                    <div className="flex justify-between items-start gap-3 mb-4">
                      <div>
                        <div className="font-black text-indigo-900 uppercase">Mã học sinh</div>
                        <div className="text-xs text-indigo-700/70 font-bold mt-1">Bật/tắt yêu cầu nhập mã khi vào học</div>
                      </div>
                      <button onClick={() => updateGlobalSetting('isStudentCodeEnabled', !isStudentCodeEnabled)} className={`w-12 h-6 rounded-full transition-colors relative shadow-inner flex-shrink-0 ${isStudentCodeEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform shadow-md ${isStudentCodeEnabled ? 'left-7' : 'left-1'}`}></div></button>
                    </div>
                    <div className="p-3 text-xs font-bold text-slate-500 bg-slate-50 border border-indigo-100 rounded-xl text-center">{isStudentCodeEnabled ? 'Học sinh phải nhập mã để vào học' : 'Học sinh vào học không cần mã'}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {isAdmin && showScheduleWorkspace && (
            <div className="fixed inset-0 z-[120] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-0">
              <SimpleScheduleTable
                currentSchoolYear={currentSchoolYear}
                subjects={SUBJECTS}
                user={user}
                onClose={() => setShowScheduleWorkspace(false)}
                showNotification={showNotification}
              />
            </div>
          )}
          {isAdmin && showAttendanceWorkspace && (
            <div className="fixed inset-0 z-[120] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-0">
              <ClassOpsManager
                mode="admin"
                initialView="attendance"
                currentSchoolYear={currentSchoolYear}
                user={user}
                students={allStudents}
                subjects={SUBJECTS}
                onClose={() => setShowAttendanceWorkspace(false)}
                onOpenDatabase={() => {
                  setShowAttendanceWorkspace(false);
                  setShowStudentDatabase(true);
                }}
                showNotification={showNotification}
              />
            </div>
          )}
          <div className={`home-panels-wrap w-full ${isAdmin ? 'max-w-none' : 'max-w-6xl'} mb-3 sm:mb-4 flex flex-col min-h-0`}>
              <div className="lg:hidden flex flex-col items-center w-full min-h-0">
                  <div className="bg-white/60 p-1.5 rounded-full mb-3 flex w-[280px] shadow-sm border border-white shrink-0">
                      <button onClick={() => setMobileHomeTab('notifications')} className={`flex-1 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${mobileHomeTab === 'notifications' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-blue-600'}`}>Thông báo</button>
                      <button onClick={() => setMobileHomeTab('news')} className={`flex-1 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${mobileHomeTab === 'news' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-blue-600'}`}>Bản tin</button>
                  </div>
                  
                  {/* Khung được chốt theo viewport để không phình ra sau khi tải thông báo. */}
                  <div className="home-mobile-panel w-full bg-white/40 backdrop-blur-xl rounded-[2rem] border border-white/50 p-1.5 transition-all duration-300 relative overflow-hidden shadow-lg flex flex-col">
                      {mobileHomeTab === 'notifications' ? (
                          <div className="bg-gradient-to-r from-white/90 to-white/60 rounded-[1.75rem] p-4 shadow-inner h-full flex flex-col relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                              <h3 className="font-extrabold text-blue-900 mb-3 flex items-center gap-2 text-sm uppercase"><Bell className="w-5 h-5 animate-pulse text-rose-500" /> Thông Báo Khẩn</h3>
                              <div className="flex-1 overflow-hidden bg-white/60 rounded-2xl p-3 border border-white/50 relative">
                                  <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white/95 to-transparent z-10 pointer-events-none"></div>
                                  <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white/95 to-transparent z-10 pointer-events-none"></div>
                                  {pinnedNewsFeed.length > 0 && (
                                      <div className="relative z-20 mb-3 space-y-2">
                                          {pinnedNewsFeed.map(item => (
                                              <button key={item.id} onClick={() => setViewingNews(item)} className="w-full text-left bg-amber-50/95 border-2 border-amber-200 rounded-2xl p-3 shadow-sm hover:bg-amber-100 transition-all">
                                                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1"><Pin className="w-3.5 h-3.5" fill="currentColor" /> Tin ghim</div>
                                                  <h4 className="font-black text-amber-950 text-sm leading-snug line-clamp-2">{item.title}</h4>
                                              </button>
                                          ))}
                                      </div>
                                  )}
                                  {combinedFeedSorted.length > 0 ? (
                                      <marquee direction="up" scrollamount="2" className="h-full w-full" onMouseOver={(e) => e.currentTarget.stop()} onMouseOut={(e) => e.currentTarget.start()}>
                                          <div className="flex flex-col gap-4 pb-8 pt-2">
                                              {combinedFeedSorted.map(item => (
                                                  <div key={item.id} onClick={() => { if (item.isAuto) { setRole('student'); setLoginRole('student'); setSelectedGrade(item.targetGrade); setSelectedSubject(item.targetSubject); setSelectedLesson(item.targetLesson); window.scrollTo({ top: 0, behavior: 'smooth' }); } else { setViewingNews(item); } }} className={`p-4 rounded-xl shadow-sm border cursor-pointer flex flex-col ${item.isAuto ? (item.iconType === 'quiz' ? 'bg-rose-50/90 border-rose-100' : item.iconType === 'note' ? 'bg-emerald-50/90 border-emerald-100' : 'bg-blue-50/90 border-blue-100') : 'bg-white/90 border-white'}`}>
                                                      <h4 className={`font-extrabold text-sm mb-1.5 leading-snug ${item.isAuto ? (item.iconType === 'quiz' ? 'text-rose-700' : item.iconType === 'note' ? 'text-emerald-700' : 'text-blue-700') : 'text-blue-900'}`}>{item.title}</h4>
                                                      <div className="text-[10px] text-slate-500 font-bold mb-2 pb-2 border-b border-slate-200/60">
                                                          {item.isAuto ? (item.iconType === 'quiz' ? <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 inline mr-1" /> : item.iconType === 'note' ? <BookOpen className="w-3.5 h-3.5 text-emerald-500 inline mr-1" /> : <FileText className="w-3.5 h-3.5 text-blue-500 inline mr-1" />) : <Calendar className="w-3.5 h-3.5 text-blue-400 inline mr-1" />}{new Date(item.timestamp).toLocaleDateString('vi-VN')}
                                                      </div>
                                                      <div className="text-slate-700 text-xs line-clamp-2" dangerouslySetInnerHTML={{ __html: item.content }} />
                                                  </div>
                                              ))}
                                          </div>
                                      </marquee>
                                  ) : pinnedNewsFeed.length === 0 ? <p className="text-center text-[11px] text-slate-500 mt-10 italic">Đang cập nhật...</p> : null}
                              </div>
                          </div>
                      ) : (
                          <div className="bg-gradient-to-l from-white/90 to-white/60 rounded-[1.75rem] p-4 shadow-inner h-full flex flex-col relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                              <div className="flex justify-between items-center mb-3">
                                  <h3 className="font-extrabold text-blue-900 flex items-center gap-2 uppercase text-sm"><Newspaper className="w-5 h-5 text-blue-600" /> Bản Tin</h3>
                                  {isAdmin && <button onClick={() => showAddNews ? closeNewsForm() : openNewsForm()} className="bg-blue-100 text-blue-700 p-1.5 rounded-lg shadow-sm">{showAddNews ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}</button>}
                              </div>
                              {isAdmin && showAddNews ? (
                                  <div className="flex flex-col gap-2 flex-1 overflow-hidden">
                                      <input type="text" placeholder={editingNews ? "Sửa tiêu đề..." : "Tiêu đề..."} className="w-full bg-slate-50 border p-2 rounded-xl text-xs font-bold focus:outline-none" value={newsTitle} onChange={(e) => setNewsTitle(e.target.value)} />
                                      <div className="flex items-center gap-1 bg-white p-1 rounded-xl shadow-sm border border-slate-200 shrink-0">
                                          <button type="button" onMouseDown={e => {e.preventDefault(); document.execCommand('bold')}} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700"><Bold className="w-3.5 h-3.5" /></button>
                                          <button type="button" onMouseDown={e => {e.preventDefault(); document.execCommand('italic')}} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700"><Italic className="w-3.5 h-3.5" /></button>
                                          <div className="w-px h-4 bg-slate-200 mx-1"></div>
                                          <label className="flex items-center justify-center p-1.5 hover:bg-emerald-50 text-emerald-700 rounded-lg cursor-pointer">
                                              <ImageIcon className="w-3.5 h-3.5" />
                                              <input type="file" accept="image/*" onChange={handleNewsImageUpload} className="hidden" />
                                          </label>
                                          <label className="flex items-center justify-center p-1.5 hover:bg-emerald-50 text-emerald-700 rounded-lg cursor-pointer">
                                              <Camera className="w-3.5 h-3.5" />
                                              <input type="file" accept="image/*" capture="environment" onChange={handleNewsImageUpload} className="hidden" />
                                          </label>
                                      </div>
                                      <div className="relative flex-1 bg-slate-50 rounded-xl border overflow-hidden min-h-[120px]">
                                          <div ref={newsContentRef} contentEditable={true} onPaste={handlePasteToNews} data-placeholder="Nhập nội dung (có thể dán ảnh)..." className="rich-editor w-full h-full p-2 focus:outline-none text-xs overflow-y-auto" />
                                      </div>
                                      <button onClick={handleAddNews} disabled={isSubmittingNews} className="w-full bg-blue-600 text-white p-2.5 rounded-xl text-xs font-black shadow-lg flex justify-center items-center gap-2">
                                          {isSubmittingNews ? <><Loader2 className="w-4 h-4 animate-spin"/> Đang gửi...</> : (editingNews ? 'Lưu sửa' : 'Đăng')}
                                      </button>
                                  </div>
                              ) : (
                                  <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                                      {newsList.length === 0 ? <p className="text-center text-[11px] text-slate-400 mt-6">Danh sách trống</p> : newsList.map(n => (
                                          <div key={n.id} onClick={() => setViewingNews(n)} className="bg-white/80 p-3 rounded-xl border border-white/50 shadow-sm cursor-pointer flex justify-between items-center">
                                              <div className="pr-2 flex-1">
                                                  {n.isHot && <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[8px] font-black uppercase text-rose-600"><Sparkles className="w-3 h-3" fill="currentColor" /> Tin nóng</div>}
                                                  <h4 className="font-bold text-slate-800 text-xs line-clamp-2">{n.title}</h4>
                                                  <div className="text-[9px] text-slate-400 mt-1 uppercase font-black">{new Date(n.createdAt).toLocaleDateString('vi-VN')}</div>
                                              </div>
                                              {renderNewsAdminActions(n)}
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              </div>

              {/* Khung được chốt theo viewport để không phình ra sau khi tải thông báo. */}
              <div className="home-desktop-panels hidden lg:grid grid-cols-12 gap-6">
                <div className="home-panel-card col-span-6 bg-white/40 backdrop-blur-xl rounded-[2rem] border border-white/50 p-1.5 h-full">
                  <div className="bg-gradient-to-r from-white/80 to-white/50 rounded-[1.75rem] p-5 border border-white/40 shadow-inner flex flex-col h-full relative overflow-hidden">
                    <h3 className="font-extrabold text-blue-900 mb-4 flex items-center gap-2 text-sm uppercase font-black"><Bell className="w-5 h-5 animate-pulse text-rose-500" /> Thông Báo Khẩn</h3>
                    <div className="flex-1 overflow-hidden bg-white/50 rounded-2xl p-4 border border-white/40 relative">
                      <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-white/95 to-transparent z-10 pointer-events-none"></div><div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white/95 to-transparent z-10 pointer-events-none"></div>
                      {pinnedNewsFeed.length > 0 && (
                        <div className="relative z-20 mb-4 space-y-3">
                          {pinnedNewsFeed.map(item => (
                            <button key={item.id} onClick={() => setViewingNews(item)} className="w-full text-left bg-amber-50/95 border-2 border-amber-200 rounded-2xl p-4 shadow-sm hover:bg-amber-100 hover:shadow-md transition-all">
                              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2"><Pin className="w-4 h-4" fill="currentColor" /> Tin ghim</div>
                              <h4 className="font-black text-amber-950 text-base leading-snug line-clamp-2">{item.title}</h4>
                            </button>
                          ))}
                        </div>
                      )}
                      {combinedFeedSorted.length > 0 ? (
                        <marquee direction="up" scrollamount="2" className="h-full w-full" onMouseOver={(e) => e.currentTarget.stop()} onMouseOut={(e) => e.currentTarget.start()}>
                          <div className="flex flex-col gap-6 pb-8 pt-4">{combinedFeedSorted.map(item => (<div key={item.id} onClick={() => { if (item.isAuto) { setRole('student'); setLoginRole('student'); setSelectedGrade(item.targetGrade); setSelectedSubject(item.targetSubject); setSelectedLesson(item.targetLesson); window.scrollTo({ top: 0, behavior: 'smooth' }); } else { setViewingNews(item); } }} className={`p-5 rounded-2xl shadow-sm border cursor-pointer flex flex-col ${item.isAuto ? (item.iconType === 'quiz' ? 'bg-rose-50/90 border-rose-100 hover:bg-rose-50' : item.iconType === 'note' ? 'bg-emerald-50/90 border-emerald-100 hover:bg-emerald-50' : 'bg-blue-50/90 border-blue-100 hover:bg-blue-50') : 'bg-white/90 border-white hover:bg-white'}`}><h4 className={`font-extrabold text-lg mb-2 leading-snug transition-colors ${item.isAuto ? (item.iconType === 'quiz' ? 'text-rose-700 group-hover:text-rose-900' : item.iconType === 'note' ? 'text-emerald-700 group-hover:text-emerald-900' : 'text-blue-700 group-hover:text-blue-900') : 'text-blue-900 group-hover:text-blue-600'}`}>{item.title}</h4><div className="text-xs text-slate-500 font-bold mb-3 pb-3 border-b border-slate-200/60">{item.isAuto ? (item.iconType === 'quiz' ? <CheckCircle2 className="w-4 h-4 text-rose-500 inline mr-1" /> : item.iconType === 'note' ? <BookOpen className="w-4 h-4 text-emerald-500 inline mr-1" /> : <FileText className="w-4 h-4 text-blue-500 inline mr-1" />) : <Calendar className="w-4 h-4 text-blue-400 inline mr-1" />}{new Date(item.timestamp).toLocaleDateString('vi-VN')}</div><div className="text-slate-700 text-sm line-clamp-2" dangerouslySetInnerHTML={{ __html: item.content }} /></div>))}</div>
                        </marquee>
                      ) : pinnedNewsFeed.length === 0 ? <p className="text-center text-sm text-slate-500 mt-10 italic">Đang cập nhật bản tin mới nhất...</p> : null}
                    </div>
                  </div>
                </div>
                <div className="home-panel-card col-span-6 bg-white/40 backdrop-blur-xl rounded-[2rem] border border-white/50 p-1.5 h-full">
                  <div className="bg-gradient-to-l from-white/80 to-white/50 rounded-[1.75rem] p-5 border border-white/40 shadow-inner flex flex-col h-full overflow-hidden">
                    <div className="flex justify-between items-center mb-4 pl-2"><h3 className="font-extrabold text-blue-900 flex items-center gap-2 uppercase text-sm font-black"><Newspaper className="w-5 h-5 text-blue-600" /> Bản Tin & Sự Kiện</h3>{isAdmin && <button onClick={() => showAddNews ? closeNewsForm() : openNewsForm()} className="bg-blue-100 text-blue-700 p-1.5 rounded-lg shadow-sm">{showAddNews ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}</button>}</div>
                    {isAdmin && showAddNews ? (
                      <div className="flex flex-col gap-3 flex-1 overflow-hidden animate-in fade-in duration-300">
                          <input type="text" placeholder={editingNews ? "Sửa tiêu đề tin tức..." : "Tiêu đề tin tức..."} className="w-full bg-slate-50 border p-3 rounded-xl text-base font-bold focus:outline-none focus:border-blue-400" value={newsTitle} onChange={(e) => setNewsTitle(e.target.value)} />
                          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 shrink-0">
                              <button type="button" onMouseDown={e => {e.preventDefault(); document.execCommand('bold')}} className="p-2 hover:bg-slate-100 rounded-lg text-slate-700"><Bold className="w-4 h-4" /></button>
                              <button type="button" onMouseDown={e => {e.preventDefault(); document.execCommand('italic')}} className="p-2 hover:bg-slate-100 rounded-lg text-slate-700"><Italic className="w-4 h-4" /></button>
                              <div className="w-px h-5 bg-slate-200 mx-1"></div>
                              <label className="flex items-center gap-1 p-2 hover:bg-emerald-50 text-emerald-700 rounded-lg cursor-pointer font-bold text-xs">
                                  <ImageIcon className="w-4 h-4" /> Tải ảnh
                                  <input type="file" accept="image/*" onChange={handleNewsImageUpload} className="hidden" />
                              </label>
                              <label className="flex items-center gap-1 p-2 hover:bg-emerald-50 text-emerald-700 rounded-lg cursor-pointer font-bold text-xs">
                                  <Camera className="w-4 h-4" /> Chụp
                                  <input type="file" accept="image/*" capture="environment" onChange={handleNewsImageUpload} className="hidden" />
                              </label>
                          </div>
                          <div className="relative flex-1 bg-slate-50 rounded-xl border overflow-hidden min-h-[150px]">
                              <div ref={newsContentRef} contentEditable={true} onPaste={handlePasteToNews} data-placeholder="Nhập nội dung (có thể dán ảnh)..." className="rich-editor w-full h-full p-4 focus:outline-none text-sm overflow-y-auto" />
                          </div>
                          <button onClick={handleAddNews} disabled={isSubmittingNews} className="w-full bg-blue-600 text-white p-3 rounded-xl text-base font-black shadow-lg hover:bg-blue-700 transition-all flex justify-center items-center gap-2">
                              {isSubmittingNews ? <><Loader2 className="w-5 h-5 animate-spin"/> Đang gửi...</> : (editingNews ? 'Lưu bản tin' : 'Đăng tin ngay')}
                          </button>
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin">
                        {newsList.length === 0 ? <p className="text-center text-sm text-slate-400 mt-10">Danh sách trống</p> : newsList.map(n => (
                          <div key={n.id} onClick={() => setViewingNews(n)} className="bg-white/70 p-4 rounded-2xl border border-white/50 shadow-sm cursor-pointer flex justify-between items-center hover:bg-white group transition-all">
                              <div className="pr-3 flex-1">
                                  {n.isHot && <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-rose-600"><Sparkles className="w-3.5 h-3.5" fill="currentColor" /> Tin nóng</div>}
                                  <h4 className="font-bold text-slate-800 text-sm line-clamp-2 group-hover:text-blue-600">{n.title}</h4>
                                  <div className="text-[10px] text-slate-400 mt-2 uppercase font-black tracking-widest">{new Date(n.createdAt).toLocaleDateString('vi-VN')}</div>
                              </div>
                              {renderNewsAdminActions(n)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
          </div>

          <div className="home-role-actions w-full max-w-md mx-auto px-2 relative z-20 shrink-0 pb-1 sm:pb-2 mt-2 sm:mt-3">
            {!isAdmin && (
              <div className="flex flex-col gap-2 sm:gap-3">
                  <div className="flex flex-row gap-2 sm:gap-4 justify-center">
                    <button onClick={() => { if (isStudentCodeEnabled) { setShowStudentAccessModal(true); setStudentForgotMode(false); setStudentFoundCode(''); } else { setRole('student'); setLoginRole('student'); } }} className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 bg-blue-600 text-white py-3 px-2 rounded-[1rem] sm:rounded-2xl font-black shadow-lg transition-all active:scale-95">
                       <User className="w-4 h-4 sm:w-5 sm:h-5" />
                       <span className="text-[11px] sm:text-sm uppercase tracking-wider whitespace-nowrap">Tôi là Học sinh</span>
                    </button>
                    <button onClick={openTeacherLogin} className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 py-3 px-2 rounded-[1rem] sm:rounded-2xl font-black shadow-md transition-all active:scale-95">
                       <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
                       <span className="text-[11px] sm:text-sm uppercase tracking-wider whitespace-nowrap">Tôi là Giáo viên</span>
                    </button>
                  </div>
                  <div className="flex justify-center">
                      <button onClick={() => { setModalMode('admin'); setShowPasswordModal(true); }} className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black uppercase text-slate-400 bg-white/40 px-4 py-2 rounded-full border border-slate-200/60 hover:bg-white hover:text-slate-600 transition-all backdrop-blur-sm"><Settings className="w-3.5 h-3.5" /> Quản trị</button>
                  </div>
              </div>
            )}
          </div>
        </div>
        
        {showPasswordModal && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300"><div className="bg-white rounded-[2.5rem] shadow-2xl max-w-sm w-full p-10 border border-white/20"><div className="flex items-center space-x-3 mb-8"><div className="bg-slate-100 p-3.5 rounded-full"><Lock className="w-6 h-6 text-slate-800" /></div><h3 className="text-2xl font-black text-slate-800">{modalMode === 'admin' ? 'Hệ thống Quản trị' : 'Xác thực Giáo viên'}</h3></div><input type="password" placeholder="Nhập mật khẩu truy cập..." className="w-full border-2 border-slate-200 rounded-2xl p-5 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 mb-4 text-lg font-black tracking-widest text-center" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />{errorMsg && <p className="text-rose-500 text-sm mb-6 font-black text-center">{errorMsg}</p>}<div className="flex space-x-3"><button onClick={() => { setShowPasswordModal(false); setErrorMsg(''); }} className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-colors">Hủy bỏ</button><button onClick={handleLogin} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all">Đăng nhập</button></div></div></div>}
        {showStudentAccessModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-5 sm:p-7 border border-white/20">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 p-3 rounded-2xl"><User className="w-6 h-6 text-blue-600" /></div>
                  <div><h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase">Vào học</h3><p className="text-[11px] font-bold text-slate-500 leading-tight">Mã học sinh đã có sẵn chữ HS, em chỉ nhập số phía sau.</p></div>
                </div>
                <button type="button" onClick={() => setShowStudentAccessModal(false)} className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><X className="w-5 h-5" /></button>
              </div>
              {!studentForgotMode ? (
                <div className="space-y-3">
                  <div className="flex items-stretch rounded-2xl border-2 border-blue-100 bg-white overflow-hidden focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-50">
                    <div className="px-4 flex items-center justify-center bg-blue-50 text-blue-700 font-black text-lg tracking-widest border-r border-blue-100">HS</div>
                    <input value={studentAccessCode} onChange={(e) => setStudentAccessCode(normalizeStudentAccessSuffix(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && handleStudentCodeLogin()} inputMode="numeric" placeholder="VD: 22601" className="min-w-0 flex-1 p-4 focus:outline-none text-lg font-black tracking-widest text-center text-slate-800" />
                  </div>
                  <button type="button" onClick={handleStudentCodeLogin} className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all">Vào học</button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setStudentForgotMode(true); setStudentFoundCode(''); }} className="py-2.5 text-[11px] font-black uppercase text-slate-500 hover:text-blue-600">Quên mã?</button>
                    <button type="button" onClick={() => window.open('https://script.google.com/macros/s/AKfycby6e5ya2k105Oe7i65k9viysIZbHKOF-9CosueiNy1GvnHJbVw1lHB_0eezSxO91ls/exec', '_blank', 'noopener,noreferrer')} className="py-2.5 text-[11px] font-black uppercase text-emerald-600 hover:text-emerald-700">Đăng ký mới</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input value={studentForgotName} onChange={(e) => setStudentForgotName(e.target.value)} placeholder="Nhập họ tên có dấu hoặc không dấu" className="w-full border border-slate-200 rounded-2xl p-4 focus:outline-none focus:border-blue-400 text-sm font-bold" />
                  <input value={studentForgotVerify} onChange={(e) => setStudentForgotVerify(e.target.value.replace(/\D/g, '').slice(0, 2))} onKeyDown={(e) => e.key === 'Enter' && handleFindStudentCode()} placeholder="2 số cuối mã định danh, nếu không có thì dùng ngày sinh" className="w-full border border-slate-200 rounded-2xl p-4 focus:outline-none focus:border-blue-400 text-sm font-bold text-center tracking-widest" />
                  <button type="button" onClick={handleFindStudentCode} className="w-full py-3 bg-blue-600 text-white rounded-2xl font-black shadow-md">Tìm mã</button>
                  {studentFoundCode && <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3 text-center"><div className="text-[10px] font-black uppercase text-emerald-700 mb-1">Mã học sinh của em</div><div className="text-xl font-black text-emerald-900 tracking-widest">{studentFoundCode}</div>{!studentFoundCode.includes(',') && <button type="button" onClick={handleStudentCodeLogin} className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase">Dùng mã này vào học</button>}</div>}
                  <button type="button" onClick={() => setStudentForgotMode(false)} className="w-full py-2.5 text-xs font-black uppercase text-slate-500 hover:text-blue-600">Quay lại nhập mã</button>
                </div>
              )}
            </div>
          </div>
        )}
        {viewingNews && <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-2 sm:p-5 z-50 animate-in zoom-in-95 duration-200"><div className="bg-white rounded-[1.75rem] sm:rounded-[3rem] shadow-2xl w-full max-w-[1200px] max-h-[94vh] flex flex-col overflow-hidden border border-white/20"><div className="px-5 sm:px-8 py-4 sm:py-6 border-b flex justify-between items-center bg-slate-50/50"><div className="pr-4"><div className="flex flex-wrap items-center gap-2 mb-1">{viewingNews.isHot && <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-rose-600"><Sparkles className="w-3.5 h-3.5" fill="currentColor" /> Tin nóng</span>}<h3 className="text-xl sm:text-2xl font-black text-slate-800 leading-tight">{viewingNews.title}</h3></div><div className="flex items-center gap-2 text-[10px] text-slate-400 font-black uppercase tracking-widest"><Calendar className="w-3.5 h-3.5" /> {new Date(viewingNews.createdAt).toLocaleString('vi-VN')}</div></div><div className="flex items-center gap-2">{isAdmin && <button onClick={(e) => handleEditNews(e, viewingNews)} className="p-3 bg-white shadow-md border rounded-full text-blue-600 hover:bg-blue-600 hover:text-white transition-all" title="Sửa bản tin"><Pencil className="w-5 h-5" /></button>}<button onClick={() => setViewingNews(null)} className="p-3 bg-white shadow-md border rounded-full hover:bg-rose-500 hover:text-white transition-all"><X className="w-5 h-5" /></button></div></div><div className="p-4 sm:p-8 md:p-10 overflow-y-auto flex-1 bg-white student-content"><div dangerouslySetInnerHTML={{ __html: viewingNews.content }} /></div></div></div>}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col text-slate-800 font-sans relative" style={pageBackgroundStyle}><MainBackground />
      <style>{`
        .rich-editor { min-height: 150px; outline: none; }
        .rich-editor:empty:before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; display: block; }
        .rich-editor img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; border: 1px solid #e2e8f0; }
        .student-content img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; border: 1px solid #e2e8f0; }
        .announce-content img { max-height: 200px; width: auto; display: inline-block; margin: 0 15px; border-radius: 12px; vertical-align: middle; }
        .news-content-display img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; border: 1px solid #e2e8f0; }
        .news-content-display p { margin-bottom: 8px; }
        .ai-response-content p { margin-bottom: 8px; line-height: 1.6; }
        .ai-response-content strong { color: #1e3a8a; }
        .student-content mjx-container, .teacher-content mjx-container, .ai-response-content mjx-container { font-size: 112% !important; overflow-x: auto; overflow-y: hidden; max-width: 100%; }
        .student-content mjx-container[display="true"], .teacher-content mjx-container[display="true"], .ai-response-content mjx-container[display="true"] { padding: 0.75rem 0; }
        .student-content mjx-container[jax="CHTML"] { line-height: 1.25; }
        .student-content .teacher-only { display: none !important; }
        .student-content .ai-suggestion-title { display: none !important; }
        .rich-editor .teacher-only, .teacher-content .teacher-only { display: block; background-color: #fff1f2; padding: 25px 15px 15px 15px; border-radius: 8px; border: 2px dashed #f43f5e; margin-top: 20px; position: relative; }
        .rich-editor .teacher-only::before, .teacher-content .teacher-only::before { content: "CHỈ GIÁO VIÊN THẤY (ĐÁP ÁN BỊ ẨN VỚI HỌC SINH)"; position: absolute; top: -12px; left: 15px; background: #f43f5e; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 900; }
      `}</style>

      {showClassOps && role === 'student' && activeStudentProfile?.isClassLeader && (
        <div className="fixed inset-0 z-[120] bg-slate-100/95 backdrop-blur-md overflow-y-auto p-2 sm:p-4">
          <Suspense fallback={<div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-black text-emerald-700">Đang mở điểm danh...</div>}>
            <ClassOpsManager
              mode="monitor"
              currentSchoolYear={currentSchoolYear}
              user={user}
              students={allStudents}
              currentStudent={activeStudentProfile}
              subjects={SUBJECTS}
              onClose={() => setShowClassOps(false)}
              showNotification={showNotification}
            />
          </Suspense>
        </div>
      )}

      {showStudentProfileModal && activeStudentProfile?.id && (
        <div className="fixed inset-0 z-[115] bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col border border-white/20">
            <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-slate-900 uppercase truncate">Hồ sơ học sinh</h3>
                  {activeStudentPendingProfileRequests.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">
                      <Clock className="w-3.5 h-3.5" /> Chờ duyệt
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-bold">Em gửi yêu cầu sửa, admin duyệt xong mới cập nhật hồ sơ chính.</p>
              </div>
              <button type="button" onClick={() => setShowStudentProfileModal(false)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ['Mã học sinh', activeStudentProfile.accessCode || ''],
                  ['Lớp', activeStudentProfile.className || ''],
                  ['Năm học', activeStudentProfile.schoolYear || currentSchoolYear],
                  ['Tình trạng', activeStudentProfile.status === 'dropped' ? 'Bỏ học' : 'Đang học']
                ].map(([label, value]) => (
                  <label key={label} className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase text-slate-400">{label}</span>
                    <input value={value} readOnly className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black text-slate-500" />
                  </label>
                ))}
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                {activeStudentPendingProfileRequests.length > 0
                  ? `Các mục đang chờ admin duyệt${activeStudentPendingProfileFieldLabels.length ? `: ${activeStudentPendingProfileFieldLabels.join(', ')}` : ''}. Em vẫn có thể sửa lại hoặc bổ sung mục khác rồi bấm cập nhật.`
                  : 'Học sinh sửa thông tin rồi gửi yêu cầu. Admin duyệt xong hồ sơ chính mới thay đổi.'}
              </div>

              <datalist id="student-profile-province-options">
                {derivedProvinceOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              <datalist id="student-profile-current-ward-options">
                {currentWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              <datalist id="student-profile-household-ward-options">
                {householdWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {STUDENT_PROFILE_EDIT_FIELDS.map(field => {
                  const isFieldPending = activeStudentPendingProfileFieldKeys.has(field.key);
                  const listId = field.key === 'province' || field.key === 'householdProvince'
                    ? 'student-profile-province-options'
                    : field.key === 'ward'
                      ? 'student-profile-current-ward-options'
                      : field.key === 'householdWard'
                        ? 'student-profile-household-ward-options'
                        : undefined;
                  const placeholder = field.key === 'birthDate'
                    ? 'dd/mm/yyyy'
                    : field.key === 'identityCode'
                      ? '12 số hoặc bé chưa có'
                      : (field.key === 'ward' || field.key === 'householdWard')
                        ? 'Chọn tỉnh trước, rồi gõ/chọn phường xã'
                        : '';
                  return (
                    <label key={field.key} className="flex flex-col gap-1">
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400">
                        {field.label}
                        {isFieldPending && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] text-amber-700">Chờ duyệt</span>}
                      </span>
                      <input
                        value={studentProfileDraft[field.key] || ''}
                        list={listId}
                        placeholder={placeholder}
                        onChange={(event) => handleStudentProfileFieldChange(field.key, event.target.value)}
                        className={`rounded-2xl border px-3 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400 ${isFieldPending ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
                      />
                    </label>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600">
                  <ImageIcon className="w-4 h-4 text-blue-600" /> Ảnh hồ sơ và giấy tờ
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {STUDENT_PROFILE_IMAGE_FIELDS.map(field => {
                    const isFieldPending = activeStudentPendingProfileFieldKeys.has(field.key);
                    const currentUrl = activeStudentPendingProfileChanges[field.key] || activeStudentProfile[field.key] || '';
                    const previewValue = studentProfileImagePreviews[field.key];
                    const previewUrls = Array.isArray(previewValue) ? previewValue : (previewValue ? [previewValue] : []);
                    const previewUrl = previewUrls[0] || getStudentProfileImageUrl(currentUrl);
                    const embedUrl = previewUrls.length ? '' : getStudentProfileEmbedUrl(currentUrl);
                    const originalUrl = firstProfileDocumentUrl(currentUrl);
                    const selectedFiles = Array.isArray(studentProfileImages[field.key])
                      ? studentProfileImages[field.key]
                      : (studentProfileImages[field.key] ? [studentProfileImages[field.key]] : []);
                    const selectedFile = selectedFiles[0];
                    const canAddMoreImages = field.key === 'transcriptUrl';
                    return (
                      <div key={field.key} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase text-slate-500">
                          {field.label}
                          {isFieldPending && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] text-amber-700">Chờ duyệt</span>}
                        </div>
                        <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                          {embedUrl ? (
                            <iframe title={field.label} src={embedUrl} className="w-full h-full border-0 bg-white" loading="lazy" />
                          ) : previewUrl ? (
                            <img src={previewUrl} alt={field.label} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-center px-3 text-[11px] font-bold text-slate-400">
                              Chưa có ảnh
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <label className={`flex-1 cursor-pointer rounded-xl px-3 py-2 text-center text-[10px] font-black uppercase text-white shadow-sm ${isFieldPending ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {selectedFile ? 'Đổi ảnh' : 'Chọn ảnh'}
                            <input
                              type="file"
                              accept="image/*"
                              multiple={canAddMoreImages}
                              onChange={(event) => {
                                if (canAddMoreImages) {
                                  applyStudentProfileImageFiles(field.key, event.target.files, false);
                                } else {
                                  handleStudentProfileImageChange(field.key, event.target.files?.[0] || null, field.label);
                                }
                                event.target.value = null;
                              }}
                              className="hidden"
                            />
                          </label>
                          {canAddMoreImages && selectedFiles.length > 0 && (
                            <label className={`cursor-pointer rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${isFieldPending ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                              Thêm ảnh
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(event) => { applyStudentProfileImageFiles(field.key, event.target.files, true); event.target.value = null; }}
                                className="hidden"
                              />
                            </label>
                          )}
                          {originalUrl && (
                            <a href={originalUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:text-blue-600">
                              Mở
                            </a>
                          )}
                        </div>
                        {selectedFile && (
                          <div className="mt-2 truncate text-[10px] font-bold text-emerald-700">
                            {selectedFiles.length > 1 ? `Đã chọn: ${selectedFiles.length} ảnh, sẽ tự ghép khi gửi` : `Đã chọn: ${selectedFile.name}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-white flex flex-col sm:flex-row justify-end gap-2">
              <button type="button" onClick={() => setShowStudentProfileModal(false)} className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-700 font-black">Hủy</button>
              <button type="button" onClick={submitStudentProfileRequest} disabled={isSubmittingProfileRequest} className="px-5 py-3 rounded-2xl bg-blue-600 text-white font-black shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
                {isSubmittingProfileRequest ? 'Đang gửi...' : (activeStudentPendingProfileRequests.length > 0 ? 'Cập nhật yêu cầu chờ duyệt' : 'Gửi yêu cầu sửa')}
              </button>
            </div>
              </div>
            </div>
          )}

          {role === 'teacher' && showQuizComposeWorkspace && (
            <div className="fixed inset-0 z-[80] bg-slate-100 overflow-y-auto p-2 sm:p-3">
              <div className="w-full max-w-none mx-auto space-y-3 sm:space-y-4">
                <div className="sticky top-0 z-10 rounded-3xl border border-emerald-100 bg-white/95 px-3 sm:px-5 py-3 sm:py-4 shadow-lg backdrop-blur flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button type="button" onClick={() => { refreshQuizHtmlFromEditors(); setShowQuizComposeWorkspace(false); }} className="h-11 px-3 sm:px-4 rounded-2xl bg-slate-100 text-slate-700 border border-slate-200 text-xs font-black uppercase flex items-center gap-2 hover:bg-slate-200">
                      <ChevronLeft className="w-4 h-4" /> Quay lại
                    </button>
                    <div className="min-w-0">
                      <h3 className="font-black text-emerald-900 text-base sm:text-xl uppercase tracking-tight flex items-center gap-2"><Pencil className="w-5 h-5" /> Bảng soạn đề</h3>
                      <div className="text-[10px] sm:text-xs font-bold text-emerald-700/70 truncate">Soạn đề, đáp án và biểu điểm trong một trang riêng rộng rãi</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setShowQuizToolbar(prev => !prev)} className="h-10 px-3 bg-slate-100 text-slate-700 rounded-xl font-black text-[10px] sm:text-xs uppercase border border-slate-200">{showQuizToolbar ? '\u1ea8n c\u00f4ng c\u1ee5' : 'C\u00f4ng c\u1ee5'}</button>
                  </div>
                </div>

                <div className="rounded-3xl border border-emerald-100 bg-white shadow-xl p-3 sm:p-5 space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button type="button" onClick={() => setShowQuizArchive(prev => !prev)} className={(showQuizArchive ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-700 border-amber-200') + ' h-11 px-3 rounded-xl font-black text-[10px] sm:text-xs uppercase border shadow-sm flex items-center justify-center gap-2 text-center leading-tight'}><Copy className="w-3.5 h-3.5" /><span>Kho đề</span></button>
                    <button type="button" onClick={handleOpenAiModal} className="h-11 bg-indigo-600 text-white px-3 rounded-xl text-[10px] sm:text-xs font-black shadow-md flex items-center justify-center gap-2 uppercase text-center leading-tight"><Sparkles className="w-3.5 h-3.5" /> <span>Tạo đề tự động</span></button>
                    <button type="button" onClick={handleClearQuiz} disabled={isSavingQuiz} className="h-11 bg-white text-slate-600 border border-slate-200 px-3 rounded-xl text-[10px] sm:text-xs font-black shadow-sm flex items-center justify-center gap-2 uppercase text-center leading-tight hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /> <span>Xóa hết</span></button>
                  </div>

                  {showQuizArchive && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-3 sm:p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-black text-amber-900 text-xs uppercase">Kho đề đã lưu</div>
                        {previousQuizId && <button type="button" onClick={handleLoadPreviousQuiz} className="px-3 py-2 rounded-xl bg-white text-amber-700 border border-amber-200 text-[10px] font-black uppercase">Lấy đề năm trước</button>}
                      </div>
                      {savedQuizArchive.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-amber-200 bg-white p-4 text-center text-xs font-bold text-slate-500">Chưa có đề nào trong kho cho khối/môn/năm học này.</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                          {savedQuizArchive.map(item => (
                            <button key={item.id} type="button" onClick={() => loadQuizFromArchive(item)} className="rounded-xl border border-amber-100 bg-white px-3 py-2 text-left hover:border-amber-300 hover:bg-amber-50 transition-colors">
                              <div className="font-black text-slate-800 text-xs uppercase truncate">{item.title || `${item.subject} ${item.grade} - ${getWeekDisplayName(item.lesson)}`}</div>
                              <div className="mt-1 text-[10px] font-bold text-slate-500">{item.schoolYear || currentSchoolYear} • {getWeekDisplayName(item.lesson)} • {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('vi-VN') : 'Chưa rõ ngày'}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {showQuizToolbar && <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1.5 rounded-2xl shadow-sm border border-slate-200"><button onMouseDown={e => {e.preventDefault(); document.execCommand('bold')}} className="p-2 hover:bg-white rounded-xl text-slate-700"><Bold className="w-4 h-4" /></button><button onMouseDown={e => {e.preventDefault(); document.execCommand('italic')}} className="p-2 hover:bg-white rounded-xl text-slate-700"><Italic className="w-4 h-4" /></button><button onMouseDown={e => {e.preventDefault(); document.execCommand('underline')}} className="p-2 hover:bg-white rounded-xl text-slate-700"><Underline className="w-4 h-4" /></button><button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyLeft')}} className="p-2 hover:bg-white rounded-xl text-slate-700"><AlignLeft className="w-4 h-4" /></button><button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyCenter')}} className="p-2 hover:bg-white rounded-xl text-slate-700"><AlignCenter className="w-4 h-4" /></button><button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyRight')}} className="p-2 hover:bg-white rounded-xl text-slate-700"><AlignRight className="w-4 h-4" /></button><button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#dc2626')}} className="w-4 h-4 rounded-full bg-red-600 border border-red-700"></button><button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#2563eb')}} className="w-4 h-4 rounded-full bg-blue-600 border border-blue-700"></button><button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#16a34a')}} className="w-4 h-4 rounded-full bg-green-600 border border-green-700"></button><label className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-black text-[10px] uppercase cursor-pointer"><ImageIcon className="w-4 h-4" /> {'Ch\u00e8n \u1ea3nh'}<input type="file" accept="image/*" onChange={handleQuizImageUpload} className="hidden" /></label></div>}

                  <div>
                    <div>
                      <div className="mb-2 text-[10px] sm:text-xs font-black uppercase text-emerald-700">Dán / soạn đề</div>
                      <div ref={quizEditorRef} contentEditable={true} onInput={handleQuizEditorInput} onPaste={handleQuizPaste} onClick={(e) => handleEditorImageClick(e, 'quiz')} data-placeholder={'Dán hoặc soạn đề tại đây...'} className="quiz-editor quiz-editor-viewport rich-editor p-4 sm:p-7 text-base sm:text-lg leading-relaxed focus:outline-none overflow-y-auto border border-emerald-100 rounded-2xl bg-white shadow-inner" />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] sm:text-xs font-black uppercase text-rose-700">Đáp án và biểu điểm</span>
                      <button type="button" onClick={() => handleGenerateQuizAnswer()} disabled={isGeneratingQuizAnswer} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-black uppercase flex items-center gap-1.5 disabled:opacity-50">
                        {isGeneratingQuizAnswer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Tạo đáp án bằng AI
                      </button>
                    </div>
                    <div ref={quizAnswerEditorRef} contentEditable={true} onInput={handleQuizAnswerInput} onPaste={handleQuizAnswerPaste} data-placeholder={'Dán đáp án ở đây. Nếu chưa có, bấm Tạo đáp án bằng AI...'} className="quiz-editor rich-editor teacher-content min-h-[220px] p-4 sm:p-7 text-base sm:text-lg leading-relaxed focus:outline-none overflow-y-auto border border-rose-100 rounded-2xl bg-white shadow-inner" />
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Tên đề để lưu vào kho..." className="mb-2 w-full max-w-xl rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-400" />
                      <label className="relative inline-flex px-3 py-2 text-left font-black text-[10px] sm:text-xs text-blue-700 cursor-pointer bg-blue-50 border border-blue-100 rounded-xl">{isSubmitting ? '\u0110ang up file...' : '+ \u0110\u00ednh k\u00e8m'}<input type="file" multiple onChange={(e) => { const files = Array.from(e.target.files || []); handleQuizFileUpload(e, files); e.target.value = null; }} className="absolute inset-0 opacity-0 cursor-pointer" /></label>
                      {quizAttachments.length > 0 && <div className="mt-2 flex flex-col gap-1.5">{quizAttachments.map(file => (<div key={file.id} className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 shadow-sm max-w-full"><button type="button" onClick={() => window.open(file.url || file.previewUrl, '_blank', 'noopener,noreferrer')} className="min-w-0 flex items-center gap-2 text-left text-[10px] sm:text-xs font-bold text-blue-800"><FileText className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" /><span className="truncate">{file.title}</span></button><button type="button" onClick={() => handleRemoveQuizAttachment(file.id)} className="text-rose-500 hover:bg-rose-50 rounded-lg p-1 flex-shrink-0"><X className="w-3.5 h-3.5" /></button></div>))}</div>}
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 flex-shrink-0">
                      <button onClick={handleSaveQuiz} disabled={isSavingQuiz} className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-[10px] sm:text-xs font-black flex items-center gap-2 shadow-md hover:bg-emerald-700 disabled:opacity-50">{isSavingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : (quizSaveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />)} {isSavingQuiz ? 'Đang lưu...' : 'Lưu bài'}</button>
                    </div>
                  </div>
                  {quizDocStatus.message && (
                    <div className={`rounded-xl px-3 py-2 text-[10px] sm:text-xs font-black border flex items-center justify-between gap-3 ${quizDocStatus.state === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : quizDocStatus.state === 'error' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                      <span className="flex items-center gap-2">{quizDocStatus.state === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{quizDocStatus.message}</span>
                      {quizDocStatus.url && <a href={quizDocStatus.url} target="_blank" rel="noopener noreferrer" className="bg-white px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 whitespace-nowrap">Mở Doc</a>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

      {confirmModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 border border-white/20">
            <h3 className="text-xl font-black text-slate-800 mb-4">Xác nhận</h3>
            <p className="text-slate-600 font-bold mb-8 whitespace-pre-wrap">{confirmModal.message}</p>
            <div className="flex space-x-3">
              <button onClick={() => setConfirmModal({ show: false, message: '', onConfirm: null })} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-colors">Hủy</button>
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal({ show: false, message: '', onConfirm: null }); }} className="flex-1 py-3 bg-rose-600 text-white rounded-2xl font-black shadow-lg hover:bg-rose-700 transition-all">Đồng ý</button>
            </div>
          </div>
        </div>
      )}

      {!hideMainHeaderForWorkspace && <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer group flex-shrink-0" onClick={resetNavigationWithClean}>
            <div className="bg-blue-600 p-2 rounded-xl shadow-md group-hover:bg-blue-700 transition-colors"><Library className="w-5 h-5 text-white" /></div>
            <div className="hidden sm:block leading-tight"><span className="font-black text-lg block tracking-tighter">THCS Nguyễn An Ninh</span><span className="text-[10px] text-blue-600 font-black uppercase tracking-widest">Kho Học Liệu Số</span></div>
          </div>
          
          <div className="flex flex-1 ml-3 sm:ml-6 mr-3 sm:mr-6 items-center overflow-hidden bg-slate-50/80 rounded-full px-3 py-1.5 border border-slate-200/60 shadow-inner">
             <Sparkles className="w-3.5 h-3.5 text-blue-500 mr-2 flex-shrink-0 animate-pulse" />
             <marquee direction="left" scrollamount="4" className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em] w-full pt-0.5 whitespace-nowrap flex items-center h-full">
               {loginRole === 'teacher' ? (
                  role === 'teacher' ? (
                      <span className="text-emerald-600 mr-8">✨ CHÀO MỪNG THẦY CÔ! ĐỂ XEM THỬ GIAO DIỆN HỌC SINH, HÃY NHẤN VÀO NÚT BÊN PHẢI.</span>
                  ) : (
                      <span className="text-emerald-600 mr-8">✨ ĐANG XEM THỬ GIAO DIỆN HỌC SINH! NHẤN NÚT BÊN PHẢI ĐỂ QUAY LẠI GÓC NHÌN GIÁO VIÊN.</span>
                  )
               ) : (
                  <span className="text-blue-600 mr-8">✨ CHÀO MỪNG HỌC SINH! CHÚC EM MỘT NGÀY HỌC TẬP THẬT HIỆU QUẢ.</span>
               )}
               <span className="hidden sm:inline text-slate-500">
                 {combinedFeedSorted.length > 0 
                    ? combinedFeedSorted.slice(0, 5).map(item => `[${new Date(item.timestamp).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}] ${item.title.replace(/<[^>]+>/g, '')}`).join(' ✨ ')
                    : 'HỆ THỐNG ĐANG HOẠT ĐỘNG ỔN ĐỊNH...'}
               </span>
             </marquee>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-5 flex-shrink-0">
            {loginRole === 'teacher' ? (
              <button onClick={handleToggleRole} className={`flex items-center space-x-1 sm:space-x-2.5 px-3 py-2 sm:px-4 sm:py-2 rounded-full border shadow-sm transition-all hover:scale-105 active:scale-95 ${role === 'teacher' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}>
                {role === 'teacher' ? <GraduationCap className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> : <User className="w-4 h-4 sm:w-4.5 sm:h-4.5" />}
                <span className="text-[10px] sm:text-sm font-black inline">
                   <span className="hidden sm:inline">Góc nhìn: {role === 'teacher' ? 'Giáo viên' : 'Học sinh'}</span>
                   <span className="sm:hidden">{role === 'teacher' ? 'Giáo viên' : 'Học sinh'}</span>
                </span>
                <RefreshCw className="w-3 h-3 ml-1 opacity-50 hidden sm:block" />
              </button>
            ) : loginRole === 'student' ? (
              <button type="button" onClick={() => activeStudentProfile?.id && setShowStudentProfileModal(true)} className="relative flex items-center space-x-1.5 sm:space-x-2.5 bg-blue-50 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full border shadow-sm border-blue-100 hover:bg-blue-100 transition-colors">
                <User className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-blue-600" />
                <span className="text-[11px] sm:text-sm font-black text-blue-800">
                  <span className="sm:hidden">{getStudentDisplayName(activeStudentProfile?.fullName, true)}</span>
                  <span className="hidden sm:inline">{getStudentDisplayName(activeStudentProfile?.fullName)}</span>
                </span>
                {activeStudentPendingProfileRequests.length > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[8px] font-black uppercase text-white shadow-sm">
                    Chờ
                  </span>
                )}
              </button>
            ) : null}
            <button onClick={() => { setRole(null); setLoginRole(null); setCurrentStudent(null); setShowClassOps(false); resetNavigationWithClean(); }} className="text-[10px] sm:text-xs font-black text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest">Thoát</button>
          </div>
        </div>
      </header>}
      
      <main className="max-w-6xl mx-auto px-4 py-4 sm:py-8 flex-1 w-full relative z-10 flex flex-col">
        <div className={`flex flex-nowrap items-center text-[clamp(9px,2.35vw,11px)] sm:text-xs font-black text-slate-400 ${selectedLesson && role === 'teacher' ? 'mb-2' : 'mb-2 sm:mb-8'} bg-white/80 backdrop-blur-md px-2.5 sm:px-6 py-2 sm:py-4 rounded-xl sm:rounded-2xl shadow-sm border border-white/60 uppercase tracking-wide sm:tracking-widest shrink-0 overflow-hidden`}>
            <button onClick={resetNavigationWithClean} className="hover:text-blue-600 flex items-center transition-colors whitespace-nowrap flex-shrink-0" title="Trang chủ"><Home className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-0 sm:mr-2" /> <span className="hidden sm:inline">{'Trang ch\u1ee7'}</span></button>
            {selectedGrade && <><ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 mx-0.5 sm:mx-2 opacity-30 flex-shrink-0" /><div className="relative flex-shrink-0"><select value={selectedGrade} onChange={(e) => { setSelectedGrade(e.target.value); setIsTextbookExpanded(true); }} className="appearance-none bg-emerald-50 text-emerald-700 border border-emerald-100 pl-1.5 pr-5 sm:pl-2 sm:pr-7 py-0.5 rounded-md sm:rounded-lg whitespace-nowrap font-black focus:outline-none focus:ring-2 focus:ring-emerald-100 cursor-pointer">{GRADES.map(g => <option key={g} value={g}>{'Kh\u1ed1i ' + g}</option>)}</select><ChevronDown className="pointer-events-none absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" /></div></>}
            {selectedSubject && <><ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 mx-0.5 sm:mx-2 opacity-30 flex-shrink-0" /><button onClick={() => setSelectedLesson(null)} className="bg-sky-50 text-sky-700 border border-sky-100 px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg whitespace-nowrap truncate min-w-0 max-w-[82px] sm:max-w-none">{selectedSubject}</button></>}
            {role === 'student' && activeStudentProfile?.isClassLeader && !selectedLesson && (
              <button type="button" onClick={() => setShowClassOps(true)} className="ml-auto sm:ml-3 bg-emerald-600 text-white px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl whitespace-nowrap flex items-center gap-1.5 shadow-sm">
                <ListChecks className="w-3.5 h-3.5" /> <span>Điểm danh</span>
              </button>
            )}
            {selectedLesson && <>
              <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 mx-0.5 sm:mx-2 opacity-30 flex-shrink-0" />
              <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5 bg-blue-50/90 border border-blue-100 rounded-lg sm:rounded-xl p-0.5 sm:p-1 shadow-sm flex-shrink-0">
                <button type="button" onClick={() => setSelectedLesson(String(Math.max(1, Number(selectedLesson || 1) - 1)))} disabled={Number(selectedLesson) <= 1} className="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-white text-blue-700 flex items-center justify-center shadow-sm disabled:opacity-40 active:scale-95"><ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                <select value={selectedLesson} onChange={(e) => setSelectedLesson(e.target.value)} className={`h-7 sm:h-9 bg-white border-0 ${getWeekData(selectedLesson).isExam ? getWeekData(selectedLesson).text : 'text-blue-900'} font-black text-[clamp(10px,2.5vw,11px)] sm:text-sm px-1 sm:px-3 rounded-md sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer text-center w-[clamp(74px,20vw,92px)] sm:w-[120px] shadow-sm`}>
                  {Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1).map(l => {
                    const lData = getWeekData(l);
                    return <option key={l} value={String(l)}>{(quizLessonSet.has(String(l)) ? '* ' : '') + (lData.isExam ? lData.main : 'Tuần ' + l)}</option>
                  })}
                </select>
                <button type="button" onClick={() => setSelectedLesson(String(Math.min(TOTAL_LESSONS, Number(selectedLesson || 1) + 1)))} disabled={Number(selectedLesson) >= TOTAL_LESSONS} className="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-white text-blue-700 flex items-center justify-center shadow-sm disabled:opacity-40 active:scale-95"><ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
              </div>
            </>}
        </div>
        
        {role && !selectedLesson && !selectedSubject && (
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 flex flex-col">
              {false && role === 'teacher' && (
                <div className="flex justify-center mb-6">
                    <div className="bg-white/60 backdrop-blur-md p-1.5 rounded-full flex shadow-sm border border-white">
                      <button onClick={() => setTeacherTab('giang_day')} className={`px-6 py-2.5 rounded-full text-xs sm:text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 ${teacherTab === 'giang_day' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-blue-600 hover:bg-white'}`}>
                          <BookOpen className="w-4 h-4"/> Giảng Dạy
                      </button>
                      <button onClick={() => setTeacherTab('chuyen_mon')} className={`px-6 py-2.5 rounded-full text-xs sm:text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 ${teacherTab === 'chuyen_mon' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-emerald-600 hover:bg-white'}`}>
                          <Briefcase className="w-4 h-4"/> Chuyên Môn
                      </button>
                    </div>
                </div>
              )}

              <div className="hidden sm:flex justify-center mb-8 gap-4 bg-white/60 p-2 rounded-2xl shadow-sm border border-white/50 w-fit mx-auto">
                 <div className="px-4 py-3 text-sm font-black text-slate-400 uppercase tracking-widest flex items-center border-r border-slate-200">Chọn Khối</div>
                 {GRADES.map(g => (
                    <button key={g} onClick={() => { setSelectedGrade(g); setSelectedSubject(null); setIsTextbookExpanded(true); }} className={`px-8 py-3 rounded-xl font-black text-lg transition-all ${selectedGrade === g ? 'bg-blue-600 text-white shadow-lg scale-105' : 'bg-slate-50 text-slate-600 hover:bg-blue-100 hover:text-blue-700'}`}>
                       Khối {g}
                    </button>
                 ))}
              </div>

              <div className={`sm:hidden flex-1 flex flex-col ${selectedGrade ? 'hidden' : 'flex'}`}>
                  <div className="flex items-center gap-3 mb-4 bg-white/60 backdrop-blur-sm p-3.5 rounded-2xl inline-flex border border-white/50 shadow-sm self-start shrink-0">
                     <div className="w-2.5 h-7 bg-blue-600 rounded-full"></div>
                     <h2 className="text-lg font-black text-slate-800 uppercase tracking-widest">{role === 'teacher' && teacherTab === 'chuyen_mon' ? 'Nghiệp vụ' : 'Khối Lớp'}</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-4 flex-1">
                     {GRADES.map(grade => (
                         <button key={grade} onClick={() => setSelectedGrade(grade)} className={`bg-white/80 border border-white/60 shadow-xl rounded-3xl p-5 text-center active:scale-95 flex flex-col items-center justify-center min-h-[140px]`}>
                             <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3 shadow-inner border ${role === 'teacher' && teacherTab === 'chuyen_mon' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-blue-50 border-blue-200 text-blue-600'}`}>
                                 <span className="text-3xl font-black drop-shadow-sm">{grade}</span>
                             </div>
                             <h3 className="text-base font-black text-slate-800">Khối {grade}</h3>
                         </button>
                     ))}
                  </div>
              </div>

              <div className={`${!selectedGrade ? 'hidden sm:flex' : 'flex'} flex-col flex-1`}>
                  {!selectedGrade && (
                     <div className="hidden sm:flex flex-1 flex-col items-center justify-center text-center p-10 bg-white/30 rounded-[3rem] border-2 border-white border-dashed">
                         <GraduationCap className="w-20 h-20 text-slate-300 mb-6 animate-bounce" />
                         <h3 className="text-2xl font-black text-slate-400 uppercase tracking-widest">Vui lòng chọn Khối Lớp ở trên</h3>
                     </div>
                  )}

                  {selectedGrade && (
                     <div className="flex-1 flex flex-col gap-6 sm:gap-8 animate-in fade-in zoom-in-95 duration-300">
                        {false && role === 'teacher' && teacherTab === 'chuyen_mon' ? (
                            <div className="bg-white/80 backdrop-blur-md rounded-[2rem] p-6 sm:p-10 shadow-xl border border-white w-full max-w-4xl mx-auto">
                               <h2 className="text-2xl font-black text-emerald-900 mb-8 uppercase text-center border-b-2 border-emerald-100 pb-4">Công tác chuyên môn Khối {selectedGrade}</h2>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                  <div className="bg-indigo-50 rounded-[1.5rem] border border-indigo-200 p-6 flex flex-col text-center hover:shadow-lg transition-all group">
                                     <div className="bg-indigo-600 w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform"><Pencil className="w-8 h-8" /></div>
                                     <h3 className="font-black text-lg text-indigo-900 uppercase tracking-tight mb-2">Nhập điểm</h3>
                                     <p className="text-xs text-indigo-700 font-bold mb-4 flex-1">Mở bảng nhập nhanh theo đúng khối và môn đang chọn.</p>
                                     <select className="mb-4 p-3 rounded-xl border border-indigo-200 bg-white font-bold text-xs focus:outline-none focus:border-indigo-500" onChange={(e) => setPlanSubject(e.target.value)} value={planSubject}>
                                         <option value="">-- Chọn Môn --</option>
                                         {SUBJECTS.map(s => <option key={`quick-input-subject-${s}`} value={s}>{s}</option>)}
                                     </select>
                                     <button
                                       type="button"
                                       onClick={() => openQuickScoreWorkspace({ grade: selectedGrade, subjectName: planSubject, locked: true })}
                                       disabled={!planSubject}
                                       className="mt-auto bg-indigo-600 text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs shadow-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700 active:scale-95"
                                     >
                                       MỞ NHẬP ĐIỂM
                                     </button>
                                  </div>
                                  <div className="bg-emerald-50 rounded-[1.5rem] border border-emerald-200 p-6 flex flex-col text-center hover:shadow-lg transition-all group">
                                     <div className="bg-emerald-600 w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform"><Briefcase className="w-8 h-8" /></div>
                                     <h3 className="font-black text-lg text-emerald-900 uppercase tracking-tight mb-2">Up Kế hoạch Bài Dạy</h3>
                                     <p className="text-xs text-emerald-700 font-bold mb-6 flex-1">Nộp tài liệu kế hoạch bài dạy của bạn lên kho lưu trữ của tổ chuyên môn.</p>
                                     <div className="relative">
                                         <label htmlFor="plan-upload" className="flex flex-col items-center justify-center w-full border-2 border-dashed border-emerald-300 p-4 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors bg-white">
                                            <UploadCloud className="w-6 h-6 text-emerald-400 mb-2"/>
                                            <span className="text-[11px] font-black text-emerald-700 text-center px-2 truncate w-full">{planFile ? planFile.name : "Nhấp/Kéo file vào đây"}</span>
                                         </label>
                                         <input id="plan-upload" type="file" className="hidden" onChange={(e) => setPlanFile(e.target.files[0])} />
                                     </div>
                                     <select className="mt-4 p-3 rounded-xl border border-emerald-200 bg-white font-bold text-xs focus:outline-none focus:border-emerald-500" onChange={(e) => setPlanSubject(e.target.value)} value={planSubject}>
                                         <option value="">-- Chọn Môn --</option>
                                         {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                                     </select>
                                     {planStatus && <div className={`mt-4 p-2 rounded-lg text-[10px] font-black ${planStatus.includes('thành công') ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{planStatus}</div>}
                                     <button onClick={handleTeacherPlanUpload} disabled={isUploadingPlan || !planFile || !planSubject} className="mt-4 bg-emerald-600 text-white font-black py-3 rounded-xl uppercase tracking-widest text-xs shadow-md disabled:opacity-50 hover:bg-emerald-700 active:scale-95 flex justify-center items-center gap-2">
                                         {isUploadingPlan ? <><Loader2 className="w-4 h-4 animate-spin"/> ĐANG GỬI...</> : "NỘP KẾ HOẠCH BÀI DẠY"}
                                     </button>
                                  </div>
                               </div>
                            </div>
                        ) : (
                            <>
                               <div className="bg-white/80 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-8 border border-white shadow-xl">
                                  <div className="flex items-center gap-3 mb-4 sm:mb-6 border-b-2 border-blue-100/50 pb-4">
                                     <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md"><BookOpen className="w-5 h-5 sm:w-6 sm:h-6"/></div>
                                     <h2 className="text-base sm:text-2xl font-black text-slate-800 uppercase tracking-widest">Môn dạy</h2>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                                     {SUBJECTS.map((s, index) => (
                                        <button key={s} onClick={() => { setSelectedSubject(s); setPlanSubject(s); setShowLearningResultsWorkspace(false); setQuickScoreLockedContext(null); }} className={`${getSubjectCardStyle(index)} border hover:shadow-md rounded-xl p-3 sm:p-4 flex items-center justify-center transition-all group active:scale-95 text-center h-[58px] sm:h-[66px]`}>
                                           <span className="font-black text-current text-xs sm:text-sm uppercase tracking-tight leading-snug">{getSubjectShortName(s)}</span>
                                        </button>
                                     ))}
                                  </div>
                               </div>

                               <div className="bg-white/70 backdrop-blur-md rounded-[1.5rem] sm:rounded-[2rem] p-4 sm:p-8 border border-white/60 shadow-xl shrink-0">
                                  <button onClick={() => setIsTextbookExpanded(!isTextbookExpanded)} className="w-full flex justify-between items-center focus:outline-none group">
                                    <div className="flex flex-col items-start gap-1">
                                        <div className="flex items-center gap-2 sm:gap-4">
                                            <div className="w-1.5 sm:w-2.5 h-5 sm:h-8 bg-emerald-500 rounded-full"></div>
                                            <h2 className="text-base sm:text-2xl font-black text-slate-800 uppercase sm:capitalize tracking-widest sm:tracking-normal">Sách giáo khoa</h2>
                                        </div>
                                        <p className="text-[9px] sm:text-xs font-bold text-emerald-800/60 uppercase tracking-widest ml-4 sm:ml-7 mt-0.5">Nhấn vào để chọn sách xem</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isAdmin && <a href={`https://drive.google.com/drive/folders/${TEXTBOOK_FOLDERS[selectedGrade]}?usp=drive_link`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hidden sm:flex bg-emerald-500 text-white px-4 py-2 rounded-xl font-black items-center space-x-2 text-xs shadow-md hover:bg-emerald-600 transition-all"><Folder className="w-4 h-4" /><span>KHO DRIVE SGK</span></a>}
                                        <div className="bg-slate-100 p-1.5 sm:p-2 rounded-full group-hover:bg-slate-200 transition-colors">
                                            {isTextbookExpanded ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500"/> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500"/>}
                                        </div>
                                    </div>
                                  </button>

                                  {isTextbookExpanded && (
                                      <div className="mt-4 sm:mt-8 pt-4 sm:pt-0 border-t sm:border-0 border-slate-100/50 animate-in slide-in-from-top-2 duration-300">
                                          {isAdmin && <a href={`https://drive.google.com/drive/folders/${TEXTBOOK_FOLDERS[selectedGrade]}?usp=drive_link`} target="_blank" rel="noopener noreferrer" className="sm:hidden mb-4 bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-black flex justify-center items-center space-x-2 text-xs shadow-md hover:bg-emerald-600 transition-all w-full"><Folder className="w-4 h-4" /><span>MỞ KHO DRIVE SGK</span></a>}
                                          {isLoadingTextbooks ? <div className="text-center py-10 flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /><p className="font-black text-slate-400 uppercase text-xs tracking-widest">Đang tải...</p></div> : (
                                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
                                              {sortedTextbooks.map((f) => (
                                                  <button key={f.id} className="bg-white border border-emerald-100 sm:border-2 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex justify-center items-center shadow-sm hover:border-emerald-400 hover:shadow-md transition-all active:scale-95 text-center group" 
                                                      onClick={() => {
                                                        if (window.innerWidth >= 640) {
                                                          window.open(f.webViewLink, '_blank', 'noopener,noreferrer');
                                                        } else {
                                                          setViewingMaterial({ title: formatTextbookName(f.name), url: f.webViewLink });
                                                        }
                                                      }}>
                                                      <h4 className="font-black text-slate-700 text-xs sm:text-sm group-hover:text-emerald-700 leading-tight uppercase tracking-tighter truncate w-full">{formatTextbookName(f.name)}</h4>
                                                  </button>
                                              ))}
                                          </div>
                                          )}
                                      </div>
                                  )}
                               </div>
                            </>
                        )}
                     </div>
                  )}
              </div>
           </div>
        )}

        {(!role || role === 'student' || role === 'teacher') && selectedGrade && selectedSubject && !selectedLesson && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4 flex-1 mt-4">
            <div className="grid grid-cols-4 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-12 gap-2 pb-2">
              {Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1).map(l => {
                const wData = getWeekData(l);
                const quizMeta = quizLessonMetaMap[String(l)] || {};
                const quizBadgeLabel = quizMeta.scoreLabel
                  ? `${quizMeta.semesterLabel ? `${quizMeta.semesterLabel} ` : ''}${quizMeta.scoreLabel}`
                  : 'KT';
                const quizDone = studentCompletedQuizLessonSet.has(String(l));
                return (
                <button key={l} onClick={() => setSelectedLesson(String(l))} className={`${wData.bg} border ${wData.border} shadow-sm rounded-xl py-2 sm:py-3 min-h-[46px] sm:min-h-[58px] flex flex-col items-center justify-center group transition-all active:scale-95 relative overflow-hidden`}>
                    {wData.isExam && <div className="absolute top-0 right-0 bg-white/50 w-full h-full z-0 rotate-45 scale-150 mix-blend-overlay hidden sm:block"></div>}
                    {quizLessonSet.has(String(l)) && (
                      <div className={`absolute top-1 left-1 sm:top-1.5 sm:left-1.5 z-20 bg-rose-500 text-white rounded-full w-5 h-5 sm:w-auto sm:h-auto sm:px-1.5 sm:py-1 shadow-md flex items-center justify-center sm:gap-1 ${role === 'student' && !quizDone ? 'animate-pulse ring-2 ring-rose-200' : ''}`} title={`${quizDone ? 'Da lam bai kiem tra' : 'Co bai kiem tra chua lam'}: ${quizBadgeLabel}`} aria-label={`${quizDone ? 'Da lam bai kiem tra' : 'Co bai kiem tra chua lam'}: ${quizBadgeLabel}`}>
                        <Sparkles className="w-3 h-3" />
                        <span className="hidden sm:inline text-[8px] sm:text-[9px] font-black leading-none tracking-tight">{quizBadgeLabel}</span>
                      </div>
                    )}
                    <span className="sm:hidden font-black text-[11px] uppercase tracking-wider relative z-10 text-slate-700">
                       {wData.isExam ? <span className={wData.text}>{wData.main}</span> : `Tuần ${l}`}
                    </span>
                    <div className="hidden sm:flex flex-col items-center">
                       <span className={`text-[9px] font-black ${wData.isExam ? wData.text : 'text-slate-400'} mb-0.5 uppercase tracking-widest relative z-10`}>{wData.top}</span>
                       <span className={`${wData.isExam ? 'text-[15px]' : 'text-2xl'} font-black ${wData.text} ${wData.textHover} transition-colors tracking-tighter relative z-10`}>{wData.main}</span>
                    </div>
                </button>
              )})}
            </div>
            {role === 'teacher' && (
              <div className="rounded-2xl border border-white/60 bg-white/85 p-3 sm:p-4 shadow-lg">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => openQuickScoreWorkspace({ grade: selectedGrade, subjectName: selectedSubject, locked: true })}
                    className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-left hover:bg-indigo-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm"><Pencil className="w-5 h-5" /></div>
                      <div>
                        <div className="text-sm font-black uppercase text-indigo-900">Nhập điểm</div>
                        <div className="text-[11px] font-bold text-indigo-700/70">Mở nhanh {getSubjectShortName(selectedSubject)} khối {selectedGrade}</div>
                      </div>
                    </div>
                  </button>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <label htmlFor="plan-upload-inline" className="min-h-[42px] flex-1 rounded-xl border border-dashed border-emerald-300 bg-white px-3 py-2 cursor-pointer hover:bg-emerald-50 transition-colors flex items-center gap-2">
                        <UploadCloud className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        <span className="text-[11px] font-black text-emerald-800 truncate">{planFile ? planFile.name : 'Chọn file kế hoạch bài dạy'}</span>
                      </label>
                      <input id="plan-upload-inline" type="file" className="hidden" onChange={(e) => setPlanFile(e.target.files[0])} />
                      <button onClick={handleTeacherPlanUpload} disabled={isUploadingPlan || !planFile} className="h-10 rounded-xl bg-emerald-600 px-4 text-[11px] font-black uppercase text-white shadow-sm disabled:opacity-50 hover:bg-emerald-700 active:scale-95 flex items-center justify-center gap-2">
                        {isUploadingPlan ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang gửi</> : <><Briefcase className="w-4 h-4" /> Up kế hoạch</>}
                      </button>
                    </div>
                    {planStatus && <div className={`mt-2 rounded-lg px-3 py-2 text-[10px] font-black ${planStatus.includes('thành công') ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{planStatus}</div>}
                  </div>
                </div>
                {showLearningResultsWorkspace && quickScoreLockedContext && renderTeacherQuickScorePanel()}
              </div>
            )}
          </div>
        )}

        {selectedGrade && selectedSubject && selectedLesson && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-3 sm:space-y-4 flex-1 mt-0 pb-20 sm:pb-0">
            <div className={`${role === 'teacher' ? 'hidden' : 'hidden sm:flex'} border-b-4 border-blue-100/50 pb-4 sm:pb-6 flex-col gap-4`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className={`text-2xl sm:text-4xl md:text-5xl font-black ${getWeekData(selectedLesson).isExam ? getWeekData(selectedLesson).text : 'text-slate-800'} tracking-tighter flex items-center flex-wrap`}>
                  {getWeekDisplayName(selectedLesson)} 
                  <span className="font-black text-slate-300 text-base sm:text-xl md:text-2xl ml-3 sm:ml-4 opacity-50 uppercase tracking-widest inline">{selectedSubject} {selectedGrade}</span>
                </h2>
                {role === 'teacher' && autoSaveStatus && (
                  <span className="text-[10px] sm:text-sm font-bold text-blue-500 italic animate-pulse bg-blue-50 px-2 py-1 rounded-md">{autoSaveStatus}</span>
                )}
              </div>
              
              <div className="hidden">
                <div className="flex items-center gap-1.5 sm:gap-2 bg-white/50 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200">
                  <button onClick={() => setSelectedLesson(String(parseInt(selectedLesson) - 1))} disabled={parseInt(selectedLesson) <= 1} className="p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl shadow-md disabled:opacity-50 hover:bg-blue-50 transition-colors text-blue-700 active:scale-95"><ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                  <select value={selectedLesson} onChange={(e) => setSelectedLesson(e.target.value)} className={`bg-white border-0 font-black ${getWeekData(selectedLesson).isExam ? getWeekData(selectedLesson).text : 'text-blue-900'} text-sm sm:text-lg py-2 sm:py-3 px-1 sm:px-4 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-md text-center outline-none min-w-[90px] sm:min-w-[120px]`}>
                    {Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1).map(l => {
                       const lData = getWeekData(l);
                       return <option key={l} value={String(l)}>{(quizLessonSet.has(String(l)) ? '* ' : '') + (lData.isExam ? lData.main : 'Tuần ' + l)}</option>
                    })}
                  </select>
                  <button onClick={() => setSelectedLesson(String(parseInt(selectedLesson) + 1))} disabled={parseInt(selectedLesson) >= TOTAL_LESSONS} className="p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl shadow-md disabled:opacity-50 hover:bg-blue-50 transition-colors text-blue-700 active:scale-95"><ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                </div>
                
                {role === 'teacher' && (
                  <button onClick={handleOpenAiModal} className="lg:hidden bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 px-3 py-2 rounded-xl text-[10px] font-black flex items-center gap-1.5 border border-indigo-200 shadow-sm active:scale-95">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" /> TẠO ĐỀ
                  </button>
                )}
              </div>
            </div>
            
            <div className="bg-white/95 rounded-2xl sm:rounded-[2.5rem] shadow-2xl border border-white/60 overflow-hidden">
              <div className="bg-slate-50/80 px-4 sm:px-8 py-3 border-b flex flex-col">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 sm:p-3 rounded-lg sm:rounded-2xl text-blue-600 shadow-inner">
                      <FileText className="w-4 h-4 sm:w-6 sm:h-6" />
                    </div>
                    <h3 className="font-black text-sm sm:text-xl text-slate-800 uppercase tracking-tight">Bài học</h3>
                  </div>

                  {role === 'student' && activeStudentProfile?.isClassLeader && (
                    <button type="button" onClick={() => setShowClassOps(true)} className="ml-auto mr-2 bg-emerald-600 text-white px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl whitespace-nowrap flex items-center gap-1.5 shadow-sm text-[10px] sm:text-xs font-black uppercase">
                      <ListChecks className="w-3.5 h-3.5" /> <span>Điểm danh</span>
                    </button>
                  )}

                  {role === 'student' && (studentCurrentQuizVisible || studentScheduledQuizPending) && (
                    <button type="button" onClick={() => { if (!studentCurrentQuizVisible) return; setShowStudentQuizPanel(true); requestAnimationFrame(() => document.getElementById('quiz-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} className={`text-white px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-md flex items-center gap-1.5 ${studentCurrentQuizVisible ? 'bg-rose-600' : 'bg-blue-600 cursor-default'}`}>
                      {studentCurrentQuizVisible ? <Bell className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {studentCurrentQuizVisible ? 'Có bài kiểm tra' : `Mở sau ${scheduledQuizCountdownText}`}
                    </button>
                  )}

                  {role === 'teacher' && (
                    <div className="flex items-center gap-2">
                      <label className="lg:hidden px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm border border-emerald-200 active:scale-95 cursor-pointer">
                        <ImageIcon className="w-3.5 h-3.5" /> Chèn ảnh
                        <input type="file" accept="image/*" onChange={handleToolbarImageUpload} className="hidden" />
                      </label>

                      <button onClick={() => setShowMobileToolbar(!showMobileToolbar)} className="lg:hidden px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-sm border border-slate-200 active:scale-95">
                        <Palette className="w-3.5 h-3.5" /> {showMobileToolbar ? 'Ẩn công cụ' : 'Công cụ'}
                      </button>

                      <div className="hidden lg:flex flex-wrap items-center gap-1.5 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 transition-all">
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('bold')}} className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors" title="In đậm"><Bold className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('italic')}} className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors" title="In nghiêng"><Italic className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('underline')}} className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors" title="Gạch chân"><Underline className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                        <div className="w-px h-5 bg-slate-200 mx-1 hidden sm:block"></div>
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyLeft')}} className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors" title="Canh trái"><AlignLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyCenter')}} className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors" title="Canh giữa"><AlignCenter className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyRight')}} className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors" title="Canh phải"><AlignRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyFull')}} className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-700 transition-colors" title="Canh đều"><AlignJustify className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></button>
                        <div className="w-px h-5 bg-slate-200 mx-1 hidden sm:block"></div>
                        <div className="flex items-center gap-2 sm:gap-2.5 px-2">
                          <button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#000000')}} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-black border border-slate-300 hover:scale-125 transition-transform shadow-sm" title="Đen"></button>
                          <button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#dc2626')}} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-red-600 border border-red-700 hover:scale-125 transition-transform shadow-sm" title="Đỏ"></button>
                          <button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#2563eb')}} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-blue-600 border border-blue-700 hover:scale-125 transition-transform shadow-sm" title="Xanh dương"></button>
                          <button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#16a34a')}} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-green-600 border border-green-700 hover:scale-125 transition-transform shadow-sm" title="Xanh lá"></button>
                          <button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#ea580c')}} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-orange-600 border border-orange-700 hover:scale-125 transition-transform shadow-sm" title="Cam"></button>
                        </div>
                        <div className="w-px h-5 bg-slate-200 mx-1 hidden sm:block"></div>
                        <label className="flex items-center gap-1 sm:gap-1.5 hover:bg-emerald-50 text-emerald-700 p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-colors cursor-pointer font-bold text-[10px] sm:text-xs" title="Chèn ảnh từ thiết bị">
                          <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="hidden xl:inline">Tải ảnh</span>
                          <input type="file" accept="image/*" onChange={handleToolbarImageUpload} className="hidden" />
                        </label>
                        <label className="flex items-center gap-1 sm:gap-1.5 hover:bg-emerald-50 text-emerald-700 p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition-colors cursor-pointer font-bold text-[10px] sm:text-xs" title="Chụp ảnh bằng Camera">
                          <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="hidden xl:inline">Chụp</span>
                          <input type="file" accept="image/*" capture="environment" onChange={handleToolbarImageUpload} className="hidden" />
                        </label>
                      </div>
                      <div className="w-px h-8 bg-slate-200 hidden lg:block mx-1"></div>
                      <button onClick={handleOpenAiModal} className="hidden lg:flex bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 px-4 py-2.5 rounded-xl text-xs font-black items-center gap-2 border border-indigo-200 hover:shadow-md transition-all active:scale-95 shadow-sm">
                        <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" /> TẠO ĐỀ AI
                      </button>
                    </div>
                  )}
                </div>

                {role === 'teacher' && showMobileToolbar && (
                    <div className="lg:hidden mt-3 flex flex-wrap items-center gap-1 bg-white p-1.5 rounded-xl shadow-sm border border-slate-200 animate-in slide-in-from-top-2 duration-200">
                      <button onMouseDown={e => {e.preventDefault(); document.execCommand('bold')}} className="p-2 hover:bg-slate-100 rounded-lg text-slate-700"><Bold className="w-4 h-4" /></button>
                      <button onMouseDown={e => {e.preventDefault(); document.execCommand('italic')}} className="p-2 hover:bg-slate-100 rounded-lg text-slate-700"><Italic className="w-4 h-4" /></button>
                      <button onMouseDown={e => {e.preventDefault(); document.execCommand('underline')}} className="p-2 hover:bg-slate-100 rounded-lg text-slate-700"><Underline className="w-4 h-4" /></button>
                      <div className="w-px h-5 bg-slate-200 mx-1"></div>
                      <button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyLeft')}} className="p-2 hover:bg-slate-100 rounded-lg text-slate-700"><AlignLeft className="w-4 h-4" /></button>
                      <button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyCenter')}} className="p-2 hover:bg-slate-100 rounded-lg text-slate-700"><AlignCenter className="w-4 h-4" /></button>
                      <button onMouseDown={e => {e.preventDefault(); document.execCommand('justifyRight')}} className="p-2 hover:bg-slate-100 rounded-lg text-slate-700"><AlignRight className="w-4 h-4" /></button>
                      <div className="w-px h-5 bg-slate-200 mx-1"></div>
                      <div className="flex items-center gap-2 px-1">
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#000000')}} className="w-4 h-4 rounded-full bg-black border border-slate-300"></button>
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#dc2626')}} className="w-4 h-4 rounded-full bg-red-600 border border-red-700"></button>
                        <button onMouseDown={e => {e.preventDefault(); document.execCommand('foreColor', false, '#2563eb')}} className="w-4 h-4 rounded-full bg-blue-600 border border-blue-700"></button>
                      </div>
                    </div>
                )}
              </div>
              
              <div className="p-0 relative">
                {role === 'teacher' ? (
                  <div className="relative">
                    <div 
                         id="teacher-editor-box"
                         ref={(node) => { contentEditableRef.current = node; }}
                         contentEditable={true} 
                         onInput={handleEditorInput}
                         onPaste={handlePaste}
                         onClick={handleEditorImageClick} 
                         data-placeholder="Thầy cô hãy gõ, dán nội dung (hoặc dán ảnh) trực tiếp tại đây..." 
                         className={`lesson-editor-viewport ${isEditorExpanded ? 'is-expanded' : ''} rich-editor p-4 sm:p-8 md:p-10 text-lg sm:text-xl leading-relaxed focus:outline-none overflow-y-auto transition-all duration-300`} />
                    
                    {selectedImage && (
                      <div className="absolute z-50 bg-white shadow-2xl border-2 border-slate-200 rounded-xl p-1.5 flex items-center gap-1.5 animate-in zoom-in-95 duration-200" style={{ top: imagePopupPos.y, left: imagePopupPos.x, transform: 'translateX(-50%)' }}>
                        <span className="text-[10px] font-black text-slate-400 uppercase px-2">Cỡ ảnh:</span>
                        <button onMouseDown={(e) => { e.preventDefault(); selectedImage.style.width='30%'; handleEditorInput(); }} className="px-3 py-1.5 bg-slate-50 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-lg text-xs font-bold transition-colors">Nhỏ</button>
                        <button onMouseDown={(e) => { e.preventDefault(); selectedImage.style.width='60%'; handleEditorInput(); }} className="px-3 py-1.5 bg-slate-50 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-lg text-xs font-bold transition-colors">Vừa</button>
                        <button onMouseDown={(e) => { e.preventDefault(); selectedImage.style.width='100%'; handleEditorInput(); }} className="px-3 py-1.5 bg-slate-50 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-lg text-xs font-bold transition-colors">To</button>
                        <div className="w-px h-5 bg-slate-200 mx-1"></div>
                        <button onMouseDown={handleDeleteSelectedImage} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 rounded-lg text-xs font-black flex items-center gap-1.5 transition-colors shadow-sm"><Trash2 className="w-3.5 h-3.5"/> Xóa ảnh</button>
                      </div>
                    )}
                    {isPastingImage && <div className="absolute top-6 right-8 bg-emerald-500 text-white text-xs px-5 py-2.5 rounded-full font-black animate-bounce shadow-2xl flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải ảnh lên Drive...</div>}
                  </div>
                ) : (
                  <div ref={studentContentRef} className="lesson-readable-content lesson-editor-viewport p-4 sm:p-10 text-lg sm:text-xl leading-relaxed student-content">
                    {noteHtml ? <div dangerouslySetInnerHTML={{ __html: noteHtml }} /> : <p className="text-slate-300 font-bold text-center mt-10 sm:mt-20 uppercase tracking-[0.2em]">Chưa có nội dung từ thầy cô.</p>}
                  </div>
                )}
              </div>

              {role === 'student' && sortedCurrentMaterials.length > 0 && (
                <div className="bg-slate-50/70 border-t border-slate-200 px-4 py-3 sm:px-8 sm:py-4">
                  <div className="flex items-center gap-2 mb-2 text-blue-800 font-black text-xs sm:text-sm uppercase tracking-tight"><LinkIcon className="w-4 h-4" /> {'T\u00e0i li\u1ec7u \u0111\u00ednh k\u00e8m'}</div>
                  <div className="flex flex-wrap gap-2">
                    {sortedCurrentMaterials.map((m) => (
                      <button key={m.id} onClick={() => { if(window.innerWidth >= 640) window.open(m.url, '_blank', 'noopener,noreferrer'); else setViewingMaterial(m); }} className="bg-white border border-blue-100 rounded-full px-3 py-2 flex items-center gap-2 shadow-sm text-left max-w-full">
                        <span className="w-5 h-5 flex items-center justify-center">{renderIcon(m.type)}</span>
                        <span className="text-[11px] sm:text-xs font-bold text-slate-700 truncate max-w-[210px]">{m.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* TÀI LIỆU ĐÍNH KÈM TÍCH HỢP CHO GIÁO VIÊN */}
              {role === 'teacher' && (
                <div className="bg-slate-50/50 border-t border-slate-200 p-2 sm:p-6">
                  <div className="flex flex-row items-center justify-between gap-1 mb-2 sm:mb-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button type="button" onClick={() => setShowInlineLink(prev => !prev)} className={`text-[10px] sm:text-xs font-black flex items-center gap-1 transition-all hover:underline ${showInlineLink ? 'text-slate-600' : 'text-blue-600 hover:text-blue-800'}`}>
                        {showInlineLink ? <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <LinkIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                        <span className="whitespace-nowrap">{showInlineLink ? 'ĐÓNG FORM' : '+ ĐÍNH KÈM'}</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button onClick={() => setIsEditorExpanded(!isEditorExpanded)} className="bg-white text-slate-600 border border-slate-200 px-2 py-1.5 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] uppercase tracking-widest font-black flex items-center gap-1 hover:bg-slate-50 transition-all active:scale-95 shadow-sm whitespace-nowrap">
                        {isEditorExpanded ? <><Minimize className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">THU GỌN</span></> : <><Maximize className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">MỞ RỘNG</span></>}
                      </button>
                      <button onClick={handleSaveNote} disabled={isSavingNote} className="bg-blue-600 text-white px-3 py-1.5 sm:px-6 sm:py-2.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black flex items-center justify-center gap-1 shadow-md hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap">
                        {isSavingNote ? <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : (saveSuccess ? <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" /> : <Save className="w-3 h-3 sm:w-4 sm:h-4" />)}
                        <span>LƯU</span>
                      </button>
                    </div>
                  </div>
                  
                  {showInlineLink && (
                    <div className="mb-4 bg-white border-2 border-emerald-100 rounded-3xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                      <form onSubmit={handleInlineUpload} className="bg-emerald-50/70 border-2 border-dashed border-emerald-300 rounded-2xl p-4 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-emerald-800 font-black text-xs uppercase tracking-widest"><UploadCloud className="w-4 h-4" /> Bên trái: thêm file tài liệu</div>
                        <div className="relative bg-white border-2 border-emerald-100 rounded-2xl min-h-[90px] flex items-center justify-center text-center px-4 hover:border-emerald-400 transition-colors">
                          <input type="file" multiple onChange={(e) => setInlineFiles(Array.from(e.target.files))} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                          <div className="font-black text-sm text-emerald-700">{inlineFiles.length > 0 ? `Đã chọn ${inlineFiles.length} file` : 'Bấm để chọn file hoặc kéo file vào đây'}</div>
                        </div>
                        <button type="submit" disabled={isSubmitting || inlineFiles.length === 0} className="w-full px-5 py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs shadow-md hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-widest">
                          {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang up {uploadProgress.current}/{uploadProgress.total}</> : <><UploadCloud className="w-4 h-4" /> Up file và ghim vào bài này</>}
                        </button>
                      </form>
                      <form onSubmit={handleInlineLinkSubmit} onPaste={handleInlineLinkPaste} className="bg-blue-50/70 border-2 border-dashed border-blue-200 rounded-2xl p-4 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-blue-800 font-black text-xs uppercase tracking-widest"><LinkIcon className="w-4 h-4" /> Bên phải: dán link hoặc ảnh</div>
                        <input required type="url" placeholder="Dán link YouTube, website hoặc ảnh..." className="w-full border-2 border-blue-100 p-4 rounded-2xl text-sm font-bold focus:outline-none focus:border-blue-400 bg-white" value={inlineLinkData.url} onChange={(e) => setInlineLinkData({ ...inlineLinkData, url: e.target.value, type: 'link' })} />
                        <button type="submit" disabled={isSubmitting || !inlineLinkData.url} className="w-full px-5 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs shadow-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-widest">
                          <LinkIcon className="w-4 h-4" /> Ghim link vào bài này
                        </button>
                      </form>
                    </div>
                  )}
                  
                  {sortedCurrentMaterials.length === 0 ? (
                    <div className="text-center py-2 sm:py-8 border border-dashed sm:border-2 border-slate-200 rounded-xl sm:rounded-2xl bg-white/50"><p className="text-[10px] sm:text-xs text-slate-400 font-bold italic">Chưa có tài liệu đính kèm.</p></div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-1 sm:mt-2">
                      {sortedCurrentMaterials.map((m) => (
                        <div key={m.id} className="bg-white border border-slate-200 rounded-full px-2 sm:px-3 py-0.5 sm:py-1.5 flex items-center gap-1 sm:gap-2 shadow-sm group hover:border-blue-400 transition-all">
                          <button onClick={() => { if (window.innerWidth >= 640) { window.open(m.url, '_blank', 'noopener,noreferrer'); } else { setViewingMaterial(m); } }} className="flex items-center gap-1.5 focus:outline-none text-left">
                            {m.type === 'pdf' ? <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-500" /> : m.type === 'ppt' ? <MonitorPlay className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-orange-500" /> : m.type === 'image' ? <ImageIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-500" /> : <LinkIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-500" />}
                            <span className="text-[9px] sm:text-[11px] font-bold text-slate-700 group-hover:text-blue-600 truncate max-w-[96px] sm:max-w-[200px]">{m.title}</span>
                          </button>
                          <div className="w-px h-3 bg-slate-200 mx-0.5"></div>
                          <button onClick={() => handleDeleteMaterial(m.id)} className="text-slate-400 hover:text-rose-500 transition-colors focus:outline-none" title="Gỡ tài liệu này"><Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {role === 'teacher' && (
              <div className="sm:hidden fixed left-0 right-0 bottom-0 z-[115] border-t border-slate-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.14)] backdrop-blur">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuizEditor(true);
                      requestAnimationFrame(() => document.getElementById('quiz-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                    }}
                    className="h-11 rounded-2xl bg-emerald-600 text-white text-[11px] font-black uppercase shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Bài kiểm tra
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCommonLibraryWorkspace(true)}
                    className="h-11 rounded-2xl bg-blue-600 text-white text-[11px] font-black uppercase shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Folder className="w-4 h-4" /> Kho tài liệu
                  </button>
                </div>
              </div>
            )}

            {/* TÀI LIỆU ĐÃ GHIM (DÀNH CHO HỌC SINH) */}

            {(role === 'teacher' || studentCurrentQuizVisible) && (
              <div id="quiz-section" className="quiz-panel bg-white/95 rounded-2xl sm:rounded-[2rem] shadow-xl border border-emerald-100 overflow-hidden">
                <div className="w-full px-4 sm:px-6 py-3 sm:py-4 bg-emerald-50/80 border-b border-emerald-100 flex items-center justify-between gap-3">
                  <button type="button" onClick={() => { if (role === 'teacher') { setShowQuizEditor(prev => { const next = !prev; if (!next) setShowQuizToolbar(false); return next; }); return; } setShowStudentQuizPanel(prev => !prev); }} className="flex-1 text-left font-black text-emerald-800 text-xs sm:text-sm uppercase tracking-tight flex items-center gap-2"><CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> {role === 'teacher' ? 'B\u00e0i ki\u1ec3m tra' : 'B\u00e0i ki\u1ec3m tra'}</button>
                  {role === 'teacher' && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); openQuickQuizPreview(); }} disabled={!quizHasQuickContent} className="h-9 px-3 rounded-xl bg-white text-emerald-700 border border-emerald-200 text-[10px] sm:text-xs font-black uppercase shadow-sm flex items-center justify-center gap-1.5 hover:bg-emerald-600 hover:text-white disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-emerald-700">
                        <FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Xem đề nhanh</span><span className="sm:hidden">Xem đề</span>
                      </button>
                      {showQuizEditor ? <ChevronUp className="w-5 h-5 text-emerald-700" /> : <ChevronDown className="w-5 h-5 text-emerald-700" />}
                    </div>
                  )}
                  {role !== 'teacher' && studentCurrentQuizVisible && (
                    <div className="flex items-center gap-2">
                      <ChevronDown className={`w-5 h-5 text-emerald-700 transition-transform ${showStudentQuizPanel ? 'rotate-180' : ''}`} />
                      {showStudentQuizPanel && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setShowStudentQuizPanel(false); }} className="w-8 h-8 rounded-full bg-white text-emerald-700 border border-emerald-100 shadow-sm flex items-center justify-center active:scale-95" aria-label="Đóng bài kiểm tra">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {role === 'teacher' && showQuizEditor && (
                  <div className="p-3 sm:p-5 space-y-3 sm:space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button type="button" onClick={() => { setQuizTeacherTab('compose'); setShowQuizResults(false); setShowQuizComposeWorkspace(true); }} className={`${showQuizComposeWorkspace ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-100'} h-11 px-2 sm:px-3 rounded-xl font-black text-[10px] sm:text-xs uppercase border shadow-sm flex items-center justify-center gap-2 text-center leading-tight`}><Pencil className="w-3.5 h-3.5" /> Soạn đề</button>
                      <button type="button" onClick={openAutoWorkTeacherTab} className={`${showQuizWorkWorkspace && !showQuizResults ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-700 border-sky-100'} h-11 px-2 sm:px-3 rounded-xl font-black text-[10px] sm:text-xs uppercase border shadow-sm flex items-center justify-center gap-2 text-center leading-tight`}><ListChecks className="w-3.5 h-3.5" /> Bài làm tự động</button>
                      <button type="button" onClick={openScoreTeacherTab} className={`${showQuizWorkWorkspace && showQuizResults ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-blue-700 border-blue-100'} h-11 px-2 sm:px-3 rounded-xl font-black text-[10px] sm:text-xs uppercase border shadow-sm flex items-center justify-center gap-2 text-center leading-tight relative`}>
                        <FileText className="w-3.5 h-3.5" /> Chấm điểm ({quizScoreCount})
                        {pendingHandwrittenSubmissionCount > 0 && (
                          <span className="absolute -top-2 -right-2 min-w-6 h-6 rounded-full bg-rose-600 px-1.5 text-[10px] font-black text-white flex items-center justify-center shadow-md">{pendingHandwrittenSubmissionCount}</span>
                        )}
                      </button>
                      <button type="button" onClick={handleToggleQuizPublish} disabled={isSavingQuiz} className={`${quizPublishAction.className} h-11 px-2 sm:px-3 rounded-xl font-black text-[10px] sm:text-xs uppercase border shadow-sm flex items-center justify-center gap-2 text-center leading-tight disabled:opacity-50`}>
                        {quizPublishAction.icon === 'hide' ? <X className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />} {isSavingQuiz ? 'Đang lưu' : quizPublishAction.label}
                      </button>
                    </div>
                    {showQuizWorkWorkspace && quizTeacherTab === 'work' && <div className="quiz-work-page fixed inset-0 z-[999] h-[100dvh] w-screen overflow-y-auto overscroll-contain bg-slate-100 p-2 sm:p-3">
                      <div className="w-full max-w-none mx-auto space-y-3 sm:space-y-4">
                        <div className="sticky top-0 z-10 rounded-3xl border border-sky-100 bg-white/95 px-3 sm:px-5 py-3 sm:py-4 shadow-lg backdrop-blur flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-black text-sky-900 text-base sm:text-xl uppercase tracking-tight flex items-center gap-2"><ListChecks className="w-5 h-5" /> {showQuizResults ? 'Chấm bài tự động' : 'Bài làm tự động'}</h3>
                            <div className="text-[10px] sm:text-xs font-bold text-sky-700/70 truncate">{showQuizResults ? 'Xem điểm trắc nghiệm, tự luận và cho học sinh làm lại' : 'Chọn trắc nghiệm hoặc tự luận để tạo và quản lý bài làm'}</div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {(showSelfQuizBuilder || showHandwrittenSubmissions) && (
                              <>
                                <button type="button" onClick={openSelfQuizTeacherTab} className={`h-11 px-3 sm:px-4 rounded-2xl border text-xs font-black uppercase flex items-center gap-2 ${showSelfQuizBuilder ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-100 hover:bg-emerald-50'}`}>
                                  <ListChecks className="w-4 h-4" /> Trắc nghiệm
                                </button>
                                <button type="button" onClick={openHandwrittenTeacherTab} className={`h-11 px-3 sm:px-4 rounded-2xl border text-xs font-black uppercase flex items-center gap-2 ${showHandwrittenSubmissions ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-700 border-sky-100 hover:bg-sky-50'}`}>
                                  <UploadCloud className="w-4 h-4" /> Tự luận
                                  {pendingHandwrittenSubmissionCount > 0 && <span className="min-w-5 h-5 rounded-full bg-rose-600 px-1.5 text-[10px] text-white flex items-center justify-center">{pendingHandwrittenSubmissionCount}</span>}
                                </button>
                              </>
                            )}
                            <button type="button" onClick={() => setShowQuizWorkWorkspace(false)} className="h-11 px-3 sm:px-4 rounded-2xl bg-slate-100 text-slate-700 border border-slate-200 text-xs font-black uppercase flex items-center gap-2 hover:bg-slate-200">
                              <X className="w-4 h-4" /> Đóng
                            </button>
                          </div>
                        </div>
                        <div className="rounded-3xl border border-sky-100 bg-white shadow-xl p-3 sm:p-5 space-y-3 sm:space-y-4">
                    {!showSelfQuizBuilder && !showHandwrittenSubmissions && !showQuizResults && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button type="button" onClick={openSelfQuizTeacherTab} className="min-h-[120px] rounded-3xl border border-emerald-100 bg-emerald-50 p-5 text-left shadow-sm hover:bg-emerald-100 transition-colors">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-4">
                            <ListChecks className="w-6 h-6" />
                          </div>
                          <div className="font-black text-emerald-950 text-lg uppercase">Trắc nghiệm</div>
                          <div className="mt-2 text-sm font-bold text-emerald-800/75 leading-relaxed">Tạo bài trắc nghiệm tự chấm, chọn đáp án đúng và lưu cho học sinh làm.</div>
                        </button>
                        <button type="button" onClick={openHandwrittenTeacherTab} className="relative min-h-[120px] rounded-3xl border border-sky-100 bg-sky-50 p-5 text-left shadow-sm hover:bg-sky-100 transition-colors">
                          {pendingHandwrittenSubmissionCount > 0 && (
                            <span className="absolute right-4 top-4 min-w-7 h-7 rounded-full bg-rose-600 px-2 text-xs font-black text-white flex items-center justify-center shadow-md">{pendingHandwrittenSubmissionCount}</span>
                          )}
                          <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center mb-4">
                            <UploadCloud className="w-6 h-6" />
                          </div>
                          <div className="font-black text-sky-950 text-lg uppercase">Tự luận</div>
                          <div className="mt-2 text-sm font-bold text-sky-800/75 leading-relaxed">Xem bài tự luận học sinh nộp, chấm bài chờ và lưu điểm giáo viên.</div>
                        </button>
                      </div>
                    )}
                    <Suspense fallback={<div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700">Đang mở công cụ trắc nghiệm...</div>}>
                      <SelfQuizTeacherTools
                        quizData={quizData}
                        currentQuizResults={currentQuizResults}
                        handwrittenSubmissions={currentHandwrittenSubmissions}
                        students={allStudents}
                        selectedGrade={selectedGrade}
                        currentSchoolYear={currentSchoolYear}
                        showSelfQuizBuilder={showSelfQuizBuilder}
                        showQuizResults={showQuizResults}
                        showHandwrittenSubmissions={showHandwrittenSubmissions}
                        selfQuizDraft={selfQuizDraft}
                        setSelfQuizDraft={setSelfQuizDraft}
                        onCreateDraft={openSelfQuizTeacherTab}
                        onToggleBuilder={() => { setShowSelfQuizBuilder(false); setShowQuizWorkWorkspace(false); }}
                        onToggleResults={() => { setShowQuizResults(false); setShowQuizWorkWorkspace(false); }}
                        onToggleHandwritten={openHandwrittenTeacherTab}
                        onOpenHandwrittenSubmission={openHandwrittenSubmissionByKey}
                        onResetQuizAttempts={resetQuizAttemptsForCurrentLesson}
                        onResetStudentAttempt={resetQuizAttemptsForStudent}
                        onAddQuestion={addSelfQuizQuestion}
                        onUpdateQuestion={updateSelfQuizQuestion}
                        onUpdateOption={updateSelfQuizOption}
                        onRemoveQuestion={removeSelfQuizQuestion}
                        onSaveSelfQuiz={handleSaveSelfQuiz}
                        showWorkTabs={false}
                      />
                    </Suspense>
                    {showHandwrittenSubmissions && (
                    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-sky-100">
                        <button type="button" onClick={() => setShowHandwrittenSubmissions(prev => !prev)} className="text-left font-black text-sky-900 text-xs sm:text-sm uppercase flex items-center gap-2">
                          <UploadCloud className="w-4 h-4" /> Tự luận tự động ({currentHandwrittenSubmissions.length})
                        </button>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={resetQuizAttemptsForCurrentLesson} disabled={currentQuizResults.length + currentHandwrittenSubmissions.length === 0} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 text-[10px] sm:text-xs font-black uppercase flex items-center gap-1.5 hover:bg-rose-600 hover:text-white transition-colors disabled:opacity-50">
                            <RefreshCw className="w-3.5 h-3.5" /> Reset bai lam
                          </button>
                          <button type="button" onClick={handleGradeNextSubmission} disabled={gradingSubmissionId || currentHandwrittenSubmissions.length === 0} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-[10px] sm:text-xs font-black uppercase shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                            {gradingSubmissionId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Chấm bài chờ
                          </button>
                          <button type="button" onClick={() => setShowHandwrittenSubmissions(false)} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 text-[10px] sm:text-xs font-black uppercase flex items-center gap-1.5 hover:bg-rose-600 hover:text-white transition-colors">
                            <X className="w-3.5 h-3.5" /> Đóng
                          </button>
                        </div>
                      </div>
                      {showHandwrittenSubmissions && (
                        <div className="p-3 sm:p-4 space-y-3 bg-white/70">
                          {studentEssayText && (
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 sm:p-4">
                              <div className="mb-2 text-[10px] font-black uppercase text-amber-700">Đề tự luận</div>
                              <div
                                ref={essayPromptRef}
                                className="rounded-xl border border-amber-100 bg-white p-3 sm:p-4 text-xs sm:text-sm font-bold text-slate-800 leading-relaxed student-content"
                                dangerouslySetInnerHTML={{ __html: formatEssayPromptHtml(studentEssayText) }}
                              />
                            </div>
                          )}
                          {currentHandwrittenSubmissions.length > 0 && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                              <div className="text-[10px] sm:text-xs font-black text-sky-800 uppercase">
                                Bài {handwrittenViewerIndex + 1}/{currentHandwrittenSubmissions.length}
                              </div>
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setHandwrittenViewerIndex(prev => Math.max(prev - 1, 0))} disabled={handwrittenViewerIndex <= 0} className="px-3 py-2 rounded-xl bg-white text-sky-700 border border-sky-100 text-[10px] font-black uppercase disabled:opacity-40 flex items-center gap-1">
                                  <ChevronLeft className="w-3.5 h-3.5" /> Trước
                                </button>
                                <button type="button" onClick={() => setHandwrittenViewerIndex(prev => Math.min(prev + 1, currentHandwrittenSubmissions.length - 1))} disabled={handwrittenViewerIndex >= currentHandwrittenSubmissions.length - 1} className="px-3 py-2 rounded-xl bg-white text-sky-700 border border-sky-100 text-[10px] font-black uppercase disabled:opacity-40 flex items-center gap-1">
                                  Sau <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                          {currentHandwrittenSubmissions.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-sky-200 bg-white p-5 text-center text-slate-400 text-xs sm:text-sm font-bold">
                              Chưa có bài viết tay nào được nộp cho bài này.
                            </div>
                          ) : [selectedHandwrittenSubmission].filter(Boolean).map(submission => {
                            const draft = submissionGradeDrafts[submission.id] || {};
                            const displayScore = draft.teacherScore ?? submission.teacherScore ?? submission.aiScore ?? '';
                            const displayMaxScore = draft.teacherMaxScore ?? submission.teacherMaxScore ?? submission.aiMaxScore ?? '10';
                            const displayComment = draft.teacherComment ?? submission.teacherComment ?? '';
                            const isGradingThis = gradingSubmissionId === submission.id || submission.aiStatus === 'grading';
                            return (
                              <div key={submission.id} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
                                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-black text-slate-900 text-sm sm:text-base truncate">{submission.studentName || 'Học sinh'} <span className="text-[11px] text-slate-400">{submission.studentAccessCode ? `- ${submission.studentAccessCode}` : ''}</span></div>
                                    <div className="text-[10px] sm:text-xs font-bold text-slate-500 mt-0.5">
                                      {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString('vi-VN') : ''} • {submission.fileName || 'Bài nộp'}
                                    </div>
                                    <div className={`inline-flex mt-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${submission.status === 'left_page' ? 'bg-rose-50 text-rose-700 border-rose-100' : submission.status === 'teacher_reviewed' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : submission.aiStatus === 'graded' ? 'bg-blue-50 text-blue-700 border-blue-100' : submission.aiStatus === 'error' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                      {submission.status === 'left_page' ? 'HS đã thoát ra ngoài' : submission.status === 'teacher_reviewed' ? 'GV đã duyệt' : submission.aiStatus === 'graded' ? 'AI đã chấm nháp' : submission.aiStatus === 'error' ? 'AI lỗi' : isGradingThis ? 'Đang chấm AI' : 'Chờ AI'}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {submission.fileUrl && <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 text-[10px] sm:text-xs font-black uppercase flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Mở bài</a>}
                                    <button type="button" onClick={() => runAiGradingForSubmission(submission)} disabled={isGradingThis || !submission.fileId} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] sm:text-xs font-black uppercase flex items-center gap-1.5 disabled:opacity-50">
                                      {isGradingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Chấm AI
                                    </button>
                                  </div>
                                </div>
                                {submission.fileUrl && (
                                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                                    <iframe src={getEmbedUrl(submission.fileUrl)} title={`Bài của ${submission.studentName || 'học sinh'}`} className="w-full h-[320px] sm:h-[520px] bg-white border-0" allowFullScreen />
                                  </div>
                                )}
                                {submission.aiComment && (
                                  <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                                    <div className="text-[10px] font-black uppercase text-blue-600 mb-1">Nhận xét AI</div>
                                    <div className="text-xs sm:text-sm font-bold text-slate-700 whitespace-pre-wrap max-h-40 overflow-y-auto">{submission.aiComment}</div>
                                  </div>
                                )}
                                {submission.aiError && submission.aiStatus === 'error' && (
                                  <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-black text-rose-700">{submission.aiError}</div>
                                )}
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-[110px_90px_1fr_auto] gap-2">
                                  <input value={displayScore} onChange={(e) => updateSubmissionGradeDraft(submission.id, 'teacherScore', e.target.value)} placeholder="Điểm" className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-800 focus:outline-none focus:border-emerald-400" />
                                  <input value={displayMaxScore} onChange={(e) => updateSubmissionGradeDraft(submission.id, 'teacherMaxScore', e.target.value)} placeholder="/10" className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-800 focus:outline-none focus:border-emerald-400" />
                                  <input value={displayComment} onChange={(e) => updateSubmissionGradeDraft(submission.id, 'teacherComment', e.target.value)} placeholder="Nhận xét của giáo viên..." className="border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-400" />
                                  <button type="button" onClick={() => saveTeacherGradeForSubmission(submission)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase flex items-center justify-center gap-1.5 shadow-sm">
                                    <Save className="w-3.5 h-3.5" /> Lưu điểm
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    )}
                        </div>
                      </div>
                    </div>}
                  </div>)}
                {role !== 'teacher' && studentCurrentQuizVisible && showStudentQuizPanel && (
                  activeSelfQuiz ? (
                    <div ref={studentQuizContentRef} className="student-quiz-viewport p-4 sm:p-8 student-content space-y-4">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 pr-14 relative">
                        <button type="button" onClick={() => setShowStudentQuizPanel(false)} className="absolute right-3 top-3 w-9 h-9 rounded-full bg-white text-emerald-700 border border-emerald-100 shadow-sm flex items-center justify-center active:scale-95" aria-label="Đóng bài kiểm tra">
                          <X className="w-4 h-4" />
                        </button>
                        <h4 className="font-black text-emerald-900 text-base sm:text-lg uppercase">Làm bài trắc nghiệm tự chấm</h4>
                        <p className="text-xs sm:text-sm text-emerald-700 font-bold mt-1">Học sinh nhập họ tên, chọn đáp án rồi bấm nộp bài. Điểm sẽ được lưu cho giáo viên.</p>
                      </div>
                      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-black text-rose-700">
                        Lưu ý: Khi đang làm trắc nghiệm, nếu em thoát khỏi trang, chuyển tab hoặc chuyển ứng dụng, hệ thống sẽ tự nộp phần bài đã làm. Câu chưa chọn sẽ tính là chưa làm.
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                        <input ref={studentQuizNameRef} value={studentQuizName} onChange={(e) => { setStudentQuizName(e.target.value); if (studentQuizWarning) setStudentQuizWarning(''); }} disabled={studentSelfQuizSubmitted} placeholder="Nhập họ tên..." className="w-full border border-slate-200 rounded-xl px-4 py-3 font-bold text-sm focus:outline-none focus:border-emerald-400 disabled:opacity-60" />
                        {studentReviewQuizResult && activeSelfQuiz.showScoreAfterSubmit !== false && (
                          <div className="bg-white border border-emerald-100 rounded-xl px-4 py-3 font-black text-emerald-700 text-center">
                            Điểm: {formatPointScore(getSelfQuizScorePoint(studentReviewQuizResult))}
                          </div>
                        )}
                      </div>
                      {studentQuizWarning && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-black text-rose-700">
                          {studentQuizWarning}
                        </div>
                      )}
                      <div className="space-y-3">
                        {shuffledSelfQuizQuestions.map((q, qIndex) => (
                          <div key={q.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex gap-3">
                              <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 font-black text-xs flex items-center justify-center flex-shrink-0">{qIndex + 1}</div>
                              <div className="flex-1 min-w-0">
                                <div className="font-black text-slate-800 text-sm sm:text-base whitespace-pre-wrap">{q.text}</div>
                                <div className="mt-3 grid grid-cols-1 gap-2">
                                  {q.displayOptions.map((opt, optIndex) => {
                                    const checked = studentQuizAnswers[q.id] === opt.id;
                                    const submitted = studentSelfQuizSubmitted;
                                    const isCorrectOption = opt.id === q.correctOptionId;
                                    const isWrongSelection = submitted && checked && !isCorrectOption;
                                    const label = String.fromCharCode(65 + optIndex);
                                    return (
                                      <label key={opt.id} className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${isCorrectOption && submitted ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : isWrongSelection ? 'bg-rose-50 border-rose-300 text-rose-900' : checked ? 'bg-blue-50 border-blue-300 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50'} ${submitted ? 'cursor-default' : 'cursor-pointer'}`}>
                                        <input type="radio" name={`student-${q.id}`} checked={checked} disabled={submitted} onChange={() => { setStudentQuizAnswers(prev => ({ ...prev, [q.id]: opt.id })); if (studentQuizWarning) setStudentQuizWarning(''); }} className="mt-1" />
                                        <span className="font-black text-xs bg-white border border-slate-200 rounded-lg w-7 h-7 flex items-center justify-center flex-shrink-0">{label}</span>
                                        <span className="text-sm font-bold whitespace-pre-wrap flex-1">{opt.text}</span>
                                        {submitted && isCorrectOption && <span className="text-[10px] font-black text-emerald-700 uppercase">Đúng</span>}
                                        {isWrongSelection && <span className="text-[10px] font-black text-rose-700 uppercase">Sai</span>}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 justify-end">
                        <button type="button" onClick={handleSubmitSelfQuiz} disabled={isSubmittingSelfQuiz || studentSelfQuizSubmitted || !canWriteCurrentSchoolYear} className="px-5 py-3 bg-rose-600 text-white rounded-xl text-xs font-black uppercase shadow-md flex items-center justify-center gap-2 disabled:opacity-50">
                          {isSubmittingSelfQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {!canWriteCurrentSchoolYear ? 'Năm học đã khóa' : (studentSelfQuizSubmitted ? 'Đã nộp trắc nghiệm' : 'Nộp trắc nghiệm')}
                        </button>
                      </div>
                      {studentEssayText && (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 sm:p-5 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="font-black text-amber-900 text-sm sm:text-base uppercase">Phần tự luận</h4>
                            <span className="text-[10px] font-black text-amber-700 bg-white border border-amber-100 rounded-full px-3 py-1">Nộp tay</span>
                          </div>
                          <div className="bg-white border border-amber-100 rounded-xl p-4 text-sm sm:text-base font-bold text-slate-800 whitespace-pre-wrap leading-relaxed">{studentEssayText}</div>
                          <button type="button" onClick={() => studentSubmitSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="w-full sm:w-auto px-4 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-black uppercase shadow-sm">Nộp phần tự luận bên dưới</button>
                        </div>
                      )}
                      {studentSelfQuizSubmitted && activeSelfQuiz.showScoreAfterSubmit === false && <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center text-blue-700 text-sm font-black">Đã ghi nhận bài làm. Giáo viên sẽ xem điểm trong bảng điểm.</div>}
                    </div>
                  ) : (
                    <div ref={studentQuizContentRef} className="student-quiz-viewport p-4 sm:p-8 text-base sm:text-lg leading-relaxed student-content"><div dangerouslySetInnerHTML={{ __html: quizHtml }} /></div>
                  )
                )}
              </div>
            )}

            {/* KHO CHUNG - BỘ LỌC TỰ ĐỘNG VÀ UP FILE TRỰC TIẾP */}
            {role === 'teacher' && (
              <div className={`${showCommonLibraryWorkspace ? 'fixed inset-0 z-[190] block overflow-y-auto bg-slate-100/95 p-2 backdrop-blur-md' : 'hidden'} sm:static sm:z-auto sm:block sm:overflow-hidden sm:bg-white/90 sm:p-0 sm:backdrop-blur-0 sm:rounded-[2.5rem] shadow-xl border border-white/60 sm:mt-12`}>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:px-8 sm:py-7 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex w-full items-start justify-between gap-3 md:w-auto">
                    <div>
                    <h3 className="font-black text-blue-900 flex items-center gap-2 sm:gap-3 text-lg sm:text-xl uppercase tracking-tighter"><Folder className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />Tài liệu Kho Chung</h3>
                    <p className="text-[9px] sm:text-[10px] text-blue-700/60 mt-1 sm:mt-1.5 font-black uppercase tracking-widest">Nguồn tài liệu tham khảo thêm</p>
                    </div>
                    {showCommonLibraryWorkspace && (
                      <button type="button" onClick={() => setShowCommonLibraryWorkspace(false)} className="sm:hidden w-10 h-10 rounded-full bg-rose-600 text-white shadow-lg flex items-center justify-center active:scale-95" aria-label="Đóng kho tài liệu">
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2 bg-white border-2 border-blue-100 rounded-xl sm:rounded-2xl p-1.5 shadow-sm w-full sm:w-auto">
                      <button type="button" onClick={() => setSelectedLesson(prev => String(Math.max(1, Number(prev || 1) - 1)))} disabled={Number(selectedLesson) <= 1} className="w-10 h-10 rounded-lg sm:rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center hover:bg-blue-600 hover:text-white disabled:opacity-30 disabled:hover:bg-blue-50 disabled:hover:text-blue-700 transition-all flex-shrink-0"><ChevronLeft className="w-5 h-5" /></button>
                      <select value={selectedLesson || "1"} onChange={(e) => setSelectedLesson(e.target.value)} className="flex-1 h-10 bg-white border-0 text-blue-900 font-black text-xs sm:text-sm px-2 sm:px-3 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-50 cursor-pointer text-center sm:text-left">
                        {Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1).map(lesson => (<option key={lesson} value={String(lesson)}>{getWeekData(lesson).isExam ? getWeekData(lesson).main : 'Tuần ' + lesson}</option>))}
                      </select>
                      <button type="button" onClick={() => setSelectedLesson(prev => String(Math.min(TOTAL_LESSONS, Number(prev || 1) + 1)))} disabled={Number(selectedLesson) >= TOTAL_LESSONS} className="w-10 h-10 rounded-lg sm:rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center hover:bg-blue-600 hover:text-white disabled:opacity-30 disabled:hover:bg-blue-50 disabled:hover:text-blue-700 transition-all flex-shrink-0"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                    <button onClick={() => setShowBulkUpload(!showBulkUpload)} className="flex-1 md:flex-none bg-indigo-100 text-indigo-700 px-4 sm:px-6 py-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition-all hover:bg-indigo-200 active:scale-95 border-2 border-indigo-200">
                      <ListChecks className="w-4 h-4 sm:w-5 sm:h-5" /><span className="sm:hidden">UP TÀI LIỆU</span><span className="hidden sm:inline">{showBulkUpload ? 'ĐÓNG FORM' : 'UP TÀI LIỆU'}</span>
                    </button>
                    <button onClick={fetchDriveData} className="flex-none bg-white text-blue-700 px-4 py-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm shadow-sm flex items-center justify-center transition-all hover:shadow-lg border-2 border-blue-100 active:scale-95"><RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isLoadingDrive ? 'animate-spin' : ''}`} /></button>
                  </div>
                </div>

                {showBulkUpload && (
                    <div className="bulk-upload-panel p-4 sm:p-6 bg-indigo-50 border-b border-indigo-100 animate-in slide-in-from-top-2">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div className="flex items-center gap-2 text-indigo-900 font-black uppercase tracking-widest text-xs sm:text-sm">
                            <UploadCloud className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                            <span>Up tài liệu vào kho</span>
                          </div>
                          <button type="button" onClick={() => setShowBulkUpload(false)} className="px-3 py-2 bg-white text-slate-600 hover:text-rose-600 border border-indigo-100 rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-widest shadow-sm flex items-center gap-2 active:scale-95 transition-all">
                            <X className="w-4 h-4" />
                            <span>Đóng up bài</span>
                          </button>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 mb-8 bg-white/60 p-3 rounded-3xl w-full border border-indigo-100">
                          <button type="button" onClick={() => setUploadTab('manual')} className={`flex-1 py-3 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2.5 ${uploadTab === 'manual' ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-600/70 hover:text-indigo-800 hover:bg-indigo-100'}`}><Folder className="w-4 h-4"/> Up Hàng Loạt</button>
                          <button type="button" onClick={() => setUploadTab('bylesson')} className={`flex-1 py-3 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2.5 ${uploadTab === 'bylesson' ? 'bg-emerald-600 text-white shadow-md' : 'text-indigo-600/70 hover:text-emerald-800 hover:bg-emerald-100'}`}><ListChecks className="w-4 h-4"/> Up & Ghim theo Tuần</button>
                          <button type="button" onClick={() => setUploadTab('link')} className={`flex-1 py-3 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2.5 ${uploadTab === 'link' ? 'bg-orange-500 text-white shadow-md' : 'text-indigo-600/70 hover:text-orange-800 hover:bg-orange-100'}`}><LinkIcon className="w-4 h-4"/> Ghép Link Web</button>
                        </div>
                        <form onSubmit={handleGlobalUpload} className="space-y-4">
                          {uploadTab === 'manual' && (
                            <div className="animate-in fade-in duration-300">
                              <div className="bg-white/80 p-6 sm:p-10 rounded-[2rem] border-2 border-dashed border-indigo-300 flex flex-col items-center text-center relative group hover:bg-indigo-50/80 hover:border-indigo-400 cursor-pointer transition-all">
                                <UploadCloud className="w-16 h-16 text-indigo-300 mb-4 group-hover:scale-110 group-hover:text-indigo-500 transition-all duration-300" />
                                <label className="block text-lg font-black text-indigo-900 mb-2">Kéo thả vô số file vào đây</label>
                                <p className="text-xs text-indigo-500 font-bold mb-6">Hỗ trợ PDF, Word, Excel, PowerPoint, Hình ảnh...</p>
                                <input type="file" multiple onChange={(e) => setManualFiles(Array.from(e.target.files))} className="w-full opacity-0 absolute h-full top-0 left-0 z-10 cursor-pointer" />
                                <div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg hover:-translate-y-1 transition-all text-xs sm:text-sm">Bấm để chọn file</div>
                                {manualFiles.length > 0 && (
                                  <div className="mt-6 w-full bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm relative z-20">
                                    <h4 className="text-left font-black text-slate-800 mb-3 text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Đã chọn {manualFiles.length} file:</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[150px] overflow-y-auto scrollbar-thin">
                                      {manualFiles.map((f, i) => (<div key={i} className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center gap-2 text-slate-600 text-[10px] font-bold truncate"><FileText className="w-3 h-3 text-indigo-500 flex-shrink-0" /><span className="truncate">{f.name}</span></div>))}
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="flex justify-center pt-4">
                                <button type="submit" disabled={isSubmitting || manualFiles.length === 0} className="w-full sm:w-auto px-10 py-4 bg-indigo-600 text-white rounded-3xl font-black shadow-xl flex items-center justify-center gap-3 hover:-translate-y-1 transition-all disabled:opacity-50 active:scale-95 text-xs sm:text-sm uppercase tracking-widest">
                                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> ĐANG UP {uploadProgress.current}/{uploadProgress.total}...</> : <><UploadCloud className="w-5 h-5" /> ĐẨY TOÀN BỘ LÊN KHO DRIVE</>}
                                </button>
                              </div>
                            </div>
                          )}

                          {uploadTab === 'bylesson' && (
                            <div className="animate-in fade-in duration-300">
                              <div className="max-h-[350px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                                {Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1).map(l => {
                                  const wData = getWeekData(l);
                                  return (
                                  <div key={l} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-[1.5rem] border-2 transition-all ${lessonFilesMap[l] && lessonFilesMap[l].length > 0 ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-slate-100 hover:border-emerald-200'}`}>
                                     <div className="flex items-center gap-3 mb-2 sm:mb-0 w-40">
                                       <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${lessonFilesMap[l] && lessonFilesMap[l].length > 0 ? 'bg-emerald-500 text-white shadow-md' : (wData.isExam ? wData.text + ' bg-slate-50 border border-slate-200' : 'bg-slate-100 text-slate-500')}`}>{l}</div>
                                       <span className={`font-black ${wData.isExam ? wData.text : 'text-slate-600'} text-xs sm:text-sm`}>{wData.isExam ? wData.main : 'Tuần ' + l}</span>
                                     </div>
                                     <div className="flex-1 w-full">
                                       {lessonFilesMap[l] && lessonFilesMap[l].length > 0 ? (
                                         <div className="flex flex-col gap-1.5">
                                            {lessonFilesMap[l].map((file, fIdx) => (
                                              <div key={fIdx} className="bg-white p-2 rounded-xl border border-emerald-100 flex items-center justify-between text-emerald-700 text-[10px] sm:text-xs font-bold shadow-sm">
                                               <div className="flex items-center gap-2 truncate pr-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /><span className="truncate">{file.name}</span></div>
                                               <button type="button" onClick={() => removeFileFromLesson(l, fIdx)} className="text-slate-400 hover:text-rose-500 bg-slate-50 hover:bg-rose-50 p-1.5 rounded-md transition-colors flex-shrink-0"><Trash2 className="w-3 h-3" /></button>
                                             </div>
                                           ))}
                                           <div className="relative mt-1">
                                            <input type="file" multiple onChange={(e) => handleLessonFileChange(l, e.target.files)} className="w-full opacity-0 absolute h-full cursor-pointer top-0 left-0" />
                                            <button type="button" className="text-[9px] font-black text-emerald-600 uppercase tracking-widest hover:underline">+ Chọn thêm file</button>
                                           </div>
                                         </div>
                                       ) : (
                                         <div className="relative">
                                            <input type="file" multiple onChange={(e) => handleLessonFileChange(l, e.target.files)} className="w-full opacity-0 absolute h-full cursor-pointer top-0 left-0 z-10" />
                                           <div className="w-full bg-slate-50 border border-dashed border-slate-300 text-slate-400 py-2 sm:py-3 rounded-xl text-center font-bold text-[10px] sm:text-xs hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 transition-all cursor-pointer">
                                             Nhấp/kéo file vào {wData.isExam ? wData.main : 'Tuần ' + l}
                                            </div>
                                         </div>
                                       )}
                                     </div>
                                  </div>
                                )})}
                              </div>
                              <div className="flex justify-center pt-6 border-t border-indigo-100/50 mt-4">
                                <button type="submit" disabled={isSubmitting || Object.keys(lessonFilesMap).length === 0} className="w-full sm:w-auto px-10 py-4 bg-emerald-600 text-white rounded-3xl font-black shadow-xl flex items-center justify-center gap-3 hover:-translate-y-1 transition-all disabled:opacity-50 active:scale-95 text-xs sm:text-sm uppercase tracking-widest">
                                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> ĐANG XỬ LÝ {uploadProgress.current}/{uploadProgress.total}...</> : <><CheckCircle2 className="w-5 h-5" /> UP LÊN KHO VÀ TỰ ĐỘNG GHIM</>}
                                </button>
                              </div>
                            </div>
                          )}

                          {uploadTab === 'link' && (
                            <div className="animate-in fade-in duration-300 bg-white/60 p-5 sm:p-8 rounded-[2rem] border border-white">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
                                <div><label className="block text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Tên hiển thị (Tùy chọn):</label><input type="text" placeholder="VD: Video hướng dẫn giải..." className="w-full border-2 border-slate-200 p-3 sm:p-4 rounded-xl font-bold focus:border-orange-400 focus:ring-0 text-sm" value={linkData.title} onChange={(e) => setLinkData({...linkData, title: e.target.value})} /></div>
                                <div><label className="block text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Đường dẫn URL:</label><input required type="url" placeholder="https://youtube.com/..." className="w-full border-2 border-slate-200 p-3 sm:p-4 rounded-xl font-bold focus:border-orange-400 focus:ring-0 text-sm" value={linkData.url} onChange={(e) => setLinkData({...linkData, url: e.target.value})} /></div>
                              </div>
                              <div className="bg-orange-50/50 p-4 sm:p-5 rounded-2xl border border-orange-100 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                 <div className="flex-1 w-full"><label className="block text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Chọn Tuần để ghim Link:</label><select value={linkData.lesson} onChange={(e) => setLinkData({...linkData, lesson: e.target.value})} className="w-full bg-white border-2 border-slate-200 p-3 rounded-xl font-black text-slate-700 focus:border-orange-400 transition-all cursor-pointer text-sm">{Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1).map(l => <option key={l} value={l}>Ghim vào {getWeekData(l).isExam ? getWeekData(l).main : 'Tuần ' + l}</option>)}</select></div>
                                 <div className="w-full sm:w-auto"><label className="block text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Loại biểu tượng:</label>
                                   <div className="flex space-x-2">
                                     {['link', 'pdf', 'ppt'].map(type => (
                                       <label key={type} className={`flex-1 sm:flex-none flex items-center justify-center space-x-1.5 cursor-pointer px-3 py-2 sm:py-3 rounded-xl border-2 transition-all ${linkData.type === type ? 'border-orange-400 bg-orange-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                         <input type="radio" name="linkType" value={type} checked={linkData.type === type} onChange={(e) => setLinkData({...linkData, type: e.target.value})} className="hidden" />
                                         <span className="uppercase text-[10px] sm:text-xs font-black text-slate-700">{type}</span>
                                       </label>
                                     ))}
                                   </div>
                                 </div>
                              </div>
                              <div className="flex justify-center">
                                <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-10 py-4 bg-orange-500 text-white rounded-3xl font-black shadow-xl flex items-center justify-center gap-3 hover:-translate-y-1 transition-all disabled:opacity-50 active:scale-95 text-xs sm:text-sm uppercase tracking-widest">
                                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" /> ĐANG LƯU...</> : <><LinkIcon className="w-5 h-5" /> LƯU & GHIM LINK NÀY</>}
                                </button>
                              </div>
                            </div>
                          )}
                        </form>
                    </div>
                )}

                <div className="p-0">
                  {isLoadingDrive ? (
                    <div className="py-16 sm:py-24 text-center text-slate-400 font-black flex flex-col items-center gap-4 text-sm sm:text-base"><Loader2 className="w-8 h-8 sm:w-10 sm:h-10 animate-spin text-blue-500" /> ĐANG QUÉT KHO CHUNG...</div>
                  ) : driveError ? (
                    <div className="p-8 sm:p-12 text-rose-500 font-black text-center text-sm sm:text-base">{driveError}</div>
                  ) : driveFiles.length === 0 ? (
                    <div className="text-center py-16 sm:py-24 text-slate-300 font-black uppercase text-xs sm:text-sm tracking-[0.2em] sm:tracking-[0.3em]">Kho chung hiện trống. (Thầy cô có thể up file trực tiếp tại đây)</div>
                  ) : (
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto hide-scrollbar">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50/80 text-[10px] sm:text-[11px] font-black uppercase text-slate-400 border-b tracking-[0.2em]">
                            <th className="px-4 sm:px-6 py-4 sm:py-5 w-1/2">
                              <button type="button" onClick={() => setDriveSort({ key: 'name', direction: driveSort.key === 'name' && driveSort.direction === 'asc' ? 'desc' : 'asc' })} className="inline-flex items-center gap-1.5 sm:gap-2 hover:text-blue-700 transition-colors whitespace-nowrap">
                                <span>Tên file</span>{driveSort.key === 'name' ? (driveSort.direction === 'asc' ? <ArrowUpAZ className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <ArrowDownAZ className="w-3.5 h-3.5 sm:w-4 sm:h-4" />) : <ArrowUpAZ className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-30" />}
                              </button>
                            </th>
                            <th className="px-4 sm:px-6 py-4 sm:py-5 w-1/4">
                              <button type="button" onClick={() => setDriveSort({ key: 'pinned', direction: driveSort.key === 'pinned' && driveSort.direction === 'desc' ? 'asc' : 'desc' })} className="inline-flex items-center gap-1.5 sm:gap-2 hover:text-emerald-700 transition-colors whitespace-nowrap">
                                <span className="hidden sm:inline">Đã ghim</span><span className="sm:hidden">Ghim</span>{driveSort.key === 'pinned' ? (driveSort.direction === 'desc' ? <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <ArrowUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />) : <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-30" />}
                              </button>
                            </th>
                            <th className="px-4 sm:px-6 py-4 sm:py-5 text-right w-1/4 whitespace-nowrap">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {sortedDriveFiles.map(f => {
                            const pinnedLessons = getPinnedLessonsForDriveFile(f);
                            const fileExt = f.name.includes('.') ? f.name.split('.').pop().toUpperCase() : 'LINK';
                            return (
                              <tr key={f.id} className="bg-white hover:bg-blue-50/50 transition-colors">
                                <td className="px-4 sm:px-6 py-4 sm:py-5 whitespace-normal break-words min-w-[150px] max-w-[200px]">
                                  <a href={f.webViewLink} target="_blank" rel="noreferrer" className="font-black text-slate-700 text-xs sm:text-sm hover:text-blue-600 block tracking-tight leading-tight">{getDriveBaseName(f.name)} <span className="text-[8px] sm:text-[9px] text-slate-400 font-black ml-1 px-1.5 py-0.5 bg-slate-100 rounded-md">.{fileExt}</span></a>
                                  {f.description && <p className="text-[10px] sm:text-xs text-slate-500 font-bold mt-1 sm:mt-1.5 mb-1 sm:mb-2">{f.description}</p>}
                                </td>
                                <td className="px-4 sm:px-6 py-4 sm:py-5 align-top pt-5 sm:pt-6">
                                  {pinnedLessons.length > 0 && (<div className="flex flex-wrap gap-1 sm:gap-1.5">{pinnedLessons.map(label => (<span key={label} className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-sm border border-emerald-200 bg-emerald-100 text-emerald-700">{label}</span>))}</div>)}
                                </td>
                                <td className="px-4 sm:px-6 py-4 sm:py-5 text-right align-top pt-4 sm:pt-5">
                                  <div className="flex flex-col sm:flex-row justify-end gap-1.5 sm:gap-2">
                                    <button onClick={() => handleSelectDriveFile(f)} className="bg-blue-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-[10px] hover:bg-blue-700 transition-all shadow-md uppercase tracking-wider">Ghim</button>
                                    <button onClick={() => handleHideFromDrive(f)} className="bg-rose-100 text-rose-600 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-[10px] hover:bg-rose-600 hover:text-white transition-all shadow-sm uppercase tracking-wider" title="Ẩn file khỏi Kho chung">Xóa</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {role === 'student' && studentCanAccessCurrentGradeQuiz && studentWorkReviewReady && (
              <div className="bg-white/95 rounded-2xl sm:rounded-[2rem] shadow-xl border border-blue-100 overflow-hidden animate-in fade-in duration-500">
                <button type="button" onClick={() => setShowStudentWorkReview(prev => !prev)} className="w-full px-4 sm:px-6 py-3 sm:py-4 bg-blue-50/80 border-b border-blue-100 flex items-center justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <h3 className="font-black text-blue-900 text-sm sm:text-lg uppercase">Xem bài làm của em</h3>
                    <p className="text-[10px] sm:text-xs font-bold text-blue-600 mt-0.5">Trắc nghiệm, tự luận và điểm đã chấm.</p>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-blue-700 transition-transform ${showStudentWorkReview ? 'rotate-180' : ''}`} />
                </button>
                {showStudentWorkReview && (
                  <div ref={studentWorkReviewRef} className="p-4 sm:p-6 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-center">
                        <div className="text-[10px] font-black uppercase text-emerald-700">Trắc nghiệm</div>
                        <div className="text-lg font-black text-emerald-900">{studentWorkReviewScore.hasQuizScore ? formatPointScore(studentWorkReviewScore.quizScore) : '-'}</div>
                      </div>
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-3 text-center">
                        <div className="text-[10px] font-black uppercase text-indigo-700">Tự luận</div>
                        <div className="text-lg font-black text-indigo-900">{studentWorkReviewScore.hasEssayScore ? formatPointScore(studentWorkReviewScore.essayScore) : '-'}</div>
                      </div>
                      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3 text-center">
                        <div className="text-[10px] font-black uppercase text-blue-700">Tổng</div>
                        <div className="text-lg font-black text-blue-900">{studentWorkReviewScore.hasTotalScore ? formatPointScore(studentWorkReviewScore.totalScore) : '-'}</div>
                      </div>
                    </div>
                    {studentReviewQuizResult?.answers?.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 font-black text-slate-800 text-xs uppercase">Phần trắc nghiệm</div>
                        <div className="divide-y divide-slate-100">
                          {studentReviewQuizResult.answers.map((answer, index) => (
                            <div key={`${answer.questionId}-${index}`} className="p-3 sm:p-4">
                              <div className="font-black text-slate-800 text-sm">Câu {index + 1}: {answer.questionText}</div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black">
                                <span className={`px-2.5 py-1 rounded-full border ${answer.isCorrect ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                                  Em chọn: {String(answer.selectedOptionId || '-').toUpperCase()}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Đáp án: {String(answer.correctOptionId || '-').toUpperCase()}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                                  Điểm: {formatPointScore(answer.isCorrect ? 0.25 : 0)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {studentSavedHandwrittenSubmission?.fileUrl && (
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 overflow-hidden">
                        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 font-black text-indigo-800 text-xs uppercase flex items-center justify-between gap-3">
                          <span>Phần tự luận đã nộp</span>
                          <a href={studentSavedHandwrittenSubmission.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] bg-white border border-indigo-100 text-indigo-700 rounded-xl px-3 py-1.5">Mở bài</a>
                        </div>
                        <iframe src={getEmbedUrl(studentSavedHandwrittenSubmission.fileUrl)} title="Bài tự luận đã nộp" className="w-full h-[320px] sm:h-[520px] bg-white border-0" allowFullScreen />
                      </div>
                    )}
                    {(studentSavedHandwrittenSubmission?.aiComment || studentSavedHandwrittenSubmission?.teacherComment) && (
                      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                        <div className="text-[10px] font-black uppercase text-blue-700 mb-2">Nhận xét</div>
                        <div className="text-xs sm:text-sm font-bold text-slate-700 whitespace-pre-wrap">{studentSavedHandwrittenSubmission.teacherComment || studentSavedHandwrittenSubmission.aiComment}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* --- NỘP BÀI HỌC SINH --- */}
            {role === 'student' && studentCanAccessCurrentGradeQuiz && (
              <div ref={studentSubmitSectionRef} className="bg-white/95 rounded-2xl sm:rounded-[2rem] shadow-xl border border-white/70 overflow-hidden animate-in fade-in duration-500">
                 <div className="flex flex-row items-center gap-3 sm:gap-5 px-4 sm:px-8 py-3 sm:py-5 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-emerald-50 text-left">
                    <div className="bg-white p-2 sm:p-3 rounded-xl text-sky-600 shadow-sm border border-sky-100"><UploadCloud className="w-5 h-5 sm:w-6 sm:h-6" /></div>
                    <div className="min-w-0">
                       <h3 className="font-black text-base sm:text-2xl text-slate-800 tracking-tight">Nộp Bài Làm Cho Thầy Cô</h3>
                       <p className="text-[9px] sm:text-xs font-black text-slate-500 mt-0.5 uppercase tracking-widest truncate">Học sinh nộp trực tiếp (Không cần tài khoản Google)</p>
                    </div>
                 </div>
                 <div className="p-4 sm:p-8 space-y-3 sm:space-y-5">
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs sm:text-sm font-black text-amber-800">
                      Lưu ý: Nếu đang làm bài tự luận mà em thoát khỏi trang, chuyển tab hoặc chuyển ứng dụng, hệ thống sẽ khóa bài và ghi nhận: em đã thoát ra ngoài. Chọn ảnh hoặc chụp ảnh để nộp bài không bị tính là thoát.
                    </div>
                    <div>
                       <label className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Họ và Tên của em:</label>
                       <input ref={studentSubmitNameRef} type="text" placeholder="Nhập họ tên..." value={studentName} onChange={(e) => setStudentName(e.target.value)} disabled={studentEssaySubmitted} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 sm:px-5 sm:py-4 rounded-xl focus:outline-none focus:ring-4 focus:ring-sky-50 focus:border-sky-300 font-bold text-sm sm:text-lg text-slate-800 transition-all disabled:opacity-60" />
                    </div>
                    <div>
                       <label className="block text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Chọn tệp tin hoặc hình ảnh bài làm:</label>
                       <div className="relative">
                          <label htmlFor="student-file-upload" onPointerDown={markSubmissionFilePickerActive} onClick={markSubmissionFilePickerActive} className={`flex items-center justify-between gap-3 w-full border border-dashed border-sky-300 bg-sky-50/60 hover:bg-sky-50 px-4 py-3 sm:px-5 sm:py-4 rounded-xl transition-colors ${studentEssaySubmitted ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                              <Download className="w-5 h-5 text-sky-500 shrink-0"/>
                              <span className="text-xs sm:text-sm font-black text-sky-800 text-left min-w-0 flex-1 truncate">{submissionFile ? submissionFile.name : "Nhấp vào đây để chọn tệp"}</span>
                              <span className="hidden sm:inline text-[10px] text-slate-400 font-black uppercase tracking-wider whitespace-nowrap">Hỗ trợ Ảnh, Word, PDF... (Dưới 25MB)</span>
                          </label>
                          <input id="student-file-upload" type="file" className="hidden" disabled={studentEssaySubmitted} onClick={markSubmissionFilePickerActive} onChange={(e) => { handleSelectSubmissionFile(e.target.files?.[0]); e.target.value = null; }} />
                       </div>
                       {submissionFile && (
                          <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 space-y-3">
                             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-emerald-900 font-black">
                                <div className="flex items-center gap-2 min-w-0">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                  <span className="text-xs sm:text-base truncate w-full text-left">DA CHON TEP: <span className="text-emerald-600">{submissionFile.name}</span></span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {submissionPreviewUrl && <a href={submissionPreviewUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-white border border-emerald-100 text-emerald-700 text-[10px] font-black uppercase flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Mo xem</a>}
                                  <button type="button" onClick={clearSubmissionFile} className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-black uppercase flex items-center gap-1.5 hover:bg-rose-600 hover:text-white"><Trash2 className="w-3.5 h-3.5" /> Xoa chon lai</button>
                                </div>
                             </div>
                             {submissionPreviewUrl && submissionFile.type?.startsWith('image/') && (
                               <img src={submissionPreviewUrl} alt="Xem lai bai lam vua chon" className="max-h-[360px] w-full rounded-xl border border-emerald-100 bg-white object-contain" />
                             )}
                             {submissionPreviewUrl && submissionFile.type === 'application/pdf' && (
                               <iframe src={submissionPreviewUrl} title="Xem lai bai lam PDF" className="h-[360px] w-full rounded-xl border border-emerald-100 bg-white" />
                             )}
                             {!submissionFile.type?.startsWith('image/') && submissionFile.type !== 'application/pdf' && (
                               <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[11px] font-bold text-slate-600">Neu la Word hoac tep khac, bam Mo xem de kiem tra dung tep truoc khi nop.</div>
                             )}
                          </div>
                       )}
                    </div>
                    {studentEssaySubmitted && <div className={`p-3 sm:p-4 rounded-xl font-black text-[11px] sm:text-sm text-center ${studentSavedHandwrittenSubmission?.status === 'left_page' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{studentSavedHandwrittenSubmission?.status === 'left_page' ? 'Em đã thoát ra ngoài nên bài tự luận đã bị khóa. Hãy báo giáo viên nếu cần mở lại.' : 'Em đã nộp bài tự luận rồi. Mỗi học sinh chỉ nộp 1 lần.'}</div>}
                    {submissionStatus && <div className={`p-3 sm:p-4 rounded-xl font-black text-[11px] sm:text-sm text-center animate-in slide-in-from-top-2 duration-300 ${submissionStatus.includes('thành công') || submissionStatus.includes('Đã gửi') ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{submissionStatus}</div>}
                    <div className="flex justify-center">
                       <button onClick={handleStudentSubmit} disabled={isSubmittingWork || studentEssaySubmitted || !canWriteCurrentSchoolYear} className="w-full px-5 py-3 sm:py-4 bg-sky-600 text-white rounded-xl font-black shadow-md flex items-center justify-center gap-2 hover:bg-sky-700 transition-all active:scale-95 text-xs sm:text-base uppercase tracking-widest disabled:opacity-50">
                          {!canWriteCurrentSchoolYear ? 'NĂM HỌC ĐÃ KHÓA' : studentEssaySubmitted ? 'ĐÃ NỘP TỰ LUẬN' : isSubmittingWork ? <><Loader2 className="w-5 h-5 animate-spin" /> ĐANG GỬI...</> : 'BẮT ĐẦU NỘP BÀI'}
                       </button>
                    </div>
                 </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showQuickQuizPreview && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-[95] animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-white/20">
            <div className="px-4 sm:px-6 py-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-black text-emerald-900 text-base sm:text-xl uppercase tracking-tight flex items-center gap-2"><FileText className="w-5 h-5" /> Xem đề nhanh</h3>
                <p className="text-[10px] sm:text-xs font-bold text-emerald-700/70 truncate">Đề kiểm tra kèm đáp án và biểu điểm dành cho giáo viên</p>
              </div>
              <button type="button" onClick={() => setShowQuickQuizPreview(false)} className="p-3 rounded-full bg-white border border-emerald-100 text-slate-500 hover:bg-rose-500 hover:text-white shadow-sm transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div ref={quickQuizPreviewRef} className="teacher-content p-4 sm:p-7 text-base sm:text-lg leading-relaxed overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: getCurrentQuizContent() }} />
            </div>
          </div>
        </div>
      )}

      {showQuizPublishModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-white/20">
            <h3 className="text-lg font-black text-slate-800 mb-3">Chọn cách phát đề</h3>
            <p className="text-sm text-slate-500 font-bold mb-5">Bài kiểm tra sẽ hiển thị cho học sinh theo lựa chọn của thầy cô.</p>
            <div className="space-y-3">
              {quizData?.questions?.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3">
                  <div className="text-[10px] font-black text-emerald-700 uppercase mb-2">Học sinh sẽ thấy bản nào?</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setPendingQuizDeliveryMode('auto')} className={`py-2 rounded-xl text-[10px] font-black uppercase border ${pendingQuizDeliveryMode === 'auto' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-100'}`}>Tự chấm</button>
                    <button type="button" onClick={() => setPendingQuizDeliveryMode('manual')} className={`py-2 rounded-xl text-[10px] font-black uppercase border ${pendingQuizDeliveryMode === 'manual' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-200'}`}>Bản thường</button>
                  </div>
                </div>
              )}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-[10px] font-black text-blue-800 uppercase">Ghi điểm vào cột nào?</div>
                  {quizScoreSubject && <div className="text-[10px] font-black text-blue-500">{quizScoreSubject.label} · {quizScoreSemester === 'hki' ? 'HK1' : 'HK2'}</div>}
                </div>
                {!quizScoreSubject ? (
                  <div className="text-xs font-bold text-slate-500 bg-white rounded-xl p-3 border border-blue-100">Môn này chưa có bảng điểm nhanh nên chưa tự ghi điểm.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      <button type="button" onClick={() => setPendingQuizScoreTarget(null)} className={`py-2 rounded-xl text-[10px] font-black uppercase border ${!pendingQuizScoreTarget ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200'}`}>Không ghi</button>
                      {quizScoreTargetOptions.map(option => {
                        const active = pendingQuizScoreTarget
                          && String(pendingQuizScoreTarget.semester) === String(quizScoreSemester)
                          && Number(pendingQuizScoreTarget.pageIndex) === Number(quizScoreSubject.pageIndex)
                          && Number(pendingQuizScoreTarget.scoreIndex) === Number(option.scoreIndex);
                        return (
                          <button
                            key={`score-target-${option.label}`}
                            type="button"
                            disabled={option.used}
                            onClick={() => setPendingQuizScoreTarget({
                              grade: String(selectedGrade || ''),
                              schoolYear: currentSchoolYear || '',
                              semester: quizScoreSemester,
                              semesterLabel: quizScoreSemester === 'hki' ? 'HK1' : 'HK2',
                              subjectKey: quizScoreSubject.key,
                              subjectLabel: quizScoreSubject.label,
                              pageIndex: quizScoreSubject.pageIndex,
                              scoreIndex: option.scoreIndex,
                              label: option.label
                            })}
                            className={`py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${active ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : option.used ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-white text-blue-700 border-blue-100 hover:bg-blue-600 hover:text-white'}`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[10px] font-bold text-blue-500">Cột mờ là cột đã có điểm trong bảng điểm của khối này.</div>
                  </>
                )}
              </div>
              <button onClick={confirmQuizPublishNow} className="w-full py-3 bg-emerald-600 text-white rounded-2xl font-black shadow-lg">Phát đề ngay</button>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Hẹn ngày giờ (giờ Việt Nam)</label>
                <input type="datetime-local" value={quizPublishModalAt} onChange={(e) => setQuizPublishModalAt(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-700 outline-none" />
                <button onClick={confirmQuizSchedule} className="mt-3 w-full py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs">Lưu và hẹn giờ</button>
              </div>
              <button onClick={() => setShowQuizPublishModal(false)} className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold">Hủy</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL AI --- */}
      {showAiModal && (
        <div className="ai-modal fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[90] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-300">
          <div className="ai-modal-card bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden border border-white/20">
            <div className="px-4 sm:px-8 py-4 sm:py-6 border-b bg-indigo-50 flex justify-between items-center gap-3 flex-shrink-0">
              <div className="min-w-0">
                <h3 className="text-xl sm:text-3xl font-black text-indigo-900 tracking-tight">Tạo đề AI</h3>
                <p className="text-[10px] sm:text-xs font-black text-indigo-600 uppercase tracking-widest mt-1">Tạo đề từ bài giảng và tài liệu đính kèm</p>
              </div>
              <button onClick={() => setShowAiModal(false)} className="p-3 bg-white rounded-full border shadow-lg hover:bg-rose-500 hover:text-white transition-all active:scale-90"><X className="w-5 h-5 sm:w-6 sm:h-6" /></button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50/70 p-4 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8">
                <div className="flex flex-col min-h-[320px]">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Nội dung nguồn</label>
                    <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black uppercase whitespace-nowrap">Đã tự lấy dữ liệu</span>
                  </div>
                  <textarea value={aiContextContent} onChange={(e) => setAiContextContent(e.target.value)} placeholder="Khung này hiển thị nội dung AI nhận được. Có thể dán thêm nội dung vào đây..." className="flex-1 w-full bg-white border-2 border-slate-100 p-4 sm:p-6 rounded-3xl focus:outline-none focus:ring-4 focus:ring-indigo-50 min-h-[280px] font-medium leading-relaxed text-sm sm:text-base shadow-inner" />
                </div>

                <div className="flex flex-col min-h-[320px]">
                  <div className="bg-white p-1.5 rounded-3xl border border-slate-100 shadow-sm mb-4 grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => { setAiToolTab('quick'); setShowAiLessonPicker(false); }} className={`py-3 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all ${aiToolTab === 'quick' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>Nguồn bài giảng</button>
                    <button type="button" onClick={() => setAiToolTab('pro')} className={`py-3 rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all ${aiToolTab === 'pro' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>Nguồn đính kèm</button>
                  </div>

                  <button type="button" onClick={() => setShowAiLessonPicker(prev => !prev)} className="w-full mb-3 bg-emerald-50 text-emerald-700 border-2 border-emerald-100 font-black py-3 rounded-2xl text-xs uppercase tracking-widest">Lấy dữ liệu từ các bài trước</button>
                  {showAiLessonPicker && (
                    <div className="mb-4 bg-white border-2 border-emerald-100 rounded-3xl p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="font-black text-emerald-900 text-xs uppercase tracking-widest">{aiToolTab === 'pro' ? 'Dùng tài liệu ở bài' : 'Dùng nội dung bài giảng'}</div>
                        <button type="button" onClick={() => setAiSelectedLessons(Array.from({ length: Number(selectedLesson || 1) }, (_, i) => i + 1))} className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase whitespace-nowrap">{'Từ đầu -> ' + (getWeekData(selectedLesson).isExam ? getWeekData(selectedLesson).main : 'Tuần ' + (selectedLesson || 1))}</button>
                      </div>
                      <div className="grid grid-cols-5 sm:grid-cols-7 gap-2 max-h-28 overflow-y-auto pr-1">
                        {Array.from({ length: TOTAL_LESSONS }, (_, i) => i + 1).map(lesson => (
                          <label key={lesson} className={`cursor-pointer text-center rounded-xl border-2 py-2 text-[10px] font-black transition-all ${aiSelectedLessons.includes(lesson) ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-emerald-300'}`}>
                            <input type="checkbox" className="hidden" checked={aiSelectedLessons.includes(lesson)} onChange={(e) => setAiSelectedLessons(prev => e.target.checked ? [...prev, lesson].sort((a, b) => a - b) : prev.filter(x => x !== lesson))} />
                            {getWeekData(lesson).isExam ? getWeekData(lesson).main : 'T' + lesson}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Chọn mẫu nhanh</label>
                  <select className="sm:hidden w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-3 mb-3 text-xs font-black text-slate-700 uppercase" defaultValue="" onChange={(e) => handleAiPromptTemplateSelect(e.target.value)}>
                    <option value="" disabled>Chọn mẫu nhanh</option>
                    <option value="Hay tao 5 cau hoi trac nghiem co 4 dap an A, B, C, D va 1 bai tap tu luan ngan dua tren noi dung bai hoc. Kem dap an va bieu diem ro tung cau/tung y.">5 TN + 1 bài tập</option>
                    <option value="Hay tao 10 cau hoi trac nghiem co 4 dap an A, B, C, D, phan hoa tu nhan biet den van dung. Kem dap an va bieu diem ro tung cau/tung y.">10 câu trắc nghiệm</option>
                    <option value="Hay tao de kiem tra 15 phut gom 8 cau trac nghiem va 2 cau tu luan ngan. Kem dap an va bieu diem ro tung cau/tung y.">Đề kiểm tra 15 phút</option>
                    <option value="Hay tao bo cau hoi on tap kiem tra 1 tiet, bao quat cac bai da chon, gom trac nghiem va tu luan. Sap xep theo muc do de den kho, kem dap an va bieu diem ro tung cau/tung y.">Ôn tập kiểm tra 1 tiết</option>
                  </select>
                  <div className="hidden sm:grid grid-cols-2 gap-2 mb-4">
                    {[
                      { label: '5 TN + 1 bài tập', text: 'Hãy tạo 5 câu hỏi trắc nghiệm có 4 đáp án A, B, C, D và 1 bài tập tự luận ngắn dựa trên nội dung bài học. Chỉ soạn đề, kèm đáp án và biểu điểm rõ từng câu/từng ý.' },
                      { label: '10 câu trắc nghiệm', text: 'Hãy tạo 10 câu hỏi trắc nghiệm có 4 đáp án A, B, C, D, phân hóa từ nhận biết đến vận dụng. Chỉ soạn đề, kèm đáp án và biểu điểm rõ từng câu/từng ý.' },
                      { label: 'Đề kiểm tra 15 phút', text: 'Hãy tạo đề kiểm tra 15 phút gồm 8 câu trắc nghiệm và 2 câu tự luận ngắn. Chỉ soạn đề cho học sinh làm, kèm đáp án và biểu điểm rõ từng câu/từng ý.' },
                      { label: 'Ôn tập kiểm tra 1 tiết', text: 'Hãy tạo bộ câu hỏi ôn tập kiểm tra 1 tiết, bao quát các bài đã chọn, gồm trắc nghiệm và tự luận. Sắp xếp theo mức độ dễ đến khó, kèm đáp án và biểu điểm rõ từng câu/từng ý.' }
                    ].map(template => (
                      <button key={template.label} type="button" onClick={() => setAiPrompt(template.text)} className={`text-left border-2 rounded-2xl px-4 py-3 transition-all ${aiPrompt === template.text ? 'bg-indigo-100 border-indigo-400 shadow-md ring-2 ring-indigo-50' : 'bg-white hover:bg-indigo-50 border-slate-100 hover:border-indigo-200'}`}>
                        <span className={`block text-xs font-black uppercase tracking-widest ${aiPrompt === template.text ? 'text-indigo-800' : 'text-slate-800'}`}>{template.label}</span>
                      </button>
                    ))}
                  </div>

                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Yêu cầu cụ thể của thầy cô</label>
                  <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Khu tạo prompt: giáo viên có thể sửa theo ý mình." className="w-full bg-blue-50/50 border-4 border-dashed border-blue-100 p-4 sm:p-6 rounded-3xl focus:outline-none focus:ring-4 focus:ring-blue-50 font-black text-blue-900 text-sm sm:text-base shadow-inner min-h-[150px]" />

                  {aiToolTab === 'pro' ? (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button type="button" onClick={handleOpenChatGptPrompt} className="w-full bg-emerald-50 text-emerald-700 border-2 border-emerald-100 font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-sm hover:bg-emerald-100 transition-all active:scale-95"><FileText className="w-5 h-5" />Mở ChatGPT</button>
                      <button type="button" onClick={handleCopyGeminiProPrompt} className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg hover:bg-emerald-700 transition-all active:scale-95"><ExternalLink className="w-5 h-5" />Mở Gemini</button>
                    </div>
                  ) : (
                    <button onClick={handleGenerateAI} disabled={isAiLoading || !aiPrompt.trim()} className="mt-4 w-full bg-indigo-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50">{isAiLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />} Tạo đề ngay</button>
                  )}
                </div>
              </div>

              {aiError && <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl border-2 border-rose-100 font-black text-center uppercase tracking-widest">{aiError}</div>}
              {aiResponse && (
                <div className="bg-white border-4 border-emerald-50 rounded-3xl p-4 sm:p-8 shadow-xl">
                  <div ref={aiResponseContentRef} className="ai-response-content prose prose-lg sm:prose-xl max-w-none font-medium leading-relaxed" dangerouslySetInnerHTML={{ __html: formatAiText(aiResponse) }} />
                  <div className="mt-6 grid grid-cols-1 sm:flex sm:justify-end gap-3 border-t-4 border-slate-50 pt-6">
                    <button onClick={appendAiToQuiz} className="bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg hover:bg-indigo-700 transition-all active:scale-95"><CheckCircle2 className="w-5 h-5" />Chuyển vào bài kiểm tra</button>
                    <button onClick={appendAiToEditor} className="bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg hover:bg-emerald-700 transition-all active:scale-95"><Save className="w-5 h-5" />Chèn vào bài học</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL XEM TÀI LIỆU */}
      {viewingMaterial && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[70] flex flex-col animate-in fade-in duration-300">
          <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 bg-slate-900 text-white border-b border-white/10 shadow-2xl">
            <div className="flex items-center space-x-3 sm:space-x-5 flex-1 truncate">
              <div className="hidden sm:block bg-white/10 p-3 rounded-2xl border border-white/20"><FileText className="w-7 h-7 text-blue-400" /></div>
              <h3 className="font-black text-lg sm:text-2xl truncate tracking-tight">{viewingMaterial.title}</h3>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button onClick={() => handleCopyLink(viewingMaterial.url)} className="bg-white/10 p-3 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs border border-white/10 flex items-center gap-2.5 transition-all hover:bg-white/20 uppercase tracking-widest active:scale-95"><Copy className="w-4 h-4 sm:w-5 sm:h-5" /><span className="hidden sm:inline">Copy Link</span></button>
              <a href={isYouTubeUrl(viewingMaterial.url) ? getYouTubeWatchUrl(viewingMaterial.url) : viewingMaterial.url} target="_blank" rel="noopener noreferrer" className="bg-blue-600 p-3 sm:px-8 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs shadow-2xl border-b-4 border-blue-800 flex items-center gap-2.5 hover:bg-blue-500 transition-all uppercase tracking-widest active:scale-95"><ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" /><span className="hidden sm:inline">{isYouTubeUrl(viewingMaterial.url) ? 'Mở YouTube' : 'Tải về máy'}</span></a>
              <div className="hidden sm:block w-px h-10 bg-white/10 mx-4 opacity-50"></div>
              <button onClick={() => setViewingMaterial(null)} className="p-3 sm:p-4 bg-rose-600 sm:bg-white/10 rounded-xl sm:rounded-full hover:bg-rose-500 transition-all active:scale-75"><X className="w-4 h-4 sm:w-7 sm:h-7 text-white" /></button>
            </div>
          </div>
          <div className="flex-1 p-0 sm:p-3 md:p-8 bg-slate-900/50 relative">
            {isYouTubeUrl(viewingMaterial.url) && (
              <div className="absolute left-1/2 -translate-x-1/2 top-2 sm:top-5 z-10 bg-white/95 border border-red-100 shadow-xl rounded-2xl px-3 sm:px-4 py-1.5 sm:py-2 flex items-center gap-2 sm:gap-3">
                <MonitorPlay className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest hidden sm:inline">Nếu video báo lỗi 153</span>
                <a href={getYouTubeWatchUrl(viewingMaterial.url)} target="_blank" rel="noopener noreferrer" className="text-[9px] sm:text-[10px] font-black bg-red-600 text-white px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl uppercase tracking-widest hover:bg-red-500 whitespace-nowrap">Xem trên YouTube</a>
              </div>
            )}
            <iframe src={getEmbedUrl(viewingMaterial.url)} className="w-full h-full sm:rounded-[3rem] bg-white border-0 shadow-2xl animate-in zoom-in-95 duration-500" title={viewingMaterial.title} allowFullScreen />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
