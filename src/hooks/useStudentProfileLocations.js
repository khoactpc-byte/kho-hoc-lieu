import { useCallback, useEffect, useRef, useState } from 'react';
import { sharedStudentProfileLocationDirectory } from '../services/studentProfileLocations';
import { buildStudentProfileProvinceOptions, STUDENT_PROFILE_ADDRESS_GROUPS, studentProfileProvinceLabel } from '../utils/studentProfileProvinces';

export default function useStudentProfileLocations(enabled, draft = {}) {
  const directory = useRef(null);
  if (!directory.current) directory.current = sharedStudentProfileLocationDirectory;
  const [bootstrap, setBootstrap] = useState(null);
  const [status, setStatus] = useState('loading');
  const [entries, setEntries] = useState({});
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => {
    directory.current.clear();
    setBootstrap(null); setEntries({}); setStatus('loading'); setRevision(value => value + 1);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setStatus('loading');
    directory.current.provinces().then(data => {
      if (active) { setBootstrap(data); setStatus('ready'); }
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [enabled, revision]);

  const targetsKey = JSON.stringify([...new Set(STUDENT_PROFILE_ADDRESS_GROUPS
    .filter(group => draft?.[group.province])
    .map(group => `${group.kind}:${studentProfileProvinceLabel(draft[group.province])}`))]);
  useEffect(() => {
    if (!enabled || !bootstrap) return;
    let active = true;
    for (const key of JSON.parse(targetsKey)) {
      const [kind, ...parts] = key.split(':');
      const province = parts.join(':');
      setEntries(previous => ({ ...previous, [key]: { status: 'loading' } }));
      directory.current.lookup(kind, province).then(data => {
        if (active) setEntries(previous => ({ ...previous, [key]: { status: 'ready', data } }));
      }).catch(error => {
        if (active) setEntries(previous => ({ ...previous, [key]: { status: 'error', error: error.message } }));
      });
    }
    return () => { active = false; };
  }, [enabled, bootstrap, targetsKey, revision]);

  const provinceOptions = buildStudentProfileProvinceOptions(bootstrap || {});
  const fields = {};
  for (const group of STUDENT_PROFILE_ADDRESS_GROUPS) {
    const province = draft?.[group.province] || '';
    const entry = entries[`${group.kind}:${studentProfileProvinceLabel(province)}`];
    const data = entry?.status === 'ready' ? entry.data : null;
    const choices = provinceOptions[group.province] || [];
    const error = province && entry?.status === 'error' ? entry.error : '';
    fields[group.province] = { choices, disabled: status !== 'ready', placeholder: status === 'error' ? 'Chưa tải được danh mục' : status !== 'ready' ? 'Đang tải danh mục…' : 'Chọn tỉnh / thành phố', error: status === 'error' ? 'Chưa tải được danh mục tỉnh/thành phố.' : '', retry };
    if (group.district) {
      fields[group.district] = { choices: (data?.districts || []).map(value => ({ value, label: value })), disabled: !data, placeholder: !province ? 'Chọn tỉnh trước' : error ? 'Chưa tải được danh mục' : !data ? 'Đang tải huyện…' : 'Chọn quận / huyện', error, retry };
    }
    const district = draft?.[group.district] || '';
    const districtValid = !group.district || data?.districts.includes(district);
    const wards = !data || !districtValid ? [] : group.district ? data.communesByDistrict[`${data.province}|||${district}`] || [] : data.items;
    fields[group.ward] = { choices: wards.map(value => ({ value, label: value })), disabled: !data || !districtValid, placeholder: !province ? 'Chọn tỉnh trước' : group.district && !districtValid ? 'Chọn huyện trước' : error ? 'Chưa tải được danh mục' : !data ? 'Đang tải xã…' : 'Chọn xã / phường', error: group.district ? '' : error, retry };
  }
  return { fields, provinceOptions, status, retry, lookup: directory.current.lookup };
}
