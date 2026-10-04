const normalizeSuggestionKey = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .toLowerCase();

export const getTeachingCampusCodes = (classNames = []) => [...new Set(
  (Array.isArray(classNames) ? classNames : []).map(value => {
    const className = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (/^[1-9]A$/.test(className)) return 'NAN';
    if (/^[1-9]B$/.test(className)) return 'TQK';
    return '';
  }).filter(Boolean)
)];

export const getTeachingTeacherSuggestions = ({
  query = '',
  assignment = '',
  classes = [],
  teachersByCampus = {},
  fallbackTeachers = [],
  subjectAliases = [],
  limit = 8
} = {}) => {
  const campusCodes = getTeachingCampusCodes(classes);
  const candidates = campusCodes.length
    ? campusCodes.flatMap(code => teachersByCampus[code] || [])
    : fallbackTeachers;
  const acceptedSubjects = new Set([assignment, ...subjectAliases].map(normalizeSuggestionKey).filter(Boolean));
  const filtered = assignment
    ? candidates.filter(teacher => acceptedSubjects.has(normalizeSuggestionKey(teacher.subject)))
    : candidates;
  const searchKey = normalizeSuggestionKey(query);
  const uniqueTeachers = new Map();

  filtered.forEach(teacher => {
    const name = String(teacher.name || '').trim();
    const key = `${normalizeSuggestionKey(name)}|${normalizeSuggestionKey(teacher.subject)}`;
    if (name && !uniqueTeachers.has(key)) uniqueTeachers.set(key, teacher);
  });

  return [...uniqueTeachers.values()]
    .map(teacher => {
      const nameKey = normalizeSuggestionKey(teacher.name);
      const score = !searchKey
        ? 1
        : (nameKey.startsWith(searchKey) ? 3 : (nameKey.includes(searchKey) ? 2 : 0));
      return { teacher, score };
    })
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.teacher.name.localeCompare(right.teacher.name, 'vi'))
    .slice(0, limit)
    .map(item => item.teacher);
};

export const getAccountTeacherSuggestions = ({ schoolCode = '', teachersByCampus = {}, query = '', limit = 8 } = {}) => {
  const campus = String(schoolCode || '').trim().toUpperCase();
  if (!['NAN', 'TQK'].includes(campus)) return [];
  const teachers = teachersByCampus?.[campus];
  const uniqueNames = new Map();
  (Array.isArray(teachers) ? teachers : []).forEach(teacher => {
    const name = String(teacher?.name || '').trim();
    const key = normalizeSuggestionKey(name);
    if (key && !uniqueNames.has(key)) uniqueNames.set(key, { ...teacher, name });
  });
  return getTeachingTeacherSuggestions({ query, fallbackTeachers: [...uniqueNames.values()], limit });
};
