import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  ArrowDownAZ,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Columns,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Share2,
  Trash2,
  UploadCloud,
  UserRound,
  X
} from 'lucide-react';
import { appId, db } from '../config/firebase';
import { IMAGE_DRIVE_FOLDER_ID, postAppsScript } from '../utils/helpers';
import scorebookTemplate from '../data/scorebookTemplate.json';

const STUDENT_FIELDS = [
  { key: 'fullName', label: 'Họ và tên', required: true, sticky: true },
  { key: 'birthDate', label: 'Ngày sinh' },
  { key: 'gender', label: 'Giới tính' },
  { key: 'birthProvince', label: 'Tỉnh nơi sinh' },
  { key: 'birthDistrict', label: 'Huyện nơi sinh' },
  { key: 'birthWard', label: 'Xã nơi sinh' },
  { key: 'birthPlaceName', label: 'Tên nơi sinh' },
  { key: 'birthRegistrationProvince', label: 'Tỉnh đăng ký khai sinh' },
  { key: 'birthRegistrationDistrict', label: 'Huyện đăng ký khai sinh' },
  { key: 'birthRegistrationWard', label: 'Xã đăng ký khai sinh' },
  { key: 'hometownProvince', label: 'Tỉnh quê quán' },
  { key: 'hometownDistrict', label: 'Huyện quê quán' },
  { key: 'hometownWard', label: 'Xã quê quán' },
  { key: 'identityCode', label: 'Mã định danh' },
  { key: 'phone', label: 'Số điện thoại' },
  { key: 'className', label: 'Lớp học', required: true },
  { key: 'enrollmentYear', label: 'Năm nhập học' },
  { key: 'address', label: 'Số nhà / Khu phố' },
  { key: 'ward', label: 'Xã / Phường' },
  { key: 'province', label: 'Tỉnh / Thành' },
  { key: 'householdAddress', label: 'Số nhà / Khu phố hk' },
  { key: 'householdWard', label: 'Xã / Phường hk' },
  { key: 'householdProvince', label: 'Tỉnh / Thành hk' },
  { key: 'fatherName', label: 'Tên cha' },
  { key: 'fatherBirthYear', label: 'Năm sinh cha' },
  { key: 'fatherJob', label: 'Nghề nghiệp cha' },
  { key: 'fatherPhone', label: 'SĐT cha' },
  { key: 'motherName', label: 'Tên mẹ' },
  { key: 'motherBirthYear', label: 'Năm sinh mẹ' },
  { key: 'motherJob', label: 'Nghề nghiệp mẹ' },
  { key: 'motherPhone', label: 'SĐT mẹ' },
  { key: 'temporaryStatus', label: 'Tình trạng tạm trú' },
  { key: 'transport', label: 'Đi xe' },
  { key: 'birthCertificateUrl', label: 'Link ảnh Khai sinh', type: 'link' },
  { key: 'identityCardUrl', label: 'Link ảnh Căn cước', type: 'link' },
  { key: 'transcriptUrl', label: 'Link ảnh Học bạ', type: 'link' },
  { key: 'portraitUrl', label: 'Link ảnh thẻ', type: 'link' },
  { key: 'hocLucLop6', label: 'Học lực lớp 6' },
  { key: 'hanhKiemLop6', label: 'Hạnh kiểm lớp 6' },
  { key: 'hocLucLop7', label: 'Học lực lớp 7' },
  { key: 'hanhKiemLop7', label: 'Hạnh kiểm lớp 7' },
  { key: 'hocLucLop8', label: 'Học lực lớp 8' },
  { key: 'hanhKiemLop8', label: 'Hạnh kiểm lớp 8' },
  { key: 'hocLucLop9', label: 'Học lực lớp 9' },
  { key: 'hanhKiemLop9', label: 'Hạnh kiểm lớp 9' }
];

const ADMIN_EDIT_FIELD_ORDER = [
  'fullName',
  'birthDate',
  'gender',
  'birthProvince',
  'birthDistrict',
  'birthWard',
  'birthPlaceName',
  'birthRegistrationProvince',
  'birthRegistrationDistrict',
  'birthRegistrationWard',
  'hometownProvince',
  'hometownDistrict',
  'hometownWard',
  'identityCode',
  'phone',
  'className',
  'enrollmentYear',
  'province',
  'ward',
  'address',
  'householdProvince',
  'householdWard',
  'householdAddress',
  'fatherName',
  'fatherBirthYear',
  'fatherJob',
  'fatherPhone',
  'motherName',
  'motherBirthYear',
  'motherJob',
  'motherPhone',
  'temporaryStatus',
  'transport',
  'hocLucLop6',
  'hanhKiemLop6',
  'hocLucLop7',
  'hanhKiemLop7',
  'hocLucLop8',
  'hanhKiemLop8',
  'hocLucLop9',
  'hanhKiemLop9'
];

const DOCUMENT_FIELD_KEYS = new Set(['birthCertificateUrl', 'identityCardUrl', 'transcriptUrl', 'portraitUrl']);
const STUDENT_FIELD_LABELS = Object.fromEntries(STUDENT_FIELDS.map(field => [field.key, field.label]));
const ACADEMIC_RESULT_FIELD_KEYS = new Set([
  'hocLucLop6',
  'hanhKiemLop6',
  'hocLucLop7',
  'hanhKiemLop7',
  'hocLucLop8',
  'hanhKiemLop8',
  'hocLucLop9',
  'hanhKiemLop9'
]);
const ACADEMIC_RESULT_OPTIONS = ['', 'Tốt', 'Khá', 'Đạt'];

const DEFAULT_VISIBLE_COLUMNS = [
  'fullName',
  'enrollmentYear',
  'birthDate',
  'gender',
  'birthProvince',
  'identityCode',
  'phone',
  'className',
  'transcriptUrl'
];

const REGISTRATION_DEFAULT_VISIBLE_COLUMNS = [
  'fullName',
  'birthDate',
  'gender',
  'birthProvince',
  'identityCode',
  'phone',
  'className',
  'enrollmentYear',
  'transcriptUrl'
];

const COMPACT_VISIBLE_COLUMNS = [
  'fullName',
  'enrollmentYear',
  'birthDate',
  'gender',
  'className'
];

const IMAGE_ONLY_VISIBLE_COLUMNS = [
  'fullName',
  'birthCertificateUrl',
  'identityCardUrl',
  'transcriptUrl',
  'portraitUrl'
];

const IMAGE_PREVIEW_FIELD_LABELS = {
  birthCertificateUrl: 'Khai sinh',
  identityCardUrl: 'Căn cước',
  transcriptUrl: 'Học bạ',
  portraitUrl: 'Ảnh thẻ'
};

const MOBILE_VISIBLE_COLUMNS = [
  'fullName',
  'className'
];

const EMPTY_FILTER_VALUE = '__EMPTY__';
const HAS_DOCUMENT_FILTER_VALUE = '__HAS_DOCUMENT__';
const REGISTRATION_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby6e5ya2k105Oe7i65k9viysIZbHKOF-9CosueiNy1GvnHJbVw1lHB_0eezSxO91ls/exec';
const STUDENT_DATA_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1oIGnM9Dw_3bUl8xfTKYE0XKsBvJWHb-J7qvD11fDcMM/edit?gid=0#gid=0';
const ADDRESS_DIRECTORY_CACHE_KEY = 'khl-address-directory-v2';
const STUDENT_DB_PREFS_KEY = 'khl-student-db-prefs-v1';
const STUDENT_EXPORT_DRIVE_FOLDER_ID = '1rSQB_aAM4oY_NcZY_sqBESAK1u5v87za';
const JOURNEY_SCORE_COLUMNS = [
  { sourcePage: 0, academic: true },
  { sourcePage: 1, academic: true },
  { sourcePage: 3, academic: true },
  { sourcePage: 4, academic: true },
  { sourcePage: 5, academic: true },
  { sourcePage: 6, academic: true }
];

const normalizeVietnameseName = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeBirthDate = (value = '') => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    return `${day}${month}${value.getFullYear()}`;
  }
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, '0')}${iso[2].padStart(2, '0')}${iso[1]}`;
  const vn = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (vn) return `${vn[1].padStart(2, '0')}${vn[2].padStart(2, '0')}${vn[3]}`;
  return raw.replace(/\D/g, '');
};

const formatDisplayDate = (value = '') => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${value.getFullYear()}`;
  }
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  return raw;
};

const HEADER_MAP = {
  'dau thoi gian': 'timestamp',
  'dấu thời gian': 'timestamp',
  'ho va ten': 'fullName',
  'họ và tên': 'fullName',
  'ngay sinh': 'birthDate',
  'ngày sinh': 'birthDate',
  'gioi tinh': 'gender',
  'giới tính': 'gender',
  'ma hoc sinh': 'accessCode',
  'mã học sinh': 'accessCode',
  'ma dinh danh': 'identityCode',
  'mã định danh': 'identityCode',
  'so dien thoai': 'phone',
  'số điện thoại': 'phone',
  'lop hoc': 'className',
  'lớp học': 'className',
  'nam nhap hoc': 'enrollmentYear',
  'năm nhập học': 'enrollmentYear',
  'so nha / khu pho': 'address',
  'số nhà / khu phố': 'address',
  'xa / phuong': 'ward',
  'xã / phường': 'ward',
  'tinh / thanh': 'province',
  'tỉnh / thành': 'province',
  'ten noi sinh': 'birthPlaceName',
  'tên nơi sinh': 'birthPlaceName',
  'tinh noi sinh': 'birthProvince',
  'tỉnh nơi sinh': 'birthProvince',
  'huyen noi sinh': 'birthDistrict',
  'huyện nơi sinh': 'birthDistrict',
  'xa noi sinh': 'birthWard',
  'xã nơi sinh': 'birthWard',
  'noi sinh day du': 'birthPlace',
  'nơi sinh đầy đủ': 'birthPlace',
  'noi sinh': 'birthPlace',
  'nơi sinh': 'birthPlace',
  'tinh dang ky khai sinh': 'birthRegistrationProvince',
  'tỉnh đăng ký khai sinh': 'birthRegistrationProvince',
  'huyen dang ky khai sinh': 'birthRegistrationDistrict',
  'huyện đăng ký khai sinh': 'birthRegistrationDistrict',
  'xa dang ky khai sinh': 'birthRegistrationWard',
  'xã đăng ký khai sinh': 'birthRegistrationWard',
  'noi dang ky khai sinh day du': 'birthRegistrationPlace',
  'nơi đăng ký khai sinh đầy đủ': 'birthRegistrationPlace',
  'tinh que quan': 'hometownProvince',
  'tỉnh quê quán': 'hometownProvince',
  'huyen que quan': 'hometownDistrict',
  'huyện quê quán': 'hometownDistrict',
  'xa que quan': 'hometownWard',
  'xã quê quán': 'hometownWard',
  'que quan day du': 'hometownPlace',
  'quê quán đầy đủ': 'hometownPlace',
  'so nha / khu pho kp': 'householdAddress',
  'số nhà / khu phố kp': 'householdAddress',
  'xa / phuong hk': 'householdWard',
  'xã / phường hk': 'householdWard',
  'tinh / thanh hk': 'householdProvince',
  'tỉnh / thành hk': 'householdProvince',
  'ten cha': 'fatherName',
  'tên cha': 'fatherName',
  'nam sinh cha': 'fatherBirthYear',
  'năm sinh cha': 'fatherBirthYear',
  'nghe nghiep cha': 'fatherJob',
  'nghề nghiệp cha': 'fatherJob',
  'sdt cha': 'fatherPhone',
  'sđt cha': 'fatherPhone',
  'ten me': 'motherName',
  'tên mẹ': 'motherName',
  'nam sinh me': 'motherBirthYear',
  'năm sinh mẹ': 'motherBirthYear',
  'nghe nghiep me': 'motherJob',
  'nghề nghiệp mẹ': 'motherJob',
  'sdt me': 'motherPhone',
  'sđt mẹ': 'motherPhone',
  'tinh trang tam tru': 'temporaryStatus',
  'tình trạng tạm trú': 'temporaryStatus',
  'di xe': 'transport',
  'đi xe': 'transport',
  'link anh khai sinh': 'birthCertificateUrl',
  'link ảnh khai sinh': 'birthCertificateUrl',
  'link anh hoc ba': 'transcriptUrl',
  'link ảnh học bạ': 'transcriptUrl',
  'link hoc ba': 'transcriptUrl',
  'link học bạ': 'transcriptUrl',
  'link anh chan dung': 'portraitUrl',
  'link ảnh chân dung': 'portraitUrl',
  'link anh/ anh the': 'portraitUrl',
  'link ảnh/ ảnh thẻ': 'portraitUrl',
  'link anh can cuoc': 'identityCardUrl',
  'link ảnh căn cước': 'identityCardUrl',
  'hoc luc lop 6': 'hocLucLop6',
  'học lực lớp 6': 'hocLucLop6',
  'hanh kiem lop 6': 'hanhKiemLop6',
  'hạnh kiểm lớp 6': 'hanhKiemLop6',
  'hoc luc lop 7': 'hocLucLop7',
  'học lực lớp 7': 'hocLucLop7',
  'hanh kiem lop 7': 'hanhKiemLop7',
  'hạnh kiểm lớp 7': 'hanhKiemLop7',
  'hoc luc lop 8': 'hocLucLop8',
  'học lực lớp 8': 'hocLucLop8',
  'hanh kiem lop 8': 'hanhKiemLop8',
  'hạnh kiểm lớp 8': 'hanhKiemLop8',
  'hoc luc lop 9': 'hocLucLop9',
  'học lực lớp 9': 'hocLucLop9',
  'hanh kiem lop 9': 'hanhKiemLop9',
  'hạnh kiểm lớp 9': 'hanhKiemLop9'
};

const emptyStudent = {
  fullName: '',
  birthDate: '',
  gender: '',
  identityCode: '',
  phone: '',
  className: '',
  enrollmentYear: '',
  address: '',
  ward: '',
  province: '',
  birthPlaceName: '',
  birthProvince: '',
  birthDistrict: '',
  birthWard: '',
  birthPlace: '',
  birthRegistrationProvince: '',
  birthRegistrationDistrict: '',
  birthRegistrationWard: '',
  birthRegistrationPlace: '',
  hometownProvince: '',
  hometownDistrict: '',
  hometownWard: '',
  hometownPlace: '',
  householdAddress: '',
  householdWard: '',
  householdProvince: '',
  fatherName: '',
  fatherBirthYear: '',
  fatherJob: '',
  fatherPhone: '',
  motherName: '',
  motherBirthYear: '',
  motherJob: '',
  motherPhone: '',
  temporaryStatus: '',
  transport: '',
  birthCertificateUrl: '',
  identityCardUrl: '',
  transcriptUrl: '',
  portraitUrl: '',
  hocLucLop6: '',
  hanhKiemLop6: '',
  hocLucLop7: '',
  hanhKiemLop7: '',
  hocLucLop8: '',
  hanhKiemLop8: '',
  hocLucLop9: '',
  hanhKiemLop9: '',
  accessCode: '',
  isClassLeader: false,
  status: 'active'
};

const safePlainValue = (value = '') => {
  if (value === undefined || value === null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDisplayDate(value);
  if (Array.isArray(value)) return value.map(item => safePlainValue(item)).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    const directValue = value.url || value.link || value.href || value.value || value.text || value.name || '';
    if (directValue) return safePlainValue(directValue);
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value || '').trim();
};

const pickText = (...values) => {
  for (const value of values) {
    const text = safePlainValue(value);
    if (text) return text;
  }
  return '';
};

