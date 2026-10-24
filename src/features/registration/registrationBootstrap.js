const validConfig = config => Array.isArray(config?.schools) && config.schools.length > 0
  && /^20\d{2}-20\d{2}$/.test(config.currentSchoolYear || '');

// Public metadata only. No form values, personal data or fixed school year.
export function createRegistrationBootstrapLoader({ config, locations, fallbackLocations, now = Date.now, ttlMs = 60000 }) {
  let cached, cachedAt = 0, pending;
  return function load({ force = false, ...options } = {}) {
    if (pending) return pending;
    if (!force && cached && now() - cachedAt < ttlMs) return Promise.resolve(cached);
    const request = Promise.all([
      Promise.resolve().then(() => config(options)),
      Promise.resolve().then(locations).catch(() => fallbackLocations(options))
    ]).then(([settings, directory]) => {
      if (!settings || settings.success === false || !validConfig(settings)) throw new Error(settings?.message || 'Chưa tải được năm học và cơ sở đăng ký.');
      if (!directory || directory.success === false || !Array.isArray(directory.provinces) || !Array.isArray(directory.birthProvinces)) throw new Error(directory?.message || 'Chưa tải được danh mục địa chỉ.');
      const data = { ...directory, success: true, config: settings };
      if (!data.addressError && !data.birthError && data.provinces?.length && data.birthProvinces?.length) {
        cached = data; cachedAt = now();
      }
      return data;
    }).finally(() => { if (pending === request) pending = null; });
    pending = request;
    return request;
  };
}
