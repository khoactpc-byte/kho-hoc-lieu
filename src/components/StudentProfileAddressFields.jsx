import { STUDENT_PROFILE_ADDRESS_GROUPS } from '../utils/studentProfileProvinces';

const extraFields = { birthProvince: ['birthPlaceName'], province: ['address'], householdProvince: ['householdAddress'] };

export default function StudentProfileAddressFields({ fields, renderField }) {
  const byKey = new Map(fields.map(field => [field.key, field]));
  const groupedKeys = new Set();
  const groups = STUDENT_PROFILE_ADDRESS_GROUPS.map(group => {
    const keys = [group.province, group.district, group.ward, ...(extraFields[group.province] || [])].filter(Boolean);
    keys.forEach(key => groupedKeys.add(key));
    return { ...group, fields: keys.map(key => byKey.get(key)).filter(Boolean) };
  }).filter(group => group.fields.length);
  const otherFields = fields.filter(field => !groupedKeys.has(field.key));
  return <div className="min-w-0 space-y-3">
    {groups.map(group => <fieldset key={group.province} className="min-w-0 rounded-lg border border-slate-200 px-3 pb-3 pt-1">
      <legend className="px-1 text-xs font-medium text-slate-700">{group.label}</legend>
      <div className={`grid min-w-0 grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 ${group.fields.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {group.fields.map(renderField)}
      </div>
    </fieldset>)}
    {otherFields.length > 0 && <fieldset className="min-w-0 rounded-lg border border-slate-200 px-3 pb-3 pt-1">
      <legend className="px-1 text-xs font-medium text-slate-700">Thông tin địa chỉ khác</legend>
      <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">{otherFields.map(renderField)}</div>
    </fieldset>}
  </div>;
}
