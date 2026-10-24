export function normalizeLoginUsername(value = '') {
  const username = String(value).trim();
  if (/^(?:HS)?\d{3,15}$/i.test(username)) return `HS${username.replace(/^HS/i, '')}`;
  return username.toLowerCase();
}

export const isStudentUsername = value => /^HS\d{3,15}$/.test(normalizeLoginUsername(value));
