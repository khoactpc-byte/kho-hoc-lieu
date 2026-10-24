export default function StudentProfileFamilyFields({ fields, renderField }) {
  if (!fields.length) return null;
  return <fieldset className="min-w-0 rounded-lg border border-slate-200 px-3 pb-3 pt-1">
    <legend className="px-1 text-xs font-medium text-slate-700">Gia đình & thông tin khác</legend>
    <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">{fields.map(renderField)}</div>
  </fieldset>;
}
