import { useEffect, useId, useState } from 'react';
import { ChevronDown, FileText, Loader2, Search, UploadCloud, X } from 'lucide-react';
import { formatFileSize, normalizeSearch } from '../registrationModel';
import { provinceOptionLabel } from '../../../utils/provinceLabels';

export function Field({ name, label, values, onChange, errors = {}, required, hint, ...props }) {
  // Native date pickers keep partial day/month/year segments outside React state.
  // defaultValue lets those segments finish without clearing them on every render.
  return <div className="reg-field" data-field={name}>
    <label htmlFor={`reg-${name}`}>{label}{required && <span className="reg-required"> *</span>}</label>
    <input id={`reg-${name}`} name={name} {...(props.type === 'date' ? { defaultValue: values[name] || '' } : { value: values[name] || '' })} onChange={event => onChange({ [name]: event.target.value })}
      onInput={props.type === 'date' ? event => onChange({ [name]: event.target.value }) : undefined}
      required={required} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] || hint ? `reg-help-${name}` : undefined} {...props} />
    {(errors[name] || hint) && <p id={`reg-help-${name}`} className={errors[name] ? 'reg-field-error' : 'reg-hint'}>{errors[name] || hint}</p>}
  </div>;
}

export function SelectField({ name, label, values, onChange, errors = {}, required, options, placeholder = 'Chọn thông tin', hint, ...props }) {
  return <div className="reg-field" data-field={name}>
    <label htmlFor={`reg-${name}`}>{label}{required && <span className="reg-required"> *</span>}</label>
    <div className="reg-select-wrap"><select id={`reg-${name}`} name={name} value={values[name] || ''} onChange={event => onChange({ [name]: event.target.value })}
      required={required} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] || hint ? `reg-help-${name}` : undefined} {...props}>
      <option value="">{placeholder}</option>{options.map(option => <option key={typeof option === 'string' ? option : option.value} value={typeof option === 'string' ? option : option.value}>{typeof option === 'string' ? option : option.label}</option>)}
    </select><ChevronDown size={16} aria-hidden="true" /></div>
    {(errors[name] || hint) && <p id={`reg-help-${name}`} className={errors[name] ? 'reg-field-error' : 'reg-hint'}>{errors[name] || hint}</p>}
  </div>;
}

function ProvinceField({ name, label, options, values, onChange, errors, disabled }) {
  const [query, setQuery] = useState(null);
  const [active, setActive] = useState(0);
  const id = useId();
  const matches = options.filter(option => normalizeSearch(provinceOptionLabel(option)).includes(normalizeSearch(query || '')));
  const choose = option => { onChange({ [name]: option }); setQuery(null); setActive(0); };
  return <div className="reg-field reg-search-field" data-field={name}>
    <label htmlFor={`reg-${name}`}>{label}<span className="reg-required"> *</span></label>
    <div className="reg-search-wrap"><Search size={16} aria-hidden="true" /><input id={`reg-${name}`} name={name} autoComplete="off" disabled={disabled}
      role="combobox" aria-expanded={query !== null} aria-autocomplete="list" aria-controls={id} aria-activedescendant={query !== null && matches[active] ? `${id}-${active}` : undefined}
      aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `reg-help-${name}` : undefined} placeholder="Tìm tỉnh / thành phố" value={query === null ? provinceOptionLabel(values[name]) : query}
      onFocus={() => { setQuery(''); setActive(0); }} onChange={event => { setQuery(event.target.value); setActive(0); }}
      onBlur={() => setQuery(null)} onKeyDown={event => {
        if (event.key === 'Escape') setQuery(null);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setQuery(current => current ?? ''); setActive(index => Math.min(Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)), Math.max(0, matches.length - 1))); }
        if (event.key === 'Enter' && query !== null) { event.preventDefault(); if (matches[active]) choose(matches[active]); }
      }} /></div>
    {query !== null && <ul id={id} role="listbox" aria-label={label} className="reg-search-options">
      {matches.length ? matches.map((option, index) => <li key={option} id={`${id}-${index}`} role="option" aria-selected={index === active}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(option)} onMouseEnter={() => setActive(index)}>{provinceOptionLabel(option)}</li>) : <li className="reg-no-option">Không tìm thấy tỉnh / thành phố</li>}
    </ul>}
    {errors[name] && <p id={`reg-help-${name}`} className="reg-field-error">{errors[name]}</p>}
  </div>;
}

export function Section({ number, title, description, children, action, framed = false }) {
  const titleId = useId();
  return <section className={`reg-section${framed ? ' reg-section-card' : ''}`} aria-labelledby={titleId}><div className="reg-section-heading"><div><h3 id={titleId}>{number && <span>{number}</span>}{title}</h3>{description && <p>{description}</p>}</div>{action}</div>{framed ? <div className="reg-section-body">{children}</div> : children}</section>;
}

