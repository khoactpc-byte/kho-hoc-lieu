import { getSchoolClassesForCampus } from './schoolClasses.js';

const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const subjectOrder = ['toan', 'nguvan', 'tiengviet', 'tienganh', 'ngoaingu', 'khoahoctunhien', 'khtn', 'lichsudialy', 'lichsudiali', 'giaoduccongdan', 'gdcd', 'congnghe', 'tinhoc', 'giaoducdiaphuong', 'gddp', 'nghethuat', 'giaoducthechat', 'hdtt'];
export const compareTeachingSubjects = (a, b) => {
  const rank = value => { const index = subjectOrder.indexOf(key(value)); return index < 0 ? 99 : index; };
  return rank(a) - rank(b) || String(a).localeCompare(String(b), 'vi');
};
export const sortTeachingSubjects = subjects => [...new Set(subjects || [])].sort(compareTeachingSubjects);
export const teacherClassLabel = (profile, grade) => {
  const classes = getSchoolClassesForCampus([`${grade}A`, `${grade}B`], profile?.schoolCode);
  return classes.length ? `Lớp ${classes[0]}` : `Khối ${grade}`;
};
