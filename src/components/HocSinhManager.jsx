import { parseScoreNumber, calculateSemesterAverage, calculateYearAverage, academicSummary } from '../utils/scorebookCalculations';
import { saveStudentRecord, deleteStudentRecord, retryStudentSync, retryPendingStudentSync } from '../services/studentMutations';
import { processRecords } from '../utils/bulkOperations';
import { assertStudentSchoolYear, registrationSchoolYear } from '../utils/schoolYearText';
import { approveProfileRequestGroups, groupProfileRequests } from '../utils/profileRequestBatch';
import { stableRecordId } from '../utils/idempotency';
import { requestJsonp } from '../services/jsonpClient';
import { fetchPendingRegistrations } from '../services/pendingRegistrations';
import { REGISTRATION_WEB_APP_URL } from '../config/registration';
import { findPromotionTarget, promotionSourceVersions } from '../utils/promotionTargets';
import { provinceFilterKey, provinceFilterLabel, provinceOptionLabel } from '../utils/provinceLabels';
import { studentRowView } from '../utils/studentScoreKeys';
import { studentAcademicContexts, studentCenterAcademicResults, scorebookYearSummary } from '../utils/studentAcademicResults';
import { isGraduatedStudent, mergeStudentClassHistory, THCS_COMPLETED_CLASS } from '../utils/studentCompletion';
import { resolveScorebookDocument } from '../utils/scorebookArchive';
import { buildStudentYearReconciliation, reconciledStudentRecord, restoreClassesFromPriorRoster, sheetClassConflict } from '../utils/studentYearReconciliation';
import StudentYearReconciliation from './StudentYearReconciliation';
import StudentSheetImportStatus from './StudentSheetImportStatus';
import StudentSheetReconciliation from './StudentSheetReconciliation';
import { buildSheetReconciliation, sheetRecordForYear, studentDuplicateGroups } from '../utils/studentSheetReconciliation';
import { sameData } from '../utils/dataEquality';
import { sanitizeHtml } from '../utils/safeHtml';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, deleteDoc, doc, getDocsFromServer, onSnapshot, query as firestoreQuery, setDoc, where } from 'firebase/firestore';
import {
  Users,
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
import { compareSchoolRosterStudents, getSchoolName, getStudentEntryGrade, getStudentSchoolCode, normalizeSchoolCode, normalizeSchoolYearKey, promoteSchoolClassName, SCHOOL_OPTIONS } from '../utils/schoolClasses';
import { findDropoutContinuation } from '../utils/studentJourney';
import scorebookTemplate from '../data/scorebookTemplate.json';
import StudentProfileSections from './StudentProfileSections';
import StudentProfileHistory from './StudentProfileHistory';
import StudentFilterDropdown from './StudentFilterDropdown';
import StudentUtilitiesMenu from './StudentUtilitiesMenu';
import { belongsToEducationLevel, educationLabel } from '../utils/educationLevels';
import { buildStudentProfileHistory, profileSchoolYear } from '../utils/studentProfileHistory';
import ProfileChangeTable from './ProfileChangeTable';
import { STUDENT_PROFILE_SECTIONS, studentProfileSection } from '../utils/studentProfileLayout';

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
  { key: 'schoolCode', label: 'Cơ sở' },
  { key: 'classSuffix', label: 'Ký hiệu lớp' },
  { key: 'entryGrade', label: 'Khối nhập học' },
  { key: 'grade', label: 'Khối hiện tại' },
  { key: 'className', label: 'Lớp hiện tại', required: true },
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
  'schoolName',
  'schoolCode',
  'classSuffix',
  'classHistory',
  'entryGrade',
  'grade',
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

const STUDENT_LEFT_ALIGNED_FIELDS = new Set([
  'fullName', 'birthPlaceName', 'fatherName', 'motherName',
  'birthProvince', 'birthRegistrationProvince', 'hometownProvince', 'province', 'householdProvince'
]);
const STUDENT_COLUMN_WIDTHS = {
  fullName: 200,
  birthDate: 94,
  gender: 68,
  birthProvince: 152,
  birthDistrict: 136,
  birthWard: 144,
  birthPlaceName: 176,
  birthRegistrationProvince: 152,
  birthRegistrationDistrict: 144,
  birthRegistrationWard: 144,
  hometownProvince: 152,
  hometownDistrict: 136,
  hometownWard: 144,
  identityCode: 110,
  phone: 102,
  schoolCode: 192,
  classSuffix: 76,
  entryGrade: 88,
  grade: 80,
  className: 108,
  enrollmentYear: 96,
  address: 192,
  ward: 144,
  province: 152,
  householdAddress: 192,
  householdWard: 144,
  householdProvince: 152,
  fatherName: 176,
  fatherBirthYear: 84,
  fatherJob: 128,
  fatherPhone: 102,
  motherName: 176,
  motherBirthYear: 84,
  motherJob: 128,
  motherPhone: 102,
  temporaryStatus: 120,
  transport: 68
};

const studentColumnWidth = field => STUDENT_COLUMN_WIDTHS[field.key]
  || (field.type === 'link' ? 104 : ACADEMIC_RESULT_FIELD_KEYS.has(field.key) ? 88 : 128);

const DEFAULT_VISIBLE_COLUMNS = [
  'fullName',
  'enrollmentYear',
  'birthDate',
  'gender',
  'birthProvince',
  'identityCode',
  'phone',
  'entryGrade',
  'grade',
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
  'entryGrade',
  'grade',
  'className',
  'enrollmentYear',
  'transcriptUrl'
];

const COMPACT_VISIBLE_COLUMNS = [
  'fullName',
  'enrollmentYear',
  'birthDate',
  'gender',
  'entryGrade',
  'grade',
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
  'khoi': 'entryGrade',
  'khối': 'entryGrade',
  'khoi nhap hoc': 'entryGrade',
  'khối nhập học': 'entryGrade',
  'khoi hoc': 'entryGrade',
  'khối học': 'entryGrade',
  'khoi hien tai': 'grade',
  'khối hiện tại': 'grade',
  'lop': 'className',
  'lớp': 'className',
  'lop hoc': 'className',
  'lớp học': 'className',
  'lop hien tai': 'className',
  'lớp hiện tại': 'className',
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
  schoolName: '',
  schoolCode: '',
  classSuffix: '',
  classHistory: {},
  dropoutPreviousClassName: '',
  dropoutYear: '',
  entryGrade: '',
  grade: '',
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

const registrationToStudentData = (registration = {}, currentSchoolYear = '') => {
  const isDropped = String(registration.status || '').toLowerCase() === 'dropped' || Boolean(pickText(registration.dropoutYear));
  return ({
  ...emptyStudent,
  fullName: formatStudentFullName(pickText(registration.fullName, registration.hoVaTen)),
  birthDate: formatDisplayDate(pickText(registration.birthDate, registration.ngaySinh)),
  gender: pickText(registration.gender, registration.gioiTinh),
  accessCode: pickText(registration.accessCode, registration.maHocSinh).toUpperCase().replace(/\s/g, ''),
  identityCode: pickText(registration.identityCode, registration.maDinhDanh).replace(/^'/, ''),
  phone: pickText(registration.phone, registration.soDienThoai).replace(/^'/, ''),
  schoolName: pickText(registration.schoolName, registration.coSoDangKy, registration.school),
  schoolCode: pickText(registration.schoolCode, registration.maCoSo, registration.schoolKey, registration.coSoDangKy),
  classSuffix: pickText(registration.classSuffix, registration.hauToLop),
  classHistory: registration.classHistory && typeof registration.classHistory === 'object' ? registration.classHistory : {},
  graduationYear: pickText(registration.graduationYear),
  completionStatus: pickText(registration.completionStatus),
  completionSchoolYear: pickText(registration.completionSchoolYear),
  dropoutYear: pickText(registration.dropoutYear),
  entryGrade: pickText(registration.entryGrade, registration.enrollmentGrade, registration.admissionGrade,
    getGradeFromClass(registration.className || registration.lopHoc), registration.grade, registration.khoi),
  grade: isDropped ? '' : pickText(registration.currentGrade, registration.khoiHienTai),
  className: isDropped ? '' : pickText(registration.currentClassName, registration.lopHienTai, registration.current_class_name, registration.className, registration.lopHoc),
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
  status: isDropped ? 'dropped' : isGraduatedStudent(registration) ? 'completed' : 'active',
  schoolYear: registrationSchoolYear(registration, currentSchoolYear)
  });
};

const normalizeStudentRecord = (student = {}, fallbackSchoolYear = '') => {
  const normalized = { ...student };
  Object.keys(emptyStudent).forEach(key => {
    if (key === 'isClassLeader') {
      normalized.isClassLeader = Boolean(student.isClassLeader);
      return;
    }
    if (key === 'classHistory') {
      normalized.classHistory = student.classHistory && typeof student.classHistory === 'object' && !Array.isArray(student.classHistory)
        ? { ...student.classHistory }
        : {};
      return;
    }
    normalized[key] = safePlainValue(student[key] ?? emptyStudent[key]);
  });
  normalized.id = safePlainValue(student.id);
  normalized.previousStudentId = safePlainValue(student.previousStudentId);
  normalized.schoolYear = safePlainValue(student.schoolYear || fallbackSchoolYear);
  normalized.schoolCode = getStudentSchoolCode({ ...student, ...normalized });
  if (normalized.schoolCode !== 'UNKNOWN' || normalizeSchoolCode(student.schoolCode) === 'UNKNOWN') {
    normalized.schoolName = getSchoolName(normalized.schoolCode);
  }
  normalized.fullName = formatStudentFullName(normalized.fullName);
  normalized.birthDate = formatDisplayDate(normalized.birthDate);
  normalized.identityCode = normalized.identityCode.replace(/^'/, '');
  normalized.phone = normalized.phone.replace(/^'/, '');
  normalized.fatherPhone = normalized.fatherPhone.replace(/^'/, '');
  normalized.motherPhone = normalized.motherPhone.replace(/^'/, '');
  normalized.accessCode = normalized.accessCode.replace(/\s+/g, '').toUpperCase();
  normalized.entryGrade = getStudentEntryGrade({
    ...student,
    entryGrade: student.entryGrade || normalized.entryGrade,
    schoolYear: normalized.schoolYear,
    className: normalized.className,
    enrollmentYear: normalized.enrollmentYear
  }, fallbackSchoolYear);
  normalized.status = normalized.status === 'dropped' ? 'dropped' : isGraduatedStudent(normalized) ? 'completed' : 'active';
  if (normalized.status === 'dropped') {
    normalized.dropoutPreviousClassName ||= normalized.className || Object.entries(normalized.classHistory)
      .find(([year]) => normalizeSchoolYearKey(year) === normalizeSchoolYearKey(normalized.schoolYear))?.[1] || '';
    normalized.className = '';
    Object.keys(normalized.classHistory).forEach(year => {
      if (normalizeSchoolYearKey(year) === normalizeSchoolYearKey(normalized.schoolYear)) delete normalized.classHistory[year];
    });
  }
  normalized.grade = ['completed', 'dropped'].includes(normalized.status) ? '' : getGradeFromClass(normalized.className) || getGradeFromClass(normalized.grade);
  return normalized;
};

const hasGrade9CompletionResult = (student = {}) => (
  Boolean(student) && Boolean(String(student.hocLucLop9 || '').trim() || String(student.hanhKiemLop9 || '').trim())
);

const isReadOnlyStudentRecord = (student = {}) => (
  Boolean(student) && (
    String(student.status || '').toLowerCase() === 'dropped' || isGraduatedStudent(student) || hasGrade9CompletionResult(student)
  )
);

const readOnlyStudentMessage = (student = {}) => (
  student?.status === 'dropped'
    ? 'Học sinh đã bỏ học nên hồ sơ chỉ xem, không duyệt chỉnh sửa nữa.'
    : isGraduatedStudent(student) ? 'Học sinh đã tốt nghiệp THCS nên hồ sơ chỉ xem.'
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
  const entryGrade = Number(getStudentEntryGrade(student, schoolYear))
    || (currentGrade ? Math.max(1, currentGrade - yearsPassed) : 0);
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



const getPreviousSchoolYear = (schoolYear = '') => {
  const years = String(schoolYear || '').match(/\d{4}/g);
  if (!years || years.length < 2) return '';
  return `${Number(years[0]) - 1}-${Number(years[1]) - 1}`;
};

const getNextSchoolYear = (schoolYear = '') => {
  const years = String(schoolYear || '').match(/\d{4}/g);
  if (!years || years.length < 2) return '';
  return `${Number(years[0]) + 1}-${Number(years[1]) + 1}`;
};

const getStudentIdentity = (student = {}) => (
  (/^\d{12}$/.test(String(student.identityCode || '').replace(/^'/, '').trim()) ? String(student.identityCode || '').replace(/^'/, '').trim() : '')
  || student.previousStudentId
  || `${normalizeSearch(student.fullName)}_${String(student.birthDate || '').trim()}`
);

const getJourneyResult = (student = {}, prefix = '', grade = getGradeFromClass(student.className)) => {
  const gradeValue = grade ? safePlainValue(student[`${prefix}Lop${grade}`]) : '';
  return gradeValue || safePlainValue(student[prefix]) || '';
};

const getJourneyYearCell = (student = {}, historyRecords = []) => {
  const grade = getGradeFromClass(student.className);
  const getYearResult = prefix => {
    const currentResult = getJourneyResult(student, prefix, grade);
    if (currentResult || !grade) return currentResult;
    const field = `${prefix}Lop${grade}`;
    return [...historyRecords].reverse()
      .map(record => safePlainValue(record?.[field]))
      .find(Boolean) || '';
  };
  return {
    className: safePlainValue(student.className),
    conduct: getYearResult('hanhKiem'),
    academic: getYearResult('hocLuc')
  };
};

const isJourneyRowDropped = (row = {}, yearFilter = '') => {
  const statusRecord = yearFilter
    ? row.byYear?.get(yearFilter)
    : row.records?.[row.records.length - 1];
  return statusRecord?.status === 'dropped';
};

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

const getJourneySemesterTermAverage = (editsMap, semester, pageIndex, rowIndex) => { return calculateSemesterAverage(index => getJourneyScoreInputValue(editsMap, semester, pageIndex, rowIndex, index)); };

const getJourneySemesterScoreResult = (editsMap, semester, pageIndex, rowIndex, scoreIndex = semester === 'hkii' ? 7 : 6) => {
  const saved = getJourneyScoreInputValue(editsMap, semester, pageIndex, rowIndex, scoreIndex);
  if (saved !== '') return saved;
  if (scoreIndex === 6) return getJourneySemesterTermAverage(editsMap, semester, pageIndex, rowIndex);
  if (semester === 'hkii' && scoreIndex === 7) {
    const hkiAverage = parseScoreNumber(getJourneySemesterScoreResult(editsMap, 'hki', pageIndex, rowIndex, 6));
    const hkiiAverage = parseScoreNumber(getJourneySemesterScoreResult(editsMap, 'hkii', pageIndex, rowIndex, 6));
    if (hkiAverage === null || hkiiAverage === null) return '';
    return calculateYearAverage(hkiAverage, hkiiAverage);
  }
  return '';
};

const getJourneyAcademicSummaryFromScorebook = (editsMap, rowIndex) => { if (rowIndex < 0) return { result: '', complete: false, completedCount: 0, requiredCount: JOURNEY_SCORE_COLUMNS.length };
 return academicSummary(JOURNEY_SCORE_COLUMNS.filter(column=>column.academic).map(column=>getJourneySemesterScoreResult(editsMap,'hkii',column.sourcePage,rowIndex,7))); };

const getJourneyAcademicResultFromScorebook = (editsMap, rowIndex) => {
  const summary = getJourneyAcademicSummaryFromScorebook(editsMap, rowIndex);
  return summary.complete ? summary.result : '';
};

const getPromotionOutcomeFromAcademicResult = (value = '') => {
  const normalized = normalizeVietnameseName(value);
  if (!normalized) return '';
  if (/(chua dat|chua hoan thanh|khong dat|yeu|kem|o lai)/.test(normalized)) return 'repeat';
  if (/(tot|kha|dat|hoan thanh|len lop)/.test(normalized)) return 'promote';
  return '';
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
  if (field.key === 'grade') return getGradeFromClass(student.className) || getGradeFromClass(student.grade);
  if (field.key === 'entryGrade') return getStudentEntryGrade(student, student.schoolYear);
  return safePlainValue(student[field.key]);
};

const buildExportTitle = ({ currentSchoolYear, gradeFilter, classFilter, statusFilter, columnFilters, query, selectedCount, visibleFields }) => {
  const parts = ['DANH SÁCH HỌC SINH'];
  if (gradeFilter?.length) parts.push(`KHỐI ${gradeFilter.join(', ')}`);
  if (classFilter?.length) {
    parts.push(`LỚP ${classFilter.join(', ').toUpperCase()}`);
  }
  parts.push(`NĂM HỌC ${currentSchoolYear}`);
  if (statusFilter?.length) parts.push(statusFilter.map(value => value === 'dropped' ? 'BỎ HỌC' : 'ĐANG HỌC').join(', '));
  Object.entries(columnFilters || {}).forEach(([key, values]) => {
    if (!values?.length) return;
    const field = visibleFields.find(item => item.key === key) || STUDENT_FIELDS.find(item => item.key === key);
    const label = field?.label || key;
    const displayValue = values.map(getColumnFilterOptionLabel).join(', ');
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

const studentColumnFilterValue = (student, key) => {
  if (DOCUMENT_FIELD_KEYS.has(key)) {
    return splitDocumentUrls(student[key]).length > 0 ? HAS_DOCUMENT_FILTER_VALUE : EMPTY_FILTER_VALUE;
  }
  const value = String(fieldValueForExport(student, { key }) ?? '').trim();
  return value ? (key === 'birthProvince' ? provinceFilterLabel(value) : value) : EMPTY_FILTER_VALUE;
};

const matchesColumnFilter = (student, key, values) => {
  if (values == null) return true;
  const value = studentColumnFilterValue(student, key);
  return values.some(selected => key === 'birthProvince' && value !== EMPTY_FILTER_VALUE && selected !== EMPTY_FILTER_VALUE
    ? provinceFilterKey(value) === provinceFilterKey(selected)
    : value === selected);
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

const callSheetAction = async (action = '', paramsObject = {}) => {
  const response = await postAppsScript({ action: 'registrationAdminAction', registrationAction: action, params: paramsObject });
  if (response.status !== 'success' || !response.result?.success) {
    throw new Error(response.message || response.result?.message || 'Không cập nhật được Google Sheet.');
  }
  return response.result;
};

const loadRegistrationDataAction = async (action = '', params = {}, options = {}) => {
  if (action === 'listPending') return { success: true, items: await fetchPendingRegistrations(options) };
  if (action === 'listStudents') {
    const response = await postAppsScript({ action: 'registrationAdminAction', registrationAction: action, params }, options);
    if (response.result?.success !== true) throw new Error(response.result?.message || 'Chưa tải được hồ sơ. Hãy đăng nhập Admin rồi thử lại.');
    return response.result;
  }
  return requestJsonp(REGISTRATION_WEB_APP_URL, { action, ...params }, options);
};

const toSheetStudentParams = (student = {}, schoolYear = '') => ({
  studentRecordId: student.id || '', studentKey: student.studentKey || '', syncRevision: student.syncRevision || '', syncJobId: student.sheetSync?.jobId || '',
  accessCode: student.accessCode || student.studentCode || '',
  identityCode: String(student.identityCode || '').replace(/^'/, ''),
  fullName: student.fullName || '',
  birthDate: formatDisplayDate(student.birthDate || ''),
  gender: student.gender || '',
  phone: String(student.phone || '').replace(/^'/, ''),
  grade: getGradeFromClass(student.className) || getGradeFromClass(student.grade),
  schoolName: getSchoolName(getStudentSchoolCode(student)),
  schoolCode: getStudentSchoolCode(student),
  classSuffix: String(student.className || '').trim().toUpperCase().match(/^[1-9]([A-Z][A-Z0-9-]*)$/)?.[1] || student.classSuffix || '',
  classHistory: student.classHistory && typeof student.classHistory === 'object' ? student.classHistory : {},
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
  graduationYear: student.graduationYear || '',
  completionStatus: student.completionStatus || '',
  completionSchoolYear: student.completionSchoolYear || '',
  schoolYear: schoolYear || student.schoolYear || '',
  dropoutYear: student.status === 'dropped' ? (student.dropoutYear || schoolYear || student.schoolYear || '') : '',
  reactivateDropout: student.status === 'active' && Number.isSafeInteger(student.dropoutReactivationRevision)
    && student.dropoutReactivationRevision > 0 && student.dropoutReactivationRevision === student.syncRevision
});

const syncStudentToSheet = (student = {}, schoolYear = '') => callSheetAction('syncStudent', toSheetStudentParams(student, schoolYear));

const loadStudentSheetSummary = async (schoolYear = '') => {
  const response = await loadRegistrationDataAction('listStudents', { schoolYear });
  if (response?.success === false) throw new Error(response.message || 'Không đọc được dữ liệu Google Sheet.');
  const items = Array.isArray(response.items) ? response.items : [];
  const yearKey = normalizeSchoolYearKey(schoolYear);
  const exactYearCount = items.filter(item => normalizeSchoolYearKey(item.schoolYear) === yearKey).length;
  const unassignedYearCount = items.filter(item => !normalizeSchoolYearKey(item.schoolYear)).length;
  return { exactYearCount, unassignedYearCount, totalRead: items.length };
};

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
  'schoolCode',
  'schoolName',
  'fullName',
  'birthDate',
  'gender',
  'identityCode',
  'phone',
  'entryGrade',
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
  { key: 'missingIdentity', label: 'Thiếu mã định danh' },
  { key: 'missingAcademic', label: 'Thiếu học lực / hạnh kiểm' },
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

export default function HocSinhManager({ students = [], educationLevel = '', configuredClassOptions = [], currentSchoolYear, systemSchoolYear = '', initialTab = 'current', initialTabKey = 0, user, showNotification, onBack, onOpenAttendance, onSendTestResults, onSendMailboxMessages, learningProgressRows = [], onBeforeDangerousAction, onStartSchoolYearPromotion, schoolYearPromotionState = null, onPendingRegistrationsLoaded, onRegistrationsResolved }) {
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchButtonRef = useRef(null);
  const [studentTab, setStudentTab] = useState(initialTab === 'countStats' ? 'current' : (initialTab || 'current'));
  const [gradeFilter, setGradeFilter] = useState(null);
  const [classFilter, setClassFilter] = useState(() => {
    const saved = getStudentDbPrefs().classFilter;
    return Array.isArray(saved) && saved.length ? saved.map(String).filter(Boolean) : null;
  });
  const [journeyYearFilter, setJourneyYearFilter] = useState(currentSchoolYear || '');
  const [journeyClassFilter, setJourneyClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(['active']);
  const [quickIssueFilter, setQuickIssueFilter] = useState(() => getStudentDbPrefs().quickIssueFilter || 'all');
  const [sortMode, setSortMode] = useState('className');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedRegistrationIds, setSelectedRegistrationIds] = useState(new Set());
  const [allPendingRegistrations, setPendingRegistrations] = useState([]);
  const registrationRequestRef = useRef(null);
  const registrationMutationRef = useRef(false);
  useEffect(() => () => registrationRequestRef.current?.abort(), []);
  const [allProfileRequests, setProfileRequests] = useState([]);
  const [scorebookEditsByYearGrade, setScorebookEditsByYearGrade] = useState({});
  const [academicScorebooks, setAcademicScorebooks] = useState([]);
  const [academicScorebooksReady, setAcademicScorebooksReady] = useState(false);
  const [yearReconciliation, setYearReconciliation] = useState(null);
  const [yearReconciliationProgress, setYearReconciliationProgress] = useState('');
  const yearReconciliationLock = useRef(false);
  const [sheetImportStatus, setSheetImportStatus] = useState(null);
  const [sheetReconciliation, setSheetReconciliation] = useState(null);
  const sheetReconciliationLock = useRef(false);
  const sheetImportLock = useRef(false);
  const [isLoadingRegistrations, setIsLoadingRegistrations] = useState(false);
  const [showCodeChoiceModal, setShowCodeChoiceModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});
  const [openFilterKey, setOpenFilterKey] = useState(null);
  const [quickEditEnabled, setQuickEditEnabled] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profileReadOnly, setProfileReadOnly] = useState(false);
  const editingOriginal = useRef(null);
  const [profileAttendance, setProfileAttendance] = useState([]);
  const [profileAttendanceState, setProfileAttendanceState] = useState('loading');
  const [profileAttendanceScope, setProfileAttendanceScope] = useState('');
  const [profileAttendanceRetry, setProfileAttendanceRetry] = useState(0);
  const profileOpen = Boolean(editing);
  const [avatarStudent, setAvatarStudent] = useState(null);
  const [showPortraits, setShowPortraits] = useState(false);
  const [documentViewer, setDocumentViewer] = useState(null);
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [showDocumentPreviews, setShowDocumentPreviews] = useState(false);
  const [showClassStats, setShowClassStats] = useState(false);
  const [showExportChoice, setShowExportChoice] = useState(false);
  const [sendingTestResultStudentId, setSendingTestResultStudentId] = useState('');
  const [exportFormat, setExportFormat] = useState('');
  const [excelExportAction, setExcelExportAction] = useState('');
  const [showUtilitiesMenu, setShowUtilitiesMenu] = useState(false);
  const [schoolYearPromotionPreview, setSchoolYearPromotionPreview] = useState(null);
  const [utilitiesMenuPosition, setUtilitiesMenuPosition] = useState({ top: 0, left: 12, width: 360, maxHeight: 420 });
  const utilitiesButtonRef = useRef(null);
  const [mailComposerStudents, setMailComposerStudents] = useState([]);
  const [mailCategory, setMailCategory] = useState('general');
  const [mailTitle, setMailTitle] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [isSendingMailboxMessages, setIsSendingMailboxMessages] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [isSharingSheet, setIsSharingSheet] = useState(false);
  const [sharedPdfLink, setSharedPdfLink] = useState('');
  const [sharedSheetLink, setSharedSheetLink] = useState('');
  const [missingInfoReport, setMissingInfoReport] = useState('');
  const [addressDirectory, setAddressDirectory] = useState({ provinces: [], communes: {} });
  const [quickEdit, setQuickEdit] = useState(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  useEffect(() => setOpenFilterKey(null), [studentTab]);
  const [sheetSyncStatus, setSheetSyncStatus] = useState({
    phase: 'idle',
    completed: 0,
    total: 0,
    failed: 0,
    exactYearCount: null,
    unassignedYearCount: 0
  });
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = getStudentDbPrefs().visibleColumns;
    if (Array.isArray(saved) && saved.includes('fullName')) {
      if (typeof window !== 'undefined' && window.innerWidth < 640) return saved;
      const migrated = [...saved];
      const classIndex = migrated.indexOf('className');
      const insertBefore = migrated.indexOf('grade') >= 0 ? migrated.indexOf('grade') : classIndex;
      const insertIndex = insertBefore >= 0 ? insertBefore : migrated.length;
      if (!migrated.includes('entryGrade')) migrated.splice(insertIndex, 0, 'entryGrade');
      if (!migrated.includes('grade')) {
        const nextClassIndex = migrated.indexOf('className');
        migrated.splice(nextClassIndex >= 0 ? nextClassIndex : migrated.length, 0, 'grade');
      }
      return [...new Set(migrated)];
    }
    if (typeof window !== 'undefined' && window.innerWidth < 640) return MOBILE_VISIBLE_COLUMNS;
    return DEFAULT_VISIBLE_COLUMNS;
  });
  const [importText, setImportText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const profileBatchLock = useRef(false);
  const [profileBatchStatus, setProfileBatchStatus] = useState(null);
  const [sheetRetryStatus, setSheetRetryStatus] = useState(null);
  const safeStudents = useMemo(
    () => (Array.isArray(students) ? students : []).map(student => normalizeStudentRecord(student, currentSchoolYear)),
    [students, currentSchoolYear]
  );
  const scopedStudents = useMemo(() => safeStudents.filter(student => belongsToEducationLevel(student, educationLevel)), [safeStudents, educationLevel]);
  const pendingRegistrations = useMemo(() => allPendingRegistrations.filter(item => belongsToEducationLevel(registrationToStudentData(item, currentSchoolYear), educationLevel)), [allPendingRegistrations, educationLevel, currentSchoolYear]);
  const profileRequests = useMemo(() => allProfileRequests.filter(request => belongsToEducationLevel(safeStudents.find(student => student.id === request.studentId) || request, educationLevel)), [allProfileRequests, safeStudents, educationLevel]);

  useEffect(() => {
    if (initialTab === 'countStats') {
      setStudentTab('current');
      setShowClassStats(true);
      return;
    }
    setStudentTab(initialTab || 'current');
  }, [initialTab, initialTabKey]);

  const profileRequestsCollection = useMemo(
    () => collection(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests'),
    []
  );
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
  }, [profileRequestsCollection]);
  useEffect(() => {
    const ref = collection(db, 'artifacts', appId, 'public', 'data', 'scorebooks');
    return onSnapshot(ref, snapshot => {
      setAcademicScorebooks(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
      setAcademicScorebooksReady(true);
      const nextMap = {};
      snapshot.docs.forEach(item => {
        const data = item.data() || {};
        if (data.campusNormalization?.archivedTo) return;
        if (String(data.sourceFile || '') !== String(scorebookTemplate.sourceFile || '')) return;
        const gradeKey = String(data.grade || '').trim();
        const schoolYearKey = normalizeSchoolYearKey(data.schoolYear || '');
        if (!gradeKey || !schoolYearKey) return;
        const schoolCode = normalizeSchoolCode(data.schoolCode) || normalizeSchoolCode(data.schoolName);
        if (!schoolCode) return;
        const mapKey = `${schoolYearKey}__${gradeKey}__${schoolCode}`;
        const existing = nextMap[mapKey];
        if (!existing || Number(data.updatedAt || 0) >= Number(existing.updatedAt || 0)) {
          nextMap[mapKey] = { id: item.id, edits: data.edits || {}, updatedAt: Number(data.updatedAt || 0) };
        }
      });
      setScorebookEditsByYearGrade(nextMap);
    }, () => {
      setAcademicScorebooksReady(false);
      showNotification?.('Chưa tải được dữ liệu sổ điểm để điền quá trình học.', 'error');
    });
  }, [showNotification]);
  const previousSchoolYear = useMemo(() => getPreviousSchoolYear(currentSchoolYear), [currentSchoolYear]);
  const yearStudents = useMemo(
    () => scopedStudents.filter(student => String(student.schoolYear || currentSchoolYear) === String(currentSchoolYear)),
    [scopedStudents, currentSchoolYear]
  );
  const learningProgressByStudent = useMemo(() => {
    const map = new Map();
    (Array.isArray(learningProgressRows) ? learningProgressRows : []).forEach(row => {
      const student = row?.student || {};
      const keys = [
        student.id,
        student.accessCode,
        student.studentAccessCode,
        normalizeSearch(student.fullName || student.studentName || '')
      ].map(value => String(value || '').trim().toUpperCase()).filter(Boolean);
      keys.forEach(key => map.set(key, row));
    });
    return map;
  }, [learningProgressRows]);
  const getStudentLearningProgress = (student = {}) => {
    const keys = [
      student.id,
      student.accessCode,
      student.studentAccessCode,
      normalizeSearch(student.fullName || student.studentName || '')
    ].map(value => String(value || '').trim().toUpperCase()).filter(Boolean);
    return keys.map(key => learningProgressByStudent.get(key)).find(Boolean) || null;
  };
  const previousYearStudents = useMemo(
    () => previousSchoolYear
      ? scopedStudents.filter(student => String(student.schoolYear || '') === String(previousSchoolYear))
      : [],
    [scopedStudents, previousSchoolYear]
  );
  const visibleStudentFields = useMemo(
    () => STUDENT_FIELDS.filter(field => visibleColumns.includes(field.key) && !(educationLevel === 'primary' && ACADEMIC_RESULT_FIELD_KEYS.has(field.key))),
    [visibleColumns, educationLevel]
  );
  const isImageOnlyView = useMemo(
    () => showDocumentPreviews && visibleColumns.length === IMAGE_ONLY_VISIBLE_COLUMNS.length
      && IMAGE_ONLY_VISIBLE_COLUMNS.every(key => visibleColumns.includes(key)),
    [showDocumentPreviews, visibleColumns]
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
    () => ADMIN_EDIT_FIELD_ORDER.map(key => editFieldMap.get(key)).filter(field => field && !(educationLevel === 'primary' && ACADEMIC_RESULT_FIELD_KEYS.has(field.key))),
    [editFieldMap, educationLevel]
  );
  const journeyYearOptions = useMemo(
    () => uniqueTextItems([...safeStudents.map(student => student.schoolYear), currentSchoolYear])
      .sort((a, b) => (getYearStart(a) || 0) - (getYearStart(b) || 0)),
    [safeStudents, currentSchoolYear]
  );
  const journeyClassOptions = useMemo(() => {
    const classes = uniqueTextItems(
      scopedStudents
        .filter(student => !journeyYearFilter || student.schoolYear === journeyYearFilter)
        .map(student => student.className)
    ).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' }));
    return classes.map(className => ({ value: className, label: `Lop ${className}` }));
  }, [scopedStudents, journeyYearFilter]);
  const journeyStudentsByYearGrade = useMemo(() => {
    const map = new Map();
    safeStudents
      .filter(student => (student.status || 'active') !== 'dropped')
      .forEach(student => {
        const grade = getGradeFromClass(student.className || student.grade || '');
        const schoolYearKey = normalizeSchoolYearKey(student.schoolYear || currentSchoolYear || '');
        if (!grade || !schoolYearKey) return;
        const key = `${schoolYearKey}__${grade}__${getStudentSchoolCode(student)}`;
        const list = map.get(key) || [];
        list.push(student);
        map.set(key, list);
      });
    map.forEach((list, key) => {
      map.set(key, [...list].sort(compareSchoolRosterStudents));
    });
    return map;
  }, [safeStudents, currentSchoolYear]);
  const showCenterResultColumns = studentTab === 'journey' || (studentTab === 'current' && visibleColumns.some(key => ACADEMIC_RESULT_FIELD_KEYS.has(key)));
  const profileAttendanceYears = useMemo(() => {
    const years = new Set();
    if (showCenterResultColumns) {
      safeStudents.forEach(student => studentAcademicContexts(student, safeStudents, systemSchoolYear || currentSchoolYear)
        .forEach(record => years.add(record.schoolYear)));
    }
    if (editing) {
      buildStudentProfileHistory({ student: editing, original: editingOriginal.current || editing, records: safeStudents,
        currentSchoolYear: systemSchoolYear || currentSchoolYear })
        .filter(row => row.current || row.schoolYear < (systemSchoolYear || currentSchoolYear))
        .forEach(row => years.add(row.schoolYear));
    }
    return JSON.stringify([...years].sort());
  }, [showCenterResultColumns, safeStudents, editing, systemSchoolYear, currentSchoolYear]);
  const attendanceReadyForResults = profileAttendanceState === 'ready' && profileAttendanceScope === profileAttendanceYears;
  const loadedResultAttendanceYears = useMemo(() => new Set(JSON.parse(profileAttendanceScope || '[]')), [profileAttendanceScope]);
  const centerAcademicByStudent = useMemo(() => new Map(safeStudents.map(student => [student.id, studentCenterAcademicResults({
    student, records: safeStudents, scorebooks: academicScorebooks, currentSchoolYear: systemSchoolYear || currentSchoolYear,
    attendance: profileAttendance, attendanceReady: attendanceReadyForResults, attendanceYears: loadedResultAttendanceYears
  })])), [safeStudents, academicScorebooks, systemSchoolYear, currentSchoolYear, profileAttendance, attendanceReadyForResults, loadedResultAttendanceYears]);
  const yearStudentsWithResults = useMemo(() => yearStudents.map(student => ({
    ...student, ...centerAcademicByStudent.get(student.id)?.fields
  })), [yearStudents, centerAcademicByStudent]);
  const editingCenterResults = useMemo(() => studentCenterAcademicResults({
    student: editing, records: safeStudents, scorebooks: academicScorebooks, currentSchoolYear: systemSchoolYear || currentSchoolYear,
    attendance: profileAttendance, attendanceReady: attendanceReadyForResults, attendanceYears: loadedResultAttendanceYears
  }), [editing, safeStudents, academicScorebooks, systemSchoolYear, currentSchoolYear, profileAttendance, attendanceReadyForResults, loadedResultAttendanceYears]);
  const journeyScorebookResults = useMemo(() => {
    const results = new Map();
    safeStudents.forEach(student => {
      const grade = getGradeFromClass(student.className || student.grade || '');
      const schoolYear = student.schoolYear || currentSchoolYear || '';
      const schoolYearKey = normalizeSchoolYearKey(schoolYear);
      if (!student.id || !grade || !schoolYearKey) return;
      const yearGradeKey = `${schoolYearKey}__${grade}__${getStudentSchoolCode(student)}`;
      const yearRows = journeyStudentsByYearGrade.get(yearGradeKey) || [];
      const selectedKey = getJourneyStudentKey(student);
      const rowIndex = yearRows.findIndex(row => row.id === student.id);
      const safeRowIndex = rowIndex >= 0 ? rowIndex : yearRows.findIndex(row => getJourneyStudentKey(row) === selectedKey);
      const scorebookEdits = scorebookEditsByYearGrade[yearGradeKey]?.edits || {};
      const hasScorebookData = Object.keys(scorebookEdits).length > 0;
      const academic = hasScorebookData && safeRowIndex >= 0
        ? getJourneyAcademicResultFromScorebook(studentRowView(scorebookEdits, student, safeRowIndex), safeRowIndex)
        : '';
      results.set(student.id, {
        academic: centerAcademicByStudent.get(student.id)?.fields[`hocLucLop${grade}`] || (Number(grade) < 6 ? academic : ''),
        conduct: centerAcademicByStudent.get(student.id)?.fields[`hanhKiemLop${grade}`] || ''
      });
    });
    return results;
  }, [currentSchoolYear, journeyStudentsByYearGrade, safeStudents, scorebookEditsByYearGrade, centerAcademicByStudent]);
  const profileHistoryRows = useMemo(() => editing ? buildStudentProfileHistory({
    student: { ...editing, ...editingCenterResults.fields }, original: editingOriginal.current || editing, records: safeStudents,
    currentSchoolYear: systemSchoolYear || currentSchoolYear, attendance: profileAttendance, academicResults: journeyScorebookResults
  }) : [], [editing, editingCenterResults, safeStudents, systemSchoolYear, currentSchoolYear, profileAttendance, journeyScorebookResults]);
  useEffect(() => {
    if (!profileOpen && !showCenterResultColumns) return;
    setProfileAttendance([]);
    setProfileAttendanceState('loading');
    const years = JSON.parse(profileAttendanceYears);
    if (!years.length) { setProfileAttendanceState('ready'); setProfileAttendanceScope(profileAttendanceYears); return; }
    // Load only the years needed by the open profile or visible annual-result columns.
    const base = collection(db, 'artifacts', appId, 'public', 'data', 'class_attendance');
    const batches = Array.from({ length: Math.ceil(years.length / 30) }, (_, index) => years.slice(index * 30, index * 30 + 30));
    const loaded = new Map();
    let failed = false;
    const subscriptions = batches.map((batch, index) => onSnapshot(firestoreQuery(base, where('schoolYear', 'in', batch)), snapshot => {
      loaded.set(index, snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
      if (failed || loaded.size !== batches.length) return;
      setProfileAttendance([...loaded.values()].flat());
      setProfileAttendanceState('ready');
      setProfileAttendanceScope(profileAttendanceYears);
    }, () => { failed = true; setProfileAttendanceState('error'); }));
    return () => subscriptions.forEach(unsubscribe => unsubscribe());
  }, [profileOpen, showCenterResultColumns, profileAttendanceRetry, profileAttendanceYears]);

  const buildSchoolYearPromotionPreview = async (scope = '') => {
    if (!academicScorebooksReady) throw new Error('Chưa tải xong sổ điểm. Hãy đợi tải xong rồi xét lớp.');
    const sourceSchoolYear = normalizeSchoolYearKey(scope === 'graduation'
      ? getPreviousSchoolYear(systemSchoolYear || currentSchoolYear) : systemSchoolYear || currentSchoolYear);
    const targetSchoolYear = getNextSchoolYear(sourceSchoolYear);
    const sourceStudents = safeStudents
      .filter(student => normalizeSchoolYearKey(student.schoolYear || sourceSchoolYear) === sourceSchoolYear);
    let activeStudents = sourceStudents.filter(student => !['dropped', 'completed'].includes(student.status)
      && (scope !== 'graduation' || getGradeFromClass(student.className) === '9'));
    const attendanceCollection = collection(db, 'artifacts', appId, 'public', 'data', 'class_attendance');
    const attendanceSnapshot = await getDocsFromServer(firestoreQuery(
      attendanceCollection, where('schoolYear', '==', sourceSchoolYear)));
    const resultAttendance = attendanceSnapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    const targetStudents = safeStudents
      .filter(student => normalizeSchoolYearKey(student.schoolYear || '') === normalizeSchoolYearKey(targetSchoolYear));
    let previousSheetStudents = [];
    const previousSourceSchoolYear = getPreviousSchoolYear(sourceSchoolYear);
    if (previousSourceSchoolYear) {
      try {
        // One row per student: fetch all rows so classHistory columns remain available even when BA points to a newer year.
        const response = await loadRegistrationDataAction('listStudents');
        if (response?.success !== true || !Array.isArray(response.items)) {
          throw new Error(response?.message || 'Google Sheet không trả về danh sách học sinh.');
        }
        previousSheetStudents = response.items
          .map(row => normalizeStudentRecord(registrationToStudentData(row, previousSourceSchoolYear), previousSourceSchoolYear));
      } catch (error) {
        throw new Error(`Không đọc được lịch sử lớp trên Google Sheet để đối chiếu: ${error.message || 'lỗi không xác định'}`, { cause: error });
      }
    }

    const findPreviousSheetStudent = (student) => {
      const schoolCode = getStudentSchoolCode(student);
      const sameSchoolRows = previousSheetStudents.filter(item => getStudentSchoolCode(item) === schoolCode);
      const identityCode = String(student.identityCode || '').replace(/^'/, '').trim();
      const accessCode = String(student.accessCode || student.studentCode || '').trim().toUpperCase();
      const fullName = normalizeVietnameseName(student.fullName || '');
      const birthDate = normalizeBirthDate(student.birthDate || '');
      if (/^\d{12}$/.test(identityCode)) {
        const matches = sameSchoolRows.filter(item => String(item.identityCode || '').replace(/^'/, '').trim() === identityCode);
        if (matches.length === 1) return matches[0];
      }
      if (accessCode) {
        const matches = sameSchoolRows.filter(item => String(item.accessCode || item.studentCode || '').trim().toUpperCase() === accessCode);
        if (matches.length === 1) return matches[0];
      }
      if (fullName && birthDate) {
        const matches = sameSchoolRows.filter(item => (
          normalizeVietnameseName(item.fullName || '') === fullName
          && normalizeBirthDate(item.birthDate || '') === birthDate
        ));
        if (matches.length === 1) return matches[0];
      }
      return null;
    };

    // A Sheet edit may precede its import into the web database.
    activeStudents = activeStudents.filter(student => findPreviousSheetStudent(student)?.status !== 'dropped');
    const classHistoryByStudentId = new Map();
    const studentsWithSheetHistory = new Map();
    activeStudents.forEach(student => {
      const previousSheetStudent = findPreviousSheetStudent(student);
      const classHistory = mergeStudentClassHistory(student.classHistory, previousSheetStudent?.classHistory);
      classHistoryByStudentId.set(student.id, classHistory);
      studentsWithSheetHistory.set(student.id, { ...student, classHistory });
    });
    const resultSchoolYears = [...new Set(activeStudents.flatMap(student =>
      studentAcademicContexts(studentsWithSheetHistory.get(student.id), safeStudents, sourceSchoolYear).map(record => record.schoolYear)
    ))].filter(year => year && year !== sourceSchoolYear);
    for (let offset = 0; offset < resultSchoolYears.length; offset += 30) {
      const years = resultSchoolYears.slice(offset, offset + 30);
      const snapshot = await getDocsFromServer(firestoreQuery(attendanceCollection, where('schoolYear', 'in', years)));
      resultAttendance.push(...snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
    }

    const correctedClassByStudentId = new Map();
    const classRepairs = [];
    activeStudents.forEach(student => {
      const grade = getGradeFromClass(student.className || student.grade || '');
      const classText = String(student.className || '').trim().toUpperCase().replace(/^LỚP\s*/i, '').replace(/\s+/g, '');
      if (!/^\d$/.test(classText) || !student.id) return;
      let correctedClassName = '';
      if (Number(grade) <= 5) {
        correctedClassName = `${grade}A`;
      } else {
        const previousStudent = findPreviousSheetStudent(student);
        const previousClassName = previousStudent?.classHistory?.[previousSourceSchoolYear] || previousStudent?.className;
        const promotedFromPrevious = promoteSchoolClassName(previousClassName);
        if (getGradeFromClass(promotedFromPrevious) === grade && /^[1-9][A-Z]/.test(promotedFromPrevious)) {
          correctedClassName = promotedFromPrevious;
        }
      }
      if (!correctedClassName) return;
      correctedClassByStudentId.set(student.id, correctedClassName);
      classRepairs.push({ studentId: student.id, className: correctedClassName, grade });
    });

    const studentsByGrade = new Map();
    activeStudents.forEach(student => {
      const grade = getGradeFromClass(student.className || student.grade || '');
      if (!grade) return;
      const schoolCode = getStudentSchoolCode(student);
      const key = `${schoolCode}__${grade}`;
      studentsByGrade.set(key, [...(studentsByGrade.get(key) || []), student]);
    });
    studentsByGrade.forEach((rows, key) => {
      studentsByGrade.set(key, [...rows].sort(compareSchoolRosterStudents));
    });

    const findExistingTargetStudent = student => findPromotionTarget(student, targetStudents);

    const transitions = [];
    const completions = [];
    const missingScores = [];
    const missingConduct = [];
    const invalidClasses = [];
    const alreadyPrepared = [];
    const repeated = [];
    const promoted = [];
    const scorebookGuards = new Map();

    activeStudents.forEach(student => {
      const grade = getGradeFromClass(student.className || student.grade || '');
      const normalizedClassName = correctedClassByStudentId.get(student.id) || String(student.className || '')
        .trim()
        .toUpperCase()
        .replace(/^LỚP\s*/i, '')
        .replace(/\s+/g, '');
      if (!grade || !/^[1-9][A-Z][A-Z0-9-]*$/.test(normalizedClassName)) {
        invalidClasses.push(student);
        return;
      }
      const existingTargetStudent = findExistingTargetStudent(student);

      const schoolCode = getStudentSchoolCode(student);
      const rowsInGrade = studentsByGrade.get(`${schoolCode}__${grade}`) || [];
      const rowIndex = rowsInGrade.findIndex(item => item.id === student.id);
      const resolution = resolveScorebookDocument(academicScorebooks, { schoolYear: sourceSchoolYear, grade, schoolCode, sourceFile: scorebookTemplate.sourceFile });
      const scorebook = resolution.needsSelection ? null : resolution.document;
      const scorebookEdits = scorebook?.edits || {};
      const scorebookSummary = Number(grade) >= 6 ? scorebookYearSummary(scorebookEdits, student)
        : getJourneyAcademicSummaryFromScorebook(studentRowView(scorebookEdits, student, rowIndex), rowIndex);
      const storedAcademicResult = getJourneyResult(student, 'hocLuc');
      const academicResult = scorebookSummary.complete ? scorebookSummary.result : Number(grade) < 6 ? storedAcademicResult : '';
      const outcome = getPromotionOutcomeFromAcademicResult(academicResult);

      if (!outcome) {
        missingScores.push({ student, completedCount: scorebookSummary.completedCount, requiredCount: scorebookSummary.requiredCount });
        return;
      }

      const source = scorebookSummary.complete ? 'so_diem' : 'ket_qua_da_chot';
      if (source === 'so_diem' && scorebook?.id) scorebookGuards.set(scorebook.id, {
        ...scorebook,
        updatedAt: Number(scorebook.updatedAt?.toMillis?.() ?? scorebook.updatedAt) || 0
      });
      const annualResultSummary = studentCenterAcademicResults({ student: studentsWithSheetHistory.get(student.id), records: safeStudents,
        scorebooks: academicScorebooks, currentSchoolYear: sourceSchoolYear, attendance: resultAttendance,
        attendanceReady: true, attendanceYears: new Set([...resultSchoolYears, sourceSchoolYear]) });
      const annualResults = annualResultSummary.fields;
      new Set(Object.values(annualResultSummary.sources).map(result => result.scorebookId).filter(Boolean)).forEach(id => {
        const resultBook = academicScorebooks.find(item => item.id === id);
        if (resultBook) scorebookGuards.set(id, { ...resultBook,
          updatedAt: Number(resultBook.updatedAt?.toMillis?.() ?? resultBook.updatedAt) || 0 });
      });
      const conductResult = annualResults[`hanhKiemLop${grade}`]
        || getJourneyResult(student, 'hanhKiem', grade);
      if (Number(grade) === 9 && outcome === 'promote') {
        if (!conductResult) { missingConduct.push(student); return; }
        if ((existingTargetStudent && ![normalizedClassName, THCS_COMPLETED_CLASS].includes(existingTargetStudent.className))
          || existingTargetStudent?.promotion?.outcome === 'repeat') { invalidClasses.push(student); return; }
        completions.push({ student, sourceClassName: normalizedClassName, targetClassName: THCS_COMPLETED_CLASS,
          targetStudent: existingTargetStudent, classHistory: classHistoryByStudentId.get(student.id), academicResult, conductResult, annualResults,
          graduationYear: sourceSchoolYear.slice(5), source });
        promoted.push(student);
        return;
      }

      const targetClassName = outcome === 'repeat'
        ? normalizedClassName
        : promoteSchoolClassName(normalizedClassName);
      if (!targetClassName) {
        invalidClasses.push(student);
        return;
      }
      if (existingTargetStudent) {
        if (existingTargetStudent.className !== targetClassName) { invalidClasses.push(student); return; }
        alreadyPrepared.push({ student, targetStudent: existingTargetStudent, classHistory: classHistoryByStudentId.get(student.id),
          sourceClassName: normalizedClassName, targetClassName, academicResult, conductResult, annualResults, outcome, source });
        return;
      }
      const transition = { student, classHistory: classHistoryByStudentId.get(student.id), sourceClassName: normalizedClassName,
        targetClassName, academicResult, conductResult, annualResults, outcome, source };
      transitions.push(transition);
      if (outcome === 'repeat') repeated.push(transition);
      else promoted.push(student);
    });

    return {
      scope,
      sourceSchoolYear,
      targetSchoolYear,
      sourceVersions: promotionSourceVersions(students, sourceSchoolYear),
      targetVersions: promotionSourceVersions(students.filter(student =>
        normalizeSchoolYearKey(student.schoolYear || '') === targetSchoolYear), targetSchoolYear),
      scorebookGuards: [...scorebookGuards.values()],
      sourceStudentCount: sourceStudents.length,
      activeStudentCount: activeStudents.length,
      droppedStudentCount: sourceStudents.length - activeStudents.length,
      transitions,
      completions,
      classRepairs,
      missingScores,
      missingConduct,
      invalidClasses,
      alreadyPrepared,
      repeated,
      promoted,
      canExecute: Boolean(targetSchoolYear && activeStudents.length && (scope === 'graduation'
        ? transitions.length + completions.length + alreadyPrepared.length > 0
        : !missingScores.length && !invalidClasses.length))
    };
  };
  const journeyRows = useMemo(() => {
    const needle = normalizeSearch(query);
    const groups = new Map();
    scopedStudents.forEach(student => {
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
      const dropoutContinuation = findDropoutContinuation([...group.byYear.values()]);
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
        latestStudent: latest,
        records,
        byYear: group.byYear,
        dropoutContinuation,
        entryYear: first.enrollmentYear || first.schoolYear || '',
        include: Boolean(matchedRecord),
        searchable
      };
    })
      .filter(row => (!journeyYearFilter || row.include) && (!needle || row.searchable.includes(needle)))
      .sort((a, b) => compareClassThenName(a.student, b.student));
  }, [scopedStudents, query, journeyYearFilter, journeyClassFilter]);
  const addressProvinceOptions = useMemo(() => uniqueTextItems([
    ...addressDirectory.provinces,
    ...safeStudents.flatMap(student => [student.province, student.householdProvince]),
    editing?.province,
    editing?.householdProvince
  ]).sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })), [addressDirectory.provinces, safeStudents, editing?.province, editing?.householdProvince]);
  const getWardOptions = useCallback((province = '', currentValue = '', household = false) => {
    const provinceName = String(province || '').trim();
    const sheetOptions = addressDirectory.communes[provinceName] || [];
    const studentOptions = safeStudents
      .filter(student => !provinceName || student.province === provinceName || student.householdProvince === provinceName)
      .flatMap(student => household ? [student.householdWard, student.ward] : [student.ward, student.householdWard]);
    return uniqueTextItems([...sheetOptions, ...studentOptions, currentValue])
      .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
  }, [addressDirectory.communes, safeStudents]);
  const editCurrentWardOptions = useMemo(
    () => getWardOptions(editing?.province, editing?.ward, false),
    [getWardOptions, editing?.province, editing?.ward]
  );
  const editHouseholdWardOptions = useMemo(
    () => getWardOptions(editing?.householdProvince, editing?.householdWard, true),
    [getWardOptions, editing?.householdProvince, editing?.householdWard]
  );
  const findRegistrationDuplicate = useCallback((registration = {}) => {
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
  }, [safeStudents]);

  const registrationIdentity = registration => /^\d{12}$/.test(String(registration.identityCode || ''))
    ? registration.identityCode
    : registration.registrationId || registration.id || registration.tempId;
  const decorateRegistration = useCallback((item = {}, index = 0) => {
    const duplicate = findRegistrationDuplicate(item);
    const identity = registrationIdentity(item);
    return {
      ...item,
      tempId: safePlainValue(item.id || item.rowNumber || `${pickText(item.identityCode, item.fullName) || 'row'}_${index}`),
      hiddenBecauseExistingStudent: Boolean(duplicate?.student),
      duplicateReason: duplicate?.reason || '',
      duplicateStudentId: duplicate?.student?.id || '',
      duplicateStudentName: duplicate?.student?.fullName || '',
      duplicateAccessCode: duplicate?.student?.accessCode || '',
      registrationSyncPending: yearStudents.some(student => student.registrationId === identity && ['pending', 'failed', 'running'].includes(student.sheetSync?.status))
    };
  }, [findRegistrationDuplicate, yearStudents]);
  // Student snapshots can arrive after the Sheet response or change while this list stays open.
  const reviewedRegistrations = useMemo(
    () => pendingRegistrations.map(decorateRegistration),
    [pendingRegistrations, decorateRegistration]
  );
  const registrationRows = useMemo(
    () => reviewedRegistrations.map(item => ({
      ...registrationToStudentData(item, currentSchoolYear),
      id: safePlainValue(item.tempId),
      tempId: safePlainValue(item.tempId),
      rowNumber: safePlainValue(item.rowNumber),
      duplicateReason: safePlainValue(item.duplicateReason),
      duplicateStudentId: safePlainValue(item.duplicateStudentId),
      duplicateStudentName: safePlainValue(item.duplicateStudentName),
      duplicateAccessCode: safePlainValue(item.duplicateAccessCode),
      registrationSyncPending: item.registrationSyncPending
    })),
    [reviewedRegistrations, currentSchoolYear]
  );

  const loadPendingRegistrationsRef = useRef(loadPendingRegistrations);
  loadPendingRegistrationsRef.current = loadPendingRegistrations;
  const autoLoadRegistrationsAttemptedRef = useRef(false);

  useEffect(() => {
    if (studentTab !== 'registrations') {
      autoLoadRegistrationsAttemptedRef.current = false;
      return;
    }
    if (!pendingRegistrations.length && !isLoadingRegistrations && !autoLoadRegistrationsAttemptedRef.current) {
      autoLoadRegistrationsAttemptedRef.current = true;
      loadPendingRegistrationsRef.current();
    }
  }, [studentTab, pendingRegistrations.length, isLoadingRegistrations]);

  useEffect(() => {
    setColumnFilters({});
    setOpenFilterKey(null);
    setGradeFilter(null);
    setClassFilter(null);
    setStatusFilter(studentTab === 'current' ? ['active'] : null);
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

  const isEditingStudent = Boolean(editing);
  useEffect(() => {
    if (!isEditingStudent || addressDirectory.provinces.length) return;
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
  }, [isEditingStudent, addressDirectory.provinces.length]);

  useEffect(() => {
    if (!isEditingStudent) return;
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
  }, [isEditingStudent, editing?.province, editing?.householdProvince, addressDirectory.communes]);
  const duplicateRegistrationCount = useMemo(
    () => reviewedRegistrations.filter(item => item.duplicateReason && !item.registrationSyncPending).length,
    [reviewedRegistrations]
  );

  const activeSourceRows = studentTab === 'registrations' ? registrationRows : yearStudentsWithResults;
  const classOptions = useMemo(
    () => [...new Set([
      ...(studentTab === 'current' ? configuredClassOptions.filter(className => belongsToEducationLevel({ className }, educationLevel)) : []),
      ...activeSourceRows.map(student => student.className).filter(Boolean)
    ])].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' })),
    [activeSourceRows, configuredClassOptions, studentTab, educationLevel]
  );
  const activeSelectedIds = studentTab === 'registrations' ? selectedRegistrationIds : selectedIds;
  const selectedClassSet = useMemo(() => new Set(classFilter || []), [classFilter]);
  const selectedGradeSet = useMemo(() => new Set(gradeFilter || []), [gradeFilter]);
  const gradeOptions = useMemo(() => [...new Set([
    ...classOptions.map(className => getGradeFromClass(className)),
    ...activeSourceRows.map(student => getGradeFromClass(student.className) || getGradeFromClass(student.grade))
  ].filter(Boolean))].sort((a, b) => Number(a) - Number(b)), [classOptions, activeSourceRows]);
  const filteredClassOptions = useMemo(
    () => classOptions.filter(className => gradeFilter == null || selectedGradeSet.has(getGradeFromClass(className))),
    [classOptions, gradeFilter, selectedGradeSet]
  );
  const matchesClassFilter = useCallback(
    (student) => (gradeFilter == null || selectedGradeSet.has(getGradeFromClass(student.className) || getGradeFromClass(student.grade)))
      && (classFilter == null || selectedClassSet.has(student.className)),
    [gradeFilter, classFilter, selectedGradeSet, selectedClassSet]
  );
  const changeGradeFilter = (values) => {
    setGradeFilter(values);
    setClassFilter(previous => {
      if (previous == null || !previous.length || values == null) return previous;
      const valid = previous.filter(className => values.includes(getGradeFromClass(className)));
      return valid.length ? valid : null;
    });
  };
  const matchesStatusFilter = useCallback(
    student => studentTab === 'registrations' || statusFilter == null || statusFilter.includes(student.status || 'active'),
    [studentTab, statusFilter]
  );

  const getMissingAcademicResults = useCallback((student = {}) => {
    const grade = Number(getGradeFromClass(student.className) || 0);
    if (grade <= 6) return [];
    const maxGrade = Math.min(grade - 1, Number(getStudentEntryGrade(student, student.schoolYear)) - 1, 9);
    return ACADEMIC_RESULT_CHECK_FIELDS
      .filter(item => item.grade <= maxGrade)
      .filter(item => !safePlainValue(student[item.key]).trim())
      .map(item => item.label);
  }, []);

  const getMissingStudentInfo = useCallback((student = {}) => {
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
  }, [getMissingAcademicResults]);

  const openMailboxComposer = (targetStudents = [], category = 'general') => {
    const uniqueStudents = [...new Map((Array.isArray(targetStudents) ? targetStudents : [])
      .filter(Boolean)
      .map(student => [student.id || student.accessCode || student.fullName, student])).values()];
    if (!uniqueStudents.length) {
      showNotification?.('Tích chọn ít nhất một học sinh trước khi gửi thư.', 'error');
      return;
    }
    const presets = {
      general: { title: 'Thông báo từ nhà trường', body: '' },
      score: { title: 'Thông báo kết quả học tập', body: '' },
      profile: { title: 'Thông báo bổ sung hồ sơ', body: '' },
      reminder: { title: 'Nhắc việc', body: '' },
      progress: { title: 'Thông báo tiến độ học', body: '' }
    };
    setMailComposerStudents(uniqueStudents);
    setMailCategory(category);
    setMailTitle(presets[category]?.title || presets.general.title);
    setMailBody(presets[category]?.body || '');
  };

  const closeMailboxComposer = () => {
    if (isSendingMailboxMessages) return;
    setMailComposerStudents([]);
    setMailTitle('');
    setMailBody('');
  };

  const sendMailboxComposerMessages = async () => {
    if (!onSendMailboxMessages || !mailComposerStudents.length) return;
    const cleanTitle = mailTitle.trim();
    if (!cleanTitle) {
      showNotification?.('Nhập tiêu đề thư trước khi gửi.', 'error');
      return;
    }
    if (mailCategory === 'score' && !mailBody.trim() && onSendTestResults) {
      setIsSendingMailboxMessages(true);
      try {
        for (const student of mailComposerStudents) await onSendTestResults(student);
        setMailComposerStudents([]);
        setMailTitle('');
        setMailBody('');
      } catch (error) {
        showNotification?.(`Chưa gửi đủ kết quả học tập: ${error.message}`, 'error');
      } finally {
        setIsSendingMailboxMessages(false);
      }
      return;
    }
    const messages = mailComposerStudents.map(student => {
      let body = mailBody.trim();
      if (!body && mailCategory === 'profile') {
        const missing = getMissingStudentInfo(student);
        body = missing.length
          ? `Hồ sơ của em còn thiếu hoặc cần bổ sung: ${missing.join(', ')}. Em vui lòng cập nhật hoặc liên hệ nhà trường.`
          : 'Nhà trường cần em kiểm tra và xác nhận lại thông tin hồ sơ học sinh.';
      }
      if (!body && mailCategory === 'progress') {
        const progress = getStudentLearningProgress(student);
        body = progress?.targetCount
          ? `Tiến độ học hiện tại của em là ${progress.percent}%. Em đã hoàn thành phần lý thuyết của ${progress.theoryDoneCount}/${progress.targetCount} bài và đạt yêu cầu ${progress.quickDoneCount}/${progress.quickTargetCount} bài kiểm tra nhanh.`
          : 'Hiện hệ thống chưa ghi nhận đủ dữ liệu tiến độ học của em. Em vui lòng vào bài học và hoàn thành các nội dung được giao.';
      }
      if (!body) body = 'Nhà trường gửi thông báo đến em. Em vui lòng kiểm tra và thực hiện theo hướng dẫn.';
      return { student, category: mailCategory, title: cleanTitle, body };
    });
    setIsSendingMailboxMessages(true);
    try {
      await onSendMailboxMessages(messages);
      setMailComposerStudents([]);
      setMailTitle('');
      setMailBody('');
    } catch (error) {
      showNotification?.(`Chưa gửi được thư: ${error.message}`, 'error');
    } finally {
      setIsSendingMailboxMessages(false);
    }
  };

  const getStudentIssueFlags = useCallback((student = {}) => {
    const missingDocs = STUDENT_DOCUMENTS.some(item => splitDocumentUrls(student[item.key]).length === 0);
    const missingIdentity = !safePlainValue(student.identityCode).trim();
    const missingAcademic = getMissingAcademicResults(student).length > 0;
    return {
      missingDocs,
      missingIdentity,
      missingAcademic,
      missingInfo: getMissingStudentInfo(student).length > 0
    };
  }, [getMissingAcademicResults, getMissingStudentInfo]);

  useEffect(() => {
    setClassFilter(prev => {
      if (prev == null) return prev;
      const next = prev.filter(className => classOptions.includes(className));
      return next.length === prev.length ? prev : next;
    });
  }, [classOptions]);

  const matchesQuickIssueFilter = useCallback((student = {}) => {
    if (quickIssueFilter === 'all') return true;
    if (quickIssueFilter === 'selected') return activeSelectedIds.has(student.id);
    if (student.status === 'dropped') return false;
    const flags = getStudentIssueFlags(student);
    return Boolean(flags[quickIssueFilter]);
  }, [quickIssueFilter, activeSelectedIds, getStudentIssueFlags]);

  const filteredStudents = useMemo(() => {
    const needle = normalizeSearch(query);
    return [...activeSourceRows
      .filter(matchesStatusFilter)
      .filter(matchesClassFilter)
      .filter(matchesQuickIssueFilter)
      .filter(student => visibleStudentFields.every(field => {
        return matchesColumnFilter(student, field.key, columnFilters[field.key]);
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
  }, [activeSourceRows, query, visibleStudentFields, columnFilters, sortMode, matchesClassFilter, matchesStatusFilter, matchesQuickIssueFilter]);

  const issueStats = useMemo(() => {
    const rows = activeSourceRows
      .filter(matchesStatusFilter)
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
  }, [activeSourceRows, activeSelectedIds, matchesClassFilter, matchesStatusFilter, getStudentIssueFlags]);
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
      .filter(matchesStatusFilter)
      .filter(matchesClassFilter)
      .filter(student => Object.entries(columnFilters).every(([key, value]) => {
        if (value == null || key === fieldKey || !visibleColumns.includes(key)) return true;
        return matchesColumnFilter(student, key, value);
      }));
    return [...new Set([...source.map(student => studentColumnFilterValue(student, fieldKey)), ...(columnFilters[fieldKey] || [])])]
      .sort((a, b) => {
        if (a === HAS_DOCUMENT_FILTER_VALUE) return -1;
        if (b === HAS_DOCUMENT_FILTER_VALUE) return 1;
        if (a === EMPTY_FILTER_VALUE) return -1;
        if (b === EMPTY_FILTER_VALUE) return 1;
        return String(a).localeCompare(String(b), 'vi', { numeric: true, sensitivity: 'base' });
      });
  };
  const getDropdownFilterOptions = (fieldKey, filterKey) => (
    openFilterKey === filterKey ? getFilterOptions(fieldKey) : (columnFilters[fieldKey] || [])
  ).map(option => ({ value: option, label: getColumnFilterOptionLabel(option) }));

  const openCreate = () => { setProfileReadOnly(false); editingOriginal.current = null; setEditing({ ...emptyStudent, schoolYear: currentSchoolYear, enrollmentYear: String(new Date().getFullYear()) }); };
  const openEdit = (student) => { const original = students.find(item => item.id === student.id) || student; setProfileReadOnly(false); editingOriginal.current = original; setEditing(normalizeStudentRecord({ ...emptyStudent, ...original }, currentSchoolYear)); };
  const openView = (student) => { const original = students.find(item => item.id === student.id) || student; setProfileReadOnly(true); editingOriginal.current = original; setEditing(normalizeStudentRecord({ ...emptyStudent, ...original }, currentSchoolYear)); };
  const startQuickEdit = (student, field) => {
    if (!quickEditEnabled || quickEditSaving || studentTab !== 'current' || isImageOnlyView || !student?.id || !field?.key) return;
    if (DOCUMENT_FIELD_KEYS.has(field.key) || field.key === 'grade') return;
    if (centerAcademicByStudent.get(student.id)?.sources[field.key]) return;
    if (isReadOnlyStudentRecord(student)) {
      showNotification?.(readOnlyStudentMessage(student), 'error');
      return;
    }
    setQuickEdit({
      studentId: student.id,
      fieldKey: field.key,
      value: fieldValueForExport(student, field)
    });
  };
  const cancelQuickEdit = () => {
    if (!quickEditSaving) setQuickEdit(null);
  };
  const saveQuickEdit = async (student, field, rawValue) => {
    if (quickEditSaving || !student?.id || !field?.key) return;
    let nextValue = safePlainValue(rawValue);
    if (field.key === 'fullName') nextValue = formatStudentFullName(nextValue);
    if (field.key === 'birthDate') nextValue = formatDisplayDate(nextValue);
    if (field.key === 'schoolCode') nextValue = normalizeSchoolCode(nextValue) || 'UNKNOWN';
    if ((field.key === 'fullName' || field.key === 'className') && !nextValue) {
      showNotification?.(`${field.label} không được để trống.`, 'error');
      return;
    }
    const currentValue = fieldValueForExport(student, field);
    if (safePlainValue(currentValue) === nextValue) {
      setQuickEdit(prev => prev?.studentId === student.id && prev?.fieldKey === field.key ? null : prev);
      return;
    }
    const gradePatch = field.key === 'className' ? {
      grade: getGradeFromClass(nextValue),
      classHistory: { ...Object.fromEntries(studentAcademicContexts(student, safeStudents, currentSchoolYear)
        .map(record => [record.schoolYear, record.className])), ...student.classHistory, [student.schoolYear || currentSchoolYear]: nextValue }
    } : {};
    const schoolPatch = field.key === 'schoolCode'
      ? { schoolCode: nextValue, schoolName: getSchoolName(nextValue) }
      : {};
    const patch = {
      [field.key]: nextValue,
      ...gradePatch,
      ...schoolPatch,
      updatedAt: Date.now(),
      updatedBy: user?.uid || ''
    };
    setQuickEditSaving(true);
    try {
      const updatedStudent = await persistStudent({ ...student, ...patch });
      try {
        await syncPersistedStudent(updatedStudent);
        showNotification?.(`Đã sửa ${field.label} và cập nhật Sheet.`);
      } catch (sheetError) {
        showNotification?.(`Đã sửa ${field.label} trong database, nhưng Sheet chưa cập nhật: ${sheetError.message}`, 'error');
      }
      postAppsScript({
        action: 'writeAuditLog',
        auditAction: 'sua_nhanh_ho_so_hoc_sinh',
        actor: user?.uid || 'Admin',
        details: { studentId: student.id, fieldKey: field.key, before: currentValue, after: nextValue }
      }).catch(() => undefined);
      setQuickEdit(prev => prev?.studentId === student.id && prev?.fieldKey === field.key ? null : prev);
    } catch (error) {
      showNotification?.(`Chưa sửa được ${field.label}: ${error.message}`, 'error');
    } finally {
      setQuickEditSaving(false);
    }
  };
  const closeEdit = () => {
    setEditing(null);
    setProfileReadOnly(false);
    setDocumentViewer(null);
    setUploadingDocumentKey('');
  };
  const updateEditingField = (key, value) => {
    if (profileReadOnly) return;
    setEditing(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      if (key === 'schoolCode') {
        next.schoolCode = normalizeSchoolCode(value) || 'UNKNOWN';
        next.schoolName = getSchoolName(next.schoolCode);
      }
      if (key === 'className') {
        next.grade = getGradeFromClass(value);
        if (!prev.entryGrade) next.entryGrade = getGradeFromClass(value);
      }
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
      .filter(student => !(studentTab === 'registrations' && student.duplicateReason && !student.registrationSyncPending))
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
      .filter(student => belongsToEducationLevel(student, educationLevel))
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
      const result = await processRecords(targets, student => persistStudent({ ...rawStudents.find(item => item.id === student.id), fullName: student.nextName }));
      reportStudentBatch(result, 'Chuẩn hóa tên');
    } catch (error) {
      showNotification?.(`Chưa chuẩn hóa được tên học sinh: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const backfillCurrentYearStudentGrades = async () => {
    const rawStudents = Array.isArray(students) ? students : [];
    const targets = rawStudents
      .filter(student => belongsToEducationLevel(student, educationLevel))
      .filter(student => String(student.schoolYear || currentSchoolYear) === String(currentSchoolYear))
      .map(student => ({ student, grade: getGradeFromClass(student.className || student.grade || '') }))
      .filter(({ student, grade }) => student.id && grade && String(student.grade || '') !== String(grade));

    if (!targets.length) {
      showNotification?.(`Các hồ sơ năm ${currentSchoolYear} đã có cột Khối chính xác.`);
      return;
    }
    if (!window.confirm(`Bổ sung Khối cho ${targets.length} học sinh năm ${currentSchoolYear} trong database và Google Sheet?`)) return;
    setIsSaving(true);
    setSheetSyncStatus(prev => ({ ...prev, phase: 'syncing', completed: 0, total: targets.length, failed: 0 }));
    let sheetErrorCount = 0;
    let completedCount = 0;
    try {
      const outcome = await processRecords(targets, async ({ student, grade }) => {
        const savedStudent = await persistStudent({ ...student, grade }, { expected: student });
        try {
          await syncPersistedStudent(savedStudent);
        } catch {
          sheetErrorCount += 1;
        }
        return savedStudent;
      }, progress => { completedCount = progress.completed; setSheetSyncStatus(prev => ({ ...prev, phase: 'syncing', completed: progress.completed, total: targets.length, failed: progress.failed + sheetErrorCount })); });
      let summary = {};
      try {
        summary = await loadStudentSheetSummary(currentSchoolYear);
      } catch {
        summary = {};
      }
      setSheetSyncStatus(prev => ({
        ...prev,
        ...summary,
        phase: sheetErrorCount || outcome.failed.length ? 'partial' : 'done',
        completed: targets.length,
        total: targets.length,
        failed: sheetErrorCount + outcome.failed.length
      }));
      if (sheetErrorCount || outcome.failed.length) {
        showNotification?.(`Đã bổ sung Khối cho ${outcome.succeeded.length}/${targets.length} hồ sơ; ${outcome.failed.length} hồ sơ chưa lưu và ${sheetErrorCount} dòng Sheet chờ thử lại. ${outcome.failed[0]?.error.message || ''}`, 'error');
      } else {
        showNotification?.(`Đã bổ sung Khối cho ${targets.length} hồ sơ trong database và Sheet.`);
      }
    } catch (error) {
      setSheetSyncStatus(prev => ({ ...prev, phase: 'partial', completed: completedCount, total: targets.length, failed: Math.max(1, sheetErrorCount) }));
      showNotification?.(`Chưa bổ sung được cột Khối: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const restoreCurrentYearClassSections = async () => {
    const getNumericClassName = (className = '') => String(className || '')
      .trim()
      .replace(/^lớp\s*/i, '')
      .replace(/\s+/g, '');
    const currentNumericStudents = yearStudents.filter(student => /^[1-9]$/.test(getNumericClassName(student.className)));
    const findPreviousStudent = (student, candidates = [], allowPreviousId = false) => {
      if (allowPreviousId && student.previousStudentId) {
        const linked = candidates.find(item => item.id === student.previousStudentId);
        if (linked) return linked;
      }
      const identityCode = String(student.identityCode || '').replace(/^'/, '').trim();
      if (/^\d{12}$/.test(identityCode)) {
        const matches = candidates.filter(item => String(item.identityCode || '').replace(/^'/, '').trim() === identityCode);
        if (matches.length === 1) return matches[0];
      }
      const accessCode = String(student.accessCode || student.studentCode || '').trim().toUpperCase();
      if (accessCode) {
        const matches = candidates.filter(item => String(item.accessCode || item.studentCode || '').trim().toUpperCase() === accessCode);
        if (matches.length === 1) return matches[0];
      }
      const fullName = normalizeVietnameseName(student.fullName || '');
      const birthDate = normalizeBirthDate(student.birthDate || '');
      if (fullName && birthDate) {
        const matches = candidates.filter(item => (
          normalizeVietnameseName(item.fullName || '') === fullName
          && normalizeBirthDate(item.birthDate || '') === birthDate
        ));
        if (matches.length === 1) return matches[0];
      }
      return null;
    };

    let previousSheetStudents = [];
    let sheetSourceError = '';
    try {
      const response = await loadRegistrationDataAction('listStudents', { schoolYear: previousSchoolYear });
      if (response?.success === false) throw new Error(response.message || 'Không đọc được Google Sheet.');
      previousSheetStudents = (Array.isArray(response.items) ? response.items : [])
        .filter(row => normalizeSchoolYearKey(row.schoolYear) === normalizeSchoolYearKey(previousSchoolYear))
        .map(row => normalizeStudentRecord(registrationToStudentData(row, previousSchoolYear), previousSchoolYear));
    } catch (error) {
      sheetSourceError = error.message || 'Không đọc được Google Sheet.';
    }

    const databaseTargets = currentNumericStudents.flatMap(student => {
      if (!student.id) return [];
      const previousStudent = findPreviousStudent(student, previousYearStudents, true)
        || findPreviousStudent(student, previousSheetStudents);
      const nextClassName = promoteSchoolClassName(previousStudent?.className);
      if (!nextClassName || !/^[1-9][A-Z]/.test(nextClassName)) return [];
      if (getGradeFromClass(nextClassName) !== getGradeFromClass(student.className)) return [];
      return [{ student, nextClassName }];
    });

    const unresolvedCount = currentNumericStudents.length - databaseTargets.length;
    if (!databaseTargets.length) {
      showNotification?.(currentNumericStudents.length
        ? `Có ${currentNumericStudents.length} hồ sơ lớp số nhưng không ghép chắc chắn được với lớp năm trước trên Sheet; dữ liệu được giữ nguyên.${sheetSourceError ? ` ${sheetSourceError}` : ''}`
        : `Năm ${currentSchoolYear} không có lớp đang bị mất hậu tố.`);
      return;
    }
    if (!window.confirm(`Khôi phục hậu tố lớp cho ${databaseTargets.length} hồ sơ từ dữ liệu năm ${previousSchoolYear}. ${unresolvedCount ? `${unresolvedCount} hồ sơ không ghép chắc chắn sẽ giữ nguyên. ` : ''}Thao tác này chỉ cập nhật database, giữ nguyên Sheet năm cũ làm nguồn đối chiếu.`)) return;

    setIsSaving(true);
    try {
      const outcome = await processRecords(databaseTargets, ({student,nextClassName}) => persistStudent({ ...student, className: nextClassName, grade: getGradeFromClass(nextClassName) }, { expected: student }));
      reportStudentBatch(outcome, 'Khôi phục hậu tố lớp');
      postAppsScript({
        action: 'writeAuditLog',
        auditAction: 'khoi_phuc_hau_to_lop_tu_nam_truoc',
        actor: user?.uid || 'Admin',
        details: { schoolYear: currentSchoolYear, sourceSchoolYear: previousSchoolYear, databaseCount: outcome.succeeded.length, sheetSourceCount: previousSheetStudents.length }
      }).catch(() => undefined);
      showNotification?.(
        `Đã khôi phục ${outcome.succeeded.length} hậu tố lớp từ dữ liệu năm ${previousSchoolYear}.${unresolvedCount ? ` ${unresolvedCount} hồ sơ chưa đủ căn cứ nên được giữ nguyên.` : ''}`
      );
    } catch (error) {
      showNotification?.(`Chưa khôi phục được hậu tố lớp: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const openSchoolYearPromotion = async (scope = '') => {
    setIsSaving(true);
    try {
      const preview = await buildSchoolYearPromotionPreview(scope);
      if (!preview.sourceStudentCount) {
        showNotification?.(`Chưa có học sinh trong năm học hệ thống ${preview.sourceSchoolYear || currentSchoolYear}.`, 'error');
        return;
      }
      if (!preview.targetSchoolYear) {
        showNotification?.('Năm học hiện tại chưa đúng định dạng để tạo năm học kế tiếp.', 'error');
        return;
      }
      setSchoolYearPromotionPreview(preview);
    } catch (error) {
      showNotification?.(`Chưa đọc được dữ liệu để xét lên lớp: ${error.message || 'lỗi không xác định'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmSchoolYearPromotion = async () => {
      const preview = schoolYearPromotionPreview;
    if (!preview?.canExecute || !onStartSchoolYearPromotion) return;
    const transitionCount = preview.transitions.length;
    const pendingReviewCount = preview.missingScores.length + preview.missingConduct.length + preview.invalidClasses.length;
    const description = preview.scope === 'graduation'
      ? `Xét lớp 9 năm ${preview.sourceSchoolYear}: ${preview.completions.length} học sinh TNTHCS năm ${preview.sourceSchoolYear.slice(5)}, ${transitionCount} hồ sơ ở lại lớp. ${pendingReviewCount} hồ sơ thiếu dữ liệu hoặc cần đối chiếu sẽ giữ nguyên.`
      : `Xét năm ${preview.sourceSchoolYear} sang ${preview.targetSchoolYear}: ${transitionCount} hồ sơ lên lớp/lưu ban, ${preview.completions.length} hồ sơ TNTHCS năm ${preview.sourceSchoolYear.slice(5)}.`;
    if (!window.confirm(`${description} Hệ thống sẽ sao lưu rồi ghi web và Google Sheet. Lớp và kết quả năm cũ được giữ. Bạn hãy hoàn tất chỉnh sửa Sheet trước khi xác nhận.`)) return;
    setIsSaving(true);
    try {
      const result = await onStartSchoolYearPromotion(preview);
      setSchoolYearPromotionPreview(null);
      const resultMessage = preview.scope === 'graduation'
        ? `Đã xét lớp 9: ${preview.completions.length} học sinh TNTHCS, ${preview.transitions.length} hồ sơ ở lại lớp.`
        : `Đã chuyển sang năm ${preview.targetSchoolYear}. ${result?.createdCount ?? preview.transitions.length} hồ sơ năm mới được cập nhật${preview.completions.length ? `, gồm ${preview.completions.length} hồ sơ TNTHCS` : ''}.`;
      showNotification?.(`${resultMessage}${pendingReviewCount ? ` ${pendingReviewCount} hồ sơ thiếu dữ liệu hoặc cần đối chiếu vẫn được giữ nguyên.` : ''}${(result?.skippedCount || 0) ? ` ${result.skippedCount} hồ sơ đã tồn tại nên không tạo lại.` : ''}`);
    } catch (error) {
      showNotification?.(`Chưa chuyển được năm học: ${error.message || 'lỗi không xác định'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const persistStudent = (student, options = {}) => {
    if (!belongsToEducationLevel(student, educationLevel)) return Promise.reject(new Error(`Chọn lớp thuộc cấp ${educationLabel(educationLevel)} trước khi lưu hồ sơ.`));
    const centerResults = studentCenterAcademicResults({ student, records: safeStudents, scorebooks: academicScorebooks,
      currentSchoolYear: systemSchoolYear || currentSchoolYear, attendance: profileAttendance, attendanceReady: attendanceReadyForResults, attendanceYears: loadedResultAttendanceYears });
    return saveStudentRecord(normalizeStudentRecord({ ...student, ...centerResults.fields }, currentSchoolYear), { codePrefix: getCodePrefix(student, currentSchoolYear), actor: user?.uid || 'Admin', expected: student.id ? students.find(item => item.id === student.id) : undefined, ...options });
  };
  const completeRegistrationSync = async (registration, student) => {
    if (!registration.rowNumber) throw new Error('Thiếu dòng đăng ký; cần đối soát trước khi đánh dấu.');
    await callSheetAction('markExistingRegistration', { rowNumber: registration.rowNumber, identityCode: student.identityCode || '', fullName: student.fullName || '', birthDate: student.birthDate || '', note: 'Da chuyen vao database. Ma hoc sinh: ' + student.accessCode });
  };
  const syncPersistedStudent = student => retryStudentSync(student.id, saved => syncStudentToSheet(saved, saved.schoolYear), { registrationComplete: completeRegistrationSync });
  const reportStudentBatch = (result, label) => showNotification?.(label + ': ' + result.succeeded.length + '/' + (result.succeeded.length + result.failed.length) + ' hồ sơ thành công, đồng bộ Sheet được xếp hàng.' + (result.failed.length ? ' Còn ' + result.failed.length + ' hồ sơ lỗi: ' + result.failed[0].error.message : ''), result.failed.length ? 'error' : 'success');
  const retrySheetJobs = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const total = yearStudents.filter(student => ['pending', 'failed', 'running'].includes(student.sheetSync?.status)).length;
    setSheetRetryStatus({ phase: 'running', completed: 0, total, succeeded: 0, failed: 0 });
    try { const result = await retryPendingStudentSync(yearStudents, saved => syncStudentToSheet(saved, saved.schoolYear), progress => setSheetRetryStatus({ ...progress, phase: 'running' }), { registrationComplete: completeRegistrationSync });
      const firstFailure = result.failed[0];
      const failureMessage = firstFailure ? (firstFailure.record.fullName || 'Học sinh') + (firstFailure.record.accessCode ? ' (' + firstFailure.record.accessCode + ')' : '') + ': ' + firstFailure.error.message : '';
      setSheetRetryStatus({ phase: 'done', completed: total, total, succeeded: result.succeeded.length, failed: result.failed.length, error: failureMessage });
      showNotification?.('Đồng bộ lại: ' + result.succeeded.length + ' thành công; ' + result.failed.length + ' còn lỗi.' + (result.failed.length ? ' ' + result.failed[0].error.message : ''), result.failed.length ? 'error' : 'success');
    } catch (error) {
      setSheetRetryStatus(current => ({ ...current, phase: 'done', error: error.message }));
      showNotification?.('Chưa đồng bộ được Sheet: ' + error.message, 'error');
    } finally { setIsSaving(false); }
  };

  const saveStudent = async () => {
  if (profileReadOnly) return;
 if (uploadingDocumentKey) { showNotification?.('Đang tải giấy tờ, chờ xong rồi lưu hồ sơ.', 'error'); return; }
 if (!safePlainValue(editing?.fullName) || !safePlainValue(editing?.className)) { showNotification?.('Cần nhập họ tên và lớp học.', 'error'); return; }
 setIsSaving(true);
 try {
  const payload = await persistStudent({ ...editing, fullName: safePlainValue(editing.fullName), className: safePlainValue(editing.className), schoolYear: editing.schoolYear || currentSchoolYear }, { allocateCode: !editing.accessCode, expected: editingOriginal.current || undefined });
  try { await syncPersistedStudent(payload); showNotification?.('Đã lưu hồ sơ và cập nhật Sheet.'); }
  catch (error) { showNotification?.('Đã lưu hồ sơ; đồng bộ Sheet đang chờ thử lại: ' + error.message, 'error'); }
  closeEdit();
 } catch(error) { showNotification?.('Chưa lưu được học sinh: ' + error.message, 'error'); }
 finally { setIsSaving(false); }
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

  const approveProfileField = async (request={},fieldKey='') => {
 if(!request.id||!request.studentId||!fieldKey)return;
 const before=resolveProfileRequestStudent(request);
 if(isReadOnlyStudentRecord(before)){showNotification?.(readOnlyStudentMessage(before),'error');return;}
 setIsSaving(true);
 try {
  const value=safePlainValue(request.changes?.[fieldKey]); const changes=sanitizeStudentChanges(request.changes);delete changes[fieldKey];
  const student=await persistStudent({...before,id:request.studentId,[fieldKey]:value,...(fieldKey==='className'?{grade:getGradeFromClass(value)}:{})},{profileDecision:{requestId:request.id,expectedChanges:request.changes,remainingChanges:changes}});
  hideProfileRequestFieldLocally(request.id,fieldKey);
  if(editing?.id===student.id)setEditing(prev=>prev?{...prev,[fieldKey]:value}:prev);
  try{await syncPersistedStudent(student);showNotification?.('Đã duyệt thông tin và đồng bộ Sheet.');}
  catch(error){showNotification?.('Đã duyệt thông tin; việc đồng bộ được giữ để thử lại: '+error.message,'error');}
 }catch(error){showNotification?.('Chưa duyệt được thông tin: '+error.message,'error');}
 finally{setIsSaving(false);}
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

  const toggleDropout = async student => {
 if (isSaving) return;
 setIsSaving(true);
 try {
  const isDropping = student.status !== 'dropped';
  const schoolYear = student.schoolYear || currentSchoolYear;
  const restoredClassName = student.dropoutPreviousClassName || '';
  const classHistory = { ...(student.classHistory || {}) };
  if (isDropping) delete classHistory[schoolYear];
  else if (restoredClassName) classHistory[schoolYear] = restoredClassName;
  const saved=await persistStudent({
   ...student,
   status: isDropping ? 'dropped' : 'active',
   dropoutPreviousClassName: isDropping ? (student.className || student.dropoutPreviousClassName || '') : '',
   classHistory,
   className: isDropping ? '' : restoredClassName,
   grade: isDropping ? '' : getGradeFromClass(restoredClassName)
  }, { reactivateDropout: !isDropping });
  setStatusFilter(['active']);
  try{await syncPersistedStudent(saved);showNotification?.(isDropping ? 'Đã đánh dấu bỏ học; lớp và khối năm nay đã để trống.' : 'Đã đưa học sinh trở lại lớp trước đó.');}
  catch(error){showNotification?.('Tình trạng đã cập nhật; đồng bộ Sheet đang chờ thử lại: '+error.message,'error');}
 }catch(error){showNotification?.('Chưa cập nhật được: '+error.message,'error');}
 finally{setIsSaving(false);}
};

  const removeStudent = async student => {
 if (!window.confirm('Xóa hồ sơ "' + student.fullName + '"? Bản hồ sơ được lưu lại để đối soát.')) return;
 setIsSaving(true);
 try {
  await onBeforeDangerousAction?.('truoc-xoa-hoc-sinh');
   await deleteStudentRecord(students.find(item => item.id === student.id) || student, user?.uid || 'Admin');
  showNotification?.('Đã xóa hồ sơ học sinh; bản đối soát được giữ.');
  try { await postAppsScript({action:'writeAuditLog',auditAction:'xoa_ho_so_hoc_sinh',actor:user?.uid || 'Admin',details:{studentId:student.id}}); }
  catch(error) { showNotification?.('Hồ sơ đã xóa; nhật ký Sheet chưa ghi được: ' + error.message, 'error'); }
 } catch(error) { showNotification?.('Chưa xóa được hồ sơ: ' + error.message, 'error'); }
 finally { setIsSaving(false); }
};

  const removeSelectedStudents = async () => {
 const targets=yearStudents.filter(student=>selectedIds.has(student.id));
 if(!targets.length || !window.confirm('Xóa ' + targets.length + ' hồ sơ đã chọn? Bản đối soát được giữ.')) return;
 setIsSaving(true);
 try {
  await onBeforeDangerousAction?.('truoc-xoa-nhieu-hoc-sinh');
   const result=await processRecords(targets,student=>deleteStudentRecord(students.find(item => item.id === student.id) || student,user?.uid || 'Admin'));
  setSelectedIds(new Set(result.failed.map(item=>item.record.id)));
  showNotification?.('Đã xóa ' + result.succeeded.length + '/' + targets.length + ' hồ sơ. ' + (result.failed.length ? result.failed.length + ' hồ sơ lỗi vẫn được chọn để thử tiếp: ' + result.failed[0].error.message : ''),result.failed.length?'error':'success');
  try { await postAppsScript({action:'writeAuditLog',auditAction:'xoa_nhieu_hoc_sinh',actor:user?.uid || 'Admin',details:{deletedIds:result.succeeded.map(item=>item.record.id),failedIds:result.failed.map(item=>item.record.id)}}); }
  catch(error) { showNotification?.('Kết quả xóa đã được giữ; nhật ký Sheet chưa ghi được: ' + error.message,'error'); }
 } catch(error) { showNotification?.('Chưa bắt đầu xóa: ' + error.message,'error'); }
 finally { setIsSaving(false); }
};

  const generateMissingCodes = async () => {
 const targets=yearStudents.filter(student=>!student.accessCode).sort(compareClassThenName);
 if(!targets.length){showNotification?.('Tất cả học sinh đã có mã.');return;}
 setIsSaving(true);
 try { const result=await processRecords(targets,student=>persistStudent(student,{allocateCode:true})); reportStudentBatch(result,'Cấp mã'); }
 finally{setIsSaving(false);}
};

  const regenerateAllCodes = async () => {
 const targets=[...yearStudents].sort(compareClassThenName);
 if(!targets.length || !window.confirm('Cấp mã đăng nhập mới cho ' + targets.length + ' học sinh? Định danh, điểm và bài làm được giữ; mã cũ không cấp cho học sinh khác.'))return;
 setIsSaving(true);
 try {await onBeforeDangerousAction?.('truoc-cap-lai-ma-hoc-sinh');const result=await processRecords(targets,student=>persistStudent({...student,accessCode:''},{allocateCode:true}));reportStudentBatch(result,'Cấp lại mã');}
 finally{setIsSaving(false);}
};

  const importFromPaste = async () => {
 const parsed=parseSheetPaste(importText,currentSchoolYear).sort(compareClassThenName);
 if(!parsed.length){showNotification?.('Chưa đọc được bảng. Hãy dán cả hàng tiêu đề.','error');return;}
 setIsSaving(true);
 try {
  const result=await processRecords(parsed,student=>persistStudent({...student,schoolYear:student.schoolYear||currentSchoolYear},{allocateCode:true,createOnly:true,id:stableRecordId('import',student.identityCode || (normalizeSearch(student.fullName)+'|'+student.birthDate),student.schoolYear||currentSchoolYear,getStudentSchoolCode(student))}));
  reportStudentBatch(result,'Nhập hồ sơ');
  if(!result.failed.length){setImportText('');setShowImport(false);}
 } finally {setIsSaving(false);}
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
      gradeFilter,
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
        student.status === 'dropped' ? 'Bỏ học' : isGraduatedStudent(student) ? 'TNTHCS' : 'Đang học',
        isGraduatedStudent(student) ? student.graduationYear : student.schoolYear || currentSchoolYear
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
    const classText = classFilter?.length ? `Lớp: ${classFilter.join(', ')}` : 'Lớp: tất cả lớp đang xem';

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

  async function loadPendingRegistrations() {
    if (registrationMutationRef.current) return;
    registrationRequestRef.current?.abort();
    const controller = new AbortController();
    registrationRequestRef.current = controller;
    setIsLoadingRegistrations(true);
    try {
      const payload = await loadRegistrationDataAction('listPending', {}, { signal: controller.signal, timeoutMs: 20000 });
      if (controller.signal.aborted || registrationRequestRef.current !== controller) return;
      const items = Array.isArray(payload.items) ? payload.items : [];
      const allItems = items.map(decorateRegistration);
      const visibleItems = allItems.filter(item => belongsToEducationLevel(registrationToStudentData(item, currentSchoolYear), educationLevel));
      const duplicateCount = visibleItems.filter(item => item.duplicateReason).length;
      setPendingRegistrations(allItems);
      onPendingRegistrationsLoaded?.(allItems);
      setSelectedRegistrationIds(new Set());
      showNotification?.(`Đã tải ${visibleItems.length} hồ sơ mới cần duyệt.${duplicateCount ? ` Có ${duplicateCount} hồ sơ trùng cần xử lý.` : ''}`);
    } catch (error) {
      if (!controller.signal.aborted && registrationRequestRef.current === controller) showNotification?.(error.message, 'error');
    } finally {
      if (!controller.signal.aborted && registrationRequestRef.current === controller) setIsLoadingRegistrations(false);
    }
  }

  const syncAllStudentsToSheet = async () => {
    if (!yearStudents.length) {
      showNotification?.('Chưa có học sinh để cập nhật Sheet.', 'error');
      return;
    }
    if (!window.confirm(`Cập nhật ${yearStudents.length} hồ sơ của năm ${currentSchoolYear} lên Google Sheet?`)) return;
    setIsSaving(true);
    setSheetSyncStatus(prev => ({ ...prev, phase: 'syncing', completed: 0, total: yearStudents.length, failed: 0 }));
    let successCount = 0;
    const errors = [];
    try {
      for (const student of yearStudents) {
        try {
          const queued = await persistStudent(student);
          await syncPersistedStudent(queued);
          successCount += 1;
        } catch (error) {
          errors.push(`${student.fullName || student.accessCode || 'Học sinh'}: ${error.message}`);
        }
        setSheetSyncStatus(prev => ({
          ...prev,
          phase: 'syncing',
          completed: successCount + errors.length,
          total: yearStudents.length,
          failed: errors.length
        }));
      }
      let summary = {};
      try {
        summary = await loadStudentSheetSummary(currentSchoolYear);
      } catch {
        summary = {};
      }
      setSheetSyncStatus(prev => ({
        ...prev,
        ...summary,
        phase: errors.length ? 'partial' : 'done',
        completed: yearStudents.length,
        total: yearStudents.length,
        failed: errors.length
      }));
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

  const openYearReconciliation = () => {
    if (!academicScorebooksReady) {
      showNotification?.('Chưa tải xong sổ điểm. Đợi tải xong rồi đối chiếu lớp.', 'error');
      return;
    }
    setYearReconciliationProgress('');
    setYearReconciliation(buildStudentYearReconciliation({ records: scopedStudents, scorebooks: academicScorebooks, targetSchoolYear: currentSchoolYear }));
  };

  const applyYearReconciliation = async (rows, approveNewDecisions = false) => {
    if (isSaving || yearReconciliationLock.current || !rows.length) return;
    if (approveNewDecisions && !window.confirm(`Duyệt ${rows.length} hồ sơ theo đủ điểm cả năm trước? Hãy kiểm tra từng dòng trong bảng đối chiếu trước khi xác nhận.`)) return;
    yearReconciliationLock.current = true;
    setIsSaving(true);
    let savedCount = 0, syncedCount = 0;
    const errors = [];
    try {
      for (const [index, item] of rows.entries()) {
        setYearReconciliationProgress(`Đang sửa lớp: ${index + 1}/${rows.length} · ${item.student.fullName}`);
        try {
          const original = students.find(student => student.id === item.student.id);
          if (!original || !sameData(normalizeStudentRecord(original, currentSchoolYear), item.student)) throw new Error('Hồ sơ đã thay đổi, mở lại bảng đối chiếu.');
          const saved = await persistStudent(reconciledStudentRecord(item), {
            ...(item.action === 'review' ? { academicDecision: { source: students.find(student => student.id === item.sourceStudent.id), scorebook: item.scorebook } } : {})
          });
          savedCount += 1;
          setYearReconciliation(previous => previous?.map(row => row.student.id === item.student.id
            ? { ...row, action: 'unchanged', currentClass: item.proposedClass, reason: 'Đã sửa lớp trên web; đang gửi Sheet.' } : row));
          await syncPersistedStudent(saved);
          syncedCount += 1;
          setYearReconciliation(previous => previous?.map(row => row.student.id === item.student.id
            ? { ...row, reason: 'Đã sửa lớp trên web và cập nhật Sheet.' } : row));
        } catch (error) { errors.push(`${item.student.fullName}: ${error.message}`); }
      }
      setYearReconciliationProgress(`Hoàn tất: đã sửa ${savedCount}/${rows.length} hồ sơ trên web; đã gửi Sheet ${syncedCount}. ${errors.length ? errors.join(' · ') : ''}`);
    } finally {
      yearReconciliationLock.current = false;
      setIsSaving(false);
    }
  };

  const syncStudentsFromSheet = async () => {
    if (isSaving || sheetImportLock.current) return;
    if (!window.confirm('Cập nhật thông tin hồ sơ từ Sheet cho năm đang xem? Giữ các quyết định lớp và kết quả đã xét trên web. Nếu Sheet đánh dấu bỏ học, web sẽ giữ trạng thái bỏ học, xóa lớp/khối hiện tại và loại hồ sơ khỏi xét nâng lớp. Bỏ qua các ô Sheet trống khác.')) return;
    sheetImportLock.current = true;
    setIsSaving(true);
    const progress = { phase: 'reading', completed: 0, total: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, classConflicts: 0, errors: [] };
    setSheetImportStatus({ ...progress });
    try {
      const response = await loadRegistrationDataAction('listStudents');
      const sheetRows = (Array.isArray(response.items) ? response.items : [])
        .map(row => sheetRecordForYear(row, currentSchoolYear)).filter(Boolean)
        .filter(row => belongsToEducationLevel(registrationToStudentData(row, currentSchoolYear), educationLevel));
      const comparison = buildSheetReconciliation(sheetRows.map(row => ({ ...normalizeStudentRecord(registrationToStudentData(row, currentSchoolYear), currentSchoolYear),
        rowNumber: row.rowNumber, sheetClassSource: row.sheetClassSource })), scopedStudents, currentSchoolYear);
      if (!sheetRows.length) {
        setSheetImportStatus({ ...progress, phase: 'done', message: 'Sheet không trả về hồ sơ nào cho năm đang xem.' });
        return;
      }
      let matchedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const errors = [];
      progress.phase = 'updating';
      progress.total = sheetRows.length;
      setSheetImportStatus({ ...progress });

      for (const [index, row] of sheetRows.entries()) {
        try {
        const reviewRow = comparison.rows[index];
        const sheetStudent = reviewRow.student;
        const hasCurrentClassName = isUsefulSheetValue(row.currentClassName || row.lopHienTai || row.current_class_name);
        const existing = reviewRow.existing;
        if (!existing?.id || ['ambiguous', 'year'].includes(reviewRow.action)) {
          skippedCount += 1;
          progress.skipped += 1;
          continue;
        }
        matchedCount += 1;
        const sheetMarkedDropped = sheetStudent.status === 'dropped';
        const keepDroppedStatus = sheetMarkedDropped || existing.status === 'dropped';
        if (!keepDroppedStatus && sheetClassConflict(existing, sheetStudent, hasCurrentClassName)) {
          progress.classConflicts += 1;
          progress.errors.push(`${existing.fullName}: giữ lớp ${existing.className}; Sheet ghi ${sheetStudent.className}. Dùng Đối chiếu lớp theo kết quả năm trước.`);
        }
        const changes = {};
        SHEET_TO_DATABASE_SYNC_FIELDS.forEach(key => {
          if (['schoolCode', 'schoolName'].includes(key) && getStudentSchoolCode(sheetStudent) === 'UNKNOWN') return;
          if (key === 'className') return;
          if (['entryGrade', 'enrollmentYear'].includes(key) && isUsefulSheetValue(existing[key])) return;
          // Centre results come from the scorebook; only declarations before entry grade can be imported.
          const resultGrade = key.match(/^(?:hocLuc|hanhKiem)Lop([6-9])$/)?.[1];
          if (resultGrade && Number(resultGrade) >= Number(getStudentEntryGrade(existing, currentSchoolYear))) return;
          const nextValue = key === 'classHistory'
            ? mergeStudentClassHistory(existing.classHistory, sheetStudent.classHistory)
            : key === 'birthDate'
            ? formatDisplayDate(sheetStudent[key] || '')
            : key === 'schoolCode' ? getStudentSchoolCode(sheetStudent)
            : key === 'schoolName' ? getSchoolName(getStudentSchoolCode(sheetStudent))
            : safePlainValue(sheetStudent[key]);
          if (key !== 'classHistory' && !isUsefulSheetValue(nextValue)) return;
          if (key === 'classHistory' && JSON.stringify(existing[key] || {}) === JSON.stringify(nextValue)) return;
          if (key !== 'classHistory' && safePlainValue(existing[key]) === nextValue) return;
          changes[key] = nextValue;
        });
        if (keepDroppedStatus) {
          const previousClassName = existing.dropoutPreviousClassName || existing.className
            || Object.entries(existing.classHistory || {}).find(([year]) => normalizeSchoolYearKey(year) === normalizeSchoolYearKey(currentSchoolYear))?.[1]
            || '';
          const classHistory = { ...(changes.classHistory || existing.classHistory || {}) };
          Object.keys(classHistory).forEach(year => {
            if (normalizeSchoolYearKey(year) === normalizeSchoolYearKey(currentSchoolYear)) delete classHistory[year];
          });
          if (existing.status !== 'dropped') changes.status = 'dropped';
          const dropoutYear = existing.dropoutYear || sheetStudent.dropoutYear || currentSchoolYear;
          if (existing.dropoutYear !== dropoutYear) changes.dropoutYear = dropoutYear;
          if (existing.className) changes.className = '';
          if (existing.grade) changes.grade = '';
          if (existing.dropoutPreviousClassName !== previousClassName) changes.dropoutPreviousClassName = previousClassName;
          if (JSON.stringify(existing.classHistory || {}) !== JSON.stringify(classHistory)) changes.classHistory = classHistory;
          // Compare persisted values too: display normalization may already hide a legacy class.
          const persisted = students.find(student => student.id === existing.id);
          if (persisted?.className || persisted?.grade || !sameData(persisted?.classHistory || {}, classHistory)) {
            Object.assign(changes, { className: '', grade: '', classHistory });
          }
        }
        const nextClassName = keepDroppedStatus ? '' : changes.className || existing.className || '';
        const derivedGrade = getGradeFromClass(nextClassName);
        const nextGrade = Object.prototype.hasOwnProperty.call(changes, 'grade') ? changes.grade : existing.grade;
        if (derivedGrade && String(nextGrade || '') !== String(derivedGrade)) changes.grade = derivedGrade;
        if (!Object.keys(changes).length) { progress.unchanged += 1; continue; }
        try {
          await persistStudent({ ...existing, ...changes });
          updatedCount += 1;
          progress.updated += 1;
        } catch (error) {
          errors.push(`${existing.fullName || existing.accessCode || 'Học sinh'}: ${error.message}`);
          progress.failed += 1;
          progress.errors.push(errors.at(-1));
        }
        } catch (error) {
          progress.failed += 1;
          progress.errors.push(`Dòng ${progress.completed + 1}: ${error.message}`);
        } finally {
          progress.completed += 1;
          setSheetImportStatus({ ...progress, errors: [...progress.errors] });
        }
      }
      setSheetImportStatus({ ...progress, errors: [...progress.errors], phase: progress.failed ? 'error' : 'done' });
      if (comparison.rows.some(row => row.action !== 'matched') || comparison.duplicateGroups.length) {
        setSheetReconciliation({ ...comparison, progress: 'Đã cập nhật thông tin các hồ sơ khớp. Tích chọn hồ sơ thiếu hoặc khác lớp bên dưới để áp dụng.' });
      }

      if (errors.length) {
        console.warn('Lỗi cập nhật database từ Sheet:', errors);
        showNotification?.(`Đã cập nhật ${updatedCount} hồ sơ, ${errors.length} hồ sơ lỗi. Khớp ${matchedCount}, bỏ qua ${skippedCount}.`, 'error');
      } else {
        showNotification?.(`Đã cập nhật database từ Sheet: ${updatedCount} hồ sơ. Khớp ${matchedCount}, bỏ qua ${skippedCount}.`);
      }
    } catch (error) {
      setSheetImportStatus({ ...progress, phase: 'error', message: error.message });
      showNotification?.(`Chưa đồng bộ được từ Sheet: ${error.message}`, 'error');
    } finally {
      sheetImportLock.current = false;
      setIsSaving(false);
    }
  };

  const openSheetReconciliation = async (mode = 'sheet') => {
    if (isSaving || sheetReconciliationLock.current) return;
    sheetReconciliationLock.current = true;
    setIsSaving(true);
    setSheetReconciliation({ rows: [], webOnly: [], duplicateGroups: studentDuplicateGroups(yearStudents, 'web'), schoolYear: currentSchoolYear, mode, loading: true });
    try {
      const response = await loadRegistrationDataAction('listStudents');
      const sheetStudents = (Array.isArray(response.items) ? response.items : []).map(row => {
        const projected = sheetRecordForYear(row, currentSchoolYear);
        return projected ? { ...normalizeStudentRecord(registrationToStudentData(projected, currentSchoolYear), currentSchoolYear), rowNumber: row.rowNumber, sheetClassSource: projected.sheetClassSource } : null;
      }).filter(student => student && belongsToEducationLevel(student, educationLevel));
      setSheetReconciliation({ ...buildSheetReconciliation(sheetStudents, scopedStudents, currentSchoolYear), mode, loading: false });
    } catch (error) {
      setSheetReconciliation(previous => ({ ...previous, loading: false, error: `Chưa đọc được Sheet: ${error.message}` }));
    } finally { sheetReconciliationLock.current = false; setIsSaving(false); }
  };

  const applySheetReconciliation = async selectedRows => {
    if (isSaving || sheetReconciliationLock.current || !selectedRows.length) return;
    if (sheetReconciliation?.schoolYear !== currentSchoolYear) { showNotification?.('Năm đang xem đã đổi. Mở lại đối chiếu Sheet.', 'error'); return; }
    const additions = selectedRows.filter(row => row.action === 'create').length;
    const classChanges = selectedRows.filter(row => row.action === 'class').length;
    const yearChanges = selectedRows.filter(row => row.action === 'year').length;
    if (!window.confirm(`Thêm ${additions} hồ sơ thiếu, cập nhật lớp ${classChanges} hồ sơ và sửa năm ${yearChanges} hồ sơ theo Sheet? Chỉ áp dụng các dòng đã tích chọn vào năm ${currentSchoolYear}.`)) return;
    sheetReconciliationLock.current = true;
    setIsSaving(true);
    let added = 0, changed = 0, repairedYears = 0, failed = 0;
    try {
      const snapshot = await getDocsFromServer(collection(db, 'artifacts', appId, 'public', 'data', 'students'));
      const latest = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      const latestSafe = latest.map(student => normalizeStudentRecord(student, currentSchoolYear));
      const fresh = buildSheetReconciliation(sheetReconciliation.rows.map(row => row.student), latestSafe, currentSchoolYear);
      for (const [index, requested] of selectedRows.entries()) {
        setSheetReconciliation(previous => ({ ...previous, progress: `Đang áp dụng ${index + 1}/${selectedRows.length} · ${requested.student.fullName}` }));
        try {
          const row = fresh.rows.find(item => item.key === requested.key);
          if (!row || row.action !== requested.action) throw new Error('Định danh hoặc hồ sơ vừa thay đổi. Mở lại đối chiếu Sheet trước khi áp dụng.');
          let saved;
          if (row.action === 'create') {
            const source = row.sourceStudent;
            const profile = { ...row.student };
            ['id', 'rowNumber', 'sheetClassSource'].forEach(key => delete profile[key]);
            const input = { ...profile, accessCode: profile.accessCode || source?.accessCode || '',
              previousStudentId: source?.id || '', ...(source ? { studentKey: source.studentKey || source.accessCode || source.id } : {}),
              classHistory: mergeStudentClassHistory(source?.classHistory, profile.classHistory), schoolYear: currentSchoolYear };
            if (source?.className) input.classHistory[source.schoolYear] = source.className;
            if (input.className) input.classHistory[currentSchoolYear] = input.className;
            const identity = source?.studentKey || source?.accessCode || source?.id || input.accessCode || input.identityCode || `${normalizeVietnameseName(input.fullName)}|${normalizeBirthDate(input.birthDate)}`;
            saved = await persistStudent(input, { createOnly: true, allocateCode: !input.accessCode,
              id: stableRecordId(source ? 'promotion' : 'sheet-import', identity, currentSchoolYear, getStudentSchoolCode(input)) });
            added += 1;
          } else if (row.action === 'year') {
            if (!sameData(row.existing, requested.existing)) throw new Error('Hồ sơ web vừa thay đổi. Mở lại đối chiếu trước khi sửa năm.');
            const profile = { ...row.student };
            ['id', 'rowNumber', 'sheetClassSource'].forEach(key => delete profile[key]);
            const entryYear = profileSchoolYear(profile.enrollmentYear);
            const history = mergeStudentClassHistory(row.existing.classHistory, profile.classHistory);
            Object.keys(history).forEach(year => { if (profileSchoolYear(year) < entryYear) delete history[year]; });
            if (profile.className) history[currentSchoolYear] = profile.className;
            const previous = latest.find(student => student.id === row.existing.previousStudentId);
            const previousStudentId = previous && profileSchoolYear(previous.schoolYear) >= entryYear
              && profileSchoolYear(previous.schoolYear) < currentSchoolYear ? previous.id : '';
            saved = await persistStudent({ ...row.existing, ...profile, id: row.existing.id, previousStudentId,
              accessCode: row.existing.accessCode || profile.accessCode, schoolYear: currentSchoolYear, classHistory: history },
            { expected: latest.find(student => student.id === row.existing.id) });
            repairedYears += 1;
          } else {
            if (!sameData(row.existing, requested.existing)) throw new Error('Hồ sơ trên web vừa thay đổi. Mở lại đối chiếu trước khi đổi lớp.');
            saved = await persistStudent({ ...row.existing, className: row.student.className, grade: getGradeFromClass(row.student.className),
              ...(isGraduatedStudent(row.student) ? { graduationYear: row.student.graduationYear || currentSchoolYear.slice(0, 4),
                completionStatus: row.student.completionStatus || 'completed_grade_9', completionSchoolYear: row.student.completionSchoolYear || previousSchoolYear } : {}),
              classHistory: { ...(row.existing.classHistory || {}), [currentSchoolYear]: row.student.className } },
            { expected: latest.find(student => student.id === row.existing.id) });
            changed += 1;
          }
          setSheetReconciliation(previous => ({ ...previous, rows: previous.rows.map(item => item.key === requested.key
            ? { ...item, action: 'saved', existing: saved, reason: 'Đã lưu lên web; đồng bộ Sheet được xếp hàng.' } : item) }));
        } catch (error) {
          failed += 1;
          setSheetReconciliation(previous => ({ ...previous, rows: previous.rows.map(item => item.key === requested.key ? { ...item, reason: `Chưa lưu: ${error.message}` } : item) }));
        }
      }
      setSheetReconciliation(previous => ({ ...previous, progress: `Hoàn tất: thêm ${added}, cập nhật lớp ${changed}, lỗi ${failed}. Đã sửa năm ${repairedYears} hồ sơ. Các hồ sơ lỗi vẫn được giữ để bạn đối chiếu.` }));
    } catch (error) { setSheetReconciliation(previous => ({ ...previous, error: error.message })); }
    finally { sheetReconciliationLock.current = false; setIsSaving(false); }
  };

  const registrationToStudent = (registration = {}) => registrationToStudentData(registration, currentSchoolYear);

  const removePendingRegistrationLocally = (registration = {}) => {
    const tempId = safePlainValue(registration.tempId || registration.id);
    setPendingRegistrations(prev => prev.filter(item => safePlainValue(item.tempId || item.id) !== tempId));
    onRegistrationsResolved?.([registration]);
    setSelectedRegistrationIds(prev => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });
  };

  const beginRegistrationMutation = () => {
    if (isSaving || registrationMutationRef.current) return false;
    registrationMutationRef.current = true;
    registrationRequestRef.current?.abort();
    setIsLoadingRegistrations(false);
    setIsSaving(true);
    return true;
  };

  const markExistingRegistration = async (registration = {}) => {
    if (isSaving || registrationMutationRef.current) return;
    const duplicate = findRegistrationDuplicate(registration);
    const existingStudent = duplicate?.student || safeStudents.find(student => student.id === registration.duplicateStudentId);
    if (!existingStudent?.id) {
      showNotification?.('Chưa tìm thấy học sinh đã có trong database để cập nhật.', 'error');
      return;
    }
    const identityCode = String(registration.identityCode || registration.maDinhDanh || '').replace(/^'/, '').trim();
    const shouldUpdateIdentity = /^\d{12}$/.test(identityCode) && identityCode !== String(existingStudent.identityCode || '').replace(/^'/, '').trim();
    if (shouldUpdateIdentity && !window.confirm(`Cập nhật mã định danh mới cho ${existingStudent.fullName || 'học sinh'} rồi đánh dấu dòng đăng ký là Đã có?`)) return;
    if (!shouldUpdateIdentity && !window.confirm(`Hồ sơ đã có trong danh sách học sinh: ${existingStudent.fullName || 'học sinh'}. Giữ nguyên hàng trên Google Sheet và đánh dấu Đã có để không hiện lại trong hồ sơ mới?`)) return;
    if (!beginRegistrationMutation()) return;
    try {
      if (shouldUpdateIdentity) {
        await persistStudent({ ...existingStudent, identityCode });
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
      registrationMutationRef.current = false;
      setIsSaving(false);
    }
  };

  const deletePendingRegistration = async (registration = {}) => {
    if (isSaving || registrationMutationRef.current) return;
    if (!window.confirm(`Từ chối hồ sơ của ${registration.fullName || 'học sinh này'}? Hàng đăng ký sẽ bị xóa khỏi Google Sheet. Thao tác này không thể hoàn tác trên website.`)) return;
    if (!beginRegistrationMutation()) return;
    try {
      await callSheetAction('deleteRegistration', {
        rowNumber: registration.rowNumber,
        fullName: registration.fullName || '',
        birthDate: registration.birthDate || '',
        identityCode: registration.identityCode || ''
      });
      removePendingRegistrationLocally(registration);
      showNotification?.('Đã từ chối hồ sơ và xóa hàng đăng ký khỏi Google Sheet.');
    } catch (error) {
      showNotification?.(`Chưa từ chối được hồ sơ: ${error.message}`, 'error');
    } finally {
      registrationMutationRef.current = false;
      setIsSaving(false);
    }
  };

  const approveRegistrations = async (registrations = []) => {
 if(isSaving||registrationMutationRef.current)return;
 const targets=registrations.length?registrations:reviewedRegistrations.filter(item=>selectedRegistrationIds.has(item.tempId));
 if(!targets.length){showNotification?.('Chưa chọn hồ sơ đăng ký.','error');return;}
 const valid=targets.filter(item=>item.registrationSyncPending||!findRegistrationDuplicate(item));
 if(!valid.length){showNotification?.('Hồ sơ trùng với danh sách học sinh trên website. Hãy đối chiếu và chọn Cập nhật/Đã có để giữ hàng trên Sheet.','error');return;}
 if(!beginRegistrationMutation())return;
 try {
  const result=await processRecords(valid,async registration=>{
   const input=normalizeStudentRecord(registrationToStudent(registration),currentSchoolYear);
   assertStudentSchoolYear(input);
   if(input.schoolYear!==currentSchoolYear)throw new Error(`Hồ sơ đăng ký năm ${input.schoolYear}. Hãy chuyển năm admin sang ${input.schoolYear} để duyệt; không lưu vào năm ${currentSchoolYear}.`);
   if(!input.fullName||!input.className)throw new Error('Thiếu họ tên hoặc lớp.');
   const identity=registrationIdentity(registration);const targetId=stableRecordId('registration',identity,currentSchoolYear,getStudentSchoolCode(input));
   ['id','tempId','duplicateReason','duplicateStudentName','duplicateAccessCode'].forEach(key=>delete input[key]);
   let student=await persistStudent({...input,registrationId:identity},{id:targetId,createOnly:true,allocateCode:true,registration});
   if(!student.sheetSync?.jobId)student=await persistStudent(student,{registration});
   return {registration,student};
  });
  const synced=new Set(),syncErrors=[];
  for(const {value:{registration,student}} of result.succeeded){
   try{await syncPersistedStudent(student);synced.add(safePlainValue(registration.tempId||registration.id));}
   catch(error){syncErrors.push(error);}
  }
  setPendingRegistrations(prev=>prev.filter(item=>!synced.has(safePlainValue(item.tempId||item.id))));
  onRegistrationsResolved?.(valid.filter(item=>synced.has(safePlainValue(item.tempId||item.id))));
  setSelectedRegistrationIds(new Set(result.failed.map(item=>item.record.tempId)));
  showNotification?.('Database: '+result.succeeded.length+'/'+valid.length+' hồ sơ; Sheet: '+synced.size+'/'+result.succeeded.length+'. '+(result.failed.length?result.failed[0].error.message+' ':'')+(syncErrors.length?'Việc đồng bộ chưa xong được giữ trong hàng đợi.':''),result.failed.length||syncErrors.length?'error':'success');
 }catch(error){showNotification?.('Duyệt hồ sơ chưa hoàn tất: '+error.message,'error');}
 finally{registrationMutationRef.current=false;setIsSaving(false);}
};

  const approveAllRegistrations = () => {
    if (isSaving || isLoadingRegistrations || registrationMutationRef.current) return;
    const eligible = reviewedRegistrations.filter(item => item.registrationSyncPending || !item.duplicateReason);
    const skipped = reviewedRegistrations.length - eligible.length;
    if (!eligible.length) {
      showNotification?.('Không có hồ sơ mới đủ điều kiện duyệt; hãy kiểm tra các hồ sơ trùng.', 'error');
      return;
    }
    const message = `Duyệt tất cả ${eligible.length} hồ sơ đăng ký đủ điều kiện?${skipped ? `\n${skipped} hồ sơ có dấu hiệu trùng sẽ được bỏ qua.` : ''}`;
    if (!window.confirm(message)) return;
    approveRegistrations(eligible);
  };
  const approvableRegistrationCount = studentTab === 'registrations'
    ? reviewedRegistrations.filter(item => item.registrationSyncPending || !item.duplicateReason).length
    : 0;

  const approveAllProfileRequests = async () => {
    if (isSaving || profileBatchLock.current || !profileRequests.length) return;
    profileBatchLock.current = true;
    setIsSaving(true);
    let screenUnlocked = false;
    const total = profileRequests.length;
    setProfileBatchStatus({ phase: 'saving', total, completed: 0, succeeded: 0, failed: 0 });
    try {
      const result = await approveProfileRequestGroups(groupProfileRequests(profileRequests), async group => {
        const before = safeStudents.find(student => student.id === group.studentId);
        if (!before) throw new Error('Không tìm thấy hồ sơ học sinh.');
        if (isReadOnlyStudentRecord(before)) throw new Error(readOnlyStudentMessage(before));
        const changes = sanitizeStudentChanges(group.changes);
        if (!Object.keys(changes).length) throw new Error('Yêu cầu không có thông tin hợp lệ.');
        if (changes.className) changes.grade = getGradeFromClass(changes.className);
        const student = await persistStudent({ ...before, ...changes, id: group.studentId }, {
          profileDecisions: group.requests.map(request => ({ requestId: request.id, expectedChanges: request.changes, remainingChanges: {} }))
        });
        const approvedIds = new Set(group.requests.map(request => request.id));
        setProfileRequests(current => current.filter(request => !approvedIds.has(request.id)));
        return student;
      }, progress => setProfileBatchStatus({ phase: 'saving', total, ...progress }));
      const succeeded = result.succeeded.reduce((count, item) => count + item.record.requests.length, 0);
      const failed = total - succeeded;
      const error = result.failed[0]?.error.message || '';
      // Each saved student already has a durable Sheet job; unlock the screen now.
      setIsSaving(false);
      screenUnlocked = true;
      const summary = { total, completed: total, succeeded, failed, error, syncTotal: result.succeeded.length };
      setProfileBatchStatus({ ...summary, phase: 'syncing', synced: 0 });
      const sync = await processRecords(result.succeeded, item => syncPersistedStudent(item.value), progress => {
        setProfileBatchStatus({ ...summary, phase: 'syncing', synced: progress.completed });
      });
      setProfileBatchStatus({ ...summary, phase: 'done', synced: sync.succeeded.length, syncFailed: sync.failed.length });
      showNotification?.('Đã duyệt ' + succeeded + '/' + total + ' yêu cầu.' + (failed ? ' Còn ' + failed + ' yêu cầu chưa duyệt: ' + error : '') + (sync.failed.length ? ' Đồng bộ Sheet chưa xong được giữ để thử lại.' : ''), failed || sync.failed.length ? 'error' : 'success');
    } catch (error) {
      setProfileBatchStatus(current => ({ ...current, phase: 'error', error: error.message }));
      showNotification?.('Duyệt tất cả chưa hoàn tất: ' + error.message, 'error');
    } finally {
      profileBatchLock.current = false;
      if (!screenUnlocked) setIsSaving(false);
    }
  };

  const approveProfileRequest = async request => {
 if(!request?.studentId)return;const before=resolveProfileRequestStudent(request);
 if(isReadOnlyStudentRecord(before)){showNotification?.(readOnlyStudentMessage(before),'error');return;}
 const changes=sanitizeStudentChanges(request.changes);if(changes.className)changes.grade=getGradeFromClass(changes.className);
 if(!Object.keys(changes).length){showNotification?.('Yêu cầu không có thông tin hợp lệ.','error');return;}
 setIsSaving(true);
 try {
  const student=await persistStudent({...before,...changes,id:request.studentId},{profileDecision:{requestId:request.id,expectedChanges:request.changes,remainingChanges:{}}});
  hideProfileRequestFieldLocally(request.id);
  try{await syncPersistedStudent(student);showNotification?.('Đã duyệt hồ sơ và đồng bộ Sheet.');}
  catch(error){showNotification?.('Hồ sơ đã cập nhật; đồng bộ Sheet được giữ để thử lại: '+error.message,'error');}
 }catch(error){showNotification?.('Chưa duyệt được yêu cầu: '+error.message,'error');}
 finally{setIsSaving(false);}
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
  const renderQuickEditControl = (student, field) => {
    const value = quickEdit?.value ?? '';
    const updateValue = (nextValue) => setQuickEdit(prev => prev ? ({ ...prev, value: nextValue }) : prev);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelQuickEdit();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.currentTarget.blur();
      }
    };
    const controlClass = `h-8 w-full min-w-0 rounded border border-indigo-400 bg-white px-1 text-xs font-normal text-slate-800 shadow-sm outline-none ring-2 ring-indigo-100 disabled:opacity-60 ${STUDENT_LEFT_ALIGNED_FIELDS.has(field.key) ? 'text-left' : 'text-center'}`;
    const sharedProps = {
      autoFocus: true,
      value,
      disabled: quickEditSaving,
      onChange: event => updateValue(event.target.value),
      onBlur: event => saveQuickEdit(student, field, event.currentTarget.value),
      onKeyDown: handleKeyDown,
      className: controlClass
    };

    let control;
    if (field.key === 'schoolCode') {
      control = <select {...sharedProps}>{SCHOOL_OPTIONS.map(school => <option key={school.code} value={school.code}>{school.name}</option>)}</select>;
    } else if (field.key === 'className' && configuredClassOptions.length) {
      control = (
        <select {...sharedProps}>
          <option value="">Chọn lớp...</option>
          {[...new Set([student.className, ...configuredClassOptions].filter(Boolean))].map(className => <option key={className} value={className}>{className}</option>)}
        </select>
      );
    } else if (field.key === 'gender') {
      control = <select {...sharedProps}>{['', 'Nam', 'Nữ'].map(option => <option key={option || '-'} value={option}>{option || '-'}</option>)}</select>;
    } else if (ACADEMIC_RESULT_FIELD_KEYS.has(field.key)) {
      control = <select {...sharedProps}>{ACADEMIC_RESULT_OPTIONS.map(option => <option key={option || '-'} value={option}>{option || '-'}</option>)}</select>;
    } else {
      control = <input {...sharedProps} placeholder={field.key === 'birthDate' ? 'dd/mm/yyyy' : field.label} />;
    }

    return (
      <div className="relative min-w-0" onClick={event => event.stopPropagation()}>
        {control}
        {quickEditSaving && <Loader2 className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 animate-spin text-indigo-600" />}
      </div>
    );
  };
  const pendingSheetSyncCount = yearStudents.filter(student => ['pending', 'failed', 'running'].includes(student.sheetSync?.status)).length;
  const sheetSyncProgressPercent = sheetSyncStatus.total
    ? Math.round((sheetSyncStatus.completed / sheetSyncStatus.total) * 100)
    : 0;
  const closeUtilitiesMenu = () => {
    setShowUtilitiesMenu(false);
    utilitiesButtonRef.current?.focus();
  };
  const toggleUtilitiesMenu = () => {
    if (showUtilitiesMenu) {
      closeUtilitiesMenu();
      return;
    }
    const rect = utilitiesButtonRef.current?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(360, viewportWidth - 16);
    const left = Math.max(8, Math.min(viewportWidth - width - 8, (rect?.right || viewportWidth - 8) - width));
    const top = Math.max(8, Math.min((rect?.bottom || 80) + 6, viewportHeight - 180));
    setUtilitiesMenuPosition({ top, left, width, maxHeight: Math.max(0, viewportHeight - top - 8) });
    setShowUtilitiesMenu(true);
  };
  const utilityAction = action => () => { closeUtilitiesMenu(); action(); };
  const utilityGroups = [
    pendingSheetSyncCount > 0 && {
      id: 'pendingSync', label: 'Đồng bộ đang chờ', actions: [{
        id: 'retry', label: `Thử lại đồng bộ (${pendingSheetSyncCount})`,
        note: 'Gửi lại hồ sơ của năm đang xem đang chờ hoặc bị lỗi đồng bộ Sheet.',
        icon: <RefreshCw className="h-4 w-4 text-amber-600" />, disabled: isSaving,
        onClick: utilityAction(retrySheetJobs)
      }]
    },
    ['current', 'registrations'].includes(studentTab) && {
      id: 'review', label: 'Rà soát hồ sơ',
      content: <label className="mb-1 flex flex-col gap-1 px-2 py-1 text-xs text-slate-600">
        Lọc hồ sơ
        <select aria-label="Lọc hồ sơ" aria-describedby="student-issue-filter-note" value={quickIssueFilter} onChange={event => setQuickIssueFilter(event.target.value)} className="h-8 rounded border border-slate-200 bg-white px-2 text-sm text-slate-700">
          {QUICK_ISSUE_FILTERS.map(item => <option key={item.key} value={item.key}>{item.label} ({issueStats[item.key] ?? 0})</option>)}
        </select>
        <span id="student-issue-filter-note" className="text-[11px] leading-4 text-slate-500">Chỉ lọc danh sách đang xem; không sửa dữ liệu.</span>
      </label>,
      actions: studentTab === 'current' ? [{
        id: 'duplicates', label: 'Kiểm tra học sinh nghi trùng',
        note: 'Liệt kê hồ sơ cùng họ tên/ngày sinh, mã định danh hoặc mã học sinh trong cùng năm. Xem từng hồ sơ trước khi chọn xóa.',
        icon: <Users className="h-4 w-4 text-amber-600" />, disabled: isSaving,
        onClick: utilityAction(() => openSheetReconciliation('duplicates'))
      }, {
        id: 'missingInfo', label: 'Lập danh sách thông tin còn thiếu',
        note: 'Tạo nội dung để copy cho học sinh đã chọn, hoặc danh sách đang lọc.',
        icon: <ClipboardCheck className="h-4 w-4 text-orange-600" />,
        onClick: utilityAction(createMissingInfoReport)
      }] : [{
        id: 'reloadRegistrations', label: isLoadingRegistrations ? 'Đang tải hồ sơ…' : 'Tải lại hồ sơ đăng ký',
        note: 'Đọc lại hồ sơ chờ duyệt từ Sheet và kiểm tra trùng với danh sách học sinh.',
        icon: <RefreshCw className="h-4 w-4 text-emerald-600" />, disabled: isLoadingRegistrations || isSaving,
        onClick: utilityAction(loadPendingRegistrations)
      }, {
        id: 'approveSelected', label: `Duyệt hồ sơ đã chọn (${selectedRegistrationIds.size})`,
        note: 'Chỉ duyệt các hồ sơ đã tích chọn; hồ sơ có dấu hiệu trùng cần đối chiếu trước.',
        icon: <CheckCircle2 className="h-4 w-4 text-indigo-600" />, disabled: isSaving || selectedRegistrationIds.size === 0,
        onClick: utilityAction(() => approveRegistrations())
      }]
    },
    studentTab === 'current' && {
      id: 'common', label: 'Thường dùng', actions: [{
        id: 'mail', label: `Gửi thư cho học sinh đã chọn (${selectedIds.size})`,
        note: selectedIds.size ? 'Soạn thông báo vào hộp thư trên web của học sinh đã chọn.' : 'Tích chọn học sinh trước, rồi soạn thư gửi qua web.',
        icon: <Mail className="h-4 w-4 text-emerald-600" />, disabled: !onSendMailboxMessages || selectedIds.size === 0,
        onClick: utilityAction(() => openMailboxComposer(yearStudents.filter(student => selectedIds.has(student.id))))
      }, {
        id: 'codes', label: 'Quản lý mã học sinh',
        note: 'Cấp mã đăng nhập còn thiếu, hoặc cấp lại cả năm đang xem.',
        icon: <KeyRound className="h-4 w-4 text-amber-600" />, disabled: isSaving,
        onClick: utilityAction(() => setShowCodeChoiceModal(true))
      }, {
        id: 'promotion', label: 'Chuyển năm học và lên lớp',
        note: 'Xem trước lên lớp/lưu ban, rồi chuyển năm học hệ thống.',
        icon: <GraduationCap className="h-4 w-4 text-violet-700" />, disabled: isSaving || !onStartSchoolYearPromotion,
        onClick: utilityAction(openSchoolYearPromotion)
      }, {
        id: 'reconcileYear', label: 'Đối chiếu lớp theo kết quả năm trước',
        note: 'Khôi phục lớp đã xếp bị ghi đè; xem đủ điểm cả năm trước khi duyệt lên lớp/lưu ban cho năm đang xem.',
        icon: <GraduationCap className="h-4 w-4 text-sky-700" />, disabled: isSaving || !academicScorebooksReady,
        onClick: utilityAction(openYearReconciliation)
      }]
    },
    {
      id: 'sheet', label: studentTab === 'current' ? 'Nhập và đồng bộ Sheet' : 'Dữ liệu Sheet',
      note: 'Nhập mới, đối chiếu và cập nhật giữa web ↔ Sheet.', collapsible: studentTab === 'current',
      actions: [{
        id: 'openSheet', label: 'Mở bảng dữ liệu gốc',
        note: 'Mở Google Sheet ở tab mới để xem hoặc đối chiếu thông tin.',
        icon: <ExternalLink className="h-4 w-4 text-emerald-600" />,
        onClick: utilityAction(() => window.open(STUDENT_DATA_SHEET_URL, '_blank', 'noopener,noreferrer'))
      }, ...(studentTab === 'current' ? [{
        id: 'import', label: 'Nhập danh sách mới',
        note: `Dán bảng kèm hàng tiêu đề để tạo hồ sơ mới vào năm ${currentSchoolYear}.`,
        icon: <UploadCloud className="h-4 w-4 text-indigo-600" />,
        onClick: utilityAction(() => setShowImport(true))
      }, {
        id: 'fromSheet', label: 'Cập nhật hồ sơ từ Sheet',
        note: 'Cập nhật hồ sơ khớp; hiện bảng để bạn tích chọn thêm hồ sơ thiếu hoặc áp dụng lớp đúng cột năm trên Sheet.',
        icon: <RefreshCw className="h-4 w-4 text-blue-600" />, disabled: isSaving,
        onClick: utilityAction(syncStudentsFromSheet)
      }, {
        id: 'compareSheet', label: 'Đối chiếu Sheet / thêm học sinh thiếu',
        note: `So sánh số lượng từng lớp theo cột ${currentSchoolYear}. Xem tên người thiếu, khác lớp và nghi trùng trước khi áp dụng.`,
        icon: <ClipboardCheck className="h-4 w-4 text-sky-700" />, disabled: isSaving,
        onClick: utilityAction(() => openSheetReconciliation())
      }, {
        id: 'toSheet', label: 'Gửi hồ sơ trên web lên Sheet',
        note: 'Web → Sheet: toàn bộ năm đang xem, kể cả ngoài bộ lọc.',
        icon: <RefreshCw className="h-4 w-4 text-teal-600" />, disabled: isSaving || yearStudents.length === 0,
        onClick: utilityAction(syncAllStudentsToSheet)
      }] : [])]
    },
    studentTab === 'current' && {
      id: 'repair', label: 'Sửa dữ liệu cũ',
      note: 'Dùng khi dữ liệu cũ sai tên, khối hoặc mất ký hiệu lớp.', collapsible: true,
      actions: [{
        id: 'names', label: 'Chuẩn hóa họ tên cũ',
        note: 'Viết hoa đầu từ và bỏ khoảng trắng thừa trong hồ sơ của năm đang xem.',
        icon: <UserRound className="h-4 w-4 text-violet-600" />, disabled: isSaving || yearStudents.length === 0,
        onClick: utilityAction(normalizeCurrentYearStudentNames)
      }, {
        id: 'grades', label: 'Sửa khối theo lớp',
        note: 'Khớp lại cột Khối với lớp hiện tại, ví dụ 7A → khối 7; cập nhật cả Sheet.',
        icon: <GraduationCap className="h-4 w-4 text-cyan-700" />, disabled: isSaving || yearStudents.length === 0,
        onClick: utilityAction(backfillCurrentYearStudentGrades)
      }, {
        id: 'classSections', label: 'Khôi phục ký hiệu lớp',
        note: 'Đối chiếu năm trước để sửa lớp mất chữ (7 → 7A); chỉ sửa khi ghép chắc chắn.',
        icon: <GraduationCap className="h-4 w-4 text-indigo-700" />, disabled: isSaving || yearStudents.length === 0 || !previousSchoolYear,
        onClick: utilityAction(restoreCurrentYearClassSections)
      }]
    }
  ];
  const closeSearch = () => {
    setShowSearch(false);
    setQuery('');
    searchButtonRef.current?.focus();
  };

  const renderProfileField = field => {
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
        <span className="text-[10px] font-normal uppercase text-slate-400">{field.label}{field.required ? ' *' : ''}</span>
        {field.key === 'schoolCode' ? (
          <select disabled={profileReadOnly} value={normalizeSchoolCode(editing.schoolCode) || 'UNKNOWN'} onChange={(e) => updateEditingField(field.key, e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal bg-white focus:outline-none focus:border-indigo-400">
            {SCHOOL_OPTIONS.map(school => <option key={school.code} value={school.code}>{school.name}</option>)}
          </select>
        ) : field.key === 'grade' ? (
          <input value={getGradeFromClass(editing.className) || getGradeFromClass(editing.grade)} readOnly className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal bg-slate-50 text-slate-600" title="Khối được tự động xác định từ lớp học" />
        ) : field.key === 'className' && configuredClassOptions.length ? (
          <select disabled={profileReadOnly} value={editing[field.key] || ''} onChange={(e) => updateEditingField(field.key, e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal bg-white focus:outline-none focus:border-indigo-400">
            <option value="">Chọn lớp...</option>
            {[...new Set([editing[field.key], ...configuredClassOptions].filter(Boolean))].map(className => (
              <option key={className} value={className}>Lớp {className}</option>
            ))}
          </select>
        ) : editingCenterResults.sources[field.key] ? (
          <input value={editingCenterResults.fields[field.key] || ''} readOnly className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal bg-slate-50 text-slate-600" title={`Tự lấy kết quả cả năm ${editingCenterResults.sources[field.key].schoolYear} tại trung tâm`} />
        ) : ACADEMIC_RESULT_FIELD_KEYS.has(field.key) ? (
          <select disabled={profileReadOnly} value={editing[field.key] || ''} onChange={(e) => updateEditingField(field.key, e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal bg-white focus:outline-none focus:border-indigo-400">
            {ACADEMIC_RESULT_OPTIONS.map(option => <option key={option || '-'} value={option}>{option || '-'}</option>)}
          </select>
        ) : (
          <input readOnly={profileReadOnly} value={editing[field.key] || ''} list={listId} placeholder={placeholder} onChange={(e) => updateEditingField(field.key, e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal focus:outline-none focus:border-indigo-400" />
        )}
      </label>
    );
  };

  const databaseColumnWidths = [
    36, 32, 52, showPortraits ? 104 : 44,
    ...(studentTab === 'current' && !isImageOnlyView ? [96, 88] : []),
    ...visibleStudentFields.map(field => isImageOnlyView && DOCUMENT_FIELD_KEYS.has(field.key) ? 160 : studentColumnWidth(field)),
    ...(studentTab === 'registrations' ? [240] : !isImageOnlyView ? [132] : [])
  ];
  const databaseTableWidth = databaseColumnWidths.reduce((total, width) => total + width, 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white font-normal rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="shrink-0 bg-slate-50 p-2 border-b border-slate-200 flex flex-col gap-1.5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="flex min-w-0 items-center justify-between gap-2 lg:flex-1 lg:pr-4">
          <h3 className="font-normal text-slate-800 text-sm sm:text-base flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-600" /> Học sinh {educationLabel(educationLevel)} {currentSchoolYear}
          </h3>
          {onBack && (
            <button type="button" onClick={onBack} title="Đóng database" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-600 text-white shadow-sm sm:hidden">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-nowrap items-center justify-start gap-1 overflow-x-auto pb-1 sm:flex-wrap sm:gap-2 lg:pb-0 lg:justify-end lg:shrink-0">
          {onBack && (
            <button type="button" onClick={onBack} title="Đóng database" className="hidden sm:flex sm:order-last shrink-0 w-9 h-9 border border-slate-200 bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded items-center justify-center transition-colors">
              <X className="w-4 h-4" />
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
              ref={searchButtonRef}
              type="button"
              onClick={() => showSearch ? closeSearch() : setShowSearch(true)}
              aria-expanded={showSearch}
              aria-controls="student-database-search"
              className={`flex h-7 shrink-0 items-center gap-1 rounded border px-2 text-xs sm:h-9 sm:px-3 sm:text-sm ${showSearch ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <Search className="h-4 w-4" /> Tìm kiếm
            </button>
          )}
          {studentTab !== 'journey' && studentTab !== 'profileRequests' && (
            <button
              type="button"
              onClick={() => setShowColumns(prev => !prev)}
              className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal text-slate-700 hover:bg-slate-50 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal"
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
              className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-cyan-100 bg-cyan-50 px-2 text-[11px] font-normal text-cyan-700 hover:bg-cyan-100 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal"
            >
              <FileSpreadsheet className="h-4 w-4" /> Xuất
            </button>
          )}
          {studentTab === 'current' && (
            <button
              type="button"
              onClick={removeSelectedStudents}
              disabled={isSaving || selectedCount === 0}
              className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-rose-100 bg-rose-50 px-2 text-[11px] font-normal text-rose-600 hover:bg-rose-100 disabled:opacity-40 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal"
              title="Xóa các học sinh đang được tích chọn"
            >
              <Trash2 className="h-4 w-4" /> Xóa {selectedCount ? `(${selectedCount})` : ''}
            </button>
          )}
          <div className="relative shrink-0">
            <button
              ref={utilitiesButtonRef}
              type="button"
              onClick={toggleUtilitiesMenu}
              className="flex h-7 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-normal text-slate-700 shadow-sm hover:bg-slate-50 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal"
              aria-expanded={showUtilitiesMenu}
            >
              <FileText className="h-4 w-4 text-blue-600" />
              Tiện ích
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showUtilitiesMenu ? 'rotate-180' : ''}`} />
            </button>
            {showUtilitiesMenu && typeof document !== 'undefined' && createPortal(
              <StudentUtilitiesMenu position={utilitiesMenuPosition} groups={utilityGroups} onClose={closeUtilitiesMenu} />,
              document.body
            )}
          </div>
          {studentTab === 'current' && (
            <button type="button" onClick={openCreate} className="flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 text-[11px] font-normal text-white shadow-sm hover:bg-indigo-700 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm sm:font-normal">
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Thêm
            </button>
          )}
          {studentTab === 'registrations' && (
            <button type="button" onClick={approveAllRegistrations} disabled={isSaving || isLoadingRegistrations || approvableRegistrationCount === 0} title="Duyệt toàn bộ hồ sơ đủ điều kiện, bỏ qua hồ sơ trùng" className="flex h-7 shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2 text-[11px] text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:rounded-lg sm:px-3 sm:text-sm">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Duyệt tất cả ({approvableRegistrationCount})
            </button>
          )}
        </div>
        </div>
        {profileRequests.length > 0 && studentTab !== 'profileRequests' && (
          <div className="flex items-center">
            <div className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-normal uppercase text-rose-700">
              {profileRequests.length} yêu cầu sửa
            </div>
          </div>
        )}
        {studentTab === 'current' && sheetSyncStatus.phase === 'syncing' && (
          <div className="overflow-hidden rounded border border-cyan-100 bg-white" role="status">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600" />
              Đang đồng bộ Sheet: {sheetSyncStatus.completed}/{sheetSyncStatus.total}
            </div>
            <div className="h-1 bg-slate-100">
              <div className="h-full bg-cyan-500 transition-[width] duration-200" style={{ width: `${sheetSyncProgressPercent}%` }} />
            </div>
          </div>
        )}
      </div>

      {studentTab === 'current' && <StudentSheetImportStatus status={sheetImportStatus} onClose={() => setSheetImportStatus(null)} />}
      {sheetReconciliation && <StudentSheetReconciliation key={`${sheetReconciliation.schoolYear}:${sheetReconciliation.mode || 'sheet'}`}
        report={sheetReconciliation} webStudents={yearStudents} busy={isSaving} onApply={applySheetReconciliation}
        onClose={() => setSheetReconciliation(null)}
        onView={student => { setSheetReconciliation(null); openView(student); }}
        onSelectWeb={records => { setSheetReconciliation(null); setStudentTab('current'); setGradeFilter(null); setClassFilter(null); setStatusFilter(null);
          setColumnFilters({}); setQuery(''); setSelectedIds(new Set(records.map(student => student.id))); setQuickIssueFilter('selected'); }} />}
      {yearReconciliation && <StudentYearReconciliation rows={yearReconciliation} schoolYear={currentSchoolYear} busy={isSaving}
        progress={yearReconciliationProgress} onRestore={rows => applyYearReconciliation(rows)}
        onPriorRoster={text => { try { setYearReconciliation(restoreClassesFromPriorRoster(yearReconciliation, scopedStudents, text)); }
          catch (error) { setYearReconciliationProgress(error.message); } }}
        onApprove={rows => applyYearReconciliation(rows, true)} onClose={() => setYearReconciliation(null)} />}

      {showClassStats && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
          <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-indigo-50 px-3 py-2.5">
              <div>
                <div className="text-xs font-normal uppercase text-indigo-950">Thống kê học sinh theo lớp</div>
                <div className="text-[11px] font-normal text-indigo-700">
                  Tổng {classStats.reduce((sum, item) => sum + item.total, 0)} học sinh
                </div>
              </div>
              <button type="button" disabled={isSaving} onClick={() => { setShowClassStats(false); openSheetReconciliation(); }} className="ml-auto rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-sky-700 disabled:opacity-40">Đối chiếu với Sheet</button>
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
                      <td className="border border-slate-300 px-2 py-1.5 font-normal text-slate-900">Lớp {item.className}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal text-indigo-700">{item.total}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal text-emerald-700">{item.active}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal text-rose-700">{item.dropped}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal text-amber-700">{item.noCode}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal text-orange-700">{item.noIdentityCode}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="border border-slate-300 px-3 py-8 text-center font-normal text-slate-400">Chưa có dữ liệu lớp để thống kê.</td>
                    </tr>
                  )}
                  {classStats.length > 0 && (
                    <tr className="bg-indigo-50 text-indigo-950">
                      <td className="border border-slate-300 px-2 py-1.5 font-normal uppercase">Tổng</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal">{classStats.reduce((sum, item) => sum + item.total, 0)}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal">{classStats.reduce((sum, item) => sum + item.active, 0)}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal">{classStats.reduce((sum, item) => sum + item.dropped, 0)}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal">{classStats.reduce((sum, item) => sum + item.noCode, 0)}</td>
                      <td className="border border-slate-300 px-2 py-1.5 text-center font-normal">{classStats.reduce((sum, item) => sum + item.noIdentityCode, 0)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {schoolYearPromotionPreview && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-violet-100 bg-violet-50 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-normal text-violet-950">
                  <GraduationCap className="h-5 w-5 text-violet-700" /> Chuyển năm học và lên lớp
                </div>
                <div className="mt-1 text-xs font-normal text-violet-800">{schoolYearPromotionPreview.sourceSchoolYear} sang {schoolYearPromotionPreview.targetSchoolYear}</div>
              </div>
              <button type="button" onClick={() => !isSaving && setSchoolYearPromotionPreview(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm hover:bg-rose-600 hover:text-white" title="Đóng" disabled={isSaving}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <button type="button" disabled={isSaving} onClick={() => openSchoolYearPromotion()} className="rounded border px-3 py-2">Xét năm hệ thống {systemSchoolYear || currentSchoolYear}</button>
                {educationLevel !== 'primary' && <button type="button" disabled={isSaving} onClick={() => openSchoolYearPromotion('graduation')} className="rounded border px-3 py-2">Xét lớp 9 năm trước {getPreviousSchoolYear(systemSchoolYear || currentSchoolYear)}</button>}
              </div>
              {schoolYearPromotionState?.sourceSchoolYear === schoolYearPromotionPreview.sourceSchoolYear
                && schoolYearPromotionState?.targetSchoolYear === schoolYearPromotionPreview.targetSchoolYear && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`mb-3 rounded-lg border p-3 text-sm font-normal ${schoolYearPromotionState.status === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-900' : schoolYearPromotionState.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                >
                  {schoolYearPromotionState.status === 'failed'
                    ? `Lần chuyển trước chưa hoàn tất (${schoolYearPromotionState.stage || 'không rõ bước'}): ${schoolYearPromotionState.message || 'Có thể chạy lại để đối soát và tiếp tục.'}`
                    : schoolYearPromotionState.status === 'success'
                      ? 'Lần chuyển năm học này đã hoàn tất và được ghi nhận.'
                      : `Đang ghi nhận trạng thái chuyển năm: ${schoolYearPromotionState.stage || 'đang xử lý'}. Nếu bị gián đoạn, có thể mở lại và chạy để tiếp tục.`}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-normal uppercase text-slate-500">Đang học</div><div className="mt-1 text-xl font-normal text-slate-900">{schoolYearPromotionPreview.activeStudentCount}</div></div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3"><div className="text-[10px] font-normal uppercase text-emerald-700">Lên lớp</div><div className="mt-1 text-xl font-normal text-emerald-800">{schoolYearPromotionPreview.promoted.length - schoolYearPromotionPreview.completions.length}</div></div>
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3"><div className="text-[10px] font-normal uppercase text-amber-700">Ở lại lớp</div><div className="mt-1 text-xl font-normal text-amber-800">{schoolYearPromotionPreview.repeated.length}</div></div>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3"><div className="text-[10px] font-normal uppercase text-blue-700">Hoàn thành lớp 9</div><div className="mt-1 text-xl font-normal text-blue-800">{schoolYearPromotionPreview.completions.length}</div></div>
                <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[10px] font-normal uppercase text-slate-500">Đã có năm mới</div><div className="mt-1 text-xl font-normal text-slate-700">{schoolYearPromotionPreview.alreadyPrepared.length}</div></div>
                <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[10px] font-normal uppercase text-slate-500">Nghỉ/bỏ học</div><div className="mt-1 text-xl font-normal text-slate-700">{schoolYearPromotionPreview.droppedStudentCount}</div></div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table aria-label="Danh sách xét lên lớp và tốt nghiệp" className="w-full border-collapse text-xs">
                  <thead className="bg-slate-50"><tr>{['Học sinh', 'Lớp cũ', 'Học lực', 'Hạnh kiểm', 'Lớp mới / Năm TN'].map(label => <th key={label} className="border p-2 text-left font-normal">{label}</th>)}</tr></thead>
                  <tbody>{[...schoolYearPromotionPreview.transitions, ...schoolYearPromotionPreview.completions, ...schoolYearPromotionPreview.alreadyPrepared].map(item => <tr key={item.student.id}>
                    <td className="border p-2">{item.student.fullName}<span className="block text-slate-500">{item.student.accessCode}</span></td>
                    <td className="border p-2 text-center">{item.sourceClassName}</td>
                    <td className="border p-2 text-center">{item.academicResult || '—'}</td>
                    <td className="border p-2 text-center">{item.conductResult || '—'}</td>
                    <td className="border p-2 text-center">{item.targetClassName}{item.graduationYear ? ` · ${item.graduationYear}` : ''}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              {schoolYearPromotionPreview.missingScores.length > 0 && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-normal text-rose-900">
                  {schoolYearPromotionPreview.scope === 'graduation' ? 'Chưa đủ căn cứ để xét tốt nghiệp' : 'Chưa thể chuyển năm'}: {schoolYearPromotionPreview.missingScores.length} học sinh chưa đủ kết quả cả năm; hồ sơ này sẽ được giữ nguyên.
                  <ul className="mt-2 list-disc pl-4">{schoolYearPromotionPreview.missingScores.map(item => <li key={item.student.id}>{item.student.fullName} ({item.student.accessCode}): {item.completedCount}/{item.requiredCount} môn.</li>)}</ul>
                </div>
              )}
              {schoolYearPromotionPreview.missingConduct.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-normal text-amber-900">
                  Chưa có căn cứ hạnh kiểm lớp 9 cho {schoolYearPromotionPreview.missingConduct.length} học sinh. Kiểm tra điểm danh hoặc kết quả đã chốt trước khi xét TNTHCS.
                  <ul className="mt-2 list-disc pl-4">{schoolYearPromotionPreview.missingConduct.map(student => <li key={student.id}>{student.fullName} ({student.accessCode})</li>)}</ul>
                </div>
              )}
              {schoolYearPromotionPreview.invalidClasses.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-normal text-amber-900">
                  Có {schoolYearPromotionPreview.invalidClasses.length} hồ sơ cần đối chiếu lớp hoặc quyết định năm mới: {schoolYearPromotionPreview.invalidClasses.map(student => student.fullName).join(', ')}.
                </div>
              )}
              {schoolYearPromotionPreview.scope === 'graduation' && (schoolYearPromotionPreview.missingScores.length || schoolYearPromotionPreview.missingConduct.length || schoolYearPromotionPreview.invalidClasses.length) > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-normal text-amber-900">
                  Chỉ cập nhật hồ sơ có đủ kết quả. Các hồ sơ thiếu điểm, thiếu dữ liệu điểm danh hoặc chưa khớp lớp sẽ giữ nguyên để đối chiếu sau.
                </div>
              )}
              {schoolYearPromotionPreview.scope !== 'graduation' && !schoolYearPromotionPreview.missingScores.length && !schoolYearPromotionPreview.missingConduct.length && !schoolYearPromotionPreview.invalidClasses.length && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-normal text-emerald-900">
                  Tất cả hồ sơ cần chuyển đã có kết quả để xét. Hệ thống sẽ sao lưu, tạo hoặc tiếp tục hồ sơ năm mới còn thiếu, ghi lịch sử lớp lên Google Sheet, rồi mới đổi năm học hệ thống.
                </div>
              )}
              <div className="mt-3 text-xs font-normal text-slate-500">Lịch sử lớp năm cũ được giữ lại và bổ sung cột năm mới trên Google Sheet. Nếu đồng bộ bị gián đoạn, dữ liệu đã ghi không bị tạo trùng khi chạy lại.</div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button type="button" onClick={() => setSchoolYearPromotionPreview(null)} disabled={isSaving} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-normal text-slate-700 hover:bg-slate-100 disabled:opacity-50">Hủy</button>
              <button type="button" onClick={confirmSchoolYearPromotion} disabled={isSaving || !schoolYearPromotionPreview.canExecute || !onStartSchoolYearPromotion} className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-normal ${schoolYearPromotionPreview.canExecute && !isSaving ? 'bg-violet-700 text-white shadow hover:bg-violet-800' : 'cursor-not-allowed bg-slate-200 text-slate-500'}`}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />} {isSaving ? 'Đang cập nhật...' : schoolYearPromotionPreview.scope === 'graduation' ? 'Sao lưu và cập nhật lớp 9' : 'Sao lưu và chuyển năm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheetRetryStatus && (
        <div role="status" aria-live="polite" className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal text-slate-700">
          {sheetRetryStatus.phase === 'running' ? 'Đang thử lại đồng bộ Sheet: ' + sheetRetryStatus.completed + '/' + sheetRetryStatus.total + ' hồ sơ.' : 'Đồng bộ Sheet: ' + sheetRetryStatus.succeeded + '/' + sheetRetryStatus.total + ' hồ sơ thành công.'}
          {sheetRetryStatus.failed > 0 && ' Còn ' + sheetRetryStatus.failed + ' hồ sơ lỗi, đã giữ để thử lại.'}
          {sheetRetryStatus.error && ' ' + sheetRetryStatus.error}
        </div>
      )}
      {studentTab === 'profileRequests' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3 bg-white">
          {(profileRequests.length > 0 || profileBatchStatus) && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal">
              <div className="text-slate-600">
                <div>{profileRequests.length} yêu cầu chờ duyệt · Cùng một thông tin, ưu tiên bản gửi mới nhất.</div>
                {profileBatchStatus && <div role="status" aria-live="polite" className="mt-1">
                  {profileBatchStatus.phase === 'saving'
                    ? 'Đang duyệt ' + profileBatchStatus.completed + '/' + profileBatchStatus.total + ' yêu cầu…'
                    : 'Đã duyệt ' + profileBatchStatus.succeeded + '/' + profileBatchStatus.total + ' yêu cầu.'}
                  {profileBatchStatus.phase === 'syncing' && ' Đang đồng bộ Sheet ' + profileBatchStatus.synced + '/' + profileBatchStatus.syncTotal + ' học sinh; bạn có thể tiếp tục thao tác.'}
                  {profileBatchStatus.phase === 'done' && profileBatchStatus.syncTotal > 0 && (profileBatchStatus.syncFailed ? ' Còn ' + profileBatchStatus.syncFailed + ' hồ sơ chờ đồng bộ lại Sheet.' : ' Đã đồng bộ Sheet.')}
                  {profileBatchStatus.failed > 0 && ' Còn ' + profileBatchStatus.failed + ' yêu cầu chưa duyệt.'}
                  {profileBatchStatus.error && ' ' + profileBatchStatus.error}
                </div>}
              </div>
              <button type="button" onClick={approveAllProfileRequests} disabled={isSaving || !profileRequests.length || ['saving', 'syncing'].includes(profileBatchStatus?.phase)} className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-2 text-xs font-normal text-white hover:bg-emerald-700 disabled:opacity-50">
                {profileBatchStatus?.phase === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Đồng ý tất cả yêu cầu
              </button>
            </div>
          )}
          {profileRequests.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-400 font-normal">
              Chưa có yêu cầu sửa hồ sơ nào.
            </div>
          ) : (
            <div className="space-y-3">
              {profileRequests.map(request => {
                const currentStudent = resolveProfileRequestStudent(request);
                return (
                  <div key={request.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                      <div>
                        <div className="font-normal text-slate-900">{request.studentName || currentStudent?.fullName || 'Học sinh'} <span className="text-xs text-slate-400">({request.accessCode || currentStudent?.accessCode || 'chưa có mã'})</span></div>
                        <div className="text-xs font-normal text-slate-500">Lớp {request.className || currentStudent?.className || '-'} - gửi lúc {request.createdAt ? new Date(request.createdAt).toLocaleString('vi-VN') : ''}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => approveProfileRequest(request)} disabled={isSaving || !currentStudent} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-normal shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                          <CheckCircle2 className="w-4 h-4" /> Đồng ý yêu cầu này
                        </button>
                        <button type="button" onClick={() => rejectProfileRequest(request)} disabled={isSaving} className="px-3 py-1.5 rounded bg-rose-50 text-rose-600 border border-rose-100 text-xs font-normal flex items-center gap-1.5 disabled:opacity-50">
                          <X className="w-4 h-4" /> Từ chối hết
                        </button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <ProfileChangeTable rows={profileChangeRows(request, currentStudent)} label={'Thay đổi hồ sơ ' + (request.studentName || currentStudent?.fullName || 'học sinh')} disabled={isSaving} onApprove={key => approveProfileField(request, key)} onReject={key => rejectProfileField(request, key)} />
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
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên, mã học sinh, ngày sinh, lớp..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-normal focus:outline-none focus:border-blue-400" />
            </div>
            <select value={journeyYearFilter} onChange={(e) => setJourneyYearFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal bg-white">
              <option value="">Tất cả năm học</option>
              {journeyYearOptions.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
            <select value={journeyClassFilter} onChange={(e) => setJourneyClassFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal bg-white">
              <option value="all">Tat ca lop</option>
              {journeyClassOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div className="shrink-0 px-3 py-1.5 border-b border-slate-100 bg-slate-50 text-center text-[10px] font-normal text-slate-500">
            Mỗi năm học gồm 3 cột: Lớp, Rèn luyện, HL (học lực). Dấu — nghĩa là chưa có kết quả được lưu. Nhấn đúp vào dòng để sửa hồ sơ.
          </div>
          {journeyRows.some(row => row.dropoutContinuation) && (
            <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-normal text-amber-900">
              ⚠ Có {journeyRows.filter(row => row.dropoutContinuation).length} hồ sơ đã đánh dấu nghỉ nhưng vẫn có hồ sơ đang học ở năm sau. Hãy kiểm tra xem học sinh đã tái nhập học chưa.
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="mx-auto min-w-[650px] table-fixed border-collapse border border-slate-200 text-left text-xs" style={{ width: Math.max(650, 302 + journeyYearOptions.length * 184) }}>
              <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                <tr className="text-left text-slate-500 uppercase font-normal">
                  <th rowSpan={2} className="sticky left-0 z-20 w-[230px] border border-slate-200 bg-white px-3 py-2">Học sinh</th>
                  <th rowSpan={2} className="w-[72px] border border-slate-200 px-1.5 py-2 text-center">Lớp hiện tại</th>
                  {journeyYearOptions.map(year => (
                    <th key={year} colSpan={3} className={`border border-slate-200 px-2 py-2 text-center ${year === journeyYearFilter ? 'bg-blue-50 text-blue-700' : ''}`}>{year}</th>
                  ))}
                </tr>
                <tr className="text-center text-[10px] font-normal uppercase text-slate-500">
                  {journeyYearOptions.map(year => (
                    <React.Fragment key={year}>
                      <th className={`w-[72px] border border-slate-200 px-1.5 py-1.5 ${year === journeyYearFilter ? 'bg-blue-50/70' : ''}`}>Lớp</th>
                      <th className={`w-[64px] border border-slate-200 px-1.5 py-1.5 ${year === journeyYearFilter ? 'bg-blue-50/70' : ''}`}>Rèn luyện</th>
                      <th className={`w-[48px] border border-slate-200 px-1.5 py-1.5 ${year === journeyYearFilter ? 'bg-blue-50/70' : ''}`}>HL</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journeyRows.length === 0 ? (
                  <tr>
                    <td colSpan={journeyYearOptions.length * 3 + 2} className="border border-slate-200 px-4 py-10 text-center text-slate-400 font-normal">
                      Chưa có học sinh đúng bộ lọc quá trình học này.
                    </td>
                  </tr>
                ) : journeyRows.map(row => (
                  <tr key={row.key} onDoubleClick={() => openEdit(row.student)} title="Nhấn đúp để sửa hồ sơ" className="border-b border-slate-100 hover:bg-blue-50/50 cursor-pointer">
                    <td className="sticky left-0 border border-slate-200 bg-white px-3 py-2 align-middle text-left">
                      <div className="flex min-w-0 items-center gap-2 text-left">
                        <div className="w-10 h-12 rounded-lg bg-indigo-50 border border-indigo-100 overflow-hidden flex items-center justify-center shrink-0">
                          <DriveImage url={row.student.portraitUrl} alt={row.student.fullName || 'Học sinh'} className="w-full h-full object-contain" fallback={<UserRound className="w-5 h-5 text-indigo-300" />} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`font-normal truncate ${isJourneyRowDropped(row, journeyYearFilter) ? 'text-rose-700 line-through' : 'text-slate-900'}`}>{row.student.fullName || 'Chưa có tên'}</div>
                          <div className="text-[10px] font-normal text-slate-500 truncate">Mã HS: {row.student.accessCode || '-'}</div>
                          <div className="text-[10px] font-normal text-slate-500 truncate">Vào: {row.entryYear || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td
                      className={`border border-slate-200 px-1.5 py-2 align-middle text-center font-normal ${row.latestStudent.status === 'dropped' ? 'text-rose-700 line-through' : 'text-blue-700'}`}
                      title={row.dropoutContinuation
                        ? `Đã nghỉ năm ${row.dropoutContinuation.droppedSchoolYear}, nhưng có hồ sơ tiếp tục năm ${row.dropoutContinuation.continuedSchoolYear}, lớp ${row.dropoutContinuation.className || '—'}. Kiểm tra tái nhập học.`
                        : `Lớp gần nhất: ${row.latestStudent.className || '—'}`}
                    >
                      {row.latestStudent.className || '—'}
                      {row.dropoutContinuation && (
                        <div className="mt-1 text-[9px] leading-tight font-normal text-rose-700" aria-label="Cần kiểm tra hồ sơ nghỉ nhưng có lớp năm sau">
                          ⚠ Kiểm tra
                        </div>
                      )}
                    </td>
                    {journeyYearOptions.map(year => {
                      const record = row.byYear.get(year);
                      const cell = getJourneyYearCell(record || {}, row.records);
                      const scorebookResult = record?.id ? journeyScorebookResults.get(record.id) : null;
                      const conductResult = scorebookResult?.conduct || cell.conduct || '';
                      const academicResult = scorebookResult?.academic || cell.academic || '';
                      const isDroppedRecord = record?.status === 'dropped';
                      return (
                        <React.Fragment key={year}>
                          <td className={`border border-slate-200 px-1.5 py-2 align-middle text-center font-normal ${year === journeyYearFilter ? 'bg-blue-50/60' : ''}`}>
                            {record ? (
                              <span className={`block truncate ${isDroppedRecord ? 'text-rose-700 line-through' : 'text-slate-700'}`} title={isDroppedRecord ? `Đã nghỉ · ${cell.className || '—'}` : cell.className || 'Chưa có lớp'}>
                                {cell.className || '—'}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className={`border border-slate-200 px-1.5 py-2 align-middle text-center font-normal ${year === journeyYearFilter ? 'bg-blue-50/60' : ''}`}>
                            <span className={conductResult ? 'text-slate-700' : 'text-slate-400'} title={scorebookResult?.conduct ? 'Rèn luyện lấy từ tổng kết năm học tại trung tâm' : conductResult ? 'Rèn luyện đã lưu trong hồ sơ học sinh' : 'Chưa có đánh giá rèn luyện được lưu'}>
                              {record ? conductResult || '—' : '—'}
                            </span>
                          </td>
                          <td className={`border border-slate-200 px-1.5 py-2 align-middle text-center font-normal ${year === journeyYearFilter ? 'bg-blue-50/60' : ''}`}>
                            <span className={academicResult ? 'text-slate-700' : 'text-slate-400'} title={scorebookResult?.academic ? 'Học lực tính từ sổ điểm năm học này' : cell.academic ? 'Học lực đã lưu trong hồ sơ học sinh' : 'Chưa có kết quả học lực được lưu'}>
                              {record ? academicResult || '—' : '—'}
                            </span>
                          </td>
                        </React.Fragment>
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
              <div className="flex items-center gap-1.5 text-[11px] font-normal uppercase text-cyan-900 sm:text-xs">
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
              <p className="hidden text-[11px] font-normal text-cyan-700 sm:block">{exportFormat ? 'Chọn phạm vi dữ liệu cần xuất.' : 'Chọn Excel để tải file hoặc PDF để tạo liên kết chia sẻ.'}</p>
            </div>
            <button type="button" onClick={() => { setShowExportChoice(false); setExportFormat(''); setExcelExportAction(''); setSharedPdfLink(''); setSharedSheetLink(''); }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-100 bg-white text-slate-600 sm:h-auto sm:w-auto sm:rounded-xl sm:px-3 sm:py-2" aria-label="Đóng"><X className="h-3.5 w-3.5" /></button>
          </div>
          {!exportFormat && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
              <button type="button" onClick={() => setExportFormat('excel')} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-white p-2 text-emerald-700 hover:bg-emerald-50 sm:min-h-20 sm:rounded-xl">
                <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-[10px] font-normal uppercase sm:text-xs">Excel (.xlsx)</span>
                <span className="text-[9px] font-normal text-slate-400">Tải file về máy</span>
              </button>
              <button type="button" onClick={() => setExportFormat('pdf')} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-blue-100 bg-white p-2 text-blue-700 hover:bg-blue-50 sm:min-h-20 sm:rounded-xl">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-[10px] font-normal uppercase sm:text-xs">PDF</span>
                <span className="text-[9px] font-normal text-slate-400">Tạo liên kết chia sẻ</span>
              </button>
            </div>
          )}
          {exportFormat === 'excel' && !excelExportAction && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
              <button type="button" onClick={() => setExcelExportAction('download')} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-white p-2 text-emerald-700 hover:bg-emerald-50 sm:min-h-20 sm:rounded-xl">
                <Download className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-[10px] font-normal uppercase sm:text-xs">Tải Excel</span>
                <span className="text-[9px] font-normal text-slate-400">Lưu file .xlsx về máy</span>
              </button>
              <button type="button" onClick={() => setExcelExportAction('sheet')} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-emerald-100 bg-white p-2 text-emerald-700 hover:bg-emerald-50 sm:min-h-20 sm:rounded-xl">
                <Share2 className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-[10px] font-normal uppercase sm:text-xs">Google Sheet</span>
                <span className="text-[9px] font-normal text-slate-400">Tạo liên kết chia sẻ</span>
              </button>
            </div>
          )}
          {exportFormat === 'excel' && excelExportAction === 'download' && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
              <button type="button" onClick={() => downloadExportList('current')} className="rounded-md bg-emerald-600 px-2 py-2.5 text-[9px] font-normal uppercase text-white sm:rounded-lg sm:px-3 sm:text-[10px]">Dữ liệu đang xem</button>
              <button type="button" onClick={() => downloadExportList('all')} className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-2.5 text-[9px] font-normal uppercase text-emerald-700 sm:rounded-lg sm:px-3 sm:text-[10px]">Đầy đủ tất cả cột</button>
            </div>
          )}
          {exportFormat === 'excel' && excelExportAction === 'sheet' && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
              <button type="button" onClick={() => shareGoogleSheetExportList('current')} disabled={isSharingSheet} className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-2.5 text-[9px] font-normal uppercase text-white disabled:opacity-60 sm:rounded-lg sm:px-3 sm:text-[10px]">
                {isSharingSheet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Dữ liệu đang xem
              </button>
              <button type="button" onClick={() => shareGoogleSheetExportList('all')} disabled={isSharingSheet} className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-2.5 text-[9px] font-normal uppercase text-emerald-700 disabled:opacity-60 sm:rounded-lg sm:px-3 sm:text-[10px]">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Đầy đủ tất cả cột
              </button>
            </div>
          )}
          {exportFormat === 'pdf' && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2">
              <button type="button" onClick={() => sharePdfExportList('current')} disabled={isSharingPdf} className="inline-flex items-center justify-center gap-1 rounded-md bg-blue-600 px-2 py-2.5 text-[9px] font-normal uppercase text-white disabled:opacity-60 sm:rounded-lg sm:px-3 sm:text-[10px]">
                {isSharingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Dữ liệu đang xem
              </button>
              <button type="button" onClick={() => sharePdfExportList('all')} disabled={isSharingPdf} className="inline-flex items-center justify-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 py-2.5 text-[9px] font-normal uppercase text-blue-700 disabled:opacity-60 sm:rounded-lg sm:px-3 sm:text-[10px]">
                <FileText className="h-3.5 w-3.5" /> Đầy đủ tất cả cột
              </button>
            </div>
          )}
        </div>
      )}

      {showExportChoice && exportFormat === 'pdf' && sharedPdfLink && (
        <div className="shrink-0 px-3 pb-3 -mt-2 border-b border-cyan-100 bg-cyan-50/50">
          <div className="rounded-xl border border-emerald-100 bg-white p-2 flex flex-col sm:flex-row gap-2">
            <input value={sharedPdfLink} readOnly className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal text-slate-700" />
            <button type="button" onClick={() => copyTextToClipboard(sharedPdfLink).then(copied => showNotification?.(copied ? 'Da copy link PDF.' : 'Chua copy duoc link PDF.', copied ? 'success' : 'error'))} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-normal uppercase">Copy link</button>
            <button type="button" onClick={() => window.open(sharedPdfLink, '_blank', 'noopener,noreferrer')} className="px-3 py-2 rounded-lg bg-white border border-emerald-100 text-emerald-700 text-[10px] font-normal uppercase">Mo link</button>
          </div>
        </div>
      )}

      {showExportChoice && exportFormat === 'excel' && excelExportAction === 'sheet' && sharedSheetLink && (
        <div className="shrink-0 px-3 pb-3 -mt-2 border-b border-emerald-100 bg-emerald-50/50">
          <div className="rounded-xl border border-emerald-100 bg-white p-2 flex flex-col sm:flex-row gap-2">
            <input value={sharedSheetLink} readOnly className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal text-slate-700" />
            <button type="button" onClick={() => copyTextToClipboard(sharedSheetLink).then(copied => showNotification?.(copied ? 'Đã copy liên kết Google Sheet.' : 'Chưa copy được liên kết.', copied ? 'success' : 'error'))} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-normal uppercase">Copy link</button>
            <button type="button" onClick={() => window.open(sharedSheetLink, '_blank', 'noopener,noreferrer')} className="px-3 py-2 rounded-lg bg-white border border-emerald-100 text-emerald-700 text-[10px] font-normal uppercase">Mở Sheet</button>
          </div>
        </div>
      )}

      {missingInfoReport && (
        <div className="shrink-0 border-b border-orange-100 bg-orange-50/60 p-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-normal uppercase text-orange-900">Nội dung thiếu thông tin để gửi nhóm</div>
                <div className="text-[11px] font-normal text-orange-700">Có thể sửa trực tiếp nội dung trước khi copy.</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => copyRichReportToClipboard(missingInfoReport).then(copied => showNotification?.(copied ? 'Đã copy nội dung, tên học sinh sẽ đậm nếu nơi dán hỗ trợ.' : 'Chưa copy được, thầy bôi đen trong khung để copy.', copied ? 'success' : 'error'))} className="rounded-xl bg-orange-600 px-3 py-2 text-[10px] font-normal uppercase text-white">
                  Copy
                </button>
                <button type="button" onClick={() => setMissingInfoReport('')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-normal uppercase text-slate-600">
                  Đóng
                </button>
              </div>
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              onInput={(event) => setMissingInfoReport(getEditableReportText(event.currentTarget))}
              className="max-h-[420px] min-h-[190px] overflow-y-auto rounded-xl border border-orange-100 bg-white p-3 text-sm leading-relaxed text-slate-800 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(missingInfoReportToHtml(missingInfoReport)) }}
            />
          </div>
        </div>
      )}

      {showColumns && (
        <div className="shrink-0 border-b border-slate-100 bg-white p-2 sm:p-4">
          <div className="mb-2 flex flex-col gap-1.5 sm:mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <div>
              <div className="text-[11px] font-normal uppercase text-slate-900 sm:text-xs">Cột hiển thị</div>
              <p className="hidden text-[11px] font-normal text-slate-500 sm:block">Dữ liệu vẫn lưu đầy đủ, thầy cô chỉ chọn cột cần nhìn để bảng gọn hơn.</p>
            </div>
            <div className="flex flex-wrap gap-1 sm:gap-2">
              <button type="button" onClick={() => setVisibleColumns(COMPACT_VISIBLE_COLUMNS)} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[9px] font-normal uppercase text-slate-600 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]">Gọn</button>
              <button type="button" onClick={() => { setShowDocumentPreviews(true); setVisibleColumns(IMAGE_ONLY_VISIBLE_COLUMNS); }} className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-[9px] font-normal uppercase text-emerald-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]">Chỉ ảnh</button>
              <button type="button" onClick={toggleAllVisibleColumns} className="rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1.5 text-[9px] font-normal uppercase text-indigo-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]">Tất cả</button>
              <button type="button" onClick={() => setVisibleColumns(typeof window !== 'undefined' && window.innerWidth < 640 ? MOBILE_VISIBLE_COLUMNS : DEFAULT_VISIBLE_COLUMNS)} className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-[9px] font-normal uppercase text-blue-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]">Mặc định</button>
              <button type="button" onClick={() => setShowColumns(false)} className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-normal uppercase text-slate-600 sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[10px]"><X className="w-3.5 h-3.5" /> Đóng</button>
            </div>
          </div>
          <div role="group" aria-label="Chọn cột hiển thị" className="grid max-h-[32dvh] grid-cols-[repeat(auto-fill,minmax(min(100%,170px),1fr))] content-start gap-1.5 overflow-y-auto sm:max-h-none sm:gap-2">
            {STUDENT_FIELDS.filter(field => !(educationLevel === 'primary' && ACADEMIC_RESULT_FIELD_KEYS.has(field.key))).map(field => (
              <label key={field.key} title={field.label} className={`flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-normal sm:text-[11px] ${visibleColumns.includes(field.key) ? 'bg-indigo-50 border-indigo-100 text-indigo-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                <input type="checkbox" checked={visibleColumns.includes(field.key)} disabled={field.key === 'fullName'} onChange={() => updateVisibleColumns(field.key)} className="shrink-0 accent-indigo-600" />
                <span className="min-w-0 truncate">{field.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {studentTab === 'current' && showImport && (
        <div className="shrink-0 p-4 border-b border-indigo-100 bg-indigo-50/40 space-y-3">
          <div className="text-xs font-normal text-indigo-900 uppercase">Nhập nhanh từ Google Sheet vào năm {currentSchoolYear}</div>
          <p className="text-[11px] text-indigo-700 font-normal">
            Mở Sheet, chọn hàng tiêu đề và các dòng học sinh, bấm Ctrl+C rồi dán vào khung dưới. Hệ thống sẽ tạo hồ sơ mới trên web và tự cấp mã học sinh.
          </p>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Dán dữ liệu copy từ Google Sheet vào đây..." className="w-full min-h-[130px] rounded-2xl border border-indigo-100 bg-white p-3 text-xs font-normal focus:outline-none focus:border-indigo-400" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowImport(false)} className="px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl text-xs font-normal">Đóng</button>
            <button type="button" onClick={importFromPaste} disabled={isSaving || !importText.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-normal disabled:opacity-60">Nhập danh sách</button>
          </div>
        </div>
      )}

      <>
      <div className="shrink-0 grid grid-cols-2 items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-700 sm:flex sm:flex-wrap">
        <label className="col-span-2 flex h-8 shrink-0 cursor-pointer items-center gap-2 sm:mr-1">
          <input type="checkbox" checked={showPortraits} onChange={event => setShowPortraits(event.target.checked)} aria-label="Hiện ảnh" className="h-4 w-4 accent-sky-700" />
          <span>Hiện ảnh</span>
        </label>
        {studentTab === 'current' && (
          <label className="col-span-2 flex h-8 shrink-0 cursor-pointer items-center gap-2 sm:mr-1" title="Bật để nhấn vào ô và sửa nhanh; tắt để xem hồ sơ bằng cách nhấn vào tên">
            <input type="checkbox" checked={quickEditEnabled} onChange={event => { setQuickEditEnabled(event.target.checked); setQuickEdit(null); }} aria-label="Chỉnh sửa nhanh" className="h-4 w-4 accent-indigo-600" />
            <span>Chỉnh sửa</span>
          </label>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">Khối:</span>
          <div className="min-w-0 flex-1 sm:w-40">
            <StudentFilterDropdown label="Khối" options={gradeOptions.map(grade => ({ value: grade, label: `Khối ${grade}` }))} value={gradeFilter} onChange={changeGradeFilter}
              open={openFilterKey === 'toolbar:grade'} onOpenChange={open => setOpenFilterKey(open ? 'toolbar:grade' : null)} />
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">Lớp:</span>
          <div className="min-w-0 flex-1 sm:w-40">
            <StudentFilterDropdown label="Lớp" options={filteredClassOptions.map(className => ({ value: className, label: className }))} value={classFilter} onChange={setClassFilter}
              open={openFilterKey === 'toolbar:class'} onOpenChange={open => setOpenFilterKey(open ? 'toolbar:class' : null)} />
          </div>
        </div>
        {studentTab === 'current' ? (
          <div className="col-span-2 flex min-w-0 items-center gap-2 sm:min-w-[260px]">
            <span className="shrink-0">Trạng thái:</span>
            <div className="min-w-0 flex-1">
              <StudentFilterDropdown label="Trạng thái" options={[{ value: 'active', label: 'Đang học' }, { value: 'dropped', label: 'Bỏ học' }, { value: 'completed', label: 'TNTHCS' }]} value={statusFilter} onChange={setStatusFilter}
                open={openFilterKey === 'toolbar:status'} onOpenChange={open => setOpenFilterKey(open ? 'toolbar:status' : null)} />
            </div>
          </div>
        ) : (
          <span className="col-span-2 text-xs text-slate-500">{duplicateRegistrationCount ? `${duplicateRegistrationCount} hồ sơ cần kiểm tra` : 'Hồ sơ đăng ký mới'}</span>
        )}
        <button type="button" onClick={filterCheckedStudents} title="Lọc học sinh đã chọn" aria-label="Lọc học sinh đã chọn" className={`flex h-8 w-8 items-center justify-center rounded border ${quickIssueFilter === 'selected' ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'}`}>
          <Filter className="h-4 w-4" />
        </button>
        {(gradeFilter != null || quickIssueFilter !== 'all' || classFilter != null || query || (studentTab === 'current' && (statusFilter?.length !== 1 || statusFilter[0] !== 'active')) || Object.values(columnFilters).some(value => value != null)) && (
          <button type="button" onClick={() => {
            setGradeFilter(null);
            setClassFilter(null);
            setStatusFilter(studentTab === 'current' ? ['active'] : null);
            setQuickIssueFilter('all');
            setColumnFilters({});
            setOpenFilterKey(null);
            setQuery('');
          }} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-600 hover:bg-slate-100">
            Xóa lọc
          </button>
        )}
      </div>
      {showSearch && (
        <div id="student-database-search" className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-2 py-2">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input autoFocus type="search" aria-label="Tìm học sinh" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') closeSearch(); }} placeholder="Tìm tên, lớp, mã..." className="h-8 w-full rounded border border-slate-300 pl-8 pr-2 text-sm focus:border-sky-500 focus:outline-none" />
          </div>
          <button type="button" onClick={closeSearch} aria-label="Đóng tìm kiếm" title="Đóng tìm kiếm" className="flex h-8 w-8 items-center justify-center rounded border border-slate-300 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showFilters && (
        <div className="shrink-0 px-3 pb-3 border-b border-slate-100 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {visibleStudentFields.map(field => (
              <div key={field.key} className="flex flex-col gap-1">
                <span className="text-[9px] font-normal uppercase text-slate-400">{field.label}</span>
                <StudentFilterDropdown label={field.label} options={getDropdownFilterOptions(field.key, `advanced:${field.key}`)}
                  value={columnFilters[field.key] ?? null} onChange={value => setColumnFilters(prev => ({ ...prev, [field.key]: value }))}
                  open={openFilterKey === `advanced:${field.key}`} onOpenChange={open => setOpenFilterKey(open ? `advanced:${field.key}` : null)} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setColumnFilters({})} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-normal uppercase text-slate-600">Xóa filter</button>
            <button type="button" onClick={() => { setShowFilters(false); setOpenFilterKey(null); }} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-[10px] font-normal uppercase text-slate-600">Đóng</button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className={`student-database-table w-full table-fixed border-collapse text-center text-xs ${showPortraits ? 'student-database-portrait-view' : ''} ${isImageOnlyView ? 'student-database-image-view' : ''}`} style={{ minWidth: databaseTableWidth }} aria-label="Database học sinh">
          <colgroup>
            {databaseColumnWidths.map((width, index) => <col key={index} style={{ width }} />)}
          </colgroup>
          <thead className="sticky top-0 bg-sky-700 border-b border-sky-800 z-10">
            <tr className="text-white font-normal">
              <th scope="col">STT</th>
              <th scope="col">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} className="w-4 h-4 accent-indigo-600" title="Tích tất cả dòng đang lọc" />
              </th>
              <th scope="col">Hồ sơ</th>
              <th scope="col">Ảnh</th>
              {studentTab === 'current' && !isImageOnlyView && (
                <>
                  <th scope="col">Mã học</th>
                  <th scope="col">Tình trạng</th>
                </>
              )}
              {visibleStudentFields.map(field => (
                <th key={field.key} scope="col" className={STUDENT_LEFT_ALIGNED_FIELDS.has(field.key) ? 'text-left' : 'text-center'}>
                   <div className={`student-column-heading ${STUDENT_LEFT_ALIGNED_FIELDS.has(field.key) ? 'justify-start' : 'justify-center'}`}>
                    {field.key === 'fullName' ? (
                      <button type="button" onClick={() => setSortMode('fullName')} className={`inline-flex min-w-0 items-center gap-1 rounded px-1 py-0.5 -ml-1 text-left ${sortMode === 'fullName' ? 'bg-white/20 text-white' : 'text-white hover:bg-white/10'}`} title="Sắp xếp theo tên gọi tiếng Việt">
                        <span className="student-column-label">{field.label}</span> <ArrowDownAZ className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    ) : field.key === 'className' ? (
                      <button type="button" onClick={() => setSortMode('className')} className={`inline-flex min-w-0 items-center gap-1 rounded px-1 py-0.5 ${sortMode === 'className' ? 'bg-white/20 text-white' : 'text-white hover:bg-white/10'}`} title="Sắp xếp theo khối/lớp rồi tên">
                        <span className="student-column-label">{field.label}</span> <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    ) : <span className="student-column-label">{isImageOnlyView ? (IMAGE_PREVIEW_FIELD_LABELS[field.key] || field.label) : field.label}</span>}
                    <StudentFilterDropdown compact label={field.label} options={getDropdownFilterOptions(field.key, `column:${field.key}`)}
                      value={columnFilters[field.key] ?? null} onChange={value => setColumnFilters(prev => ({ ...prev, [field.key]: value }))}
                      open={openFilterKey === `column:${field.key}`} onOpenChange={open => setOpenFilterKey(open ? `column:${field.key}` : null)} />
                  </div>
                </th>
              ))}
              {studentTab === 'current' ? (!isImageOnlyView && (
                <>
                  <th scope="col">Thao tác</th>
                </>
              )) : (
                <th scope="col" className="sticky right-0 z-20 border-l border-sky-600 bg-sky-700">Duyệt hồ sơ</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={visibleStudentFields.length + (studentTab === 'registrations' ? 5 : (isImageOnlyView ? 4 : 7))} className="text-center text-slate-400 font-normal">
                  {studentTab === 'current' ? 'Chưa có học sinh trong năm học hoặc bộ lọc này.' : 'Chưa có hồ sơ đăng ký mới cần duyệt trong bộ lọc này.'}
                </td>
              </tr>
            ) : filteredStudents.map((student, rowIndex) => (
              <tr key={student.id} className={`border-b border-slate-200 ${studentTab === 'registrations' && student.duplicateReason ? 'bg-amber-50/70 hover:bg-amber-50' : activeSelectedIds.has(student.id) ? 'bg-sky-50 hover:bg-sky-100' : 'even:bg-slate-50 hover:bg-sky-50'} ${student.status === 'dropped' ? 'bg-rose-50/40 opacity-75 line-through decoration-rose-400 decoration-2' : ''}`}>
                <td className="text-center tabular-nums text-slate-500">{rowIndex + 1}</td>
                <td className="px-4 py-3 align-middle">
                  <input type="checkbox" disabled={studentTab === 'registrations' && Boolean(student.duplicateReason) && !student.registrationSyncPending} checked={activeSelectedIds.has(student.id)} onChange={() => toggleSelectStudent(student.id)} className="w-4 h-4 accent-indigo-600 disabled:opacity-40" aria-label={`Chọn ${student.fullName}`} />
                </td>
                <td className="text-center">
                   <button type="button" onClick={() => studentTab === 'registrations' ? setEditing({ ...emptyStudent, ...student, id: '' }) : (quickEditEnabled ? openEdit(student) : openView(student))} className="inline-flex h-7 w-8 items-center justify-center rounded border border-slate-200 bg-white text-sky-700 hover:border-sky-300 hover:bg-sky-50" title={`Mở hồ sơ ${student.fullName}`} aria-label={`Mở hồ sơ ${student.fullName}`}>
                    <FileText className="h-4 w-4" />
                  </button>
                </td>
                <td className="text-center">
                  <button type="button" onClick={() => setAvatarStudent(student)} className={`inline-flex items-center justify-center overflow-hidden rounded border hover:bg-sky-50 ${showPortraits ? 'h-28 w-[84px]' : 'h-7 w-8'} ${student.portraitUrl ? 'border-slate-200 bg-white text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`} title={student.portraitUrl ? `Xem ảnh ${student.fullName}` : `${student.fullName} chưa có ảnh đại diện`} aria-label={`Xem ảnh ${student.fullName}`}>
                    {showPortraits ? (
                      <DriveImage key={student.portraitUrl || 'empty'} url={student.portraitUrl} alt={`Ảnh đại diện ${student.fullName}`} className="h-full w-full object-contain" fallback={
                        <span className="flex flex-col items-center gap-1 px-1 text-[10px] text-slate-400">
                          <UserRound className="h-6 w-6" />
                          Chưa có ảnh
                        </span>
                      } />
                    ) : <ImageIcon className="h-4 w-4" />}
                  </button>
                </td>
                {studentTab === 'current' && !isImageOnlyView && (
                  <>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => { navigator.clipboard?.writeText(student.accessCode || ''); showNotification?.('Đã copy mã học sinh.'); }} className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg px-2 py-1 font-normal whitespace-nowrap">
                        <KeyRound className="w-3.5 h-3.5" /> {student.accessCode || 'Chưa có'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-normal whitespace-nowrap ${student.status === 'dropped' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
                        {student.status === 'dropped' ? 'Bỏ học' : isGraduatedStudent(student) ? `TNTHCS · ${student.graduationYear || ''}` : 'Đang học'}
                      </span>
                    </td>
                  </>
                )}
                {visibleStudentFields.map(field => {
                  const isQuickEditing = studentTab === 'current' && quickEdit?.studentId === student.id && quickEdit?.fieldKey === field.key;
                   const centerResultSource = studentTab === 'current' ? centerAcademicByStudent.get(student.id)?.sources[field.key] : null;
                   const canQuickEdit = studentTab === 'current' && quickEditEnabled && !isImageOnlyView && !DOCUMENT_FIELD_KEYS.has(field.key) && field.key !== 'grade' && !centerResultSource;
                  return (
                    <td
                      key={field.key}
                      onClick={() => canQuickEdit && startQuickEdit(student, field)}
                      className={`align-middle ${STUDENT_LEFT_ALIGNED_FIELDS.has(field.key) ? 'text-left' : 'text-center'} ${canQuickEdit ? 'cursor-text hover:bg-indigo-50 hover:ring-1 hover:ring-inset hover:ring-indigo-100' : ''}`}
                      title={centerResultSource ? `Tự lấy kết quả cả năm ${centerResultSource.schoolYear} tại trung tâm` : canQuickEdit ? `Bấm để sửa nhanh ${field.label}` : undefined}
                    >
                      {isQuickEditing ? renderQuickEditControl(student, field) : (
                         <StudentCell student={student} field={field} isClassLeader={studentTab === 'current' && Boolean(student.isClassLeader)} imagePreview={isImageOnlyView && DOCUMENT_FIELD_KEYS.has(field.key)} onOpenDocument={DOCUMENT_FIELD_KEYS.has(field.key) ? (row, fieldItem, index) => openStudentDocumentViewer(row, fieldItem, index) : null} onOpenEdit={studentTab === 'registrations' ? (row) => setEditing({ ...emptyStudent, ...row, id: '' }) : openEdit} onOpenProfile={studentTab === 'current' && !quickEditEnabled ? openView : null} />
                      )}
                    </td>
                  );
                })}
                {studentTab === 'current' ? (!isImageOnlyView && (
                  <>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
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
                            className="p-1 rounded bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            {sendingTestResultStudentId === student.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                          </button>
                        )}
                        <button type="button" onClick={() => openEdit(student)} title="Sửa thông tin" className="p-1 rounded bg-white border border-slate-200 text-blue-600 hover:bg-blue-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => toggleDropout(student)} title={student.status === 'dropped' ? 'Đưa học lại' : 'Đánh dấu bỏ học'} className={`p-1 rounded border ${student.status === 'dropped' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => removeStudent(student)} title="Xóa hồ sơ" className="p-1 rounded bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )) : (
                    <td className="sticky right-0 z-[1] border-l border-slate-100 bg-white px-3 py-3">
                      {student.registrationSyncPending ? (
                        <div className="space-y-1">
                          <span className="inline-flex rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 font-normal text-[10px] uppercase">Chờ đồng bộ Sheet</span>
                          <div className="text-[11px] text-amber-700">Hồ sơ đã duyệt. Nhấn Đồng ý để tiếp tục đồng bộ.</div>
                        </div>
                      ) : student.duplicateReason ? (
                        <div className="space-y-1">
                          <span className="inline-flex rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 font-normal text-[10px] uppercase">{student.duplicateReason}</span>
                          <div className="text-[11px] text-amber-700 font-normal">{student.duplicateStudentName || 'Đã có trong database'} {student.duplicateAccessCode ? `- ${student.duplicateAccessCode}` : ''}</div>
                          <div className="text-[11px] text-amber-700">Đã có trong danh sách học sinh trên website.</div>
                        </div>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 font-normal text-[10px] uppercase">Hồ sơ mới · {student.schoolYear}</span>
                      )}
                      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                        <button type="button" onClick={() => approveRegistrations([student])} disabled={isSaving || (Boolean(student.duplicateReason) && !student.registrationSyncPending)} title={student.registrationSyncPending ? 'Tiếp tục đồng bộ hồ sơ đã duyệt lên Google Sheet' : student.duplicateReason ? 'Cần đối chiếu hồ sơ trùng trước khi đồng ý' : 'Duyệt hồ sơ và đưa vào danh sách học sinh'} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-normal text-white hover:bg-emerald-700 disabled:opacity-40">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Đồng ý
                        </button>
                        <button type="button" onClick={() => deletePendingRegistration(student)} disabled={isSaving} title="Từ chối và xóa hàng đăng ký khỏi Google Sheet" className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-normal text-rose-700 hover:bg-rose-100 disabled:opacity-40">
                          <X className="h-3.5 w-3.5" /> Từ chối
                        </button>
                        <button type="button" onClick={() => setEditing({ ...emptyStudent, ...student, id: '' })} disabled={isSaving} title="Xem hồ sơ" className="p-2 rounded-lg bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {student.duplicateReason && !student.registrationSyncPending ? (
                            <button type="button" onClick={() => markExistingRegistration(student)} disabled={isSaving} title="Giữ hàng trên Google Sheet và đánh dấu Đã có" className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 font-normal uppercase text-[10px] disabled:opacity-40">
                              Cập nhật/Đã có
                            </button>
                        ) : null}
                      </div>
                    </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      </div>
      )}

      {mailComposerStudents.length > 0 && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <h4 className="flex items-center gap-2 font-normal uppercase text-slate-900"><Mail className="h-5 w-5 text-emerald-600" /> Gửi thư học sinh</h4>
                <p className="truncate text-xs font-normal text-slate-500">Đã chọn {mailComposerStudents.length} học sinh</p>
              </div>
              <button type="button" onClick={closeMailboxComposer} disabled={isSendingMailboxMessages} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm disabled:opacity-40">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              <label className="block">
                <span className="mb-1 block text-[10px] font-normal uppercase text-slate-500">Mục thư</span>
                <select value={mailCategory} onChange={(event) => setMailCategory(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">
                  <option value="general">Thông báo</option>
                  <option value="score">Kết quả học tập</option>
                  <option value="profile">Thiếu thông tin hồ sơ</option>
                  <option value="reminder">Nhắc việc</option>
                  <option value="progress">Tiến độ học</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-normal uppercase text-slate-500">Tiêu đề</span>
                <input value={mailTitle} onChange={(event) => setMailTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal focus:border-emerald-400 focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-normal uppercase text-slate-500">Nội dung</span>
                <textarea
                  value={mailBody}
                  onChange={(event) => setMailBody(event.target.value)}
                  rows={6}
                  placeholder={mailCategory === 'score'
                    ? 'Để trống để hệ thống tự gửi kết quả kiểm tra của từng học sinh.'
                    : mailCategory === 'profile' || mailCategory === 'progress'
                      ? 'Để trống để hệ thống tự điền nội dung riêng cho từng học sinh.'
                      : 'Nhập nội dung gửi chung cho các học sinh đã chọn.'}
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal focus:border-emerald-400 focus:outline-none"
                />
              </label>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-normal text-slate-600">
                Người nhận: {mailComposerStudents.slice(0, 5).map(student => student.fullName || student.accessCode).join(', ')}
                {mailComposerStudents.length > 5 ? ` và ${mailComposerStudents.length - 5} học sinh khác` : ''}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
              <button type="button" onClick={closeMailboxComposer} disabled={isSendingMailboxMessages} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-normal text-slate-600 disabled:opacity-40">Hủy</button>
              <button type="button" onClick={sendMailboxComposerMessages} disabled={isSendingMailboxMessages} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-normal text-white shadow-sm disabled:opacity-50">
                {isSendingMailboxMessages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Gửi {mailComposerStudents.length} thư
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {avatarStudent && typeof document !== 'undefined' && createPortal(
        <StudentAvatarPreview student={avatarStudent} onClose={() => setAvatarStudent(null)} onOpenProfile={() => {
          setAvatarStudent(null);
          if (studentTab === 'registrations') setEditing({ ...emptyStudent, ...avatarStudent, id: '' });
           else (quickEditEnabled ? openEdit(avatarStudent) : openView(avatarStudent));
        }} />,
        document.body
      )}
      {editing && (
        <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm p-2 sm:p-3 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="admin-student-profile-title">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-[1280px] max-h-[94dvh] overflow-hidden flex flex-col font-normal">
            <div className="shrink-0 px-3 py-2 border-b bg-slate-50 flex items-center justify-between gap-3">
              <div>
                 <h4 id="admin-student-profile-title" className="font-normal text-slate-900">{profileReadOnly ? 'Xem hồ sơ học sinh' : 'Hồ sơ học sinh'}</h4>
                <p className="text-xs text-slate-500 font-normal">{editing.fullName || 'Học sinh mới'}{editing.className ? ` · Lớp ${editing.className}` : ''}</p>
              </div>
              <button type="button" onClick={closeEdit} aria-label="Đóng hồ sơ" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600"><X className="w-5 h-5" /></button>
            </div>
              <datalist id="admin-province-options">
                {addressProvinceOptions.map(item => <option key={item} value={item} label={provinceOptionLabel(item)} />)}
              </datalist>
              <datalist id="admin-current-ward-options">
                {editCurrentWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              <datalist id="admin-household-ward-options">
                {editHouseholdWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>

            <StudentProfileSections sections={[
              ...STUDENT_PROFILE_SECTIONS.map(section => ({
                ...section,
                content: (
                  <div className="space-y-3">
                    {section.key === 'learning' && <p className="text-xs text-slate-500">Quy đổi đánh giá cũ: Trung bình = Đạt, Khá = Khá, Giỏi = Tốt.</p>}
                    <div className={`grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 ${section.key === 'identity' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
                      {section.key === 'identity' && (<>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-normal uppercase text-slate-400">Mã học sinh</span>
                <div className="flex gap-2">
                   <input readOnly={profileReadOnly} value={editing.accessCode || ''} onChange={(e) => setEditing(prev => ({ ...prev, accessCode: e.target.value.toUpperCase().replace(/\s/g, '') }))} className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal focus:outline-none focus:border-indigo-400" />
                   {!profileReadOnly && <button type="button" aria-label="Tạo mã học sinh" title="Tạo mã học sinh" onClick={() => setEditing(prev => ({ ...prev, accessCode: makeAccessCode(prev, existingCodes) }))} className="px-3 rounded-xl bg-amber-50 text-amber-700 border border-amber-100"><KeyRound className="w-4 h-4" /></button>}
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-normal uppercase text-slate-400">Tình trạng</span>
                 <select disabled={profileReadOnly} value={editing.status || 'active'} onChange={(e) => setEditing(prev => ({ ...prev, status: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal bg-white">
                  <option value="active">Đang học</option>
                  <option value="dropped">Bỏ học</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-normal uppercase text-slate-400">Cán sự lớp</span>
                 <select disabled={profileReadOnly} value={editing.isClassLeader ? 'yes' : 'no'} onChange={(e) => setEditing(prev => ({ ...prev, isClassLeader: e.target.value === 'yes' }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal bg-white">
                  <option value="no">Không</option>
                  <option value="yes">Có quyền điểm danh</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-normal uppercase text-slate-400">Năm học quản lý</span>
                 <input readOnly={profileReadOnly} value={editing.schoolYear || currentSchoolYear} onChange={(e) => setEditing(prev => ({ ...prev, schoolYear: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-normal" />
              </label>

                      </>)}
                      {adminEditFields.filter(field => studentProfileSection(field.key) === section.key).map(renderProfileField)}
                    </div>
                    {section.key === 'identity' && (
                      <section aria-label="Quá trình học" className="border-t border-slate-200 pt-3">
                        <StudentProfileHistory rows={profileHistoryRows} attendanceState={profileAttendanceState} onRetryAttendance={() => setProfileAttendanceRetry(value => value + 1)} />
                      </section>
                    )}
                    {section.key === 'learning' && (
              <div className="space-y-2">
                <div className="text-xs font-normal text-slate-600 mb-2 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Ảnh và giấy tờ học sinh</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {STUDENT_DOCUMENTS.map(docItem => (
                    <DocumentManager
                      key={docItem.key}
                      docItem={docItem}
                      readOnly={profileReadOnly}
                      value={editing[docItem.key]}
                      uploading={uploadingDocumentKey === docItem.key}
                      onUpload={(files) => uploadEditingDocumentFiles(docItem, files)}
                      onRemove={(index) => removeEditingDocumentUrl(docItem.key, index)}
                      onOpen={(index) => openDocumentViewer(docItem, index)}
                    />
                  ))}
                </div>
              </div>
                    )}
                  </div>
                )
              })),
              ...(editingProfileRequests.length ? [{ key: 'requests', label: 'Chờ duyệt (' + editingProfileRequests.reduce((count, request) => count + Object.keys(sanitizeStudentChanges(request.changes)).length, 0) + ')', content: (
                <div className="space-y-3">
                   {editingProfileRequests.map(request => <ProfileChangeTable key={request.id} rows={profileChangeRows(request, editing)} label={'Thay đổi hồ sơ ' + (editing.fullName || 'học sinh')} disabled={isSaving || profileReadOnly} onApprove={key => approveProfileField(request, key)} onReject={key => rejectProfileField(request, key)} />)}
                </div>
              ) }] : [])
            ]} />
            <div className="shrink-0 px-3 py-2 border-t bg-slate-50 flex justify-end gap-2">
               <button type="button" onClick={closeEdit} className="h-8 px-4 bg-white border border-slate-200 text-slate-600 rounded text-xs font-normal">{profileReadOnly ? 'Đóng' : 'Hủy'}</button>
               {!profileReadOnly && <button type="button" onClick={saveStudent} disabled={isSaving || Boolean(uploadingDocumentKey)} className="h-8 px-4 bg-indigo-600 text-white rounded text-xs font-normal shadow-md flex items-center justify-center gap-2 disabled:opacity-60"><Save className="w-4 h-4" /> Lưu hồ sơ</button>}
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
              <div><h4 className="font-normal text-slate-900">Quản lý mã học sinh</h4><p className="text-xs text-slate-500 font-normal">Mã đăng nhập của học sinh trong năm {currentSchoolYear}.</p></div>
              <button type="button" onClick={() => setShowCodeChoiceModal(false)} aria-label="Đóng quản lý mã học sinh" className="p-2 rounded-xl bg-slate-50 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button type="button" onClick={() => { setShowCodeChoiceModal(false); generateMissingCodes(); }} className="text-left p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 font-normal">
                Tạo mã mới cho học sinh chưa có mã
                <div className="text-xs font-normal text-amber-700/70 mt-1">Giữ nguyên mã cũ, chỉ bổ sung cho hồ sơ trống.</div>
              </button>
              <button type="button" onClick={() => { setShowCodeChoiceModal(false); regenerateAllCodes(); }} className="text-left p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800 font-normal">
                Tạo lại mã cho tất cả
                <div className="text-xs font-normal text-rose-700/70 mt-1">Thay toàn bộ mã đăng nhập, học sinh phải dùng mã mới. Hồ sơ, điểm và bài làm được giữ.</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function profileChangeRows(request, student) {
  return Object.entries(sanitizeStudentChanges(request.changes)).map(([key, value]) => ({
    key,
    label: STUDENT_FIELD_LABELS[key] || key,
    currentValue: safePlainValue(student?.[key]),
    nextValue: safePlainValue(value),
    isDocument: DOCUMENT_FIELD_KEYS.has(key)
  }));
}

function StudentCell({ student, field, onOpenEdit, onOpenProfile, onOpenDocument, isClassLeader = false, imagePreview = false }) {
  const value = field.key === 'birthDate'
    ? formatDisplayDate(safePlainValue(student[field.key]))
    : field.key === 'grade'
      ? (getGradeFromClass(student.className) || getGradeFromClass(student.grade))
      : field.key === 'schoolCode'
        ? getSchoolName(getStudentSchoolCode(student))
      : field.key === 'birthProvince'
        ? provinceFilterLabel(safePlainValue(student[field.key]))
        : safePlainValue(student[field.key]);
  const fullName = safePlainValue(student.fullName);

  if (field.key === 'fullName') {
    return (
      <div className="flex min-w-0 items-center gap-1.5 break-words font-normal text-slate-800" onDoubleClick={onOpenProfile ? undefined : () => onOpenEdit?.(student)} title={onOpenProfile ? 'Nhấn để xem hồ sơ' : 'Nhấn đúp để sửa hồ sơ'}>
        {onOpenProfile ? (
          <button type="button" className="min-w-0 break-words text-left text-sky-800 hover:text-sky-600 hover:underline focus-visible:underline" onClick={event => { event.stopPropagation(); onOpenProfile(student); }} aria-label={`Xem hồ sơ ${fullName}`}>
            {fullName || '(Chưa có tên)'}
          </button>
        ) : <span className="min-w-0 break-words">{fullName || '(Chưa có tên)'}</span>}
        {isClassLeader && <span className="shrink-0 text-amber-600" title="Cán sự lớp">★</span>}
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
    return hasFile ? (
      <button type="button" onClick={() => onOpenDocument?.(student, field, 0)} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-1 text-sky-700 hover:bg-sky-50" title={`Xem ${field.label} của ${fullName}`}>
        <FileText className="h-3.5 w-3.5" /> Xem{urls.length > 1 ? ` (${urls.length})` : ''}
      </button>
    ) : (
      <span className="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[10px] font-normal uppercase text-rose-600">
        Trống
      </span>
    );
  }

  const originalProvince = field.key === 'birthProvince' ? safePlainValue(student.birthProvince) : '';
  return <span className="break-words text-slate-700" title={originalProvince && originalProvince !== value ? `Giá trị gốc trong hồ sơ: ${originalProvince}` : undefined}>{value || '-'}</span>;
}

function StudentAvatarPreview({ student, onClose, onOpenProfile }) {
  const closeButtonRef = useRef(null);
  const profileButtonRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      if (document.activeElement === closeButtonRef.current) profileButtonRef.current?.focus();
      else closeButtonRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-3" onClick={event => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={handleKeyDown}>
      <div role="dialog" aria-modal="true" aria-labelledby="student-avatar-title" className="w-full max-w-xs max-h-[90dvh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 id="student-avatar-title" className="font-normal text-slate-900">{student.fullName || 'Học sinh'}</h4>
            <p className="text-xs text-slate-500">{student.className ? `Lớp ${student.className} · ` : ''}{student.schoolYear}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Đóng ảnh đại diện" className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex h-56 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
          <DriveImage key={student.portraitUrl || 'empty'} url={student.portraitUrl} alt={`Ảnh đại diện ${student.fullName}`} className="h-full w-full object-contain" fallback={
            <div className="flex flex-col items-center gap-2 px-4 text-center text-sm text-slate-400">
              <UserRound className="h-12 w-12" />
              {student.portraitUrl ? 'Chưa tải được ảnh đại diện.' : 'Chưa có ảnh đại diện.'}
            </div>
          } />
        </div>
        <button ref={profileButtonRef} type="button" onClick={onOpenProfile} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-sm font-normal text-white hover:bg-sky-800">
          <FileText className="h-4 w-4" /> Mở hồ sơ
        </button>
      </div>
    </div>
  );
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
  return <img src={imageUrl} alt={alt} className={className} onError={() => setFallbackMode(true)} loading="lazy" decoding="async" fetchpriority="low" />;
});

function DocumentManager({ docItem, value, uploading, onUpload, onRemove, onOpen, readOnly = false }) {
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
        <div className="text-[10px] font-normal uppercase text-slate-500">{docItem.label}</div>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-[9px] font-normal uppercase text-slate-500">{fileUrls.length || 0} file</span>
      </div>
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-2">
        <div className="relative">
          {activeUrl ? (
            <button type="button" onClick={() => onOpen?.(activeIndex)} className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-100 bg-white">
              {isPdf ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-[11px] font-normal text-rose-600">
                  <FileSpreadsheet className="h-6 w-6" />
                  PDF
                </div>
              ) : (
                <img src={getPreviewImageUrl(activeUrl)} alt={`${docItem.label} ${activeIndex + 1}`} className="h-full w-full object-contain" loading="lazy" decoding="async" />
              )}
            </button>
          ) : (
            <div className="aspect-[4/3] rounded-lg bg-white border border-dashed border-slate-200 flex items-center justify-center text-center px-3 text-[11px] font-normal text-slate-400">Chưa có file</div>
          )}
          {fileUrls.length > 1 && (
            <>
              <button type="button" onClick={goToPrevious} disabled={activeIndex <= 0} className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md disabled:opacity-30" title="File trước">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={goToNext} disabled={activeIndex >= fileUrls.length - 1} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md disabled:opacity-30" title="File sau">
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/70 px-2 py-1 text-[10px] font-normal text-white">
                {activeIndex + 1}/{fileUrls.length}
              </div>
            </>
          )}
        </div>
        {!readOnly && <div className="mt-2 grid grid-cols-2 gap-2">
          <label htmlFor={inputId} className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-[10px] font-normal uppercase ${uploading ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {uploading ? 'Đang tải...' : 'Thay file'}
          </label>
          <button type="button" onClick={() => onRemove?.(activeIndex)} disabled={!activeUrl || uploading} className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-normal uppercase text-rose-600 disabled:cursor-not-allowed disabled:opacity-40" title="Xóa file đang xem">
            <Trash2 className="h-4 w-4" />
            Xóa
          </button>
        </div>}
      </div>
      {!readOnly && <input
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
      />}
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
            <div className="truncate text-sm font-normal uppercase text-slate-900">{viewer.title}</div>
            <div className="text-[11px] font-normal text-slate-500">File {Math.min(index + 1, urls.length)}/{urls.length}</div>
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
            <div className="flex h-full items-center justify-center text-sm font-normal text-white">Không có file để xem.</div>
          )}
        </div>
        {urls.length > 1 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-slate-100 bg-white p-2">
            {urls.map((url, itemIndex) => (
              <button key={`${url}-${itemIndex}`} type="button" onClick={() => onSelect(itemIndex)} className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-50 ${itemIndex === index ? 'border-indigo-500' : 'border-transparent'}`}>
                {/\.pdf(\?|$)/i.test(url) ? (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-normal text-rose-600">PDF {itemIndex + 1}</div>
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