const formatStudentFullName = (value = '') => {
  const text = safePlainValue(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text
    .toLocaleLowerCase('vi-VN')
    .replace(/(^|[\s\-'.’])(\p{L})/gu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('vi-VN')}`);
};

const isUsefulSheetValue = (value = '') => {
  const text = safePlainValue(value);
  if (!text) return false;
  const normalized = text.trim().toUpperCase();
  return !normalized.startsWith('#') && normalized !== 'N/A' && normalized !== 'NA' && normalized !== 'NULL' && normalized !== 'UNDEFINED';
};

const registrationToStudentData = (registration = {}, currentSchoolYear = '') => ({
  ...emptyStudent,
  fullName: formatStudentFullName(pickText(registration.fullName, registration.hoVaTen)),
  birthDate: formatDisplayDate(pickText(registration.birthDate, registration.ngaySinh)),
  gender: pickText(registration.gender, registration.gioiTinh),
  accessCode: pickText(registration.accessCode, registration.maHocSinh).toUpperCase().replace(/\s/g, ''),
  identityCode: pickText(registration.identityCode, registration.maDinhDanh).replace(/^'/, ''),
  phone: pickText(registration.phone, registration.soDienThoai).replace(/^'/, ''),
  className: pickText(registration.currentClassName, registration.className, registration.lopHoc),
  enrollmentYear: pickText(registration.enrollmentYear, registration.tinhTrangHocSinh, registration.hocTuNam),
  address: pickText(registration.address, registration.soNha),
  ward: pickText(registration.ward, registration.xaPhuong),
  province: pickText(registration.province, registration.tinhThanh),
  birthPlaceName: pickText(registration.birthPlaceName),
  birthProvince: pickText(registration.birthProvince),
  birthDistrict: pickText(registration.birthDistrict),
  birthWard: pickText(registration.birthWard),
  birthPlace: pickText(registration.birthPlace, registration.birthProvince),
  birthRegistrationProvince: pickText(registration.birthRegistrationProvince),
  birthRegistrationDistrict: pickText(registration.birthRegistrationDistrict),
  birthRegistrationWard: pickText(registration.birthRegistrationWard),
  birthRegistrationPlace: pickText(registration.birthRegistrationPlace, registration.birthRegistrationProvince),
  hometownProvince: pickText(registration.hometownProvince),
  hometownDistrict: pickText(registration.hometownDistrict),
  hometownWard: pickText(registration.hometownWard),
  hometownPlace: pickText(registration.hometownPlace, registration.hometownProvince),
  householdAddress: pickText(registration.householdAddress, registration.soNhaHK),
  householdWard: pickText(registration.householdWard, registration.xaPhuongHK),
  householdProvince: pickText(registration.householdProvince, registration.tinhThanhHK),
  fatherName: pickText(registration.fatherName, registration.tenCha),
  fatherBirthYear: pickText(registration.fatherBirthYear, registration.namSinhCha),
  fatherJob: pickText(registration.fatherJob, registration.ngheNghiepCha),
  fatherPhone: pickText(registration.fatherPhone, registration.sdtCha).replace(/^'/, ''),
  motherName: pickText(registration.motherName, registration.tenMe),
  motherBirthYear: pickText(registration.motherBirthYear, registration.namSinhMe),
  motherJob: pickText(registration.motherJob, registration.ngheNghiepMe),
  motherPhone: pickText(registration.motherPhone, registration.sdtMe).replace(/^'/, ''),
  temporaryStatus: pickText(registration.temporaryStatus, registration.tinhTrangTamTru),
  transport: pickText(registration.transport, registration.diXe),
  birthCertificateUrl: pickText(registration.birthCertificateUrl, registration.anhKhaiSinh),
  identityCardUrl: pickText(registration.identityCardUrl, registration.anhCanCuoc),
  transcriptUrl: pickText(registration.transcriptUrl, registration.anhHocBa),
  portraitUrl: pickText(registration.portraitUrl, registration.anhChanDung),
  hocLucLop6: pickText(registration.hocLucLop6),
  hanhKiemLop6: pickText(registration.hanhKiemLop6),
  hocLucLop7: pickText(registration.hocLucLop7),
  hanhKiemLop7: pickText(registration.hanhKiemLop7),
  hocLucLop8: pickText(registration.hocLucLop8),
  hanhKiemLop8: pickText(registration.hanhKiemLop8),
  hocLucLop9: pickText(registration.hocLucLop9),
  hanhKiemLop9: pickText(registration.hanhKiemLop9),
  status: 'active',
  schoolYear: currentSchoolYear
});

const normalizeStudentRecord = (student = {}, fallbackSchoolYear = '') => {
  const normalized = { ...student };
  Object.keys(emptyStudent).forEach(key => {
    if (key === 'isClassLeader') {
      normalized.isClassLeader = Boolean(student.isClassLeader);
      return;
    }
    normalized[key] = safePlainValue(student[key] ?? emptyStudent[key]);
  });
  normalized.id = safePlainValue(student.id);
  normalized.previousStudentId = safePlainValue(student.previousStudentId);
  normalized.schoolYear = safePlainValue(student.schoolYear || fallbackSchoolYear);
  normalized.fullName = formatStudentFullName(normalized.fullName);
  normalized.birthDate = formatDisplayDate(normalized.birthDate);
  normalized.identityCode = normalized.identityCode.replace(/^'/, '');
  normalized.phone = normalized.phone.replace(/^'/, '');
  normalized.fatherPhone = normalized.fatherPhone.replace(/^'/, '');
  normalized.motherPhone = normalized.motherPhone.replace(/^'/, '');
  normalized.accessCode = normalized.accessCode.replace(/\s+/g, '').toUpperCase();
  normalized.status = normalized.status === 'dropped' ? 'dropped' : 'active';
  return normalized;
};

const hasGrade9CompletionResult = (student = {}) => (
  Boolean(student) && Boolean(String(student.hocLucLop9 || '').trim() || String(student.hanhKiemLop9 || '').trim())
);

const isReadOnlyStudentRecord = (student = {}) => (
  Boolean(student) && (
    String(student.status || '').toLowerCase() === 'dropped' || hasGrade9CompletionResult(student)
  )
);

const readOnlyStudentMessage = (student = {}) => (
  student?.status === 'dropped'
    ? 'Học sinh đã bỏ học nên hồ sơ chỉ xem, không duyệt chỉnh sửa nữa.'
    : 'Học sinh đã có kết quả lớp 9 nên hồ sơ chỉ xem, không duyệt chỉnh sửa nữa.'
);

const sanitizeStudentChanges = (changes = {}) => {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return {};
  return Object.fromEntries(Object.entries(changes)
    .filter(([key]) => Object.prototype.hasOwnProperty.call(emptyStudent, key) || key === 'schoolYear' || key === 'previousStudentId')
    .map(([key, value]) => {
      if (key === 'isClassLeader') return [key, Boolean(value)];
      if (key === 'fullName') return [key, formatStudentFullName(value)];
      return [key, safePlainValue(value)];
    }));
};

const normalizeHeader = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ');

const normalizeSearch = (value = '') => normalizeHeader(value).replace(/[^\w\s]/g, '');

const uniqueTextItems = (items = []) => [...new Set(items.map(item => String(item || '').trim()).filter(Boolean))];

const decodeDisplayText = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
};

const compactSchoolYearLabel = (schoolYear = '') => String(schoolYear || '').replace(/\s*-\s*/g, '-');

const getGradeFromClass = (className = '') => {
  const match = String(className || '').trim().match(/(?:^|\D)(1[0-2]|[1-9])(?:\D|$)/);
  return match ? match[1] : '';
};

const getVietnameseNameParts = (fullName = '') => {
  const words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const givenName = words.pop() || '';
  return {
    givenName,
    familyAndMiddle: words.join(' '),
    fullName: String(fullName || '').trim()
  };
};

const compareVietnameseName = (a = {}, b = {}) => {
  const nameA = getVietnameseNameParts(a.fullName);
  const nameB = getVietnameseNameParts(b.fullName);
  const givenCompare = normalizeHeader(nameA.givenName).localeCompare(normalizeHeader(nameB.givenName), 'vi', { sensitivity: 'base' });
  if (givenCompare !== 0) return givenCompare;
  const middleCompare = normalizeHeader(nameA.familyAndMiddle).localeCompare(normalizeHeader(nameB.familyAndMiddle), 'vi', { sensitivity: 'base' });
  if (middleCompare !== 0) return middleCompare;
  return nameA.fullName.localeCompare(nameB.fullName, 'vi', { sensitivity: 'base' });
};

const compareClassThenName = (a = {}, b = {}) => {
  const gradeA = Number(getGradeFromClass(a.className) || 0);
  const gradeB = Number(getGradeFromClass(b.className) || 0);
  if (gradeA !== gradeB) return gradeA - gradeB;
  const classCompare = String(a.className || '').localeCompare(String(b.className || ''), 'vi', { numeric: true, sensitivity: 'base' });
  if (classCompare !== 0) return classCompare;
  return compareVietnameseName(a, b);
};

const getYear2 = (year = '') => {
  const match = String(year || '').match(/\d{4}/);
  return match ? match[0].slice(-2) : String(new Date().getFullYear()).slice(-2);
};

const getYearStart = (year = '') => {
  const match = String(year || '').match(/\d{4}/);
  return match ? Number(match[0]) : null;
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

const getScorebookEditText = (map = {}, key, fallback = '') => {
  const normalizedKey = String(key || '');
  const candidates = normalizedKey.startsWith('custom:')
    ? [normalizedKey, normalizedKey.replace(/^custom:/, '')]
    : [`custom:${normalizedKey}`, normalizedKey];
  const foundKey = candidates.find(candidate => Object.prototype.hasOwnProperty.call(map || {}, candidate));
  return decodeDisplayText(foundKey ? map[foundKey] : fallback);
};

const getCodePrefix = (student = {}, schoolYear = '') => {
  const enrollmentYear = student.enrollmentYear || student.schoolYear || schoolYear;
  const enrollmentStart = getYearStart(enrollmentYear);
  const currentStart = getYearStart(student.schoolYear || schoolYear);
  const currentGrade = Number(getGradeFromClass(student.className) || 0);
  const yearsPassed = enrollmentStart && currentStart ? Math.max(0, currentStart - enrollmentStart) : 0;
  const entryGrade = currentGrade ? Math.max(1, currentGrade - yearsPassed) : 0;
  const year = getYear2(enrollmentYear);
  const grade = entryGrade || getGradeFromClass(student.className) || '0';
  return `HS${year}${grade}`;
};

const nextSequentialCode = (student = {}, existingCodes = new Set(), schoolYear = '') => {
  const prefix = getCodePrefix(student, schoolYear);
  let number = 1;
  existingCodes.forEach(code => {
    const match = String(code || '').match(new RegExp(`^${prefix}(\\d{2})$`));
    if (match) number = Math.max(number, Number(match[1]) + 1);
  });
  let code = `${prefix}${String(number).padStart(2, '0')}`;
  while (existingCodes.has(code)) {
    number += 1;
    code = `${prefix}${String(number).padStart(2, '0')}`;
  }
  return code;
};

const assignSequentialCodesByOrder = (studentsForOrder = [], targets = [], existingCodes = new Set(), schoolYear = '') => {
  const targetSet = new Set(targets);
  const usedCodes = new Set(existingCodes);
  const prefixCounts = new Map();
  const result = new Map();

  [...studentsForOrder].sort(compareClassThenName).forEach(student => {
    const prefix = getCodePrefix(student, schoolYear);
    const orderNumber = (prefixCounts.get(prefix) || 0) + 1;
    prefixCounts.set(prefix, orderNumber);
    if (!targetSet.has(student)) return;

    let number = orderNumber;
    let code = `${prefix}${String(number).padStart(2, '0')}`;
    while (usedCodes.has(code)) {
      number += 1;
      code = `${prefix}${String(number).padStart(2, '0')}`;
    }
    usedCodes.add(code);
    result.set(student, code);
  });

  return result;
};

const getPreviousSchoolYear = (schoolYear = '') => {
  const years = String(schoolYear || '').match(/\d{4}/g);
  if (!years || years.length < 2) return '';
  return `${Number(years[0]) - 1}-${Number(years[1]) - 1}`;
};

const promoteClassName = (className = '') => {
  const text = String(className || '').trim();
  const match = text.match(/^(\D*)([6-9])(\D?.*)$/);
  if (!match) return text;
  const grade = Number(match[2]);
  if (grade >= 9) return '';
  return `${match[1]}${grade + 1}${match[3] || ''}`;
};

const getStudentIdentity = (student = {}) => (
  (/^\d{12}$/.test(String(student.identityCode || '').replace(/^'/, '').trim()) ? String(student.identityCode || '').replace(/^'/, '').trim() : '')
  || student.previousStudentId
  || `${normalizeSearch(student.fullName)}_${String(student.birthDate || '').trim()}`
);

const getJourneyResult = (student = {}, prefix = '') => {
  const grade = getGradeFromClass(student.className);
  const gradeValue = grade ? safePlainValue(student[`${prefix}Lop${grade}`]) : '';
  return gradeValue || safePlainValue(student[prefix]) || '';
};

const getJourneyYearCell = (student = {}) => ({
  className: safePlainValue(student.className),
  conduct: getJourneyResult(student, 'hanhKiem'),
  academic: getJourneyResult(student, 'hocLuc')
});

const getJourneyClassMatch = (student = {}, filter = 'all') => {
  if (filter === 'all') return true;
  const [type, value = ''] = String(filter || '').split(':');
  if (type === 'grade') return getGradeFromClass(student.className) === value;
  if (type === 'class') return String(student.className || '') === value;
  return String(student.className || '') === filter || getGradeFromClass(student.className) === filter;
};

const getJourneyStudentKey = (student = {}) => {
  const stable = String(student.accessCode || student.studentCode || student.pcgdCode || student.identityCode || '').trim().toUpperCase();
  if (stable) return stable;
  return `${normalizeSearch(student.fullName)}__${String(student.birthDate || '').trim()}`;
};

const getJourneyScoreInputValue = (editsMap, semester, pageIndex, rowIndex, scoreIndex) => {
  if (pageIndex === null || pageIndex === undefined || rowIndex < 0) return '';
  return String(getScorebookEditText(editsMap, `${semester}Score:${pageIndex}:r${rowIndex}:s${scoreIndex}`, '') || '').trim();
};

const getJourneySemesterTermAverage = (editsMap, semester, pageIndex, rowIndex) => {
  const txScores = [0, 1, 2, 3]
    .map(scoreIndex => parseScoreNumber(getJourneyScoreInputValue(editsMap, semester, pageIndex, rowIndex, scoreIndex)))
    .filter(value => value !== null);
  const midterm = parseScoreNumber(getJourneyScoreInputValue(editsMap, semester, pageIndex, rowIndex, 4));
  const final = parseScoreNumber(getJourneyScoreInputValue(editsMap, semester, pageIndex, rowIndex, 5));
  if (!txScores.length || midterm === null || final === null) return '';
  const total = txScores.reduce((sum, value) => sum + value, 0) + (2 * midterm) + (3 * final);
  return formatScoreNumber(total / (txScores.length + 5));
};

const getJourneySemesterScoreResult = (editsMap, semester, pageIndex, rowIndex, scoreIndex = semester === 'hkii' ? 7 : 6) => {
  const saved = getJourneyScoreInputValue(editsMap, semester, pageIndex, rowIndex, scoreIndex);
  if (saved !== '') return saved;
  if (scoreIndex === 6) return getJourneySemesterTermAverage(editsMap, semester, pageIndex, rowIndex);
  if (semester === 'hkii' && scoreIndex === 7) {
    const hkiAverage = parseScoreNumber(getJourneySemesterScoreResult(editsMap, 'hki', pageIndex, rowIndex, 6));
    const hkiiAverage = parseScoreNumber(getJourneySemesterScoreResult(editsMap, 'hkii', pageIndex, rowIndex, 6));
    if (hkiAverage === null || hkiiAverage === null) return '';
    return formatScoreNumber((hkiAverage + (2 * hkiiAverage)) / 3);
  }
  return '';
};

const getJourneyAcademicResultFromScorebook = (editsMap, rowIndex) => {
  if (rowIndex < 0) return '';
  const scores = JOURNEY_SCORE_COLUMNS
    .filter(column => column.academic)
    .map(column => parseScoreNumber(getJourneySemesterScoreResult(editsMap, 'hkii', column.sourcePage, rowIndex, 7)))
    .filter(value => value !== null);
  if (!scores.length) return '';
  if (scores.filter(score => score >= 8).length >= 5 && scores.every(score => score >= 6.5)) return 'Tốt';
  if (scores.filter(score => score >= 6.5).length >= 5 && scores.every(score => score >= 5)) return 'Khá';
  if (scores.filter(score => score >= 5).length >= 5 && scores.every(score => score >= 3.5)) return 'Đạt';
  return 'Chưa đạt';
};

const makeAccessCode = (student = {}, existingCodes = new Set()) => {
  return nextSequentialCode(student, existingCodes, student.schoolYear);
};

const parseSheetPaste = (text = '', currentSchoolYear = '') => {
  const rows = String(text || '').split(/\r?\n/).map(row => row.trim()).filter(Boolean);
  if (rows.length < 2) return [];
  const splitter = rows[0].includes('\t') ? '\t' : ',';
  const headers = rows[0].split(splitter).map(header => HEADER_MAP[normalizeHeader(header)] || '');
  return rows.slice(1).map(row => {
    const cells = row.split(splitter);
    const item = { ...emptyStudent, schoolYear: currentSchoolYear, status: 'active' };
    headers.forEach((key, index) => {
      if (key) item[key] = String(cells[index] || '').trim();
    });
    return normalizeStudentRecord(item, currentSchoolYear);
  }).filter(item => item.fullName || item.identityCode);
};

const extractDriveFileId = (url = '') => {
  const match = String(url || '').match(/\/file\/d\/([a-zA-Z0-9_-]+)|[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? (match[1] || match[2]) : '';
};

const splitDocumentUrls = (value = '') => String(value || '')
  .split(/\s*,\s*|\n+/)
  .map(item => item.trim())
  .filter(Boolean);

const firstDocumentUrl = (value = '') => splitDocumentUrls(value)[0] || '';

const getPreviewImageUrl = (url = '') => {
  const firstUrl = firstDocumentUrl(url);
  const id = extractDriveFileId(firstUrl);
  if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w700`;
  return firstUrl;
};

const getDriveEmbedUrl = (url = '') => {
  const firstUrl = firstDocumentUrl(url);
  const id = extractDriveFileId(firstUrl);
  return id ? `https://drive.google.com/file/d/${id}/preview` : '';
};

const escapeXml = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const columnName = (index) => {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod - 1) / 26);
  }
  return name;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const le16 = (value) => [value & 0xff, (value >>> 8) & 0xff];
const le32 = (value) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];

const concatBytes = (chunks) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
};

const createZipBlob = (files) => {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  files.forEach(file => {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const localHeader = new Uint8Array([
      ...le32(0x04034b50), ...le16(20), ...le16(0), ...le16(0), ...le16(dosTime), ...le16(dosDate),
      ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(nameBytes.length), ...le16(0)
    ]);
    localParts.push(localHeader, nameBytes, data);
    const centralHeader = new Uint8Array([
      ...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0), ...le16(0), ...le16(dosTime), ...le16(dosDate),
      ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(nameBytes.length), ...le16(0), ...le16(0),
      ...le16(0), ...le16(0), ...le32(0), ...le32(offset)
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  });

  const central = concatBytes(centralParts);
  const end = new Uint8Array([
    ...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(files.length), ...le16(files.length),
    ...le32(central.length), ...le32(offset), ...le16(0)
  ]);
  return new Blob([concatBytes(localParts), central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

const createXlsxBlob = (rows, title = '') => {
  const safeRows = rows.length ? rows : [['']];
  const maxCols = Math.max(...safeRows.map(row => row.length), 1);
  const widthRows = title ? safeRows.slice(1) : safeRows;
  const getDisplayLength = value => {
    const text = String(value ?? '');
    return Array.from(text).reduce((total, char) => total + (char.charCodeAt(0) > 255 ? 1.4 : 1), 0);
  };
  const columnWidths = Array.from({ length: maxCols }, (_, colIndex) => {
    const maxLength = widthRows.reduce((currentMax, row) => Math.max(currentMax, getDisplayLength(row[colIndex])), 0);
    if (colIndex === 0) return Math.min(Math.max(Math.ceil(maxLength + 2), 6), 10);
    return Math.min(Math.max(Math.ceil(maxLength + 2), 10), 34);
  });
  const cols = `<cols>${columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`;
  const sheetRows = safeRows.map((row, rowIndex) => {
    const cells = row.map((cell, colIndex) => {
      const ref = `${columnName(colIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0 && title ? ' s="2"' : (rowIndex === (title ? 1 : 0) ? ' s="1"' : ' s="3"');
      return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(cell)}</t></is></c>`;
    }).join('');
    const height = rowIndex === 0 && title ? ' ht="28" customHeight="1"' : '';
    return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
  }).join('');
  const dimension = `A1:${columnName(maxCols - 1)}${safeRows.length}`;
  const mergeCells = title && maxCols > 1 ? `<mergeCells count="1"><mergeCell ref="A1:${columnName(maxCols - 1)}1"/></mergeCells>` : '';
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${sheetRows}</sheetData>${mergeCells}</worksheet>`;
  return createZipBlob([
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Danh sách" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Times New Roman"/><family val="1"/></font><font><b/><sz val="11"/><name val="Times New Roman"/><family val="1"/></font><font><b/><sz val="16"/><name val="Times New Roman"/><family val="1"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', content: worksheet }
  ]);
};

const safeFilePart = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[^\w-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase();

const fieldValueForExport = (student = {}, field = {}) => {
  if (field.key === 'birthDate') return formatDisplayDate(safePlainValue(student[field.key]));
  return safePlainValue(student[field.key]);
};

const buildExportTitle = ({ currentSchoolYear, classFilter, statusFilter, columnFilters, query, selectedCount, visibleFields }) => {
  const parts = ['DANH SÁCH HỌC SINH'];
  if (Array.isArray(classFilter) && classFilter.length) {
    parts.push(`LỚP ${classFilter.join(', ').toUpperCase()}`);
  } else if (classFilter && classFilter !== 'all') {
    parts.push(`LỚP ${String(classFilter).toUpperCase()}`);
  }
  parts.push(`NĂM HỌC ${currentSchoolYear}`);
  if (statusFilter !== 'all') parts.push(statusFilter === 'dropped' ? 'BỎ HỌC' : 'ĐANG HỌC');
  Object.entries(columnFilters || {}).forEach(([key, value]) => {
    if (!value) return;
    const field = visibleFields.find(item => item.key === key) || STUDENT_FIELDS.find(item => item.key === key);
    const label = field?.label || key;
    const displayValue = value === EMPTY_FILTER_VALUE ? 'TRỐNG' : (value === HAS_DOCUMENT_FILTER_VALUE ? 'CÓ' : value);
    parts.push(`${label}: ${displayValue}`);
  });
  if (query) parts.push(`TÌM: ${query}`);
  if (selectedCount) parts.push(`${selectedCount} HỌC SINH ĐÃ CHỌN`);
  return parts.join(' - ').toUpperCase();
};

const getColumnFilterOptionLabel = (option) => {
  if (option === EMPTY_FILTER_VALUE) return '(Trống)';
  if (option === HAS_DOCUMENT_FILTER_VALUE) return 'Có';
  return option;
};

const copyTextToClipboard = async (text = '') => {
  const value = String(text || '');
  if (!value) return false;
  try {
    await navigator.clipboard?.writeText(value);
    return true;
  } catch {
    // Fall back to the hidden textarea copy path below.
  }
  if (typeof document === 'undefined') return false;
  try {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
  } catch {
    return false;
  }
};

const escapeReportHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const stripReportMarkdown = (text = '') => String(text || '').replace(/\*\*(.*?)\*\*/g, '$1');

const missingInfoReportToHtml = (text = '') => String(text || '')
  .split(/\r?\n/)
  .map(line => {
    const htmlLine = escapeReportHtml(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return `<div>${htmlLine || '<br>'}</div>`;
  })
  .join('');

const copyRichReportToClipboard = async (text = '') => {
  const value = String(text || '');
  if (!value) return false;
  const plainText = stripReportMarkdown(value);
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([missingInfoReportToHtml(value)], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        })
      ]);
      return true;
    } catch {
      return false;
    }
  }
  return copyTextToClipboard(plainText);
};

const getEditableReportText = (element) => {
  if (!element) return '';
  return Array.from(element.childNodes || [])
    .map(node => node.textContent || '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const callSheetAction = (action = '', paramsObject = {}) => new Promise((resolve, reject) => {
  if (typeof document === 'undefined') {
    resolve(null);
    return;
  }
  const callbackName = `studentSheetSync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const params = new URLSearchParams({
    action,
    callback: callbackName,
    t: String(Date.now())
  });
  Object.entries(paramsObject).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  });
  const script = document.createElement('script');
  const cleanup = () => {
    delete window[callbackName];
    script.remove();
  };
  window[callbackName] = (response = {}) => {
    cleanup();
    if (response.success) resolve(response);
    else reject(new Error(response.message || 'Không cập nhật được Google Sheet.'));
  };
  script.onerror = () => {
    cleanup();
    reject(new Error('Không gọi được Apps Script để cập nhật Google Sheet.'));
  };
  script.src = `${REGISTRATION_WEB_APP_URL}?${params.toString()}`;
  document.body.appendChild(script);
});

const loadRegistrationDataAction = (action = '', paramsObject = {}) => new Promise((resolve, reject) => {
  if (typeof document === 'undefined') {
    resolve({});
    return;
  }
  const callbackName = `studentAddressData_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const params = new URLSearchParams({
    action,
    callback: callbackName,
    t: String(Date.now())
  });
  Object.entries(paramsObject).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  });
  const script = document.createElement('script');
  const cleanup = () => {
    delete window[callbackName];
    script.remove();
  };
  const timeout = window.setTimeout(() => {
    cleanup();
    reject(new Error('Không tải được dữ liệu tỉnh/phường.'));
  }, 9000);
  window[callbackName] = (response = {}) => {
    window.clearTimeout(timeout);
    cleanup();
    resolve(response || {});
  };
  script.onerror = () => {
    window.clearTimeout(timeout);
    cleanup();
    reject(new Error('Không gọi được dữ liệu tỉnh/phường.'));
  };
  script.src = `${REGISTRATION_WEB_APP_URL}?${params.toString()}`;
  document.body.appendChild(script);
});

const toSheetStudentParams = (student = {}, schoolYear = '') => ({
  accessCode: student.accessCode || student.studentCode || '',
  identityCode: String(student.identityCode || '').replace(/^'/, ''),
  fullName: student.fullName || '',
  birthDate: formatDisplayDate(student.birthDate || ''),
  gender: student.gender || '',
  phone: String(student.phone || '').replace(/^'/, ''),
  className: student.className || '',
  enrollmentYear: student.enrollmentYear || '',
  address: student.address || '',
  ward: student.ward || '',
  province: student.province || '',
  birthPlaceName: student.birthPlaceName || '',
  birthProvince: student.birthProvince || '',
  birthDistrict: student.birthDistrict || '',
  birthWard: student.birthWard || '',
  birthPlace: student.birthPlace || student.birthProvince || '',
  birthRegistrationProvince: student.birthRegistrationProvince || '',
  birthRegistrationDistrict: student.birthRegistrationDistrict || '',
  birthRegistrationWard: student.birthRegistrationWard || '',
  hometownProvince: student.hometownProvince || '',
  hometownDistrict: student.hometownDistrict || '',
  hometownWard: student.hometownWard || '',
  householdAddress: student.householdAddress || '',
  householdWard: student.householdWard || '',
  householdProvince: student.householdProvince || '',
  fatherName: student.fatherName || '',
  fatherBirthYear: student.fatherBirthYear || '',
  fatherJob: student.fatherJob || '',
  fatherPhone: String(student.fatherPhone || '').replace(/^'/, ''),
  motherName: student.motherName || '',
  motherBirthYear: student.motherBirthYear || '',
  motherJob: student.motherJob || '',
  motherPhone: String(student.motherPhone || '').replace(/^'/, ''),
  temporaryStatus: student.temporaryStatus || '',
  transport: student.transport || '',
  birthCertificateUrl: student.birthCertificateUrl || '',
  transcriptUrl: student.transcriptUrl || '',
  portraitUrl: student.portraitUrl || '',
  identityCardUrl: student.identityCardUrl || '',
  hocLucLop6: student.hocLucLop6 || '',
  hanhKiemLop6: student.hanhKiemLop6 || '',
  hocLucLop7: student.hocLucLop7 || '',
  hanhKiemLop7: student.hanhKiemLop7 || '',
  hocLucLop8: student.hocLucLop8 || '',
  hanhKiemLop8: student.hanhKiemLop8 || '',
  hocLucLop9: student.hocLucLop9 || '',
  hanhKiemLop9: student.hanhKiemLop9 || '',
  status: student.status || 'active',
  schoolYear: schoolYear || student.schoolYear || '',
  dropoutYear: student.status === 'dropped' ? (schoolYear || student.schoolYear || '') : ''
});

const syncStudentToSheet = (student = {}, schoolYear = '') => callSheetAction('syncStudent', toSheetStudentParams(student, schoolYear));

const STUDENT_DOCUMENTS = [
  { key: 'portraitUrl', label: 'Ảnh thẻ', filename: 'anh_the', accept: 'image/*', multiple: false },
  { key: 'birthCertificateUrl', label: 'Khai sinh', filename: 'khai_sinh', accept: 'image/*,application/pdf', multiple: true },
  { key: 'identityCardUrl', label: 'Căn cước', filename: 'can_cuoc', accept: 'image/*,application/pdf', multiple: true },
  { key: 'transcriptUrl', label: 'Học bạ', filename: 'hoc_ba', accept: 'image/*,application/pdf', multiple: true }
];

const MISSING_INFO_CHECK_FIELDS = [
  { key: 'birthDate', label: 'ngày sinh' },
  { key: 'gender', label: 'giới tính' },
  { key: 'birthProvince', label: 'tỉnh nơi sinh' },
  { key: 'identityCode', label: 'mã định danh' },
  { key: 'className', label: 'lớp' },
  { key: 'phone', label: 'số điện thoại học sinh' },
  { key: 'fatherPhone', label: 'SĐT cha' },
  { key: 'motherPhone', label: 'SĐT mẹ' },
  { key: 'address', label: 'địa chỉ' },
  { key: 'portraitUrl', label: 'ảnh thẻ', document: true },
  { key: 'birthCertificateUrl', label: 'khai sinh', document: true },
  { key: 'identityCardUrl', label: 'căn cước', document: true },
  { key: 'transcriptUrl', label: 'học bạ', document: true }
];

const SHEET_TO_DATABASE_SYNC_FIELDS = [
  'fullName',
  'birthDate',
  'gender',
  'identityCode',
  'phone',
  'className',
  'enrollmentYear',
  'address',
  'ward',
  'province',
  'householdAddress',
  'householdWard',
  'householdProvince',
  'fatherName',
  'fatherBirthYear',
  'fatherJob',
  'fatherPhone',
  'motherName',
  'motherBirthYear',
  'motherJob',
  'motherPhone',
  'temporaryStatus',
  'transport',
  'birthPlaceName',
  'birthProvince',
  'birthDistrict',
  'birthWard',
  'birthPlace',
  'birthRegistrationProvince',
  'birthRegistrationDistrict',
  'birthRegistrationWard',
  'hometownProvince',
  'hometownDistrict',
  'hometownWard',
  'hocLucLop6',
  'hanhKiemLop6',
  'hocLucLop7',
  'hanhKiemLop7',
  'hocLucLop8',
  'hanhKiemLop8',
  'hocLucLop9',
  'hanhKiemLop9'
];

const ACADEMIC_RESULT_CHECK_FIELDS = [
  { grade: 6, key: 'hocLucLop6', label: 'học lực lớp 6' },
  { grade: 6, key: 'hanhKiemLop6', label: 'hạnh kiểm lớp 6' },
  { grade: 7, key: 'hocLucLop7', label: 'học lực lớp 7' },
  { grade: 7, key: 'hanhKiemLop7', label: 'hạnh kiểm lớp 7' },
  { grade: 8, key: 'hocLucLop8', label: 'học lực lớp 8' },
  { grade: 8, key: 'hanhKiemLop8', label: 'hạnh kiểm lớp 8' },
  { grade: 9, key: 'hocLucLop9', label: 'học lực lớp 9' },
  { grade: 9, key: 'hanhKiemLop9', label: 'hạnh kiểm lớp 9' }
];

const QUICK_ISSUE_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'missingInfo', label: 'Thiếu hồ sơ' },
  { key: 'missingDocs', label: 'Thiếu ảnh' },
  { key: 'missingIdentity', label: 'Thiếu mã ĐD' },
  { key: 'missingAcademic', label: 'Thiếu HL/HK' },
  { key: 'selected', label: 'Đã chọn' }
];

const getStudentDbPrefs = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const value = JSON.parse(localStorage.getItem(STUDENT_DB_PREFS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

const fileToBase64Payload = (file, documentItem = {}, student = {}) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = String(reader.result || '').split(',')[1] || '';
    const studentName = safeFilePart(student.fullName || student.accessCode || 'hoc-sinh') || 'hoc-sinh';
    const originalName = safeFilePart(String(file.name || '').replace(/\.[^/.]+$/, '')) || documentItem.filename || 'file';
    const extension = String(file.name || '').includes('.') ? `.${String(file.name).split('.').pop()}` : '';
    resolve({
      filename: `[HOCSINH_${studentName}]_${documentItem.filename || 'giay_to'}_${originalName}_${Date.now()}${extension}`,
      mimeType: file.type || 'application/octet-stream',
      base64,
      folderId: IMAGE_DRIVE_FOLDER_ID
    });
  };
  reader.onerror = () => reject(new Error('Không đọc được file tải lên.'));
  reader.readAsDataURL(file);
});

export default function HocSinhManager({ students = [], currentSchoolYear, initialTab = 'current', initialTabKey = 0, user, showNotification, onBack, onOpenAttendance, onSendTestResults, onBeforeDangerousAction }) {
  const [query, setQuery] = useState('');
  const [studentTab, setStudentTab] = useState(initialTab === 'countStats' ? 'current' : (initialTab || 'current'));
  const [classFilter, setClassFilter] = useState(() => {
    const saved = getStudentDbPrefs().classFilter;
    return Array.isArray(saved) ? saved.map(String).filter(Boolean) : [];
  });
  const [journeyYearFilter, setJourneyYearFilter] = useState(currentSchoolYear || '');
  const [journeyClassFilter, setJourneyClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [quickIssueFilter, setQuickIssueFilter] = useState(() => getStudentDbPrefs().quickIssueFilter || 'all');
  const [sortMode, setSortMode] = useState('className');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedRegistrationIds, setSelectedRegistrationIds] = useState(new Set());
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [profileRequests, setProfileRequests] = useState([]);
  const [scorebookEditsByYearGrade, setScorebookEditsByYearGrade] = useState({});
  const [attendanceDocs, setAttendanceDocs] = useState([]);
  const [isLoadingRegistrations, setIsLoadingRegistrations] = useState(false);
  const [showCodeChoiceModal, setShowCodeChoiceModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});
  const [openFilterKey, setOpenFilterKey] = useState(null);
  const [editing, setEditing] = useState(null);
  const [documentViewer, setDocumentViewer] = useState(null);
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showClassStats, setShowClassStats] = useState(false);
  const [showExportChoice, setShowExportChoice] = useState(false);
  const [sendingTestResultStudentId, setSendingTestResultStudentId] = useState('');
  const [exportFormat, setExportFormat] = useState('');
  const [excelExportAction, setExcelExportAction] = useState('');
  const [showUtilitiesMenu, setShowUtilitiesMenu] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [isSharingSheet, setIsSharingSheet] = useState(false);
  const [sharedPdfLink, setSharedPdfLink] = useState('');
  const [sharedSheetLink, setSharedSheetLink] = useState('');
  const [missingInfoReport, setMissingInfoReport] = useState('');
  const [addressDirectory, setAddressDirectory] = useState({ provinces: [], communes: {} });
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = getStudentDbPrefs().visibleColumns;
    if (Array.isArray(saved) && saved.includes('fullName')) return saved;
    if (typeof window !== 'undefined' && window.innerWidth < 640) return MOBILE_VISIBLE_COLUMNS;
    return DEFAULT_VISIBLE_COLUMNS;
  });
  const [importText, setImportText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const safeStudents = useMemo(
    () => (Array.isArray(students) ? students : []).map(student => normalizeStudentRecord(student, currentSchoolYear)),
    [students, currentSchoolYear]
  );

  useEffect(() => {
    if (initialTab === 'countStats') {
      setStudentTab('current');
      setShowClassStats(true);
      return;
    }
    setStudentTab(initialTab || 'current');
  }, [initialTab, initialTabKey]);

  const studentsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'students');
  const profileRequestsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests');
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STUDENT_DB_PREFS_KEY, JSON.stringify({
        classFilter,
        statusFilter,
        quickIssueFilter,
        visibleColumns
      }));
    } catch {
      localStorage.removeItem(STUDENT_DB_PREFS_KEY);
    }
  }, [classFilter, statusFilter, quickIssueFilter, visibleColumns]);

  useEffect(() => {
    return onSnapshot(profileRequestsCollection, snapshot => {
      setProfileRequests(snapshot.docs
        .map(item => {
          const data = item.data() || {};
          return {
            id: item.id,
            ...data,
            studentId: safePlainValue(data.studentId),
            studentName: safePlainValue(data.studentName),
            accessCode: safePlainValue(data.accessCode),
            className: safePlainValue(data.className),
            changes: sanitizeStudentChanges(data.changes)
          };
        })
        .filter(item => (item.status || 'pending') === 'pending')
        .filter(item => Object.keys(sanitizeStudentChanges(item.changes)).length > 0)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    });
  }, []);
  useEffect(() => {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'scorebooks');
    return onSnapshot(ref, snapshot => {
      const nextMap = {};
      snapshot.docs.forEach(item => {
        const data = item.data() || {};
        if (String(data.sourceFile || '') !== String(scorebookTemplate.sourceFile || '')) return;
        const gradeKey = String(data.grade || '').trim();
        const schoolYearKey = compactSchoolYearLabel(data.schoolYear || '');
        if (!gradeKey || !schoolYearKey) return;
        const mapKey = `${schoolYearKey}__${gradeKey}`;
        const existing = nextMap[mapKey];
        if (!existing || Number(data.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
          nextMap[mapKey] = { edits: data.edits || {}, updatedAt: Number(data.updatedAt || 0) };
        }
      });
      setScorebookEditsByYearGrade(nextMap);
    }, () => {
      showNotification?.('Chưa tải được dữ liệu sổ điểm để điền quá trình học.', 'error');
    });
  }, [showNotification]);
  useEffect(() => {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'class_attendance');
    return onSnapshot(ref, snapshot => {
      setAttendanceDocs(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, () => {
      showNotification?.('Chưa tải được dữ liệu điểm danh để tính rèn luyện.', 'error');
    });
  }, [showNotification]);
  const previousSchoolYear = useMemo(() => getPreviousSchoolYear(currentSchoolYear), [currentSchoolYear]);
  const yearStudents = useMemo(
    () => safeStudents.filter(student => String(student.schoolYear || currentSchoolYear) === String(currentSchoolYear)),
    [safeStudents, currentSchoolYear]
  );
  const previousYearStudents = useMemo(
    () => previousSchoolYear
      ? safeStudents.filter(student => String(student.schoolYear || '') === String(previousSchoolYear))
      : [],
    [safeStudents, previousSchoolYear]
  );
  const visibleStudentFields = useMemo(
    () => STUDENT_FIELDS.filter(field => visibleColumns.includes(field.key)),
    [visibleColumns]
  );
  const isImageOnlyView = useMemo(
    () => visibleColumns.length === IMAGE_ONLY_VISIBLE_COLUMNS.length
      && IMAGE_ONLY_VISIBLE_COLUMNS.every(key => visibleColumns.includes(key)),
    [visibleColumns]
  );
  const profileRequestsByStudent = useMemo(() => {
    const map = new Map();
    profileRequests.forEach(request => {
      if (!request.studentId) return;
      const current = map.get(request.studentId) || [];
      current.push(request);
      map.set(request.studentId, current);
    });
    return map;
  }, [profileRequests]);
  const existingCodes = useMemo(() => new Set(safeStudents.map(student => student.accessCode).filter(Boolean)), [safeStudents]);
  const editFieldMap = useMemo(() => new Map(STUDENT_FIELDS.map(field => [field.key, field])), []);
  const adminEditFields = useMemo(
    () => ADMIN_EDIT_FIELD_ORDER.map(key => editFieldMap.get(key)).filter(Boolean),
    [editFieldMap]
  );
  const journeyYearOptions = useMemo(
    () => uniqueTextItems([...safeStudents.map(student => student.schoolYear), currentSchoolYear])
      .sort((a, b) => (getYearStart(a) || 0) - (getYearStart(b) || 0)),
    [safeStudents, currentSchoolYear]
  );
  const journeyClassOptions = useMemo(() => {
    const classes = uniqueTextItems(
      safeStudents
        .filter(student => !journeyYearFilter || student.schoolYear === journeyYearFilter)
        .map(student => student.className)
    ).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' }));
    return classes.map(className => ({ value: className, label: `Lop ${className}` }));
  }, [safeStudents, journeyYearFilter]);
  const journeyStudentsByYearGrade = useMemo(() => {
    const map = new Map();
    safeStudents
      .filter(student => (student.status || 'active') !== 'dropped')
      .forEach(student => {
        const grade = getGradeFromClass(student.className || student.grade || '');
        const schoolYearKey = compactSchoolYearLabel(student.schoolYear || currentSchoolYear || '');
        if (!grade || !schoolYearKey) return;
        const key = `${schoolYearKey}__${grade}`;
        const list = map.get(key) || [];
        list.push(student);
        map.set(key, list);
      });
    map.forEach((list, key) => {
      map.set(key, [...list].sort(compareClassThenName).slice(0, 40));
    });
    return map;
  }, [safeStudents, currentSchoolYear]);
  const journeyScorebookResults = useMemo(() => {
    const results = new Map();
    const countAbsences = (student = {}, schoolYear = '', grade = '') => {
      const studentKey = getJourneyStudentKey(student);
      return attendanceDocs.reduce((sum, item) => {
        if (item.schoolYear && compactSchoolYearLabel(item.schoolYear) !== compactSchoolYearLabel(schoolYear)) return sum;
        const itemGrade = getGradeFromClass(item.className || item.grade || '');
        if (String(itemGrade || grade) !== String(grade)) return sum;
        const records = item.records || {};
        const attendanceRecord = records[student.id]
          || Object.values(records).find(record => {
            const recordKey = String(record?.studentId || record?.accessCode || record?.studentAccessCode || '').trim().toUpperCase();
            const recordNameKey = `${normalizeSearch(record?.studentName || record?.fullName || '')}__${String(record?.birthDate || '').trim()}`;
            return (student.id && record?.studentId === student.id)
              || (studentKey && recordKey && studentKey === recordKey)
              || (studentKey && recordNameKey && studentKey === recordNameKey);
          });
        return attendanceRecord?.status === 'CP' || attendanceRecord?.status === 'KP' ? sum + 1 : sum;
      }, 0);
    };

    safeStudents.forEach(student => {
      const grade = getGradeFromClass(student.className || student.grade || '');
      const schoolYear = student.schoolYear || currentSchoolYear || '';
      const schoolYearKey = compactSchoolYearLabel(schoolYear);
      if (!student.id || !grade || !schoolYearKey) return;
      const yearGradeKey = `${schoolYearKey}__${grade}`;
      const yearRows = journeyStudentsByYearGrade.get(yearGradeKey) || [];
      const selectedKey = getJourneyStudentKey(student);
      const rowIndex = yearRows.findIndex(row => row.id === student.id);
      const safeRowIndex = rowIndex >= 0 ? rowIndex : yearRows.findIndex(row => getJourneyStudentKey(row) === selectedKey);
      const scorebookEdits = scorebookEditsByYearGrade[yearGradeKey]?.edits || {};
      const hasScorebookData = Object.keys(scorebookEdits).length > 0;
      const academic = hasScorebookData && safeRowIndex >= 0
        ? getJourneyAcademicResultFromScorebook(scorebookEdits, safeRowIndex)
        : '';
      const absenceCount = countAbsences(student, schoolYear, grade);
      results.set(student.id, {
        academic,
        conduct: absenceCount < 20 ? 'Tốt' : 'Khá',
        absenceCount,
        hasScorebookData
      });
    });
    return results;
  }, [attendanceDocs, currentSchoolYear, journeyStudentsByYearGrade, safeStudents, scorebookEditsByYearGrade]);
  const journeyRows = useMemo(() => {
    const needle = normalizeSearch(query);
    const groups = new Map();
    safeStudents.forEach(student => {
      if (!student.fullName && !student.identityCode) return;
      const key = getStudentIdentity(student) || student.id || `${student.fullName}_${student.schoolYear}`;
      const group = groups.get(key) || { key, records: [], byYear: new Map() };
      group.records.push(student);
      if (student.schoolYear) {
        const existing = group.byYear.get(student.schoolYear);
        if (!existing || (existing.status === 'dropped' && student.status !== 'dropped')) {
          group.byYear.set(student.schoolYear, student);
        }
      }
      groups.set(key, group);
    });

    return [...groups.values()].map(group => {
      const records = [...group.records].sort((a, b) => {
        const yearCompare = (getYearStart(a.schoolYear) || 9999) - (getYearStart(b.schoolYear) || 9999);
        if (yearCompare !== 0) return yearCompare;
        return compareClassThenName(a, b);
      });
      const latest = records[records.length - 1] || {};
      const first = records[0] || latest;
      const matchedRecord = records.find(student =>
        (!journeyYearFilter || student.schoolYear === journeyYearFilter) &&
        getJourneyClassMatch(student, journeyClassFilter)
      );
      const searchable = normalizeSearch([
        latest.fullName,
        latest.accessCode,
        latest.identityCode,
        latest.birthDate,
        latest.className,
        ...records.map(student => `${student.schoolYear} ${student.className}`)
      ].join(' '));
      return {
        key: group.key,
        student: matchedRecord || latest,
        records,
        byYear: group.byYear,
        entryYear: first.enrollmentYear || first.schoolYear || '',
        include: Boolean(matchedRecord),
        searchable
      };
    })
      .filter(row => (!journeyYearFilter || row.include) && (!needle || row.searchable.includes(needle)))
      .sort((a, b) => compareClassThenName(a.student, b.student));
  }, [safeStudents, query, journeyYearFilter, journeyClassFilter]);
  const addressProvinceOptions = useMemo(() => uniqueTextItems([
    ...addressDirectory.provinces,
    ...safeStudents.flatMap(student => [student.province, student.householdProvince]),
    editing?.province,
    editing?.householdProvince
  ]).sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })), [addressDirectory.provinces, safeStudents, editing?.province, editing?.householdProvince]);
  const getWardOptions = (province = '', currentValue = '', household = false) => {
    const provinceName = String(province || '').trim();
    const sheetOptions = addressDirectory.communes[provinceName] || [];
    const studentOptions = safeStudents
      .filter(student => !provinceName || student.province === provinceName || student.householdProvince === provinceName)
      .flatMap(student => household ? [student.householdWard, student.ward] : [student.ward, student.householdWard]);
    return uniqueTextItems([...sheetOptions, ...studentOptions, currentValue])
      .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
  };
  const editCurrentWardOptions = useMemo(
    () => getWardOptions(editing?.province, editing?.ward, false),
    [addressDirectory.communes, safeStudents, editing?.province, editing?.ward]
  );
  const editHouseholdWardOptions = useMemo(
    () => getWardOptions(editing?.householdProvince, editing?.householdWard, true),
    [addressDirectory.communes, safeStudents, editing?.householdProvince, editing?.householdWard]
  );
  const registrationRows = useMemo(
    () => pendingRegistrations.map(item => ({
      ...registrationToStudentData(item, currentSchoolYear),
      id: safePlainValue(item.tempId),
      tempId: safePlainValue(item.tempId),
      rowNumber: safePlainValue(item.rowNumber),
      duplicateReason: safePlainValue(item.duplicateReason),
      duplicateStudentId: safePlainValue(item.duplicateStudentId),
      duplicateStudentName: safePlainValue(item.duplicateStudentName),
      duplicateAccessCode: safePlainValue(item.duplicateAccessCode)
    })),
    [pendingRegistrations, currentSchoolYear]
  );
  const findRegistrationDuplicate = (registration = {}) => {
    const identityCode = String(registration.identityCode || registration.maDinhDanh || '').replace(/^'/, '').trim();
    if (/^\d{12}$/.test(identityCode)) {
      const byIdentity = safeStudents.find(student => String(student.identityCode || '').replace(/^'/, '').trim() === identityCode);
      if (byIdentity) return { student: byIdentity, reason: 'Trùng mã định danh' };
    }

    const name = normalizeVietnameseName(registration.fullName || registration.hoVaTen || '');
    const birthDate = normalizeBirthDate(registration.birthDate || registration.ngaySinh || '');
    if (name && birthDate) {
      const byNameBirth = safeStudents.find(student =>
        normalizeVietnameseName(student.fullName || '') === name &&
        normalizeBirthDate(student.birthDate || '') === birthDate
      );
      if (byNameBirth) return { student: byNameBirth, reason: 'Trùng họ tên + ngày sinh' };
    }
    return null;
  };

  const decorateRegistration = (item = {}, index = 0) => {
    const duplicate = findRegistrationDuplicate(item);
    return {
      ...item,
      tempId: safePlainValue(item.id || item.rowNumber || `${pickText(item.identityCode, item.fullName) || 'row'}_${index}`),
      hiddenBecauseExistingStudent: Boolean(duplicate?.student),
      duplicateReason: duplicate?.reason || '',
      duplicateStudentId: duplicate?.student?.id || '',
      duplicateStudentName: duplicate?.student?.fullName || '',
      duplicateAccessCode: duplicate?.student?.accessCode || ''
    };
  };

  useEffect(() => {
    if (studentTab === 'registrations' && !pendingRegistrations.length && !isLoadingRegistrations) {
      loadPendingRegistrations();
    }
  }, [studentTab]);

  useEffect(() => {
    setColumnFilters({});
    setOpenFilterKey(null);
    setClassFilter([]);
    setShowClassPicker(false);
    setStatusFilter(studentTab === 'current' ? 'active' : 'all');
    if (studentTab === 'registrations') {
      const compact = typeof window !== 'undefined' && window.innerWidth < 640;
      setVisibleColumns(compact ? MOBILE_VISIBLE_COLUMNS : REGISTRATION_DEFAULT_VISIBLE_COLUMNS);
    }
  }, [studentTab]);

  useEffect(() => {
    if (!journeyYearFilter || !journeyYearOptions.includes(journeyYearFilter)) {
      setJourneyYearFilter(currentSchoolYear || journeyYearOptions[journeyYearOptions.length - 1] || '');
    }
  }, [currentSchoolYear, journeyYearFilter, journeyYearOptions]);

  useEffect(() => {
    if (journeyClassFilter !== 'all' && !journeyClassOptions.some(option => option.value === journeyClassFilter)) {
      setJourneyClassFilter('all');
    }
  }, [journeyClassFilter, journeyClassOptions]);

  useEffect(() => {
    if (!editing || addressDirectory.provinces.length) return;
    try {
      const cached = JSON.parse(localStorage.getItem(ADDRESS_DIRECTORY_CACHE_KEY) || 'null');
      if (cached?.provinces?.length) {
        setAddressDirectory({
          provinces: uniqueTextItems(cached.provinces),
          communes: cached.communes || {}
        });
        return;
      }
    } catch {
      localStorage.removeItem(ADDRESS_DIRECTORY_CACHE_KEY);
    }
    let active = true;
    loadRegistrationDataAction('addressDirectory')
      .then(response => {
        if (!active) return;
        if (response.provinces?.length || response.communes) {
          const nextDirectory = {
            provinces: uniqueTextItems(response.provinces || response.items || []),
            communes: response.communes || {}
          };
          setAddressDirectory(nextDirectory);
          localStorage.setItem(ADDRESS_DIRECTORY_CACHE_KEY, JSON.stringify(nextDirectory));
          return;
        }
        return loadRegistrationDataAction('provinces').then(fallback => {
          if (!active) return;
          setAddressDirectory(prev => ({ ...prev, provinces: uniqueTextItems(fallback.items || fallback.provinces || []) }));
        });
      })
      .catch(() => {
        loadRegistrationDataAction('provinces')
          .then(fallback => {
            if (!active) return;
            setAddressDirectory(prev => ({ ...prev, provinces: uniqueTextItems(fallback.items || fallback.provinces || []) }));
          })
          .catch(() => {});
      });
    return () => { active = false; };
  }, [editing, addressDirectory.provinces.length]);

  useEffect(() => {
    if (!editing) return;
    const targets = uniqueTextItems([editing.province, editing.householdProvince])
      .filter(province => !Object.prototype.hasOwnProperty.call(addressDirectory.communes, province));
    if (!targets.length) return;
    targets.forEach(province => {
      loadRegistrationDataAction('communes', { province })
        .then(response => {
          setAddressDirectory(prev => ({
            ...prev,
            communes: {
              ...prev.communes,
              [province]: uniqueTextItems(response.items || response.communes || [])
            }
          }));
        })
        .catch(() => {
          setAddressDirectory(prev => ({
            ...prev,
            communes: {
              ...prev.communes,
              [province]: []
            }
          }));
        });
    });
  }, [editing?.province, editing?.householdProvince, addressDirectory.communes]);
  const duplicateRegistrationCount = useMemo(
    () => pendingRegistrations.filter(item => item.duplicateReason).length,
    [pendingRegistrations]
  );

  const activeSourceRows = studentTab === 'registrations' ? registrationRows : yearStudents;
  const classOptions = useMemo(
    () => [...new Set(activeSourceRows.map(student => student.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [activeSourceRows]
  );
  const activeSelectedIds = studentTab === 'registrations' ? selectedRegistrationIds : selectedIds;
  const selectedClassSet = useMemo(() => new Set(classFilter), [classFilter]);
  const classFilterLabel = useMemo(() => {
    if (!classFilter.length) return 'Tất cả lớp';
    if (classFilter.length === 1) return `Lớp ${classFilter[0]}`;
    return `${classFilter.length} lớp`;
  }, [classFilter]);
  const toggleClassFilter = (className) => {
    setClassFilter(prev => prev.includes(className)
      ? prev.filter(item => item !== className)
      : [...prev, className].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' })));
  };
  const matchesClassFilter = (student) => !classFilter.length || selectedClassSet.has(student.className);

  const getMissingAcademicResults = (student = {}) => {
    const grade = Number(getGradeFromClass(student.className) || 0);
    if (grade <= 6) return [];
    const maxGrade = Math.min(grade - 1, 9);
    return ACADEMIC_RESULT_CHECK_FIELDS
      .filter(item => item.grade <= maxGrade)
      .filter(item => !safePlainValue(student[item.key]).trim())
      .map(item => item.label);
  };

  const getMissingStudentInfo = (student = {}) => {
    const hasStudentPhone = Boolean(safePlainValue(student.phone).trim());
    return [
      ...MISSING_INFO_CHECK_FIELDS.filter(item => {
        if (hasStudentPhone && ['fatherPhone', 'motherPhone'].includes(item.key)) return false;
        const value = safePlainValue(student[item.key]);
        if (item.document) return splitDocumentUrls(value).length === 0;
        return !value.trim();
      }).map(item => item.label),
      ...getMissingAcademicResults(student)
    ];
  };

  const getStudentIssueFlags = (student = {}) => {
    const missingDocs = STUDENT_DOCUMENTS.some(item => splitDocumentUrls(student[item.key]).length === 0);
    const missingIdentity = !safePlainValue(student.identityCode).trim();
    const missingAcademic = getMissingAcademicResults(student).length > 0;
    return {
      missingDocs,
      missingIdentity,
      missingAcademic,
      missingInfo: getMissingStudentInfo(student).length > 0
    };
  };

  useEffect(() => {
    setClassFilter(prev => prev.filter(className => classOptions.includes(className)));
  }, [classOptions]);

  const matchesQuickIssueFilter = (student = {}) => {
    if (quickIssueFilter === 'all') return true;
    if (quickIssueFilter === 'selected') return activeSelectedIds.has(student.id);
    if (student.status === 'dropped') return false;
    const flags = getStudentIssueFlags(student);
    return Boolean(flags[quickIssueFilter]);
  };

  const filteredStudents = useMemo(() => {
    const needle = normalizeSearch(query);
    return [...activeSourceRows
      .filter(student => studentTab === 'registrations' || statusFilter === 'all' || (student.status || 'active') === statusFilter)
      .filter(matchesClassFilter)
      .filter(matchesQuickIssueFilter)
      .filter(student => visibleStudentFields.every(field => {
        const filterValue = columnFilters[field.key];
        if (!filterValue) return true;
        if (DOCUMENT_FIELD_KEYS.has(field.key)) {
          const hasDocument = splitDocumentUrls(student[field.key]).length > 0;
          if (filterValue === HAS_DOCUMENT_FILTER_VALUE) return hasDocument;
          if (filterValue === EMPTY_FILTER_VALUE) return !hasDocument;
          return false;
        }
        if (filterValue === EMPTY_FILTER_VALUE) return !String(student[field.key] || '').trim();
        return String(student[field.key] || '') === filterValue;
      }))
      .filter(student => {
        if (!needle) return true;
        return normalizeSearch([
          student.fullName,
          student.className,
          student.accessCode,
          student.identityCode,
          student.phone,
          student.fatherPhone,
          student.motherPhone
        ].join(' ')).includes(needle);
      })]
      .sort((a, b) => {
        const statusCompare = (a.status === 'dropped' ? 1 : 0) - (b.status === 'dropped' ? 1 : 0);
        if (statusCompare !== 0) return statusCompare;
        return sortMode === 'fullName' ? compareVietnameseName(a, b) : compareClassThenName(a, b);
      });
  }, [activeSourceRows, studentTab, query, classFilter, statusFilter, visibleStudentFields, columnFilters, sortMode, quickIssueFilter, activeSelectedIds]);

  const issueStats = useMemo(() => {
    const rows = activeSourceRows
      .filter(student => studentTab === 'registrations' || statusFilter === 'all' || (student.status || 'active') === statusFilter)
      .filter(matchesClassFilter);
    const activeRows = rows.filter(student => student.status !== 'dropped');
    const selectedRows = rows.filter(student => activeSelectedIds.has(student.id));
    return {
      all: rows.length,
      selected: selectedRows.length,
      missingInfo: activeRows.filter(student => getStudentIssueFlags(student).missingInfo).length,
      missingDocs: activeRows.filter(student => getStudentIssueFlags(student).missingDocs).length,
      missingIdentity: activeRows.filter(student => getStudentIssueFlags(student).missingIdentity).length,
      missingAcademic: activeRows.filter(student => getStudentIssueFlags(student).missingAcademic).length
    };
  }, [activeSourceRows, studentTab, statusFilter, classFilter, activeSelectedIds]);
  const classStats = useMemo(() => {
    const map = new Map();
    activeSourceRows.forEach(student => {
      const className = String(student.className || 'Chưa xếp lớp').trim() || 'Chưa xếp lớp';
      const current = map.get(className) || { className, total: 0, active: 0, dropped: 0, noCode: 0, noIdentityCode: 0 };
      const identityText = normalizeSearch(student.identityCode);
      current.total += 1;
      if (student.status === 'dropped') current.dropped += 1;
      else current.active += 1;
      if (!student.accessCode) current.noCode += 1;
      if (!identityText || identityText.includes('chua co')) current.noIdentityCode += 1;
      map.set(className, current);
    });
    return [...map.values()].sort((a, b) => a.className.localeCompare(b.className, 'vi', { numeric: true, sensitivity: 'base' }));
  }, [activeSourceRows]);

  const getFilterOptions = (fieldKey) => {
    const source = activeSourceRows
      .filter(student => studentTab === 'registrations' || statusFilter === 'all' || (student.status || 'active') === statusFilter)
      .filter(matchesClassFilter)
      .filter(student => Object.entries(columnFilters).every(([key, value]) => {
        if (!value || key === fieldKey) return true;
        if (DOCUMENT_FIELD_KEYS.has(key)) {
          const hasDocument = splitDocumentUrls(student[key]).length > 0;
          if (value === HAS_DOCUMENT_FILTER_VALUE) return hasDocument;
          if (value === EMPTY_FILTER_VALUE) return !hasDocument;
          return true;
        }
        if (value === EMPTY_FILTER_VALUE) return !String(student[key] || '').trim();
        return String(student[key] || '') === value;
      }));
    return [...new Set(source.map(student => {
      if (DOCUMENT_FIELD_KEYS.has(fieldKey)) {
        return splitDocumentUrls(student[fieldKey]).length > 0 ? HAS_DOCUMENT_FILTER_VALUE : EMPTY_FILTER_VALUE;
      }
      const value = String(student[fieldKey] || '').trim();
      return value || EMPTY_FILTER_VALUE;
    }))]
      .sort((a, b) => {
        if (a === HAS_DOCUMENT_FILTER_VALUE) return -1;
        if (b === HAS_DOCUMENT_FILTER_VALUE) return 1;
        if (a === EMPTY_FILTER_VALUE) return -1;
        if (b === EMPTY_FILTER_VALUE) return 1;
        return String(a).localeCompare(String(b), 'vi', { numeric: true, sensitivity: 'base' });
      });
  };

  const openCreate = () => setEditing({ ...emptyStudent, schoolYear: currentSchoolYear, enrollmentYear: String(new Date().getFullYear()) });
  const openEdit = (student) => setEditing(normalizeStudentRecord({ ...emptyStudent, ...student }, currentSchoolYear));
  const closeEdit = () => {
    setEditing(null);
    setDocumentViewer(null);
    setUploadingDocumentKey('');
  };
  const updateEditingField = (key, value) => {
    setEditing(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (key === 'province' && prev.province !== value) next.ward = '';
      if (key === 'householdProvince' && prev.householdProvince !== value) next.householdWard = '';
      return next;
    });
  };
  const removeEditingDocumentUrl = (key, indexToRemove) => {
    setEditing(prev => {
      if (!prev) return prev;
      const nextUrls = splitDocumentUrls(prev[key]).filter((_, index) => index !== indexToRemove);
      return { ...prev, [key]: nextUrls.join('\n') };
    });
    setDocumentViewer(prev => {
      if (!prev || prev.key !== key) return prev;
      const nextUrls = prev.urls.filter((_, index) => index !== indexToRemove);
      if (!nextUrls.length) return null;
      return { ...prev, urls: nextUrls, index: Math.min(prev.index, nextUrls.length - 1) };
    });
  };
  const openDocumentViewer = (docItem, startIndex = 0) => {
    const urls = splitDocumentUrls(editing?.[docItem.key]);
    if (!urls.length) return;
    setDocumentViewer({
      key: docItem.key,
      title: docItem.label,
      urls,
      index: Math.min(Math.max(startIndex, 0), urls.length - 1)
    });
  };
  const openStudentDocumentViewer = (student = {}, field = {}, startIndex = 0) => {
    const urls = splitDocumentUrls(student[field.key]);
    if (!urls.length) return;
    setDocumentViewer({
      key: field.key,
      title: `${IMAGE_PREVIEW_FIELD_LABELS[field.key] || field.label || 'Ảnh'} - ${student.fullName || 'Học sinh'}`,
      urls,
      index: Math.min(Math.max(startIndex, 0), urls.length - 1)
    });
  };
  const uploadEditingDocumentFiles = async (docItem, fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!editing || !files.length) return;
    setUploadingDocumentKey(docItem.key);
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const payload = await fileToBase64Payload(file, docItem, editing);
        const response = await postAppsScript(payload);
        uploadedUrls.push(response.webViewLink || response.url || (response.fileId ? `https://drive.google.com/file/d/${response.fileId}/view` : ''));
      }
      const cleanUrls = uploadedUrls.filter(Boolean);
      setEditing(prev => {
        if (!prev) return prev;
        const nextUrls = docItem.multiple ? cleanUrls : cleanUrls.slice(-1);
        return { ...prev, [docItem.key]: nextUrls.join('\n') };
      });
      showNotification?.(`Đã tải ${cleanUrls.length} file ${docItem.label.toLowerCase()}. Bấm Lưu hồ sơ để ghi vào database.`);
    } catch (error) {
      showNotification?.(`Chưa tải được ${docItem.label.toLowerCase()}: ${error.message || 'lỗi không xác định'}`, 'error');
    } finally {
      setUploadingDocumentKey('');
    }
  };
  const filteredIds = useMemo(
    () => filteredStudents
      .filter(student => !(studentTab === 'registrations' && student.duplicateReason))
      .map(student => student.id)
      .filter(Boolean),
    [filteredStudents, studentTab]
  );
  const selectedCount = selectedIds.size;
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => activeSelectedIds.has(id));

  const toggleSelectStudent = (studentId) => {
    const setter = studentTab === 'registrations' ? setSelectedRegistrationIds : setSelectedIds;
    setter(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    const setter = studentTab === 'registrations' ? setSelectedRegistrationIds : setSelectedIds;
    setter(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredIds.forEach(id => next.delete(id));
      else filteredIds.forEach(id => next.add(id));
      return next;
    });
  };

  const filterCheckedStudents = () => {
    if (!activeSelectedIds.size) {
      showNotification?.('Thầy/cô tích học sinh cần lọc trước.');
      return;
    }
    setQuickIssueFilter('selected');
    setQuery('');
    setColumnFilters({});
    setOpenFilterKey(null);
    setShowFilters(false);
    setShowClassPicker(false);
  };

  const updateVisibleColumns = (fieldKey) => {
    setVisibleColumns(prev => {
      if (prev.includes(fieldKey)) {
        if (fieldKey === 'fullName') return prev;
        return prev.filter(key => key !== fieldKey);
      }
      return [...prev, fieldKey];
    });
  };

  const toggleAllVisibleColumns = () => {
    setVisibleColumns(prev => {
      const allKeys = STUDENT_FIELDS.map(field => field.key);
      const isAllSelected = allKeys.every(key => prev.includes(key));
      return isAllSelected ? ['fullName'] : allKeys;
    });
  };

  const normalizeCurrentYearStudentNames = async () => {
    const rawStudents = Array.isArray(students) ? students : [];
    const targets = rawStudents
      .filter(student => String(student.schoolYear || currentSchoolYear) === String(currentSchoolYear))
      .map(student => {
        const currentName = safePlainValue(student.fullName);
        const nextName = formatStudentFullName(currentName);
        return { ...student, currentName, nextName };
      })
      .filter(student => student.id && student.nextName && student.currentName !== student.nextName);

    if (!targets.length) {
      showNotification?.('Tên học sinh năm này đã đúng dạng hoa đầu từ.');
      return;
    }
    if (!window.confirm(`Chuẩn hóa ${targets.length} tên học sinh của năm ${currentSchoolYear} sang dạng hoa đầu từ?`)) return;
    setIsSaving(true);
    try {
      await Promise.all(targets.map(student => setDoc(
        doc(db, 'artifacts', appId, 'public', 'data', 'students', student.id),
        {
          fullName: student.nextName,
          updatedAt: Date.now(),
          updatedBy: user?.uid || ''
        },
        { merge: true }
      )));
      showNotification?.(`Đã chuẩn hóa ${targets.length} tên học sinh.`);
    } catch (error) {
      showNotification?.(`Chưa chuẩn hóa được tên học sinh: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const saveStudent = async () => {
    if (uploadingDocumentKey) {
      showNotification?.('Đang tải file giấy tờ, chờ xong rồi lưu hồ sơ nhé.', 'error');
      return;
    }
    const editingFullName = safePlainValue(editing?.fullName);
    const editingClassName = safePlainValue(editing?.className);
    if (!editingFullName) {
      showNotification?.('Cần nhập họ tên học sinh.', 'error');
      return;
    }
    if (!editingClassName) {
      showNotification?.('Cần nhập lớp học.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const payload = normalizeStudentRecord({
        ...editing,
        fullName: editingFullName,
        className: editingClassName,
        schoolYear: editing.schoolYear || currentSchoolYear,
        updatedAt: Date.now(),
        updatedBy: user?.uid || ''
      }, currentSchoolYear);
      if (!payload.accessCode) {
        const codeMap = assignSequentialCodesByOrder([...yearStudents, payload], [payload], existingCodes, currentSchoolYear);
        payload.accessCode = codeMap.get(payload) || makeAccessCode(payload, existingCodes);
      }
      if (payload.id) {
        const { id, ...data } = payload;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', id), data, { merge: true });
      } else {
        const data = { ...payload };
        delete data.id;
        data.createdAt = Date.now();
        data.createdBy = user?.uid || '';
        await addDoc(studentsCollection, data);
      }
      try {
        await syncStudentToSheet(payload, currentSchoolYear);
        showNotification?.('Đã lưu hồ sơ học sinh và cập nhật Sheet.');
      } catch (sheetError) {
        showNotification?.(`Đã lưu Firebase, nhưng Sheet chưa cập nhật: ${sheetError.message}`, 'error');
      }
      closeEdit();
    } catch (error) {
      showNotification?.(`Chưa lưu được học sinh: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const resolveProfileRequestStudent = (request = {}) => {
    if (!request.studentId) return null;
    if (editing?.id === request.studentId) return normalizeStudentRecord({ ...emptyStudent, ...editing }, currentSchoolYear);
    return safeStudents.find(student => student.id === request.studentId) || null;
  };

  const hideProfileRequestFieldLocally = (requestId = '', fieldKey = '') => {
    if (!requestId) return;
    setProfileRequests(prev => prev.flatMap(request => {
      if (request.id !== requestId) return [request];
      if (!fieldKey) return [];
      const nextChanges = sanitizeStudentChanges(request.changes);
      delete nextChanges[fieldKey];
      return Object.keys(nextChanges).length ? [{ ...request, changes: nextChanges }] : [];
    }));
  };

  const updateProfileRequestAfterFieldDecision = async (request = {}, fieldKey = '') => {
    const remainingChanges = sanitizeStudentChanges(request.changes);
    delete remainingChanges[fieldKey];
    if (Object.keys(remainingChanges).length === 0) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests', request.id));
      hideProfileRequestFieldLocally(request.id);
      return;
    }
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests', request.id), {
      changes: remainingChanges,
      updatedAt: Date.now()
    }, { merge: true });
    hideProfileRequestFieldLocally(request.id, fieldKey);
  };

  const approveProfileField = async (request = {}, fieldKey = '') => {
    if (!request?.id || !request.studentId || !fieldKey) return;
    const nextValue = safePlainValue(request.changes?.[fieldKey]);
    setIsSaving(true);
    try {
      const studentBefore = resolveProfileRequestStudent(request);
      if (isReadOnlyStudentRecord(studentBefore)) {
        showNotification?.(readOnlyStudentMessage(studentBefore), 'error');
        return;
      }
      const nextStudent = { ...(studentBefore || {}), id: request.studentId, [fieldKey]: nextValue };
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', request.studentId), {
        [fieldKey]: nextValue,
        updatedAt: Date.now(),
        updatedBy: user?.uid || ''
      }, { merge: true });
      await updateProfileRequestAfterFieldDecision(request, fieldKey);
      postAppsScript({ action: 'writeAuditLog', auditAction: 'duyet_mot_truong_ho_so', actor: user?.uid || 'Admin', details: { studentId: request.studentId, fieldKey, before: studentBefore?.[fieldKey] ?? '', after: nextValue } }).catch(() => undefined);
      if (editing?.id === request.studentId) {
        setEditing(prev => prev ? ({ ...prev, [fieldKey]: nextValue }) : prev);
      }
      try {
        await syncStudentToSheet(nextStudent, currentSchoolYear);
      } catch (sheetError) {
        showNotification?.(`Đã duyệt dòng này, nhưng Sheet chưa cập nhật: ${sheetError.message}`, 'error');
        return;
      }
      showNotification?.(`Đã duyệt: ${STUDENT_FIELD_LABELS[fieldKey] || fieldKey}.`);
    } catch (error) {
      showNotification?.(`Chưa duyệt được dòng này: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const rejectProfileField = async (request = {}, fieldKey = '') => {
    if (!request?.id || !fieldKey) return;
    setIsSaving(true);
    try {
      await updateProfileRequestAfterFieldDecision(request, fieldKey);
      showNotification?.(`Đã bỏ qua: ${STUDENT_FIELD_LABELS[fieldKey] || fieldKey}.`);
    } catch (error) {
      showNotification?.(`Chưa bỏ qua được dòng này: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDropout = async (student) => {
    const nextStatus = student.status === 'dropped' ? 'active' : 'dropped';
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', student.id), {
        status: nextStatus,
        updatedAt: Date.now(),
        updatedBy: user?.uid || ''
      }, { merge: true });
      let sheetSynced = true;
      try {
        await syncStudentToSheet({ ...student, status: nextStatus }, currentSchoolYear);
      } catch (sheetError) {
        sheetSynced = false;
        showNotification?.(`Firebase đã cập nhật, nhưng Sheet chưa cập nhật: ${sheetError.message}`, 'error');
      }
      setStatusFilter('active');
      if (sheetSynced) {
        showNotification?.(nextStatus === 'dropped' ? 'Đã đánh dấu học sinh bỏ học và cập nhật Sheet.' : 'Đã đưa học sinh học lại và cập nhật Sheet.');
      }
    } catch (error) {
      showNotification?.(`Chưa cập nhật được: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const removeStudent = async (student) => {
    if (!window.confirm(`Xóa hồ sơ "${student.fullName}"?`)) return;
    setIsSaving(true);
    try {
      await onBeforeDangerousAction?.('truoc-xoa-hoc-sinh');
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', student.id));
      await postAppsScript({ action: 'writeAuditLog', auditAction: 'xoa_ho_so_hoc_sinh', actor: user?.uid || 'Admin', details: { studentId: student.id, fullName: student.fullName || '' } });
      showNotification?.('Đã xóa hồ sơ học sinh.');
    } catch (error) {
      showNotification?.(`Chưa xóa được: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const removeSelectedStudents = async () => {
    const targets = yearStudents.filter(student => selectedIds.has(student.id));
    if (!targets.length) {
      showNotification?.('Chưa chọn học sinh nào để xóa.', 'error');
      return;
    }
    const ok = window.confirm(`Xóa ${targets.length} học sinh đã chọn khỏi database?\nThao tác này xóa hồ sơ khỏi Firebase, không chỉ ẩn khỏi bảng.`);
    if (!ok) return;
    setIsSaving(true);
    try {
      await onBeforeDangerousAction?.('truoc-xoa-nhieu-hoc-sinh');
      await Promise.all(targets.map(student => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', student.id))));
      await postAppsScript({ action: 'writeAuditLog', auditAction: 'xoa_nhieu_hoc_sinh', actor: user?.uid || 'Admin', details: { count: targets.length, students: targets.map(student => ({ id: student.id, fullName: student.fullName || '' })) } });
      setSelectedIds(new Set());
      showNotification?.(`Đã xóa ${targets.length} học sinh đã chọn.`);
    } catch (error) {
      showNotification?.(`Chưa xóa được danh sách đã chọn: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const generateMissingCodes = async () => {
    const targets = yearStudents.filter(student => !student.accessCode).sort(compareClassThenName);
    if (!targets.length) {
      showNotification?.('Tất cả học sinh trong năm học này đã có mã.');
      return;
    }
    setIsSaving(true);
    try {
      const codeMap = assignSequentialCodesByOrder(yearStudents, targets, existingCodes, currentSchoolYear);
      const codes = new Set(existingCodes);
      await Promise.all(targets.map(student => {
        const code = codeMap.get(student) || nextSequentialCode(student, codes, currentSchoolYear);
        codes.add(code);
        return setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', student.id), {
          accessCode: code,
          updatedAt: Date.now(),
          updatedBy: user?.uid || ''
        }, { merge: true });
      }));
      showNotification?.(`Đã tạo mã cho ${targets.length} học sinh.`);
    } catch (error) {
      showNotification?.(`Chưa tạo mã được: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const regenerateAllCodes = async () => {
    const targets = [...yearStudents].sort(compareClassThenName);
    if (!targets.length) {
      showNotification?.('Chưa có học sinh trong năm học này để tạo mã.', 'error');
      return;
    }
    const ok = window.confirm(`Xóa mã cũ và tạo lại mã mới cho ${targets.length} học sinh của năm ${currentSchoolYear}?\nMã mới sẽ theo dạng HS + năm nhập học + khối nhập học + STT, ví dụ HS22601.`);
    if (!ok) return;

    setIsSaving(true);
    try {
      const targetIds = new Set(targets.map(student => student.id));
      const reservedCodes = new Set(safeStudents.filter(student => !targetIds.has(student.id)).map(student => student.accessCode).filter(Boolean));
      const codeMap = assignSequentialCodesByOrder(targets, targets, reservedCodes, currentSchoolYear);
      await Promise.all(targets.map(student => {
        const code = codeMap.get(student) || nextSequentialCode(student, reservedCodes, currentSchoolYear);
        reservedCodes.add(code);
        return setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', student.id), {
          accessCode: code,
          updatedAt: Date.now(),
          updatedBy: user?.uid || ''
        }, { merge: true });
      }));
      showNotification?.(`Đã tạo lại mã mới cho ${targets.length} học sinh.`);
    } catch (error) {
      showNotification?.(`Chưa tạo lại mã được: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const syncPreviousYear = async () => {
    if (!previousSchoolYear) {
      showNotification?.('Chưa nhận được năm học trước để đồng bộ.', 'error');
      return;
    }
    const sourceStudents = previousYearStudents.filter(student => (student.status || 'active') === 'active');
    if (!sourceStudents.length) {
      showNotification?.(`Chưa có dữ liệu năm ${previousSchoolYear} để đồng bộ.`, 'error');
      return;
    }

    const currentKeys = new Set(yearStudents.map(getStudentIdentity).filter(Boolean));
    const candidates = sourceStudents
      .map(student => ({ student, nextClass: promoteClassName(student.className) }))
      .filter(item => item.nextClass)
      .filter(item => !currentKeys.has(getStudentIdentity(item.student)));

    if (!candidates.length) {
      showNotification?.(`Năm ${currentSchoolYear} đã có đủ dữ liệu từ ${previousSchoolYear}, hoặc lớp 9 đã ra trường.`);
      return;
    }

    const ok = window.confirm(`Đồng bộ ${candidates.length} học sinh từ năm ${previousSchoolYear} sang ${currentSchoolYear}?\nLớp 6 lên 7, 7 lên 8, 8 lên 9. Học sinh lớp 9 năm trước sẽ không đưa sang.`);
    if (!ok) return;

    setIsSaving(true);
    try {
      const codes = new Set(existingCodes);
      await Promise.all(candidates.sort((a, b) => compareClassThenName({ ...a.student, className: a.nextClass }, { ...b.student, className: b.nextClass })).map(({ student, nextClass }) => {
        const baseData = { ...student };
        const sourceStudentId = baseData.id;
        const sourcePreviousStudentId = baseData.previousStudentId;
        const sourceSyncedFromSchoolYear = baseData.syncedFromSchoolYear;
        ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'syncedFromSchoolYear', 'previousStudentId'].forEach(key => delete baseData[key]);
        const payload = {
          ...baseData,
          className: nextClass,
          schoolYear: currentSchoolYear,
          previousStudentId: sourceStudentId || sourcePreviousStudentId || '',
          syncedFromSchoolYear: sourceSyncedFromSchoolYear || previousSchoolYear,
          status: 'active',
          accessCode: baseData.accessCode || nextSequentialCode({ ...baseData, className: nextClass, schoolYear: currentSchoolYear }, codes, currentSchoolYear),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: user?.uid || '',
          updatedBy: user?.uid || ''
        };
        codes.add(payload.accessCode);
        return addDoc(studentsCollection, payload);
      }));
      showNotification?.(`Đã đồng bộ ${candidates.length} học sinh sang năm ${currentSchoolYear}.`);
    } catch (error) {
      showNotification?.(`Chưa đồng bộ được: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const importFromPaste = async () => {
    const parsed = parseSheetPaste(importText, currentSchoolYear);
    if (!parsed.length) {
      showNotification?.('Chưa đọc được dữ liệu. Hãy copy cả hàng tiêu đề từ Google Sheet rồi dán vào.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const sortedParsed = parsed.sort(compareClassThenName);
      const codeMap = assignSequentialCodesByOrder([...yearStudents, ...sortedParsed], sortedParsed, existingCodes, currentSchoolYear);
      const codes = new Set(existingCodes);
      await Promise.all(sortedParsed.map(student => {
        const accessCode = codeMap.get(student) || nextSequentialCode(student, codes, currentSchoolYear);
        codes.add(accessCode);
        return addDoc(studentsCollection, {
          ...student,
          accessCode,
          schoolYear: student.schoolYear || currentSchoolYear,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: user?.uid || '',
          updatedBy: user?.uid || ''
        });
      }));
      showNotification?.(`Đã nhập ${parsed.length} học sinh từ bảng.`);
      setImportText('');
      setShowImport(false);
    } catch (error) {
      showNotification?.(`Chưa nhập được danh sách: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const prepareExportRows = (mode = 'current') => {
    const selectedRows = filteredStudents.filter(student => activeSelectedIds.has(student.id));
    const exportRows = selectedRows.length ? selectedRows : filteredStudents;
    if (!exportRows.length) {
      showNotification?.('Không có dòng nào để xuất.', 'error');
      return null;
    }
    const exportFields = mode === 'all' ? STUDENT_FIELDS : visibleStudentFields;
    const title = buildExportTitle({
      currentSchoolYear,
      classFilter,
      statusFilter,
      columnFilters,
      query,
      selectedCount: selectedRows.length,
      visibleFields: exportFields
    });
    const headers = ['STT', ...exportFields.map(field => field.label), 'Mã học sinh', 'Tình trạng', 'Năm học'];
    const rows = [[title, ...Array(Math.max(headers.length - 1, 0)).fill('')], headers];
    exportRows.forEach((student, index) => {
      rows.push([
        index + 1,
        ...exportFields.map(field => fieldValueForExport(student, field)),
        student.accessCode || '',
        student.status === 'dropped' ? 'Bỏ học' : 'Đang học',
        student.schoolYear || currentSchoolYear
      ]);
    });
    const blob = createXlsxBlob(rows, title);
    const titlePart = safeFilePart(title).slice(0, 80) || `danh-sach-hoc-sinh-${currentSchoolYear}`;
    const fileName = `${titlePart}${selectedRows.length ? '-da-chon' : ''}.xlsx`;
    return { blob, fileName, rows, title, count: exportRows.length, selectedCount: selectedRows.length, mode };
  };

  const downloadExportList = (mode = 'current') => {
    const result = prepareExportRows(mode);
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setShowExportChoice(false);
    setExportFormat('');
    setExcelExportAction('');
    showNotification?.(`Đã tải file Excel .xlsx gồm ${result.count} học sinh, ${mode === 'all' ? 'đầy đủ tất cả cột' : 'theo dữ liệu đang xem'}.`);
  };

  const sharePdfExportList = async (mode = 'current') => {
    const result = prepareExportRows(mode);
    if (!result) return;
    setIsSharingPdf(true);
    setSharedPdfLink('');
    try {
      showNotification?.('Đang tạo PDF và lưu lên Google Drive...');
      const response = await postAppsScript({
        action: 'createStudentListPdf',
        folderId: STUDENT_EXPORT_DRIVE_FOLDER_ID,
        filename: result.fileName.replace(/\.xlsx$/i, '.pdf'),
        title: result.title,
        rows: result.rows
      });
      if (response?.url) {
        setSharedPdfLink(response.url);
        const copied = await copyTextToClipboard(response.url);
        showNotification?.(copied ? `Da tao PDF ${result.count} dong va copy link. Bam Ctrl+V de dan.` : `Da tao PDF ${result.count} dong, nhung trinh duyet chua cho copy. Bam nut Copy link ben duoi.`);
      } else {
        showNotification?.('Đã tạo PDF nhưng máy chủ chưa trả link Drive.', 'error');
      }
    } catch (error) {
      showNotification?.(`Chưa tạo được PDF: ${error.message}`, 'error');
    } finally {
      setIsSharingPdf(false);
    }
  };

  const shareGoogleSheetExportList = async (mode = 'current') => {
    const result = prepareExportRows(mode);
    if (!result) return;
    setIsSharingSheet(true);
    setSharedSheetLink('');
    try {
      showNotification?.('Đang tạo Google Sheet và lấy liên kết...');
      const response = await postAppsScript({
        action: 'createStudentListSheet',
        folderId: STUDENT_EXPORT_DRIVE_FOLDER_ID,
        filename: result.fileName.replace(/\.xlsx$/i, ''),
        title: result.title,
        rows: result.rows
      });
      if (response?.url) {
        setSharedSheetLink(response.url);
        const copied = await copyTextToClipboard(response.url);
        showNotification?.(copied ? `Đã tạo Google Sheet ${result.count} học sinh và copy liên kết.` : `Đã tạo Google Sheet ${result.count} học sinh. Bấm Copy link bên dưới để chia sẻ.`);
      } else {
        showNotification?.('Đã tạo Google Sheet nhưng máy chủ chưa trả liên kết.', 'error');
      }
    } catch (error) {
      showNotification?.(`Chưa tạo được Google Sheet: ${error.message}`, 'error');
    } finally {
      setIsSharingSheet(false);
    }
  };

  const createMissingInfoReport = async () => {
    const selectedRows = filteredStudents.filter(student => activeSelectedIds.has(student.id));
    const sourceRows = (selectedRows.length ? selectedRows : filteredStudents)
      .filter(student => student.status !== 'dropped');
    if (!sourceRows.length) {
      showNotification?.('Không có học sinh đang học nào trong danh sách đang xem để kiểm tra.', 'error');
      return;
    }

    const missingRows = sourceRows
      .map(student => ({ student, missing: getMissingStudentInfo(student) }))
      .filter(item => item.missing.length > 0);

    const scopeText = selectedRows.length
      ? `${selectedRows.length} học sinh đã chọn`
      : `${sourceRows.length} học sinh đang lọc`;
    const classText = classFilter.length ? `Lớp: ${classFilter.join(', ')}` : 'Lớp: tất cả lớp đang xem';

    const report = missingRows.length
      ? [
          'THÔNG BÁO BỔ SUNG THÔNG TIN HỒ SƠ HỌC SINH',
          classText,
          `Đã kiểm tra ${scopeText}. Nhờ PH/HS bổ sung các mục còn thiếu sau:`,
          '',
          ...missingRows.map((item, index) => {
            const student = item.student;
            const name = safePlainValue(student.fullName) || 'Chưa có tên';
            const className = safePlainValue(student.className) || '-';
            const code = safePlainValue(student.accessCode);
            return `${index + 1}. **${name}** - Lớp ${className}${code ? ` - Mã ${code}` : ''}: thiếu ${item.missing.join(', ')}.`;
          }),
          '',
          'Nếu đã gửi/bổ sung rồi, vui lòng báo lại giáo viên để cập nhật.'
        ].join('\n')
      : [
          'THÔNG BÁO KIỂM TRA HỒ SƠ HỌC SINH',
          classText,
          `Đã kiểm tra ${scopeText}: hiện chưa thấy thiếu các thông tin/ảnh hồ sơ cần rà soát.`
        ].join('\n');

    setMissingInfoReport(report);
    const copied = await copyRichReportToClipboard(report);
    showNotification?.(copied ? 'Đã tạo và copy nội dung thiếu thông tin. Bấm Ctrl+V để dán vào nhóm.' : 'Đã tạo nội dung thiếu thông tin. Thầy copy trong khung bên dưới.');
  };

  const loadPendingRegistrations = () => {
    setIsLoadingRegistrations(true);
    const callbackName = `__studentRegistrations_${Date.now()}`;
    const script = document.createElement('script');
    window[callbackName] = (payload) => {
      const items = Array.isArray(payload) ? payload : (payload?.items || []);
      const checkedItems = items.map(decorateRegistration);
      const visibleItems = checkedItems;
      const duplicateCount = visibleItems.filter(item => item.duplicateReason).length;
      setPendingRegistrations(visibleItems);
      setSelectedRegistrationIds(new Set());
      setIsLoadingRegistrations(false);
      delete window[callbackName];
      script.remove();
      showNotification?.(`Đã tải ${visibleItems.length} hồ sơ mới cần duyệt.${duplicateCount ? ` Có ${duplicateCount} hồ sơ trùng cần thầy xử lý: cập nhật/đã có hoặc xóa.` : ''}`);
    };
    script.onerror = () => {
      setIsLoadingRegistrations(false);
      delete window[callbackName];
      script.remove();
      showNotification?.('Chưa tải được đăng ký mới. Hãy cập nhật Apps Script theo bản mình tạo.', 'error');
    };
    script.src = `${REGISTRATION_WEB_APP_URL}?action=listPending&callback=${callbackName}&t=${Date.now()}`;
    document.body.appendChild(script);
  };

  const syncAllStudentsToSheet = async () => {
    if (!yearStudents.length) {
      showNotification?.('Chưa có học sinh để cập nhật Sheet.', 'error');
      return;
    }
    if (!window.confirm(`Cập nhật ${yearStudents.length} hồ sơ của năm ${currentSchoolYear} lên Google Sheet?`)) return;
    setIsSaving(true);
    let successCount = 0;
    const errors = [];
    try {
      for (const student of yearStudents) {
        try {
          await syncStudentToSheet(student, currentSchoolYear);
          successCount += 1;
        } catch (error) {
          errors.push(`${student.fullName || student.accessCode || 'Học sinh'}: ${error.message}`);
        }
      }
      if (errors.length) {
        showNotification?.(`Đã cập nhật ${successCount}/${yearStudents.length} hồ sơ. Còn ${errors.length} hồ sơ lỗi, xem Console nếu cần.`, 'error');
        console.warn('Lỗi cập nhật Sheet:', errors);
      } else {
        showNotification?.(`Đã cập nhật toàn bộ ${successCount} hồ sơ lên Google Sheet.`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const syncStudentsFromSheet = async () => {
    if (!yearStudents.length) {
      showNotification?.('Chưa có học sinh trong database để khớp với Sheet.', 'error');
      return;
    }
    if (!window.confirm('Cập nhật database từ Google Sheet cho các học sinh đã khớp? Hệ thống chỉ ghi đè ô Sheet có dữ liệu, không xóa dữ liệu đang có trong database.')) return;
    setIsSaving(true);
    try {
      const response = await loadRegistrationDataAction('listStudents', { schoolYear: currentSchoolYear });
      const sheetRows = Array.isArray(response.items) ? response.items : [];
      if (!sheetRows.length) {
        showNotification?.('Chưa đọc được dòng nào từ Sheet.', 'error');
        return;
      }
      let matchedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const errors = [];

      for (const row of sheetRows) {
        const sheetStudent = registrationToStudentData(row, currentSchoolYear);
        const accessCode = String(sheetStudent.accessCode || '').trim().toUpperCase();
        const identityCode = String(sheetStudent.identityCode || '').replace(/^'/, '').trim();
        const existing = (accessCode
          ? yearStudents.find(student => String(student.accessCode || student.studentCode || '').trim().toUpperCase() === accessCode)
          : null)
          || (/^\d{12}$/.test(identityCode)
          ? yearStudents.find(student => String(student.identityCode || '').replace(/^'/, '').trim() === identityCode)
          : null)
          || yearStudents.find(student =>
            normalizeVietnameseName(student.fullName || '') === normalizeVietnameseName(sheetStudent.fullName || '')
            && normalizeBirthDate(student.birthDate || '') === normalizeBirthDate(sheetStudent.birthDate || '')
          );
        if (!existing?.id) {
          skippedCount += 1;
          continue;
        }
        matchedCount += 1;
        const changes = {};
        SHEET_TO_DATABASE_SYNC_FIELDS.forEach(key => {
          const nextValue = key === 'birthDate'
            ? formatDisplayDate(sheetStudent[key] || '')
            : safePlainValue(sheetStudent[key]);
          if (!isUsefulSheetValue(nextValue)) return;
          if (safePlainValue(existing[key]) === nextValue) return;
          changes[key] = nextValue;
        });
        if (!Object.keys(changes).length) continue;
        try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', existing.id), {
            ...changes,
            updatedAt: Date.now(),
            updatedBy: user?.uid || ''
          }, { merge: true });
          updatedCount += 1;
        } catch (error) {
          errors.push(`${existing.fullName || existing.accessCode || 'Học sinh'}: ${error.message}`);
        }
      }

      if (errors.length) {
        console.warn('Lỗi cập nhật database từ Sheet:', errors);
        showNotification?.(`Đã cập nhật ${updatedCount} hồ sơ, ${errors.length} hồ sơ lỗi. Khớp ${matchedCount}, bỏ qua ${skippedCount}.`, 'error');
      } else {
        showNotification?.(`Đã cập nhật database từ Sheet: ${updatedCount} hồ sơ. Khớp ${matchedCount}, bỏ qua ${skippedCount}.`);
      }
    } catch (error) {
      showNotification?.(`Chưa đồng bộ được từ Sheet: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const registrationToStudent = (registration = {}) => registrationToStudentData(registration, currentSchoolYear);

  const removePendingRegistrationLocally = (registration = {}) => {
    const tempId = safePlainValue(registration.tempId || registration.id);
    setPendingRegistrations(prev => prev.filter(item => safePlainValue(item.tempId || item.id) !== tempId));
    setSelectedRegistrationIds(prev => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });
  };

  const markExistingRegistration = async (registration = {}) => {
    const duplicate = findRegistrationDuplicate(registration);
    const existingStudent = duplicate?.student || safeStudents.find(student => student.id === registration.duplicateStudentId);
    if (!existingStudent?.id) {
      showNotification?.('Chưa tìm thấy học sinh đã có trong database để cập nhật.', 'error');
      return;
    }
    const identityCode = String(registration.identityCode || registration.maDinhDanh || '').replace(/^'/, '').trim();
    const shouldUpdateIdentity = /^\d{12}$/.test(identityCode) && identityCode !== String(existingStudent.identityCode || '').replace(/^'/, '').trim();
    if (shouldUpdateIdentity && !window.confirm(`Cập nhật mã định danh mới cho ${existingStudent.fullName || 'học sinh'} rồi đánh dấu dòng đăng ký là Đã có?`)) return;
    if (!shouldUpdateIdentity && !window.confirm('Đánh dấu dòng đăng ký này là Đã có để lần sau không tải lại?')) return;
    setIsSaving(true);
    try {
      if (shouldUpdateIdentity) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', existingStudent.id), {
          identityCode,
          updatedAt: Date.now(),
          updatedBy: user?.uid || ''
        }, { merge: true });
      }
      await callSheetAction('markExistingRegistration', {
        rowNumber: registration.rowNumber,
        identityCode: identityCode || existingStudent.identityCode || '',
        fullName: registration.fullName || existingStudent.fullName || '',
        birthDate: registration.birthDate || existingStudent.birthDate || '',
        note: shouldUpdateIdentity
          ? `Da cap nhat ma dinh danh vao database: ${identityCode}`
          : `Da co trong database: ${existingStudent.fullName || ''} ${existingStudent.accessCode || ''}`.trim()
      });
      removePendingRegistrationLocally(registration);
      showNotification?.(shouldUpdateIdentity ? 'Đã cập nhật mã định danh và ghi chú Đã có trên Sheet.' : 'Đã ghi chú Đã có trên Sheet, lần sau sẽ không hiện lại.');
    } catch (error) {
      showNotification?.(`Chưa xử lý được hồ sơ trùng: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const deletePendingRegistration = async (registration = {}) => {
    if (!window.confirm(`Xóa dòng đăng ký của ${registration.fullName || 'học sinh này'} khỏi Google Sheet?`)) return;
    setIsSaving(true);
    try {
      await callSheetAction('deleteRegistration', {
        rowNumber: registration.rowNumber,
        fullName: registration.fullName || '',
        birthDate: registration.birthDate || '',
        identityCode: registration.identityCode || ''
      });
      removePendingRegistrationLocally(registration);
      showNotification?.('Đã xóa dòng đăng ký khỏi Google Sheet.');
    } catch (error) {
      showNotification?.(`Chưa xóa được dòng đăng ký: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const approveRegistrations = async (registrations = []) => {
    const targets = registrations.length ? registrations : pendingRegistrations.filter(item => selectedRegistrationIds.has(item.tempId));
    if (!targets.length) {
      showNotification?.('Chưa chọn hồ sơ đăng ký nào.', 'error');
      return;
    }
    const blocked = targets.filter(item => item.duplicateReason || findRegistrationDuplicate(item));
    const validTargets = targets.filter(item => !(item.duplicateReason || findRegistrationDuplicate(item)));
    if (!validTargets.length) {
      showNotification?.('Các hồ sơ đã chọn đều có dấu hiệu trùng. Thầy kiểm tra dòng cảnh báo trước khi chuyển.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const validEntries = validTargets
        .map(registration => ({
          registration,
          student: normalizeStudentRecord(registrationToStudent(registration), currentSchoolYear)
        }))
        .filter(item => item.student.fullName && item.student.className)
        .sort((a, b) => compareClassThenName(a.student, b.student));
      const invalidCount = validTargets.length - validEntries.length;
      if (!validEntries.length) {
        showNotification?.('Ho so dang ky thieu ho ten hoac lop, chua the duyet vao database.', 'error');
        return;
      }
      const newStudents = validEntries.map(item => item.student);
      const codeMap = assignSequentialCodesByOrder([...yearStudents, ...newStudents], newStudents, existingCodes, currentSchoolYear);
      const codes = new Set(existingCodes);
      const approvedEntries = await Promise.all(validEntries.map(async ({ registration, student }) => {
        const accessCode = codeMap.get(student) || nextSequentialCode(student, codes, currentSchoolYear);
        const data = { ...student };
        ['id', 'tempId', 'duplicateReason', 'duplicateStudentName', 'duplicateAccessCode'].forEach(key => delete data[key]);
        codes.add(accessCode);
        await addDoc(studentsCollection, {
          ...data,
          accessCode,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: user?.uid || '',
          updatedBy: user?.uid || ''
        });
        return { registration, student: { ...data, accessCode } };
      }));
      const sheetErrors = [];
      await Promise.all(approvedEntries.map(async ({ registration, student }) => {
        if (!registration.rowNumber) return;
        try {
          await callSheetAction('markExistingRegistration', {
            rowNumber: registration.rowNumber,
            identityCode: student.identityCode || registration.identityCode || '',
            fullName: student.fullName || registration.fullName || '',
            birthDate: student.birthDate || registration.birthDate || '',
            note: `Da chuyen vao database. Ma hoc sinh: ${student.accessCode || ''}. PH/HS dung ma nay de bo sung/chinh sua ho so.`
          });
        } catch (error) {
          sheetErrors.push(`${student.fullName || registration.fullName || 'Hoc sinh'}: ${error.message}`);
        }
      }));
      setPendingRegistrations(prev => prev.filter(item => !approvedEntries.some(({ registration }) => safePlainValue(registration.tempId || registration.id) === safePlainValue(item.tempId || item.id))));
      setSelectedRegistrationIds(new Set());
      showNotification?.(`Đã duyệt ${newStudents.length} học sinh vào database và đánh dấu Đã có trên Sheet ${approvedEntries.length - sheetErrors.length}/${approvedEntries.length}.${blocked.length ? ` Bỏ qua ${blocked.length} hồ sơ có dấu hiệu trùng.` : ''}${invalidCount ? ` Bo qua ${invalidCount} ho so thieu ho ten hoac lop.` : ''}${sheetErrors.length ? ' Một vài dòng Sheet chưa cập nhật được, tải lại sẽ thấy cảnh báo trùng để xử lý.' : ''}`, sheetErrors.length ? 'error' : 'success');
      if (sheetErrors.length) console.warn('Lỗi đánh dấu Đã có trên Sheet:', sheetErrors);
    } catch (error) {
      showNotification?.(`Chưa duyệt được hồ sơ: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const approveProfileRequest = async (request) => {
    if (!request?.studentId) return;
    const currentStudent = resolveProfileRequestStudent(request);
    if (isReadOnlyStudentRecord(currentStudent)) {
      showNotification?.(readOnlyStudentMessage(currentStudent), 'error');
      return;
    }
    const cleanChanges = sanitizeStudentChanges(request.changes);
    if (!Object.keys(cleanChanges).length) {
      showNotification?.('Yeu cau nay khong co thong tin hop le de duyet.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', request.studentId), {
        ...cleanChanges,
        updatedAt: Date.now(),
        updatedBy: user?.uid || ''
      }, { merge: true });
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests', request.id));
      postAppsScript({ action: 'writeAuditLog', auditAction: 'duyet_ho_so_hoc_sinh', actor: user?.uid || 'Admin', details: { studentId: request.studentId, changes: cleanChanges } }).catch(() => undefined);
      hideProfileRequestFieldLocally(request.id);
      showNotification?.('Đã duyệt và cập nhật hồ sơ học sinh.');
    } catch (error) {
      showNotification?.(`Chưa duyệt được yêu cầu: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const rejectProfileRequest = async (request) => {
    if (!request?.id || !window.confirm('Từ chối yêu cầu sửa hồ sơ này?')) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests', request.id));
      postAppsScript({ action: 'writeAuditLog', auditAction: 'tu_choi_sua_ho_so', actor: user?.uid || 'Admin', details: { studentId: request.studentId || '', requestId: request.id } }).catch(() => undefined);
      hideProfileRequestFieldLocally(request.id);
      showNotification?.('Đã từ chối yêu cầu sửa hồ sơ.');
    } catch (error) {
      showNotification?.(`Chưa xóa được yêu cầu: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const editingProfileRequests = editing?.id ? (profileRequestsByStudent.get(editing.id) || []) : [];
  const utilityButtonClass = 'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 sm:gap-2 sm:rounded-lg sm:px-3 sm:py-2 sm:text-sm sm:font-normal';

  return (
    <div className="flex h-full min-h-0 flex-col bg-white/95 rounded-2xl border border-indigo-100 shadow-xl overflow-hidden">
      <div className="shrink-0 bg-gradient-to-r from-indigo-50 to-blue-50 p-2 sm:p-3 border-b border-indigo-100 flex flex-col gap-1.5 sm:gap-3">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="flex min-w-0 items-center justify-between gap-2 lg:flex-1 lg:pr-4">
          <h3 className="font-black text-indigo-950 text-sm sm:text-base uppercase flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-600" /> Học sinh {currentSchoolYear}
          </h3>
          {onBack && (
            <button type="button" onClick={onBack} title="Đóng database" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-600 text-white shadow-sm sm:hidden">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-nowrap items-center justify-start gap-1 overflow-x-auto pb-1 sm:flex-wrap sm:gap-2 lg:pb-0 lg:justify-end lg:shrink-0">
          {onBack && (
            <button type="button" onClick={onBack} title="Đóng database" className="hidden sm:flex sm:order-last shrink-0 w-10 h-10 bg-rose-600 text-white hover:bg-rose-700 rounded-full shadow-lg items-center justify-center transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
          {onOpenAttendance && (
            <button
              type="button"
              onClick={onOpenAttendance}
              className="hidden h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-100 bg-cyan-50 px-3 text-sm font-normal text-cyan-700 hover:bg-cyan-100 sm:flex"
            >
              <CalendarDays className="h-4 w-4" /> Điểm danh
            </button>
          )}
          {studentTab !== 'journey' && studentTab !== 'profileRequests' && (
            <button
              type="button"
              onClick={() => setShowColumns(prev => !prev)}
              className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal"
            >
              <Columns className="h-4 w-4" /> Cột
            </button>
          )}
          {studentTab !== 'journey' && studentTab !== 'profileRequests' && (
            <button
              type="button"
              onClick={() => {
                setExportFormat('');
                setExcelExportAction('');
                setSharedPdfLink('');
                setSharedSheetLink('');
                setShowExportChoice(true);
              }}
              className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-cyan-100 bg-cyan-50 px-2 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-100 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal"
            >
              <FileSpreadsheet className="h-4 w-4" /> Xuất
            </button>
          )}
          {studentTab === 'current' && (
            <button
              type="button"
              onClick={removeSelectedStudents}
              disabled={isSaving || selectedCount === 0}
              className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-rose-100 bg-rose-50 px-2 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-40 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal"
              title="Xóa các học sinh đang được tích chọn"
            >
              <Trash2 className="h-4 w-4" /> Xóa {selectedCount ? `(${selectedCount})` : ''}
            </button>
          )}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowUtilitiesMenu(prev => !prev)}
              className="flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal"
              aria-expanded={showUtilitiesMenu}
            >
              <FileText className="h-4 w-4 text-blue-600" />
              Tiện ích
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showUtilitiesMenu ? 'rotate-180' : ''}`} />
            </button>
            {showUtilitiesMenu && (
              <>
                <button type="button" className="fixed inset-0 z-[80] cursor-default bg-transparent" onClick={() => setShowUtilitiesMenu(false)} aria-label="Đóng tiện ích" />
                <div className="fixed left-3 right-3 top-[150px] z-[190] grid max-h-[calc(100dvh-165px)] grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:block sm:w-72 sm:max-h-none sm:overflow-hidden">
                  <button type="button" onClick={() => { setShowUtilitiesMenu(false); window.open(STUDENT_DATA_SHEET_URL, '_blank', 'noopener,noreferrer'); }} className={utilityButtonClass}>
                    <ExternalLink className="h-4 w-4 text-emerald-600" /> Mo du lieu Sheet
                  </button>
                  {studentTab === 'current' && (
                    <button type="button" onClick={() => { setShowUtilitiesMenu(false); syncAllStudentsToSheet(); }} disabled={isSaving || yearStudents.length === 0} className={utilityButtonClass}>
                      <RefreshCw className="h-4 w-4 text-teal-600" /> Cap nhat len Sheet
                    </button>
                  )}
                  {studentTab === 'current' && (
                    <button type="button" onClick={() => { setShowUtilitiesMenu(false); syncStudentsFromSheet(); }} disabled={isSaving || yearStudents.length === 0} className={utilityButtonClass}>
                      <RefreshCw className="h-4 w-4 text-blue-600" /> Cap nhat tu Sheet
                    </button>
                  )}
                  {studentTab === 'current' && (
                    <button type="button" onClick={() => { setShowUtilitiesMenu(false); syncPreviousYear(); }} disabled={isSaving || !previousSchoolYear} className={utilityButtonClass}>
                      <RefreshCw className="h-4 w-4 text-emerald-600" /> Dong bo nam truoc
                    </button>
                  )}
                  {studentTab === 'current' && (
                    <button type="button" onClick={() => { setShowUtilitiesMenu(false); setShowImport(prev => !prev); }} className={utilityButtonClass}>
                      <UploadCloud className="h-4 w-4 text-indigo-600" /> Nhap Sheet
                    </button>
                  )}
                  {studentTab === 'current' && (
                    <button type="button" onClick={() => { setShowUtilitiesMenu(false); setShowCodeChoiceModal(true); }} disabled={isSaving} className={utilityButtonClass}>
                      <KeyRound className="h-4 w-4 text-amber-600" /> Tao ma hoc sinh
                    </button>
                  )}
                  {studentTab === 'current' && (
                    <button type="button" onClick={() => { setShowUtilitiesMenu(false); normalizeCurrentYearStudentNames(); }} disabled={isSaving || yearStudents.length === 0} className={utilityButtonClass}>
                      <UserRound className="h-4 w-4 text-violet-600" /> Chuan hoa ten
                    </button>
                  )}
                  {studentTab === 'current' && (
                    <button type="button" onClick={() => { setShowUtilitiesMenu(false); createMissingInfoReport(); }} className={utilityButtonClass}>
                      <ClipboardCheck className="h-4 w-4 text-orange-600" /> Kiem tra thieu thong tin
                    </button>
                  )}
                  {studentTab === 'registrations' && (
                    <button type="button" onClick={() => { setShowUtilitiesMenu(false); loadPendingRegistrations(); }} disabled={isLoadingRegistrations} className={utilityButtonClass}>
                      <RefreshCw className="h-4 w-4 text-emerald-600" /> {isLoadingRegistrations ? 'Dang tai...' : 'Tai moi'}
                    </button>
                  )}
                  {studentTab === 'registrations' && (
                    <button type="button" onClick={() => { setShowUtilitiesMenu(false); approveRegistrations(); }} disabled={isSaving || selectedRegistrationIds.size === 0} className={utilityButtonClass}>
                      <CheckCircle2 className="h-4 w-4 text-indigo-600" /> Duyet chon ({selectedRegistrationIds.size})
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          {studentTab === 'current' && (
            <button type="button" onClick={openCreate} className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal">
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Thêm
            </button>
          )}
        </div>
        </div>
        {profileRequests.length > 0 && studentTab !== 'profileRequests' && (
          <div className="flex items-center">
            <div className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase text-rose-700">
              {profileRequests.length} yêu cầu sửa
            </div>
          </div>
        )}
      </div>

      {showClassStats && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
          <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-indigo-50 px-3 py-2.5">
              <div>
                <div className="text-xs font-black uppercase text-indigo-950">Thống kê học sinh theo lớp</div>
                <div className="text-[11px] font-bold text-indigo-700">
                  Tổng {classStats.reduce((sum, item) => sum + item.total, 0)} học sinh
                </div>
              </div>
              <button type="button" onClick={() => setShowClassStats(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm hover:bg-rose-600 hover:text-white" title="Đóng">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-auto p-3">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 uppercase">
                    <th className="border border-slate-300 px-2 py-1.5 text-left">Lớp</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-center">Tổng</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-center">Đang học</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-center">Bỏ học</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-center">Chưa mã HS</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-center">Chưa mã định danh</th>
                  </tr>
                </thead>
                <tbody>
                  {classStats.length ? classStats.map(item => (
                    <tr key={item.className} className="odd:bg-white even:bg-slate-50">
                      <td className="border border-slate-300 px-2 py-1.5 font-black text-slate-900">Lớp {item.className}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black text-indigo-700">{item.total}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black text-emerald-700">{item.active}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black text-rose-700">{item.dropped}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black text-amber-700">{item.noCode}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black text-orange-700">{item.noIdentityCode}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="border border-slate-300 px-3 py-8 text-center font-bold text-slate-400">Chưa có dữ liệu lớp để thống kê.</td>
                    </tr>
                  )}
                  {classStats.length > 0 && (
                    <tr className="bg-indigo-50 text-indigo-950">
                      <td className="border border-slate-300 px-2 py-1.5 font-black uppercase">Tổng</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black">{classStats.reduce((sum, item) => sum + item.total, 0)}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black">{classStats.reduce((sum, item) => sum + item.active, 0)}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black">{classStats.reduce((sum, item) => sum + item.dropped, 0)}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black">{classStats.reduce((sum, item) => sum + item.noCode, 0)}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-black">{classStats.reduce((sum, item) => sum + item.noIdentityCode, 0)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {studentTab === 'profileRequests' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 bg-white">
          {profileRequests.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-400 font-bold">
              Chưa có yêu cầu sửa hồ sơ nào.
            </div>
          ) : (
            <div className="space-y-3">
              {profileRequests.map(request => {
                const currentStudent = resolveProfileRequestStudent(request);
                return (
                  <div key={request.id} className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                      <div>
                        <div className="font-black text-slate-900">{request.studentName || currentStudent?.fullName || 'Học sinh'} <span className="text-xs text-slate-400">({request.accessCode || currentStudent?.accessCode || 'chưa có mã'})</span></div>
                        <div className="text-xs font-bold text-slate-500">Lớp {request.className || currentStudent?.className || '-'} - gửi lúc {request.createdAt ? new Date(request.createdAt).toLocaleString('vi-VN') : ''}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => approveProfileRequest(request)} disabled={isSaving || !currentStudent} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                          <CheckCircle2 className="w-4 h-4" /> Đồng ý hết
                        </button>
                        <button type="button" onClick={() => rejectProfileRequest(request)} disabled={isSaving} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 text-xs font-black uppercase flex items-center gap-1.5 disabled:opacity-50">
                          <X className="w-4 h-4" /> Từ chối hết
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {Object.entries(sanitizeStudentChanges(request.changes)).map(([key, value]) => {
                        const currentValue = safePlainValue(currentStudent?.[key]);
                        const nextValue = safePlainValue(value);
                        return (
                          <div key={key} className="rounded-xl bg-white border border-amber-100 p-3">
                            <div className="text-[10px] font-black uppercase text-slate-400 mb-2">{STUDENT_FIELD_LABELS[key] || key}</div>
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 sm:items-center">
                              <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 min-w-0">
                                <div className="text-[9px] font-black uppercase text-slate-400">Cũ</div>
                                <div className="text-xs font-bold text-slate-700 break-words">{currentValue || '(trống)'}</div>
                              </div>
                              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 min-w-0">
                                <div className="text-[9px] font-black uppercase text-emerald-500">Mới</div>
                                {String(key).toLowerCase().includes('url') ? (
                                  <a href={nextValue} target="_blank" rel="noreferrer" className="text-xs font-black text-blue-600 hover:underline">Mở file/ảnh mới</a>
                                ) : (
                                  <div className="text-xs font-black text-emerald-800 break-words">{nextValue || '(trống)'}</div>
                                )}
                              </div>
                              <div className="flex sm:flex-col gap-2">
                                <button type="button" onClick={() => approveProfileField(request, key)} disabled={isSaving} title="Duyệt dòng này" className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm disabled:opacity-50">
                                  <CheckCircle2 className="w-5 h-5" />
                                </button>
                                <button type="button" onClick={() => rejectProfileField(request, key)} disabled={isSaving} title="Từ chối dòng này" className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center disabled:opacity-50">
                                  <X className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : studentTab === 'journey' ? (
        <div className="flex min-h-0 flex-1 flex-col bg-white">
          <div className="shrink-0 p-2.5 sm:p-3 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-[1fr_160px_160px] gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên, mã học sinh, ngày sinh, lớp..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-400" />
            </div>
            <select value={journeyYearFilter} onChange={(e) => setJourneyYearFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black bg-white">
              <option value="">Tất cả năm học</option>
              {journeyYearOptions.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
            <select value={journeyClassFilter} onChange={(e) => setJourneyClassFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-black bg-white">
              <option value="all">Tat ca lop</option>
              {journeyClassOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500">
            Nhấn đúp vào một dòng để mở hồ sơ học sinh. Mỗi ô năm học ghi lớp, rèn luyện và học tập của năm đó.
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-xs min-w-[1120px]">
              <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                <tr className="text-slate-500 uppercase font-black">
                  <th className="sticky left-0 z-20 bg-white px-4 py-3 min-w-[300px]">Học sinh</th>
                  <th className="px-4 py-3 min-w-[130px]">Bắt đầu học</th>
                  {journeyYearOptions.map(year => (
                    <th key={year} className={`px-4 py-3 min-w-[190px] ${year === journeyYearFilter ? 'bg-blue-50 text-blue-700' : ''}`}>{year}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journeyRows.length === 0 ? (
                  <tr>
                    <td colSpan={journeyYearOptions.length + 2} className="px-4 py-10 text-center text-slate-400 font-bold">
                      Chưa có học sinh đúng bộ lọc quá trình học này.
                    </td>
                  </tr>
                ) : journeyRows.map(row => (
                  <tr key={row.key} onDoubleClick={() => openEdit(row.student)} className="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer">
                    <td className="sticky left-0 bg-white px-4 py-3 align-middle">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-14 rounded-xl bg-indigo-50 border border-indigo-100 overflow-hidden flex items-center justify-center shrink-0">
                          <DriveImage url={row.student.portraitUrl} alt={row.student.fullName || 'Học sinh'} className="w-full h-full object-contain" fallback={<UserRound className="w-5 h-5 text-indigo-300" />} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-slate-900 truncate">{row.student.fullName || 'Chưa có tên'}</div>
                          <div className="text-[11px] font-bold text-slate-500">Mã: {row.student.accessCode || '-'} · Sinh: {row.student.birthDate || '-'}</div>
                          <div className="text-[11px] font-bold text-blue-700">Đang xem: lớp {row.student.className || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle font-black text-slate-700 whitespace-nowrap">{row.entryYear || '-'}</td>
                    {journeyYearOptions.map(year => {
                      const record = row.byYear.get(year);
                      const cell = getJourneyYearCell(record || {});
                      const scorebookResult = record?.id ? journeyScorebookResults.get(record.id) : null;
                      const conductResult = cell.conduct || scorebookResult?.conduct || '';
                      const academicResult = cell.academic || scorebookResult?.academic || '';
                      const isDroppedRecord = record?.status === 'dropped';
                      return (
                        <td key={year} className={`px-4 py-3 align-top ${year === journeyYearFilter ? 'bg-blue-50/60' : ''}`}>
                          {record ? (
                            isDroppedRecord ? (
                              <div className="space-y-1">
                                <div className="inline-flex rounded-full bg-rose-50 border border-rose-100 px-2 py-1 font-black text-rose-700">Nghỉ</div>
                                <div className="text-[11px] font-bold text-slate-500">Lớp {cell.className || '-'}</div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="inline-flex rounded-full bg-white border border-slate-200 px-2 py-1 font-black text-slate-800">Lớp {cell.className || '-'}</div>
                                <div className="text-[11px] font-bold text-slate-600">Rèn luyện: <b className="text-slate-900">{conductResult || '-'}</b></div>
                                <div className="text-[11px] font-bold text-slate-600">Học tập: <b className="text-slate-900">{academicResult || '-'}</b></div>
                              </div>
                            )
                          ) : (
                            <span className="text-slate-300 font-bold">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 flex-col bg-white">
      {showExportChoice && (
        <div className="shrink-0 border-b border-cyan-100 bg-cyan-50/50 p-2 sm:p-3">
          <div className="flex flex-row items-start justify-between gap-2 sm:items-center">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-cyan-900 sm:text-xs">
                {exportFormat && (
                  <button type="button" onClick={() => {
                    if (exportFormat === 'excel' && excelExportAction) {
                      setExcelExportAction('');
                      setSharedSheetLink('');
                    } else {
                      setExportFormat('');
                      setExcelExportAction('');
                      setSharedPdfLink('');
                      setSharedSheetLink('');
                    }
                  }} className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-cyan-700 shadow-sm" aria-label="Quay lại">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                {exportFormat === 'excel' && excelExportAction === 'sheet' ? 'Tạo Google Sheet' : exportFormat === 'excel' && excelExportAction === 'download' ? 'Tải file Excel' : exportFormat === 'excel' ? 'Chọn cách xuất Excel' : exportFormat === 'pdf' ? 'Tạo PDF và lấy liên kết' : 'Chọn định dạng xuất'}
              </div>
              <p className="hidden text-[11px] font-bold text-cyan-700 sm:block">{exportFormat ? 'Chọn phạm vi dữ liệu cần xuất.' : 'Chọn Excel để tải file hoặc PDF để tạo liên kết chia sẻ.'}</p>
            </div>
            <button type="button" onClick={() => { setShowExportChoice(false); setExportFormat(''); setExcelExportAction(''); setSharedPdfLink(''); setSharedSheetLink(''); }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-100 bg-white text-slate-600 sm:h-auto sm:w-auto sm:rounded-xl sm:px-3 sm:py-2" aria-label="Đóng"><X className="h-3.5 w-3.5" /></button>
          </div>
          {!exportFormat && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
              <button type="button" onClick={() => setExportFormat('excel')} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-white p-2 text-emerald-700 hover:bg-emerald-50 sm:min-h-20 sm:rounded-xl">
                <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-[10px] font-black uppercase sm:text-xs">Excel (.xlsx)</span>
                <span className="text-[9px] font-bold text-slate-400">Tải file về máy</span>
              </button>
              <button type="button" onClick={() => setExportFormat('pdf')} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-blue-100 bg-white p-2 text-blue-700 hover:bg-blue-50 sm:min-h-20 sm:rounded-xl">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-[10px] font-black uppercase sm:text-xs">PDF</span>
                <span className="text-[9px] font-bold text-slate-400">Tạo liên kết chia sẻ</span>
              </button>
            </div>
          )}
          {exportFormat === 'excel' && !excelExportAction && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
              <button type="button" onClick={() => setExcelExportAction('download')} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-white p-2 text-emerald-700 hover:bg-emerald-50 sm:min-h-20 sm:rounded-xl">
                <Download className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-[10px] font-black uppercase sm:text-xs">Tải Excel</span>
                <span className="text-[9px] font-bold text-slate-400">Lưu file .xlsx về máy</span>
              </button>
              <button type="button" onClick={() => setExcelExportAction('sheet')} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-white p-2 text-emerald-700 hover:bg-emerald-50 sm:min-h-20 sm:rounded-xl">
                <Share2 className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-[10px] font-black uppercase sm:text-xs">Google Sheet</span>
                <span className="text-[9px] font-bold text-slate-400">Tạo liên kết chia sẻ</span>
              </button>
            </div>
          )}
          {exportFormat === 'excel' && excelExportAction === 'download' && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
              <button type="button" onClick={() => downloadExportList('current')} className="rounded-md bg-emerald-600 px-2 py-2.5 text-[9px] font-black uppercase text-white sm:rounded-lg sm:px-3 sm:text-[10px]">Dữ liệu đang xem</button>
              <button type="button" onClick={() => downloadExportList('all')} className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-2.5 text-[9px] font-black uppercase text-emerald-700 sm:rounded-lg sm:px-3 sm:text-[10px]">Đầy đủ tất cả cột</button>
            </div>
          )}
          {exportFormat === 'excel' && excelExportAction === 'sheet' && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
              <button type="button" onClick={() => shareGoogleSheetExportList('current')} disabled={isSharingSheet} className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-2.5 text-[9px] font-black uppercase text-white disabled:opacity-60 sm:rounded-lg sm:px-3 sm:text-[10px]">
                {isSharingSheet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Dữ liệu đang xem
              </button>
              <button type="button" onClick={() => shareGoogleSheetExportList('all')} disabled={isSharingSheet} className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-2.5 text-[9px] font-black uppercase text-emerald-700 disabled:opacity-60 sm:rounded-lg sm:px-3 sm:text-[10px]">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Đầy đủ tất cả cột
              </button>
            </div>
          )}
          {exportFormat === 'pdf' && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
              <button type="button" onClick={() => sharePdfExportList('current')} disabled={isSharingPdf} className="inline-flex items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-2.5 text-[9px] font-black uppercase text-white disabled:opacity-60 sm:rounded-lg sm:px-3 sm:text-[10px]">
                {isSharingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Dữ liệu đang xem
              </button>
              <button type="button" onClick={() => sharePdfExportList('all')} disabled={isSharingPdf} className="inline-flex items-center justify-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 py-2.5 text-[9px] font-black uppercase text-blue-700 disabled:opacity-60 sm:rounded-lg sm:px-3 sm:text-[10px]">
                <FileText className="h-3.5 w-3.5" /> Đầy đủ tất cả cột
              </button>
            </div>
          )}
        </div>
      )}

      {showExportChoice && exportFormat === 'pdf' && sharedPdfLink && (
        <div className="shrink-0 px-3 pb-3 -mt-2 border-b border-cyan-100 bg-cyan-50/50">
          <div className="rounded-xl border border-emerald-100 bg-white p-2 flex flex-col sm:flex-row gap-2">
            <input value={sharedPdfLink} readOnly className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700" />
            <button type="button" onClick={() => copyTextToClipboard(sharedPdfLink).then(copied => showNotification?.(copied ? 'Da copy link PDF.' : 'Chua copy duoc link PDF.', copied ? 'success' : 'error'))} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">Copy link</button>
            <button type="button" onClick={() => window.open(sharedPdfLink, '_blank', 'noopener,noreferrer')} className="px-3 py-2 rounded-lg bg-white border border-emerald-100 text-emerald-700 text-[10px] font-black uppercase">Mo link</button>
          </div>
        </div>
      )}

      {showExportChoice && exportFormat === 'excel' && excelExportAction === 'sheet' && sharedSheetLink && (
        <div className="shrink-0 px-3 pb-3 -mt-2 border-b border-emerald-100 bg-emerald-50/50">
          <div className="rounded-xl border border-emerald-100 bg-white p-2 flex flex-col sm:flex-row gap-2">
            <input value={sharedSheetLink} readOnly className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700" />
            <button type="button" onClick={() => copyTextToClipboard(sharedSheetLink).then(copied => showNotification?.(copied ? 'Đã copy liên kết Google Sheet.' : 'Chưa copy được liên kết.', copied ? 'success' : 'error'))} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase">Copy link</button>
            <button type="button" onClick={() => window.open(sharedSheetLink, '_blank', 'noopener,noreferrer')} className="px-3 py-2 rounded-lg bg-white border border-emerald-100 text-emerald-700 text-[10px] font-black uppercase">Mở Sheet</button>
          </div>
        </div>
      )}

      {missingInfoReport && (
        <div className="shrink-0 border-b border-orange-100 bg-orange-50/60 p-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-black uppercase text-orange-900">Nội dung thiếu thông tin để gửi nhóm</div>
                <div className="text-[11px] font-bold text-orange-700">Có thể sửa trực tiếp nội dung trước khi copy.</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => copyRichReportToClipboard(missingInfoReport).then(copied => showNotification?.(copied ? 'Đã copy nội dung, tên học sinh sẽ đậm nếu nơi dán hỗ trợ.' : 'Chưa copy được, thầy bôi đen trong khung để copy.', copied ? 'success' : 'error'))} className="rounded-xl bg-orange-600 px-3 py-2 text-[10px] font-black uppercase text-white">
                  Copy
                </button>
                <button type="button" onClick={() => setMissingInfoReport('')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-600">
                  Đóng
                </button>
              </div>
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              onInput={(event) => setMissingInfoReport(getEditableReportText(event.currentTarget))}
              className="max-h-[420px] min-h-[190px] overflow-y-auto rounded-xl border border-orange-100 bg-white p-3 text-sm leading-relaxed text-slate-800 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              dangerouslySetInnerHTML={{ __html: missingInfoReportToHtml(missingInfoReport) }}
            />
          </div>
        </div>
      )}

      {showColumns && (
        <div className="shrink-0 border-b border-slate-100 bg-white p-2 sm:p-4">
          <div className="mb-2 flex flex-col gap-1.5 sm:mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <div>
              <div className="text-[11px] font-black uppercase text-slate-900 sm:text-xs">Cột hiển thị</div>
              <p className="hidden text-[11px] font-bold text-slate-500 sm:block">Dữ liệu vẫn lưu đầy đủ, thầy cô chỉ chọn cột cần nhìn để bảng gọn hơn.</p>
            </div>
            <div className="flex flex-wrap gap-1 sm:gap-2">
              <button type="button" onClick={() => setVisibleColumns(COMPACT_VISIBLE_COLUMNS)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px] font-black uppercase text-slate-600 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]">Gọn</button>
              <button type="button" onClick={() => setVisibleColumns(IMAGE_ONLY_VISIBLE_COLUMNS)} className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-[9px] font-black uppercase text-emerald-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]">Chỉ ảnh</button>
              <button type="button" onClick={toggleAllVisibleColumns} className="rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1.5 text-[9px] font-black uppercase text-indigo-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]">Tất cả</button>
              <button type="button" onClick={() => setVisibleColumns(typeof window !== 'undefined' && window.innerWidth < 640 ? MOBILE_VISIBLE_COLUMNS : DEFAULT_VISIBLE_COLUMNS)} className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-[9px] font-black uppercase text-blue-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]">Mặc định</button>
              <button type="button" onClick={() => setShowColumns(false)} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-black uppercase text-slate-600 sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]"><X className="w-3.5 h-3.5" /> Đóng</button>
            </div>
          </div>
          <div className="grid max-h-[32dvh] grid-cols-2 gap-1 overflow-y-auto sm:max-h-none sm:grid-cols-3 sm:gap-2 lg:grid-cols-4 xl:grid-cols-6">
            {STUDENT_FIELDS.map(field => (
              <label key={field.key} className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[9px] font-black sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[11px] ${visibleColumns.includes(field.key) ? 'bg-indigo-50 border-indigo-100 text-indigo-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                <input type="checkbox" checked={visibleColumns.includes(field.key)} disabled={field.key === 'fullName'} onChange={() => updateVisibleColumns(field.key)} className="accent-indigo-600" />
                <span className="truncate">{field.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {studentTab === 'current' && showImport && (
        <div className="shrink-0 p-4 border-b border-indigo-100 bg-indigo-50/40 space-y-3">
          <div className="text-xs font-black text-indigo-900 uppercase">Nhập nhanh từ Google Sheet vào năm {currentSchoolYear}</div>
          <p className="text-[11px] text-indigo-700 font-bold">
            Mở Sheet, chọn hàng tiêu đề và các dòng học sinh, bấm Ctrl+C rồi dán vào khung dưới. App sẽ lưu vào Firebase và tự tạo mã học sinh.
          </p>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Dán dữ liệu copy từ Google Sheet vào đây..." className="w-full min-h-[130px] rounded-2xl border border-indigo-100 bg-white p-3 text-xs font-bold focus:outline-none focus:border-indigo-400" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowImport(false)} className="px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl text-xs font-black">Đóng</button>
            <button type="button" onClick={importFromPaste} disabled={isSaving || !importText.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black disabled:opacity-60">Nhập danh sách</button>
          </div>
        </div>
      )}

      <>
      <div className="shrink-0 grid grid-cols-2 gap-1.5 border-b border-slate-100 p-1.5 sm:grid-cols-[minmax(220px,1fr)_170px_160px_130px_42px_auto] sm:gap-2 sm:p-3">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 sm:left-3 sm:h-4 sm:w-4" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên, lớp, mã..." className="h-8 w-full rounded-lg border border-slate-200 pl-8 pr-2 text-xs font-bold focus:border-indigo-400 focus:outline-none sm:h-10 sm:rounded-xl sm:pl-9 sm:pr-3 sm:text-sm" />
        </div>
        <select value={quickIssueFilter} onChange={(e) => setQuickIssueFilter(e.target.value)} className="h-8 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold sm:h-10 sm:rounded-xl sm:px-3 sm:text-sm sm:font-black">
          {QUICK_ISSUE_FILTERS.map(item => (
            <option key={item.key} value={item.key}>{item.label} ({issueStats[item.key] ?? 0})</option>
          ))}
        </select>
        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowClassPicker(prev => !prev); setOpenFilterKey(null); }}
            className={`h-8 w-full rounded-lg border bg-white px-2 text-xs font-bold flex items-center justify-between gap-1 sm:h-10 sm:rounded-xl sm:px-3 sm:text-sm sm:font-black ${classFilter.length ? 'border-indigo-200 text-indigo-700 shadow-sm' : 'border-slate-200 text-slate-900'}`}
          >
            <span className="truncate">{classFilterLabel}</span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showClassPicker ? 'rotate-180' : ''}`} />
          </button>
          {showClassPicker && (
            <>
              {typeof document !== 'undefined' && createPortal((
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[1px] sm:hidden" onClick={() => setShowClassPicker(false)}>
                  <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <div className="text-sm font-black text-slate-900">Chọn lớp cần xem</div>
                        <div className="mt-0.5 text-[10px] font-bold text-slate-400">{classFilterLabel}</div>
                      </div>
                      <button type="button" onClick={() => setShowClassPicker(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label="Đóng">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <button type="button" onClick={() => setClassFilter([])} className="rounded-lg bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-600">Tất cả</button>
                      <button type="button" onClick={() => setClassFilter(classOptions)} className="rounded-lg bg-indigo-50 px-3 py-2 text-[10px] font-black uppercase text-indigo-700">Chọn hết</button>
                    </div>
                    <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                      {classOptions.length ? classOptions.map(className => (
                        <label key={className} className={`mb-1 flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-xs font-black ${selectedClassSet.has(className) ? 'border-indigo-100 bg-indigo-50 text-indigo-800' : 'border-slate-100 bg-white text-slate-600'}`}>
                          <input type="checkbox" checked={selectedClassSet.has(className)} onChange={() => toggleClassFilter(className)} className="accent-indigo-600" />
                          <span className="truncate">Lớp {className}</span>
                        </label>
                      )) : (
                        <div className="px-3 py-6 text-center text-xs font-bold text-slate-400">Chưa có lớp</div>
                      )}
                    </div>
                    <button type="button" onClick={() => setShowClassPicker(false)} className="mt-2 w-full shrink-0 rounded-xl bg-indigo-600 px-3 py-3 text-xs font-black uppercase text-white shadow-sm">
                      Xong
                    </button>
                  </div>
                </div>
              ), document.body)}
              <div className="absolute right-0 top-full z-40 mt-2 hidden w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl sm:block">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <button type="button" onClick={() => setClassFilter([])} className="rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] font-black uppercase text-slate-600">Tất cả</button>
                  <button type="button" onClick={() => setClassFilter(classOptions)} className="rounded-lg bg-indigo-50 px-2 py-1.5 text-[10px] font-black uppercase text-indigo-700">Chọn hết</button>
                </div>
                <div className="mt-2 max-h-64 overflow-y-auto pr-1">
                  {classOptions.length ? classOptions.map(className => (
                    <label key={className} className={`mb-1 flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black ${selectedClassSet.has(className) ? 'border-indigo-100 bg-indigo-50 text-indigo-800' : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={selectedClassSet.has(className)} onChange={() => toggleClassFilter(className)} className="accent-indigo-600" />
                      <span className="truncate">Lớp {className}</span>
                    </label>
                  )) : (
                    <div className="px-3 py-6 text-center text-xs font-bold text-slate-400">Chưa có lớp</div>
                  )}
                </div>
                <button type="button" onClick={() => setShowClassPicker(false)} className="mt-2 w-full rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black uppercase text-white shadow-sm">
                  Xong
                </button>
              </div>
            </>
          )}
        </div>
        {studentTab === 'current' ? (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="hidden h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black sm:block">
            <option value="all">Tất cả</option>
            <option value="active">Đang học</option>
            <option value="dropped">Bỏ học</option>
          </select>
        ) : (
          <div className="hidden h-10 items-center rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-sm font-black text-emerald-700 sm:flex">
            {duplicateRegistrationCount ? `${duplicateRegistrationCount} hồ sơ cần kiểm tra` : 'Chỉ hiện hồ sơ mới'}
          </div>
        )}
        <button type="button" onClick={filterCheckedStudents} title="Lọc học sinh đã chọn" className={`hidden h-10 w-10 rounded-xl border text-[11px] font-black uppercase items-center justify-center ${quickIssueFilter === 'selected' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200'} sm:flex`}>
          <Filter className="w-4 h-4" />
        </button>
        {(quickIssueFilter !== 'all' || classFilter.length || query || Object.values(columnFilters).some(Boolean)) && (
          <button
            type="button"
            onClick={() => {
              setQuickIssueFilter('all');
              setClassFilter([]);
              setColumnFilters({});
              setQuery('');
            }}
            className="col-span-2 h-8 rounded-lg border border-rose-100 bg-rose-50 px-2 text-[9px] font-black uppercase text-rose-600 sm:col-span-1 sm:h-10 sm:rounded-xl sm:px-3 sm:text-[10px]"
          >
            Xóa lọc
          </button>
        )}
      </div>

      {showFilters && (
        <div className="shrink-0 px-3 pb-3 border-b border-slate-100 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {visibleStudentFields.map(field => (
              <label key={field.key} className="flex flex-col gap-1">
                <span className="text-[9px] font-black uppercase text-slate-400">{field.label}</span>
                <select
                  value={columnFilters[field.key] || ''}
                  onChange={(e) => setColumnFilters(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-white focus:outline-none focus:border-indigo-400"
                >
                  <option value="">Tất cả</option>
                  {getFilterOptions(field.key).map(option => <option key={option} value={option}>{getColumnFilterOptionLabel(option)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setColumnFilters({})} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-black uppercase text-slate-600">Xóa filter</button>
            <button type="button" onClick={() => setShowFilters(false)} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-black uppercase text-slate-600">Đóng</button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className={`w-full text-left text-xs ${isImageOnlyView ? 'min-w-[980px] table-fixed' : 'min-w-[980px]'}`}>
          <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
            <tr className="text-slate-500 uppercase font-black">
              <th className={`px-4 py-3 ${isImageOnlyView ? 'w-[54px]' : 'w-12'}`}>
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} className="w-4 h-4 accent-indigo-600" title="Tích tất cả dòng đang lọc" />
              </th>
              {studentTab === 'current' && !isImageOnlyView && (
                <>
                  <th className="px-4 py-3 min-w-[120px]">Mã học</th>
                  <th className="px-4 py-3 min-w-[110px]">Tình trạng</th>
                </>
              )}
              {visibleStudentFields.map(field => (
                <th key={field.key} className={`px-4 py-3 whitespace-nowrap ${isImageOnlyView ? (field.key === 'fullName' ? 'w-[22%]' : 'w-[18.5%]') : (field.key === 'fullName' ? 'min-w-[240px]' : 'min-w-[140px]')}`}>
                  <div className={`relative inline-flex items-center gap-1 ${isImageOnlyView && field.key !== 'fullName' ? 'w-full justify-center' : ''}`}>
                    {field.key === 'fullName' ? (
                      <button type="button" onClick={() => setSortMode('fullName')} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 ${sortMode === 'fullName' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`} title="Sắp xếp theo tên gọi tiếng Việt">
                        {field.label} <ArrowDownAZ className="w-3.5 h-3.5" />
                      </button>
                    ) : field.key === 'className' ? (
                      <button type="button" onClick={() => setSortMode('className')} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 -ml-2 ${sortMode === 'className' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`} title="Sắp xếp theo khối/lớp rồi tên">
                        {field.label} <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                    ) : <span>{isImageOnlyView ? (IMAGE_PREVIEW_FIELD_LABELS[field.key] || field.label) : field.label}</span>}
                    <button type="button" onClick={() => setOpenFilterKey(prev => prev === field.key ? null : field.key)} className={`rounded-md p-0.5 ${columnFilters[field.key] ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-100'}`} title={`Lọc ${field.label}`}>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {openFilterKey === field.key && (
                      <div className="absolute left-0 top-full mt-1 z-30 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl normal-case">
                        <select
                          autoFocus
                          value={columnFilters[field.key] || ''}
                          onChange={(e) => { setColumnFilters(prev => ({ ...prev, [field.key]: e.target.value })); setOpenFilterKey(null); }}
                          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold bg-white text-slate-700"
                        >
                          <option value="">Tất cả</option>
                          {getFilterOptions(field.key).map(option => <option key={option} value={option}>{getColumnFilterOptionLabel(option)}</option>)}
                        </select>
                        {columnFilters[field.key] && (
                          <button type="button" onClick={() => { setColumnFilters(prev => ({ ...prev, [field.key]: '' })); setOpenFilterKey(null); }} className="mt-2 w-full rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] font-black uppercase text-slate-600">Xóa lọc cột này</button>
                        )}
                      </div>
                    )}
                  </div>
                </th>
              ))}
              {!isImageOnlyView && (studentTab === 'current' ? (
                <>
                  <th className="px-4 py-3 text-right min-w-[170px]">Thao tác</th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 min-w-[190px]">Kiểm tra</th>
                  <th className="px-4 py-3 text-right min-w-[280px]">Duyệt</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={visibleStudentFields.length + (isImageOnlyView ? 1 : (studentTab === 'current' ? 4 : 3))} className="px-4 py-10 text-center text-slate-400 font-bold">
                  {studentTab === 'current' ? 'Chưa có học sinh trong năm học hoặc bộ lọc này.' : 'Chưa có hồ sơ đăng ký mới cần duyệt trong bộ lọc này.'}
                </td>
              </tr>
            ) : filteredStudents.map(student => (
              <tr key={student.id} className={`border-b border-slate-50 ${studentTab === 'registrations' && student.duplicateReason ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-indigo-50/40'} ${student.status === 'dropped' ? 'bg-rose-50/40 opacity-75 line-through decoration-rose-400 decoration-2' : ''}`}>
                <td className="px-4 py-3 align-middle">
                  <input type="checkbox" disabled={studentTab === 'registrations' && Boolean(student.duplicateReason)} checked={activeSelectedIds.has(student.id)} onChange={() => toggleSelectStudent(student.id)} className="w-4 h-4 accent-indigo-600 disabled:opacity-40" />
                </td>
                {studentTab === 'current' && !isImageOnlyView && (
                  <>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(student.accessCode || ''); showNotification?.('Đã copy mã học sinh.'); }} className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg px-2 py-1 font-black whitespace-nowrap">
                        <KeyRound className="w-3.5 h-3.5" /> {student.accessCode || 'Chưa có'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-black whitespace-nowrap ${student.status === 'dropped' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                        {student.status === 'dropped' ? 'Bỏ học' : 'Đang học'}
                      </span>
                    </td>
                  </>
                )}
                {visibleStudentFields.map(field => (
                  <td key={field.key} className={`px-4 py-3 align-middle ${isImageOnlyView && DOCUMENT_FIELD_KEYS.has(field.key) ? 'text-center' : ''}`}>
                    <StudentCell student={student} field={field} isClassLeader={studentTab === 'current' && Boolean(student.isClassLeader)} imagePreview={isImageOnlyView && DOCUMENT_FIELD_KEYS.has(field.key)} compactName={isImageOnlyView} onOpenDocument={DOCUMENT_FIELD_KEYS.has(field.key) ? (row, fieldItem, index) => openStudentDocumentViewer(row, fieldItem, index) : null} onOpenEdit={studentTab === 'registrations' ? (row) => setEditing({ ...emptyStudent, ...row, id: '' }) : openEdit} />
                  </td>
                ))}
                {!isImageOnlyView && (studentTab === 'current' ? (
                  <>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {onSendTestResults && (
                          <button
                            type="button"
                            onClick={async () => {
                              setSendingTestResultStudentId(student.id);
                              try {
                                await onSendTestResults(student);
                              } catch (error) {
                                showNotification?.(`Chưa gửi được kết quả kiểm tra: ${error.message}`, 'error');
                              } finally {
                                setSendingTestResultStudentId('');
                              }
                            }}
                            disabled={sendingTestResultStudentId === student.id}
                            title="Gửi kết quả kiểm tra vào hộp thư học sinh"
                            className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            {sendingTestResultStudentId === student.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                          </button>
                        )}
                        <button type="button" onClick={() => openEdit(student)} title="Sửa thông tin" className="p-2 rounded-lg bg-white border border-slate-200 text-blue-600 hover:bg-blue-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => toggleDropout(student)} title={student.status === 'dropped' ? 'Đưa học lại' : 'Đánh dấu bỏ học'} className={`p-2 rounded-lg border ${student.status === 'dropped' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => removeStudent(student)} title="Xóa hồ sơ" className="p-2 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      {student.duplicateReason ? (
                        <div className="space-y-1">
                          <span className="inline-flex rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 font-black text-[10px] uppercase">{student.duplicateReason}</span>
                          <div className="text-[11px] text-amber-700 font-bold">{student.duplicateStudentName || 'Đã có trong database'} {student.duplicateAccessCode ? `- ${student.duplicateAccessCode}` : ''}</div>
                        </div>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 font-black text-[10px] uppercase">Hồ sơ mới</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => setEditing({ ...emptyStudent, ...student, id: '' })} title="Xem hồ sơ" className="p-2 rounded-lg bg-white border border-slate-200 text-blue-600 hover:bg-blue-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {student.duplicateReason ? (
                          <>
                            <button type="button" onClick={() => markExistingRegistration(student)} disabled={isSaving} className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 font-black uppercase text-[10px] disabled:opacity-40">
                              Cập nhật/Đã có
                            </button>
                            <button type="button" onClick={() => deletePendingRegistration(student)} disabled={isSaving} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 font-black uppercase text-[10px] disabled:opacity-40">
                              Xóa Sheet
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => approveRegistrations([student])} className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 font-black uppercase text-[10px]">
                            Chuyển sang
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <h4 className="font-black text-slate-900 uppercase">Hồ sơ học sinh</h4>
                <p className="text-xs text-slate-500 font-bold">Mã học sinh dùng để các em đăng nhập/làm bài ở các bước sau.</p>
              </div>
              <button type="button" onClick={closeEdit} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Mã học sinh</span>
                <div className="flex gap-2">
                  <input value={editing.accessCode || ''} onChange={(e) => setEditing(prev => ({ ...prev, accessCode: e.target.value.toUpperCase().replace(/\s/g, '') }))} className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-black focus:outline-none focus:border-indigo-400" />
                  <button type="button" onClick={() => setEditing(prev => ({ ...prev, accessCode: makeAccessCode(prev, existingCodes) }))} className="px-3 rounded-xl bg-amber-50 text-amber-700 border border-amber-100"><KeyRound className="w-4 h-4" /></button>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Tình trạng</span>
                <select value={editing.status || 'active'} onChange={(e) => setEditing(prev => ({ ...prev, status: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-black bg-white">
                  <option value="active">Đang học</option>
                  <option value="dropped">Bỏ học</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Cán sự lớp</span>
                <select value={editing.isClassLeader ? 'yes' : 'no'} onChange={(e) => setEditing(prev => ({ ...prev, isClassLeader: e.target.value === 'yes' }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-black bg-white">
                  <option value="no">Không</option>
                  <option value="yes">Có quyền điểm danh</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Năm học quản lý</span>
                <input value={editing.schoolYear || currentSchoolYear} onChange={(e) => setEditing(prev => ({ ...prev, schoolYear: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold" />
              </label>
              <div className="lg:col-span-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                Quy đổi đánh giá cũ: Trung bình = Đạt, Khá = Khá, Giỏi = Tốt.
              </div>
              {editingProfileRequests.length > 0 && (
                <div className="lg:col-span-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="text-xs font-black uppercase text-amber-900">Yêu cầu chỉnh sửa của học sinh</div>
                      <div className="text-[11px] font-bold text-amber-700">Duyệt từng dòng: bấm ✓ để nhận, bấm X để bỏ qua dòng đó.</div>
                    </div>
                    <button type="button" onClick={() => setStudentTab('profileRequests')} className="px-3 py-2 rounded-xl bg-white border border-amber-100 text-[10px] font-black uppercase text-amber-700">Mở tab duyệt nhanh</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {editingProfileRequests.flatMap(request => Object.entries(sanitizeStudentChanges(request.changes)).map(([key, value]) => {
                      const currentValue = safePlainValue(editing?.[key]);
                      const nextValue = safePlainValue(value);
                      return (
                        <div key={`${request.id}_${key}`} className="rounded-xl bg-white border border-amber-100 p-3">
                          <div className="text-[10px] font-black uppercase text-slate-400 mb-1">{STUDENT_FIELD_LABELS[key] || key}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 sm:items-center">
                            <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 min-w-0">
                              <div className="text-[9px] font-black uppercase text-slate-400">Đang có</div>
                              <div className="text-xs font-bold text-slate-700 break-words">{currentValue || '(trống)'}</div>
                            </div>
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 min-w-0">
                              <div className="text-[9px] font-black uppercase text-emerald-500">Học sinh gửi</div>
                              {String(key).toLowerCase().includes('url') ? (
                                <a href={nextValue} target="_blank" rel="noreferrer" className="text-xs font-black text-blue-600 hover:underline">Mở file/ảnh mới</a>
                              ) : (
                                <div className="text-xs font-black text-emerald-800 break-words">{nextValue || '(trống)'}</div>
                              )}
                            </div>
                            <div className="flex sm:flex-col gap-2">
                              <button type="button" onClick={() => approveProfileField(request, key)} disabled={isSaving} title="Duyệt dòng này" className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm disabled:opacity-50">
                                <CheckCircle2 className="w-5 h-5" />
                              </button>
                              <button type="button" onClick={() => rejectProfileField(request, key)} disabled={isSaving} title="Từ chối dòng này" className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center disabled:opacity-50">
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }))}
                  </div>
                </div>
              )}
              <datalist id="admin-province-options">
                {addressProvinceOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              <datalist id="admin-current-ward-options">
                {editCurrentWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              <datalist id="admin-household-ward-options">
                {editHouseholdWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              {adminEditFields.map(field => {
                const listId = field.key === 'province' || field.key === 'householdProvince'
                  ? 'admin-province-options'
                  : field.key === 'ward'
                    ? 'admin-current-ward-options'
                    : field.key === 'householdWard'
                      ? 'admin-household-ward-options'
                      : undefined;
                const placeholder = field.key === 'ward' || field.key === 'householdWard'
                  ? 'Chọn tỉnh trước, rồi gõ/chọn phường xã'
                  : field.key === 'province' || field.key === 'householdProvince'
                    ? 'Gõ hoặc chọn tỉnh/thành'
                    : '';
                return (
                  <label key={field.key} className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase text-slate-400">{field.label}{field.required ? ' *' : ''}</span>
                    {ACADEMIC_RESULT_FIELD_KEYS.has(field.key) ? (
                      <select value={editing[field.key] || ''} onChange={(e) => updateEditingField(field.key, e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-black bg-white focus:outline-none focus:border-indigo-400">
                        {ACADEMIC_RESULT_OPTIONS.map(option => <option key={option || '-'} value={option}>{option || '-'}</option>)}
                      </select>
                    ) : (
                      <input value={editing[field.key] || ''} list={listId} placeholder={placeholder} onChange={(e) => updateEditingField(field.key, e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none focus:border-indigo-400" />
                    )}
                  </label>
                );
              })}
              <div className="lg:col-span-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-700 mb-3 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Ảnh và giấy tờ học sinh</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {STUDENT_DOCUMENTS.map(docItem => (
                    <DocumentManager
                      key={docItem.key}
                      docItem={docItem}
                      value={editing[docItem.key]}
                      uploading={uploadingDocumentKey === docItem.key}
                      onUpload={(files) => uploadEditingDocumentFiles(docItem, files)}
                      onRemove={(index) => removeEditingDocumentUrl(docItem.key, index)}
                      onOpen={(index) => openDocumentViewer(docItem, index)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t bg-slate-50 flex flex-col sm:flex-row justify-end gap-2">
              <button type="button" onClick={closeEdit} className="px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-black">Hủy</button>
              <button type="button" onClick={saveStudent} disabled={isSaving || Boolean(uploadingDocumentKey)} className="px-5 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 disabled:opacity-60"><Save className="w-4 h-4" /> Lưu hồ sơ</button>
            </div>
          </div>
        </div>
      )}
      {documentViewer && (
        <DocumentViewerModal
          viewer={documentViewer}
          onClose={() => setDocumentViewer(null)}
          onSelect={(index) => setDocumentViewer(prev => prev ? ({ ...prev, index }) : prev)}
          onPrevious={() => setDocumentViewer(prev => prev ? ({ ...prev, index: Math.max(0, prev.index - 1) }) : prev)}
          onNext={() => setDocumentViewer(prev => prev ? ({ ...prev, index: Math.min(prev.urls.length - 1, prev.index + 1) }) : prev)}
        />
      )}
      {showCodeChoiceModal && (
        <div className="fixed inset-0 z-[95] bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div><h4 className="font-black text-slate-900 uppercase">Tạo mã học sinh</h4><p className="text-xs text-slate-500 font-bold">Chọn cách tạo mã cho năm học hiện tại.</p></div>
              <button type="button" onClick={() => setShowCodeChoiceModal(false)} className="p-2 rounded-xl bg-slate-50 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button type="button" onClick={() => { setShowCodeChoiceModal(false); generateMissingCodes(); }} className="text-left p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 font-black">
                Tạo mã mới cho học sinh chưa có mã
                <div className="text-xs font-bold text-amber-700/70 mt-1">Giữ nguyên mã cũ, chỉ bổ sung cho hồ sơ trống.</div>
              </button>
              <button type="button" onClick={() => { setShowCodeChoiceModal(false); regenerateAllCodes(); }} className="text-left p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800 font-black">
                Tạo lại mã cho tất cả
                <div className="text-xs font-bold text-rose-700/70 mt-1">Ghi đè toàn bộ mã của năm học hiện tại.</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentCell({ student, field, onOpenEdit, onOpenDocument, isClassLeader = false, imagePreview = false, compactName = false }) {
  const value = field.key === 'birthDate' ? formatDisplayDate(safePlainValue(student[field.key])) : safePlainValue(student[field.key]);
  const fullName = safePlainValue(student.fullName);
  const schoolYear = safePlainValue(student.schoolYear);

  if (field.key === 'fullName') {
    if (compactName) {
      return (
        <div className="min-w-[220px] cursor-pointer rounded-xl -m-1 p-2 hover:bg-indigo-50" onDoubleClick={() => onOpenEdit?.(student)} title="Nhấn đúp để sửa hồ sơ">
          <div className="font-black text-slate-800 truncate flex items-center gap-1.5">
            <span className="truncate">{fullName || '(Chưa có tên)'}</span>
            {isClassLeader && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-600 text-xs shadow-sm flex-shrink-0" title="Cán sự lớp">★</span>}
          </div>
          <div className="text-[11px] text-slate-500 font-bold">{schoolYear}</div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 min-w-[220px] cursor-pointer rounded-xl -m-1 p-1 hover:bg-indigo-50" onDoubleClick={() => onOpenEdit?.(student)} title="Nhấn đúp để sửa hồ sơ">
        <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 overflow-hidden flex items-center justify-center flex-shrink-0">
          <DriveImage url={student.portraitUrl} alt={fullName || 'Học sinh'} className="w-full h-full object-contain" fallback={<UserRound className="w-5 h-5 text-indigo-300" />} />
        </div>
        <div className="min-w-0">
          <div className="font-black text-slate-800 truncate flex items-center gap-1.5">
            <span className="truncate">{fullName || '(Chưa có tên)'}</span>
            {isClassLeader && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-600 text-xs shadow-sm flex-shrink-0" title="Cán sự lớp">★</span>}
          </div>
          <div className="text-[11px] text-slate-500 font-bold">{schoolYear}</div>
        </div>
      </div>
    );
  }

  if (imagePreview) {
    const isPortraitPreview = field.key === 'portraitUrl';
    const previewSize = isPortraitPreview ? 'w-[84px] h-[104px]' : 'w-[128px] h-[92px]';
    const previewFit = 'object-contain';
    return value ? (
      <button type="button" onClick={() => onOpenDocument?.(student, field, 0)} className={`mx-auto flex items-center justify-center ${previewSize} rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm`}>
        <DriveImage url={value} alt={fullName || 'Ảnh học sinh'} className={`w-full h-full ${previewFit}`} fallback={<UserRound className="w-8 h-8 text-slate-300" />} />
      </button>
    ) : (
      <div className={`mx-auto flex items-center justify-center ${previewSize} rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-300`}>
        <UserRound className="w-8 h-8" />
      </div>
    );
  }

  if (field.type === 'link') {
    const urls = splitDocumentUrls(value);
    const hasFile = urls.length > 0;
    const isPortraitPreview = field.key === 'portraitUrl';
    const previewSize = isPortraitPreview ? 'w-12 h-14' : 'w-16 h-12';
    return hasFile ? (
      <button type="button" onClick={() => onOpenDocument?.(student, field, 0)} className={`relative flex items-center justify-center ${previewSize} rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm`}>
        <DriveImage url={urls[0]} alt={fullName || field.label || 'Ảnh học sinh'} className="w-full h-full object-contain" fallback={<ImageIcon className="w-5 h-5 text-slate-300" />} />
        {urls.length > 1 && (
          <span className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[8px] font-black text-white">+{urls.length - 1}</span>
        )}
      </button>
    ) : (
      <span className="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase text-rose-600">
        Trống
      </span>
    );
  }

  return <span className="font-bold text-slate-700 whitespace-nowrap">{value || '-'}</span>;
}

const DriveImage = React.memo(function DriveImage({ url, alt, className, fallback }) {
  const [fallbackMode, setFallbackMode] = useState(false);
  const mainUrl = firstDocumentUrl(safePlainValue(url));
  const embedUrl = getDriveEmbedUrl(mainUrl);
  const imageUrl = getPreviewImageUrl(mainUrl);

  if (!mainUrl) return fallback || null;
  if (fallbackMode && embedUrl) {
    return <iframe title={alt} src={embedUrl} className={`border-0 bg-white pointer-events-none ${className || ''}`} loading="lazy" />;
  }
  if (fallbackMode) return fallback || null;
  return <img src={imageUrl} alt={alt} className={className} onError={() => setFallbackMode(true)} loading="lazy" decoding="async" fetchPriority="low" />;
});

function DocumentManager({ docItem, value, uploading, onUpload, onRemove, onOpen }) {
  const fileUrls = splitDocumentUrls(safePlainValue(value));
  const inputId = `admin-doc-upload-${docItem.key}`;
  const [activeIndex, setActiveIndex] = useState(0);
  const activeUrl = fileUrls[activeIndex] || '';
  const isPdf = /\.pdf(\?|$)/i.test(activeUrl);

  useEffect(() => {
    if (activeIndex >= fileUrls.length) {
      setActiveIndex(Math.max(0, fileUrls.length - 1));
    }
  }, [activeIndex, fileUrls.length]);

  const goToPrevious = () => setActiveIndex(index => Math.max(0, index - 1));
  const goToNext = () => setActiveIndex(index => Math.min(fileUrls.length - 1, index + 1));

  return (
    <div className="rounded-2xl border border-white bg-white p-2 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-black uppercase text-slate-500">{docItem.label}</div>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-black uppercase text-slate-500">{fileUrls.length || 0} file</span>
      </div>
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-2">
        <div className="relative">
          {activeUrl ? (
            <button type="button" onClick={() => onOpen?.(activeIndex)} className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-100 bg-white">
              {isPdf ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-[11px] font-black text-rose-600">
                  <FileSpreadsheet className="h-6 w-6" />
                  PDF
                </div>
              ) : (
                <img src={getPreviewImageUrl(activeUrl)} alt={`${docItem.label} ${activeIndex + 1}`} className="h-full w-full object-contain" loading="lazy" decoding="async" />
              )}
            </button>
          ) : (
            <div className="aspect-[4/3] rounded-lg bg-white border border-dashed border-slate-200 flex items-center justify-center text-center px-3 text-[11px] font-bold text-slate-400">Chưa có file</div>
          )}
          {fileUrls.length > 1 && (
            <>
              <button type="button" onClick={goToPrevious} disabled={activeIndex <= 0} className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md disabled:opacity-30" title="File trước">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={goToNext} disabled={activeIndex >= fileUrls.length - 1} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md disabled:opacity-30" title="File sau">
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/70 px-2 py-1 text-[10px] font-black text-white">
                {activeIndex + 1}/{fileUrls.length}
              </div>
            </>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label htmlFor={inputId} className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-[10px] font-black uppercase ${uploading ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {uploading ? 'Đang tải...' : 'Thay file'}
          </label>
          <button type="button" onClick={() => onRemove?.(activeIndex)} disabled={!activeUrl || uploading} className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-black uppercase text-rose-600 disabled:cursor-not-allowed disabled:opacity-40" title="Xóa file đang xem">
            <Trash2 className="h-4 w-4" />
            Xóa
          </button>
        </div>
      </div>
      <input
        id={inputId}
        type="file"
        accept={docItem.accept}
        multiple={docItem.multiple}
        disabled={uploading}
        className="hidden"
        onChange={(event) => {
          onUpload?.(event.target.files);
          event.target.value = null;
        }}
      />
    </div>
  );
}

function DocumentViewerModal({ viewer, onClose, onSelect, onPrevious, onNext }) {
  const urls = viewer.urls || [];
  const index = viewer.index || 0;
  const currentUrl = urls[index] || '';
  const embedUrl = getDriveEmbedUrl(currentUrl);
  const isPdf = /\.pdf(\?|$)/i.test(currentUrl);

  return (
    <div className="fixed inset-0 z-[140] bg-slate-950/80 p-2 sm:p-4 backdrop-blur-sm">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-black uppercase text-slate-900">{viewer.title}</div>
            <div className="text-[11px] font-bold text-slate-500">File {Math.min(index + 1, urls.length)}/{urls.length}</div>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm" title="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 bg-slate-900">
          {urls.length > 1 && (
            <>
              <button type="button" onClick={onPrevious} disabled={index <= 0} className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-lg disabled:opacity-30">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" onClick={onNext} disabled={index >= urls.length - 1} className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-lg disabled:opacity-30">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          {currentUrl ? (
            isPdf ? (
              <iframe title={viewer.title} src={embedUrl || currentUrl} className="h-full w-full border-0 bg-white" />
            ) : (
              <div className="flex h-full w-full items-center justify-center overflow-auto bg-slate-950 p-2">
                <img src={getPreviewImageUrl(currentUrl)} alt={`${viewer.title} ${index + 1}`} className="max-h-full max-w-full object-contain" />
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-bold text-white">Không có file để xem.</div>
          )}
        </div>
        {urls.length > 1 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-slate-100 bg-white p-2">
            {urls.map((url, itemIndex) => (
              <button key={`${url}-${itemIndex}`} type="button" onClick={() => onSelect(itemIndex)} className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-50 ${itemIndex === index ? 'border-indigo-500' : 'border-transparent'}`}>
                {/\.pdf(\?|$)/i.test(url) ? (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-black text-rose-600">PDF {itemIndex + 1}</div>
                ) : (
                  <img src={getPreviewImageUrl(url)} alt={`${viewer.title} ${itemIndex + 1}`} className="h-full w-full object-contain" loading="lazy" decoding="async" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
