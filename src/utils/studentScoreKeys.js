const token = value => encodeURIComponent(String(value)).replace(/[.!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16)}`);
export const studentScoreIdentity = (student = {}) => {
  // Stable across name/class changes. Persist studentKey on promoted records.
  const key = student.studentKey || student.accessCode || student.studentAccessCode
    || student.stableStudentId || student.previousStudentId || student.studentId || student.id;
  return key ? token(key) : '';
};
export const hasLegacyRowEdits = (edits = {}) => Object.keys(edits).some(key => /:r\d+(?::|$)/.test(key));

export function studentEditKey(key, student) {
  if (!/:r\d+(?::|$)/.test(key)) return key;
  const identity = studentScoreIdentity(student);
  return identity ? key.replace(/:r\d+(?=:|$)/, `:u${identity}`) : '';
}

export function migrateLegacyRowEdits(edits, verifiedRoster) {
  const identities = verifiedRoster.map(studentScoreIdentity);
  if (identities.some(id => !id) || new Set(identities).size !== identities.length) {
    throw new Error('Danh sách đối chiếu thiếu mã hoặc có học sinh trùng mã.');
  }
  const migrated = {};
  for (const [key, value] of Object.entries(edits || {})) {
    const match = key.match(/:r(\d+)(?=:|$)/);
    const nextKey = match ? studentEditKey(key, verifiedRoster[Number(match[1])]) : key;
    if (!nextKey) throw new Error(`Thiếu học sinh đối chiếu cho dòng ${Number(match[1]) + 1}.`);
    // Only custom row keys have a legacy alias without the prefix. Template
    // cell keys and document-level headers retain their original namespace.
    const normalizedKey = match && !nextKey.startsWith('custom:') ? `custom:${nextKey}` : nextKey;
    if (Object.hasOwn(migrated, normalizedKey) && JSON.stringify(migrated[normalizedKey]) !== JSON.stringify(value)) {
      throw new Error('Hai giá trị cũ ánh xạ vào cùng ô; cần đối soát trước.');
    }
    migrated[normalizedKey] = value;
  }
  return migrated;
}

// Adapt the ID-based map for legacy calculation functions, never use row data
// as a fallback. This view is ephemeral and must not be persisted.
export function studentRowView(edits, student, rowIndex) {
  const identity = studentScoreIdentity(student);
  if (!identity) return {};
  const marker = `:u${identity}:`;
  return Object.fromEntries(Object.entries(edits || {}).filter(([key]) => key.includes(marker))
    .map(([key, value]) => [key.replace(marker, `:r${rowIndex}:`), value]));
}
