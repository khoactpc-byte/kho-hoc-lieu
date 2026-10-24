import { requestJsonp } from './jsonpClient.js';
import { REGISTRATION_WEB_APP_URL } from '../config/registration.js';
import { assertStudentProfileProvinceChanges, buildStudentProfileProvinceOptions, STUDENT_PROFILE_ADDRESS_GROUPS, studentProfileProvinceDirectoryKey, studentProfileProvinceLabel } from '../utils/studentProfileProvinces.js';

const BUNDLED_LOCATION_REVISION = 'locations-v2-1';
const BUNDLED_LOCATION_FILES = {
  address: `/data/student-address-directory-${BUNDLED_LOCATION_REVISION}.json`,
  birth: `/data/student-birth-directory-${BUNDLED_LOCATION_REVISION}.json`
};
const bundledDirectoryRequests = new Map();

function validBundledDirectory(kind, data) {
  return data?.success === true && Array.isArray(data.provinces) && data.provinces.length > 0
    && (kind === 'birth'
      ? data.districtsByProvince && data.communesByDistrict
      : data.communes);
}

async function bundledDirectory(kind) {
  if (!bundledDirectoryRequests.has(kind)) {
    const request = fetch(BUNDLED_LOCATION_FILES[kind], { cache: 'force-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (!validBundledDirectory(kind, data)) throw new Error('Danh mục địa giới tích hợp không hợp lệ.');
        return data;
      })
      .catch(error => {
        if (bundledDirectoryRequests.get(kind) === request) bundledDirectoryRequests.delete(kind);
        throw error;
      });
    bundledDirectoryRequests.set(kind, request);
  }
  return bundledDirectoryRequests.get(kind);
}

export async function loadBundledStudentProfileLocations(params = {}) {
  if (params.action === 'locationBootstrap') {
    const [address, birth] = await Promise.all([bundledDirectory('address'), bundledDirectory('birth')]);
    return { success: true, revision: birth.revision || address.revision || BUNDLED_LOCATION_REVISION,
      provinces: address.provinces, birthProvinces: birth.provinces };
  }
  if (params.action === 'birthPlaceProvince') {
    const data = await bundledDirectory('birth');
    const province = String(params.province || '').trim();
    const districts = data.districtsByProvince[province] || [];
    const prefix = `${province}|||`;
    const communesByDistrict = Object.fromEntries(Object.entries(data.communesByDistrict)
      .filter(([key]) => key.startsWith(prefix)));
    return { success: true, province, districts, communesByDistrict, revision: data.revision };
  }
  if (params.action === 'communes') {
    const data = await bundledDirectory('address');
    const province = String(params.province || '').trim();
    const items = [...new Set([...(data.communes[province] || []), ...(data.communes[''] || [])])]
      .sort((a, b) => a.localeCompare(b, 'vi'));
    return { success: true, province, items, revision: data.revision };
  }
  throw new Error('Thao tác danh mục địa giới tích hợp không được hỗ trợ.');
}

const loadLocations = async params => {
  try {
    return await loadBundledStudentProfileLocations(params);
  } catch {
    return requestJsonp(REGISTRATION_WEB_APP_URL, params, { timeoutMs: 20000 });
  }
};

// Only successful public directory responses are cached, never student-entered addresses.
export function createStudentProfileLocationDirectory(load = loadLocations) {
  const requests = new Map();
  const cached = (key, fetcher) => {
    if (!requests.has(key)) {
      const request = Promise.resolve().then(fetcher).catch(error => {
        if (requests.get(key) === request) requests.delete(key);
        throw error;
      });
      requests.set(key, request);
    }
    return requests.get(key);
  };
  const provinces = () => cached('provinces', async () => {
    const valid = data => data.success !== false && !data.addressError && !data.birthError
      && Array.isArray(data.provinces) && data.provinces.length && Array.isArray(data.birthProvinces) && data.birthProvinces.length;
    let data;
    try {
      data = await load({ action: 'locationBootstrap' });
      if (!valid(data)) throw new Error('Danh mục chưa đầy đủ.');
    } catch {
      const [address, birth] = await Promise.all([load({ action: 'addressDirectory' }), load({ action: 'birthPlaceDirectory' })]);
      if (address.success === false || birth.success === false) throw new Error('Chưa tải được danh mục tỉnh/thành phố.');
      data = { provinces: address.provinces, birthProvinces: birth.provinces };
    }
    if (!valid(data)) throw new Error('Chưa tải được danh mục tỉnh/thành phố.');
    return data;
  });
  const lookup = (kind, province) => cached(`${kind}:${studentProfileProvinceLabel(province)}`, async () => {
    const directory = await provinces();
    const names = kind === 'birth' ? directory.birthProvinces : directory.provinces;
    const rawProvince = studentProfileProvinceDirectoryKey(province, names);
    if (!names.includes(rawProvince)) throw new Error('Vui lòng chọn lại tỉnh/thành phố trong danh sách.');
    const data = await load({ action: kind === 'birth' ? 'birthPlaceProvince' : 'communes', province: rawProvince });
    if (data.success === false || (kind === 'birth' ? !Array.isArray(data.districts) || !data.districts.length || !data.communesByDistrict : !Array.isArray(data.items) || !data.items.length)) {
      throw new Error(data.message || 'Chưa tải được danh mục huyện, xã.');
    }
    // Keep the raw Sheet key: its spelling can differ from the displayed full province name.
    return { ...data, province: rawProvince };
  });
  return { provinces, lookup, clear: () => requests.clear() };
}

export const sharedStudentProfileLocationDirectory = createStudentProfileLocationDirectory();
const fallbackDirectory = sharedStudentProfileLocationDirectory;

export async function assertStudentProfileAddressChanges({ draft, current, optionsByField, editableFields, lookup = fallbackDirectory.lookup }) {
  if (!optionsByField && STUDENT_PROFILE_ADDRESS_GROUPS.some(group => editableFields.some(field => field.key === group.province)
    && String(draft[group.province] || '').trim() !== String(current[group.province] || '').trim() && draft[group.province])) {
    optionsByField = buildStudentProfileProvinceOptions(await fallbackDirectory.provinces());
  }
  assertStudentProfileProvinceChanges({ draft, current, optionsByField, editableFields });
  const editable = new Set(editableFields.map(field => field.key));
  for (const group of STUDENT_PROFILE_ADDRESS_GROUPS) {
    const keys = [group.province, group.district, group.ward].filter(Boolean);
    if (!keys.some(key => editable.has(key) && String(draft[key] || '').trim() !== String(current[key] || '').trim())) continue;
    const province = String(draft[group.province] || '').trim();
    const district = group.district ? String(draft[group.district] || '').trim() : '';
    const ward = String(draft[group.ward] || '').trim();
    if (!district && !ward) continue;
    if (!province) throw new Error(`${group.label}: cần chọn tỉnh/thành phố trước huyện, xã.`);
    if (group.district && ward && !district) throw new Error(`${group.label}: cần chọn quận/huyện trước xã/phường.`);
    const data = await lookup(group.kind, province);
    if (group.district && district && !data.districts.includes(district)) throw new Error(`${group.label}: quận/huyện không thuộc tỉnh đã chọn. Vui lòng chọn lại.`);
    const wards = group.district ? data.communesByDistrict[`${data.province}|||${district}`] || [] : data.items;
    if (ward && !wards.includes(ward)) throw new Error(`${group.label}: xã/phường không thuộc ${group.district ? 'quận/huyện' : 'tỉnh'} đã chọn. Vui lòng chọn lại.`);
  }
}