export function LocationFields({ prefix, label, values, onChange, errors, directories }) {
  const province = values[`${prefix}Province`];
  const [state, setState] = useState({ province: '', data: null, error: '', loading: false });
  const [retry, setRetry] = useState(0);
  const lookup = directories.lookup;
  useEffect(() => {
    if (!province) return;
    let current = true;
    setState({ province, data: null, error: '', loading: true });
    lookup('birth', province).then(data => { if (current) setState({ province, data, error: '', loading: false }); })
      .catch(error => { if (current) setState({ province, data: null, error: error.message, loading: false }); });
    return () => { current = false; };
  }, [province, lookup, retry, directories.bootstrap?.revision]);
  const data = state.province === province ? state.data : null;
  const loading = Boolean(province && (!data && !state.error || state.loading));
  return <div className="reg-location-block">{label && <h4>{label}</h4>}<div className="reg-grid reg-grid-three">
    <ProvinceField name={`${prefix}Province`} label="Tỉnh / Thành phố" options={directories.bootstrap?.birthProvinces || []} values={values} errors={errors}
      onChange={patch => onChange({ ...patch, [`${prefix}District`]: '', [`${prefix}Ward`]: '' })} />
    <SelectField name={`${prefix}District`} label="Quận / Huyện" required values={values} errors={errors} disabled={!data || loading}
      onChange={patch => onChange({ ...patch, [`${prefix}Ward`]: '' })} options={data?.districts || []} placeholder={loading ? 'Đang tải…' : 'Chọn huyện'} />
    <SelectField name={`${prefix}Ward`} label="Phường / Xã" required values={values} errors={errors} onChange={onChange} disabled={!data || !values[`${prefix}District`]}
      options={data?.communesByDistrict?.[`${province}|||${values[`${prefix}District`]}`] || []} placeholder="Chọn xã" />
  </div>{province && state.province === province && state.error && <p className="reg-inline-error" role="alert">Chưa tải được danh mục. <button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></p>}</div>;
}

export function AddressFields({ household, values, onChange, errors, directories, readOnly }) {
  const provinceKey = household ? 'tinhThanhHK' : 'tinhThanh';
  const wardKey = household ? 'xaPhuongHK' : 'xaPhuong';
  const province = values[provinceKey];
  const [state, setState] = useState({ province: '', data: null, error: '' });
  const [retry, setRetry] = useState(0);
  const lookup = directories.lookup;
  useEffect(() => {
    if (!province) return;
    let current = true;
    setState({ province, data: null, error: '' });
    lookup('address', province).then(data => { if (current) setState({ province, data, error: '' }); })
      .catch(error => { if (current) setState({ province, data: null, error: error.message }); });
    return () => { current = false; };
  }, [province, lookup, retry, directories.bootstrap?.revision]);
  const data = state.province === province ? state.data : null;
  return <><div className="reg-grid reg-address-grid">
    <ProvinceField name={provinceKey} label="Tỉnh / Thành phố" options={directories.bootstrap?.provinces || []} values={values} errors={errors} disabled={readOnly}
      onChange={patch => onChange({ ...patch, [wardKey]: '' })} />
    <SelectField name={wardKey} label="Phường / Xã" required values={values} errors={errors} onChange={onChange} options={data?.items || []} disabled={readOnly || !data}
      placeholder={province && !data && !state.error ? 'Đang tải…' : 'Chọn phường / xã'} />
  </div><Field name={household ? 'soNhaHK' : 'soNha'} label="Số nhà, đường, khu phố / ấp" values={values} errors={errors} onChange={onChange} disabled={readOnly} placeholder="Ví dụ: 12 Nguyễn Văn A, khu phố 3" autoComplete="street-address" />
    {province && state.province === province && state.error && <p className="reg-inline-error" role="alert">Chưa tải được danh mục. <button type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></p>}</>;
}

function FilePreview({ file }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') return;
    const nextUrl = URL.createObjectURL(file); setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url ? <img src={url} alt="" onError={() => setUrl('')} /> : <FileText size={20} aria-hidden="true" />;
}

export function FileUpload({ spec, files, onChange, errors, disabled }) {
  const list = files[spec.key] || [];
  return <div className={`reg-upload${errors[spec.key] ? ' reg-upload-error' : ''}`} data-field={spec.key}><div className="reg-upload-heading"><div className="reg-upload-description"><h3>{spec.label}<span className="reg-required"> *</span>{!!list.length && <small> · {list.length} tệp</small>}</h3><p id={`reg-upload-help-${spec.key}`} className="reg-hint">{spec.hint}</p></div>
    <label className="reg-file-picker"><UploadCloud size={17} aria-hidden="true" /><span>{list.length ? spec.limit === 1 ? 'Thay ảnh' : 'Thêm tệp' : 'Chọn tệp'}</span>
      <input type="file" aria-label={spec.label} aria-required="true" aria-invalid={Boolean(errors[spec.key])} aria-describedby={`reg-upload-help-${spec.key}`} accept={spec.pdf ? 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf' : 'image/jpeg,image/png,image/webp,image/heic,image/heif'} multiple={spec.limit > 1} disabled={disabled}
        onChange={event => {
          const incoming = Array.from(event.target.files || []);
          if (incoming.length) onChange(spec.key, spec.limit === 1 ? incoming : [...list, ...incoming.filter(file => !list.some(saved => saved.name === file.name && saved.size === file.size && saved.lastModified === file.lastModified))]);
          event.target.value = '';
        }} /></label></div>
    {!!list.length && <ul className="reg-file-list">{list.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><div className="reg-file-thumb"><FilePreview file={file} /></div><span><strong title={file.name}>{file.name}</strong><small>{formatFileSize(file.size)}</small></span><button type="button" disabled={disabled} aria-label={`Xóa ${file.name}`} onClick={() => onChange(spec.key, list.filter((_, position) => position !== index))}><X size={18} /></button></li>)}</ul>}
    {errors[spec.key] && <p className="reg-field-error" role="alert">{errors[spec.key]}</p>}
  </div>;
}

export function LoadingState() { return <div className="reg-loading" role="status"><Loader2 className="reg-spin" size={24} /><span>Đang tải thông tin đăng ký…</span></div>; }
