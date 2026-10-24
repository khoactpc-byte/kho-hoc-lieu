export function lessonUsesMath(subject = '') {
  const key = String(subject).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z]/g, '');
  return ['toan', 'khtn', 'khoahoctunhien'].includes(key);
}
