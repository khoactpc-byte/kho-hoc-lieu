export const PROFILE_DOCUMENT_FIELDS = ['portraitUrl', 'birthCertificateUrl', 'identityCardUrl', 'transcriptUrl'];

export function profileDriveFileIds(value = '') {
  const ids = String(value || '').split(/\s*,\s*|\n+/).flatMap(item => {
    try {
      const url = new URL(item.trim());
      if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(url.hostname)) return [];
      const id = url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[1] || url.searchParams.get('id');
      return id && /^[\w-]{6,200}$/.test(id) ? [id] : [];
    } catch { return []; }
  });
  return [...new Set(ids)];
}

export function replacedProfileFileIds(before, after) {
  const retained = new Set(profileDriveFileIds(after));
  return profileDriveFileIds(before).filter(id => !retained.has(id));
}

export function hasNewProfileFiles(before, after) {
  const existing = new Set(profileDriveFileIds(before));
  return profileDriveFileIds(after).some(id => !existing.has(id));
}

export function referencedProfileFileIds(records) {
  return new Set(records.flatMap(record => PROFILE_DOCUMENT_FIELDS.flatMap(key => profileDriveFileIds(record?.[key]))));
}
