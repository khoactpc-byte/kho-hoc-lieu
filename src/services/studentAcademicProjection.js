const segment = value => '`' + String(value).replaceAll('\\', '\\\\').replaceAll('`', '\\`') + '`';
const decode = value => {
  if (value == null || 'nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return Date.parse(value.timestampValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([key, entry]) => [key, decode(entry)]));
};

export function studentAcademicQuery({ collection, filters, fields, limit }) {
  return { structuredQuery: { from: [{ collectionId: collection }],
    select: { fields: fields.map(path => ({ fieldPath: path.map(segment).join('.') })) },
    where: { compositeFilter: { op: 'AND', filters: Object.entries(filters).map(([fieldPath, value]) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue: String(value) } } })) } }, limit } };
}

export async function readStudentAcademicProjection({ projectId, appId, token, query, signal, fetcher = fetch }) {
  const response = await fetcher(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/artifacts/${encodeURIComponent(appId)}/public/data:runQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(studentAcademicQuery(query)), signal
  });
  if (!response.ok) throw new Error('Chưa tải được kết quả học tập và điểm danh. Vui lòng thử lại.');
  const data = await response.json();
  if (!Array.isArray(data) || data.some(row => row.error)) throw new Error('Máy chủ chưa trả đủ kết quả học tập.');
  const rows = data.filter(row => row.document).map(({ document }) => ({ ...decode({ mapValue: { fields: document.fields || {} } }), id: document.name.split('/').at(-1) }));
  if (rows.length >= query.limit) throw new Error('Dữ liệu năm học chưa tải đủ để đối chiếu.');
  return rows;
}
