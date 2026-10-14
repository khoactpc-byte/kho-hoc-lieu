import { useEffect } from 'react';

export function useTeacherNavigation({ role, profile, grades, subjects, grade, subject, setGrade, setSubject, setLesson }) {
  useEffect(() => {
    if (role !== 'teacher' || !profile) return;
    // Empty selections belong to the grade/subject picker and must stay empty.
    if (grade && !grades.includes(String(grade))) {
      setGrade(null);
      setSubject(null);
      setLesson(null);
      return;
    }
    if (subject && !subjects.includes(String(subject))) {
      setSubject(null);
      setLesson(null);
    }
  }, [role, profile, grades, subjects, grade, subject, setGrade, setSubject, setLesson]);
}
