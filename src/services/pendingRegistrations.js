import { postAppsScript } from '../utils/helpers';

export async function fetchPendingRegistrations(options = {}) {
  const response = await postAppsScript({
    action: 'registrationAdminAction', registrationAction: 'listPending', params: {}
  }, { timeoutMs: 20000, ...options });
  if (response.result?.success !== true || !Array.isArray(response.result.items)) {
    throw new Error(response.result?.message || response.message || 'Chưa tải được hồ sơ đăng ký mới.');
  }
  return response.result.items;
}

export const pendingRegistrationKey = item => String(item.rowNumber || item.id || item.tempId || '');
