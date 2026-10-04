// Listing is read-only. A missing entry is never evidence that a pin should be deleted.
export async function listDriveFiles({ folderId, apiKey, signal, fetchImpl = fetch }) {
  const files = new Map();
  const seenTokens = new Set();
  let pageToken = '';
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${String(folderId).replace(/['\\]/g, '\\$&')}' in parents and trashed=false`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('fields', 'nextPageToken,incompleteSearch,files(id,name,mimeType,webViewLink,description,iconLink)');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetchImpl(url.toString(), { signal });
    if (!response.ok) throw new Error(`Không tải được kho Drive (${response.status}).`);
    const data = await response.json();
    if (data.error || data.incompleteSearch || !Array.isArray(data.files)) {
      throw new Error('Drive chưa trả đầy đủ danh sách. Hãy tải lại.');
    }
    data.files.forEach(file => { if (file.id) files.set(file.id, file); });
    pageToken = data.nextPageToken || '';
    if (pageToken && seenTokens.has(pageToken)) throw new Error('Drive trả trang dữ liệu lặp.');
    if (pageToken) seenTokens.add(pageToken);
  } while (pageToken);
  return [...files.values()];
}
