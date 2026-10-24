import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRegistrationBootstrap, loadBirthProvince, loadAddressCommunes } from './registrationApi';

// Share in-flight province requests across pickers; cache only successful responses.
export default function useRegistrationDirectories() {
  const [bootstrap, setBootstrap] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requests = useRef(new Map());
  const revision = useRef('');
  const mounted = useRef(false);
  const refresh = useCallback(async (options) => {
    setLoading(true); setError('');
    try {
      const data = await loadRegistrationBootstrap({ force: options?.cached !== true });
      if (!mounted.current) return;
      if (!data.success || !data.config?.schools?.length || !/^20\d{2}-20\d{2}$/.test(data.config.currentSchoolYear || '')) throw new Error(data.message || 'Chưa tải được thông tin đăng ký.');
      if (revision.current !== data.revision) requests.current.clear();
      revision.current = data.revision;
      setBootstrap(data);
      if (data.addressError || data.birthError) setError('Chưa tải đủ danh mục địa chỉ. Vui lòng thử tải lại trước khi tiếp tục.');
      return data;
    } catch (problem) { if (mounted.current) setError(problem.message || 'Chưa kết nối được. Vui lòng thử lại.'); return null; }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => { mounted.current = true; refresh({ cached: true }); return () => { mounted.current = false; }; }, [refresh]);
  const lookup = useCallback((kind, province) => {
    const key = `${revision.current}:${kind}:${province}`;
    if (!requests.current.has(key)) {
      const request = (kind === 'birth' ? loadBirthProvince(province) : loadAddressCommunes(province)).then(data => {
        if (!data.success) throw new Error(data.message || 'Chưa tải được danh mục địa chỉ.');
        return data;
      }).catch(problem => { requests.current.delete(key); throw problem; });
      requests.current.set(key, request);
    }
    return requests.current.get(key);
  }, []);
  return { bootstrap, loading, error, refresh, lookup };
}
