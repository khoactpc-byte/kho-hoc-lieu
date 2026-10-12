// Read the saved row positions without assigning those marks to a student.
export function legacyScorebookPreview(edits = {}) {
  const groups = new Map();
  for (const [key, value] of Object.entries(edits)) {
    const match = key.match(/^(?:custom:)?(hki|hkii)(Score|Review):(\d+):r(\d+):(s\d+|g\d+|note)$/);
    if (!match || value === null || value === undefined || value === '') continue;
    const [, semester, kind, page, row, column] = match;
    const groupId = `${semester}${kind}:${page}`;
    if (!groups.has(groupId)) groups.set(groupId, { id: groupId, semester, kind, page: Number(page), rows: new Map() });
    const group = groups.get(groupId);
    if (!group.rows.has(Number(row))) group.rows.set(Number(row), { index: Number(row), values: {} });
    const values = group.rows.get(Number(row)).values;
    // Preserve conflicting legacy aliases visibly, instead of silently picking one.
    values[column] = [...new Set([...(values[column] || []), String(value)])];
  }
  return [...groups.values()].sort((a, b) => a.semester.localeCompare(b.semester) || a.kind.localeCompare(b.kind) || a.page - b.page)
    .map(group => ({ ...group, rows: [...group.rows.values()].sort((a, b) => a.index - b.index) }));
}
