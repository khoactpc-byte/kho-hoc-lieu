export const SCHOOL_GRADES = Array.from({ length: 9 }, (_, index) => String(index + 1));

export const SCHOOL_OPTIONS = [
  { code: 'NAN', key: 'nguyen-an-ninh', name: 'THCS Nguyễn An Ninh' },
  { code: 'TQK', key: 'tran-quang-khai', name: 'THCS Trần Quang Khải' },
  { code: 'UNKNOWN', key: '', name: 'Chưa gán cơ sở' }
];

export const DEFAULT_SCHOOL_CODE = 'NAN';

export const normalizeSchoolCode = (value = '') => {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return '';
  const token = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').replace(/[^A-Z0-9]/g, '');
  if (token === 'NAN' || token.includes('NGUYENANNINH')) return 'NAN';
  if (token === 'TQK' || token.includes('TRANQUANGKHAI')) return 'TQK';
  if (token === 'UNKNOWN' || token.includes('CHUAGANCOSO') || token === 'UNASSIGNED') return 'UNKNOWN';
  return '';
};

export const getStudentSchoolCode = (student = {}) => {
  const explicitValues = [
    student.schoolCode,
    student.campusCode,
    student.schoolKey,
    student.campusKey,
    student.schoolId,
    student.schoolName,
    student.coSoDangKy
  ];
  for (const value of explicitValues) {
    const code = normalizeSchoolCode(value);
    if (code) return code;
  }
  return 'UNKNOWN';
};

export const getSchoolName = (schoolCode = '') => (
  SCHOOL_OPTIONS.find(school => school.code === normalizeSchoolCode(schoolCode))?.name || SCHOOL_OPTIONS.at(-1).name
);

export const getSchoolClassesForCampus = (classNames = [], schoolCode = '') => {
  const suffix = normalizeSchoolCode(schoolCode) === 'NAN'
    ? 'A'
    : (normalizeSchoolCode(schoolCode) === 'TQK' ? 'B' : '');
  if (!suffix) return [];
  return [...new Set((Array.isArray(classNames) ? classNames : [])
    .map(item => normalizeSchoolClassName(item))
    .filter(className => /^[1-9][A-Z]$/.test(className) && className.endsWith(suffix)))]
    .sort(compareSchoolClassNames);
};

export const createDefaultSchoolClassesByGrade = () => Object.fromEntries(
  SCHOOL_GRADES.map(grade => [
    grade,
    Number(grade) <= 5 ? [`${grade}A`] : [`${grade}A`, `${grade}B`]
  ])
);

export const normalizeSchoolYearKey = (value = '') => String(value || '').replace(/\s*-\s*/g, '-').trim();

export const getSchoolGrade = (value = '') => String(value || '').match(/(?:^|\D)([1-9])(?:\D|$)/)?.[1]
  || String(value || '').match(/^([1-9])/)?.[1]
  || '';

export const getStudentEntryGrade = (student = {}, fallbackSchoolYear = '') => {
  const explicitGrade = getSchoolGrade(
    student.entryGrade || student.enrollmentGrade || student.admissionGrade || ''
  );
  if (explicitGrade) return explicitGrade;

  const currentGrade = getSchoolGrade(student.className);
  const enrollmentYear = String(student.enrollmentYear || '').match(/\d{4}/)?.[0];
  const currentYear = String(student.schoolYear || fallbackSchoolYear || '').match(/\d{4}/)?.[0];
  if (currentGrade && enrollmentYear && currentYear && Number(currentYear) >= Number(enrollmentYear)) {
    const inferredGrade = Number(currentGrade) - (Number(currentYear) - Number(enrollmentYear));
    if (inferredGrade >= 1 && inferredGrade <= 9) return String(inferredGrade);
  }

  return getSchoolGrade(student.grade) || currentGrade;
};

export const promoteSchoolClassName = (className = '') => {
  const text = String(className || '')
    .trim()
    .toUpperCase()
    .replace(/^LỚP\s*/i, '')
    .replace(/\s+/g, '');
  const match = text.match(/^([1-9])([A-Z][A-Z0-9-]*)?$/);
  if (!match) return String(className || '').trim();
  const grade = Number(match[1]);
  if (grade >= 9) return '';
  return `${grade + 1}${match[2] || ''}`;
};

export const normalizeSchoolClassName = (value = '', grade = '') => {
  let text = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^LỚP\s*/i, '')
    .replace(/\s+/g, '');
  if (!text) return '';
  if (/^[A-Z]+\d*$/.test(text)) text = `${grade}${text}`;
  return text;
};

export const compareSchoolClassNames = (left = '', right = '') => {
  const leftGrade = Number(getSchoolGrade(left) || 0);
  const rightGrade = Number(getSchoolGrade(right) || 0);
  return leftGrade - rightGrade
    || String(left).localeCompare(String(right), 'vi', { numeric: true, sensitivity: 'base' });
};

