import { useEffect } from 'react';

export function useDefaultLearningGrade({ role, studentGrade, grades, grade, subject, lesson, setGrade, setTextbookExpanded }) {
  useEffect(() => {
    if (!role || grade || subject || lesson) return;
    const desktop = window.innerWidth >= 640;
    const ownGrade = role === 'student' && grades.includes(String(studentGrade)) ? String(studentGrade) : '';
    const defaultGrade = ownGrade || (desktop ? grades[0] : '');
    if (!defaultGrade) return;
    setGrade(defaultGrade);
    setTextbookExpanded(role !== 'teacher' && desktop);
  }, [role, studentGrade, grades, grade, subject, lesson, setGrade, setTextbookExpanded]);
}
