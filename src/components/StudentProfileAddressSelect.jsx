export default function StudentProfileAddressSelect({ field, value = '', state, disabled, onChange, className }) {
  const choices = state?.choices || [];
  const listed = choices.some(option => option.value === value);
  return <>
    <select aria-label={field.label} value={value} disabled={disabled || !state || state.disabled} onChange={event => onChange(field.key, event.target.value)} className={`${className || ''} min-w-0 max-w-full`}>
      <option value="">{state?.placeholder || 'Chọn tỉnh trước'}</option>
      {value && !listed && <option value={value} disabled>Đã lưu: {value} (cần kiểm tra lại)</option>}
      {choices.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {state?.error && <span role="alert" className="text-xs text-amber-800">{state.error} <button type="button" disabled={disabled} onClick={state.retry} className="text-blue-700 underline">Tải lại danh mục {field.label.toLocaleLowerCase('vi')}</button></span>}
  </>;
}