const scorebookNameSortKey = (value = '') => {
  const normalized = String(value || '').trim().toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
  const parts = normalized.split(/\s+/).filter(Boolean);
  return `${parts.at(-1) || ''} ${parts.join(' ')}`.trim();
};

export const compareSchoolRosterStudents = (left = {}, right = {}) => (
  String(left.className || '').localeCompare(String(right.className || ''), 'vi', { numeric: true, sensitivity: 'base' })
  || scorebookNameSortKey(left.fullName).localeCompare(scorebookNameSortKey(right.fullName), 'vi', { sensitivity: 'base' })
);

const assignmentSemesterKeys = {
  hk1: ['hk1', 'hki', 'semester1', 'term1'],
  hk2: ['hk2', 'hkii', 'semester2', 'term2']
};
const assignmentFallbackKeys = ['fullYear', 'value', 'teacherName', 'name'];

const getAssignmentSemesterValues = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const text = String(value || '').trim();
    return { hk1: text, hk2: text };
  }

  const fallbackKey = assignmentFallbackKeys.find(key => Object.prototype.hasOwnProperty.call(value, key));
  const fallbackValue = fallbackKey ? String(value[fallbackKey] ?? '').trim() : undefined;
  return Object.fromEntries(Object.entries(assignmentSemesterKeys).flatMap(([semester, keys]) => {
    const key = keys.find(item => Object.prototype.hasOwnProperty.call(value, item));
    if (key) return [[semester, String(value[key] ?? '').trim()]];
    if (fallbackKey) return [[semester, fallbackValue]];
    return [];
  }));
};

export const getSchoolClassTeacherAssignments = (assignmentsByClass = {}, className = '') => {
  const source = assignmentsByClass && typeof assignmentsByClass === 'object' ? assignmentsByClass : {};
  const classKey = normalizeSchoolClassName(className);
  const gradeKey = getSchoolGrade(classKey) || String(className || '').trim();
  const gradeAssignments = source[gradeKey] && typeof source[gradeKey] === 'object' ? source[gradeKey] : {};
  const classAssignments = classKey !== gradeKey && source[classKey] && typeof source[classKey] === 'object'
    ? source[classKey]
    : {};

  return Object.entries({ ...gradeAssignments, ...classAssignments }).reduce((result, [subject, value]) => {
    if (!Object.prototype.hasOwnProperty.call(classAssignments, subject)) {
      result[subject] = value;
      return result;
    }
    result[subject] = {
      ...getAssignmentSemesterValues(gradeAssignments[subject]),
      ...getAssignmentSemesterValues(value)
    };
    return result;
  }, {});
};

export const normalizeSchoolClassesByGrade = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(SCHOOL_GRADES.map(grade => {
    const seen = new Set();
    const rows = (Array.isArray(source[grade]) ? source[grade] : [])
      .map(item => normalizeSchoolClassName(item, grade))
      .filter(item => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      })
      .sort(compareSchoolClassNames);
    return [grade, rows];
  }));
};

export const buildNextSchoolYearClasses = (existing = {}, promotedClassNames = []) => {
  const normalizedExisting = normalizeSchoolClassesByGrade(existing);
  const defaults = createDefaultSchoolClassesByGrade();
  const promotedByGrade = (Array.isArray(promotedClassNames) ? promotedClassNames : [])
    .map(className => normalizeSchoolClassName(className))
    .filter(Boolean)
    .reduce((result, className) => {
      const grade = getSchoolGrade(className);
      if (grade) result[grade] = [...(result[grade] || []), className];
      return result;
    }, {});

  return normalizeSchoolClassesByGrade(Object.fromEntries(SCHOOL_GRADES.map(grade => [
    grade,
    [
      ...(normalizedExisting[grade]?.length ? normalizedExisting[grade] : defaults[grade]),
      ...(promotedByGrade[grade] || [])
    ]
  ])));
};

export const getSchoolClassesForYear = (classesByYear = {}, schoolYear = '', allowedGrades = SCHOOL_GRADES) => {
  const yearKey = normalizeSchoolYearKey(schoolYear);
  const normalized = normalizeSchoolClassesByGrade(classesByYear?.[yearKey]);
  const gradeSet = new Set((allowedGrades || SCHOOL_GRADES).map(String));
  return SCHOOL_GRADES
    .filter(grade => gradeSet.has(grade))
    .flatMap(grade => normalized[grade] || [])
    .sort(compareSchoolClassNames);
};

export const getSchoolTeachingAssignmentClassesForYear = (classesByYear = {}, schoolYear = '', allowedGrades = SCHOOL_GRADES) => {
  const classes = getSchoolClassesForYear(classesByYear, schoolYear, allowedGrades);
  const gradeSet = new Set((allowedGrades || SCHOOL_GRADES).map(String));
  if (!gradeSet.has('9') || !classes.includes('9A') || classes.includes('9B')) return classes;
  return [...classes, '9B'].sort(compareSchoolClassNames);
};
