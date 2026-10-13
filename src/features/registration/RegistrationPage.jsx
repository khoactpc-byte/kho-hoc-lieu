import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, FileCheck2, GraduationCap, Loader2 } from 'lucide-react';
import { REGISTRATION_WEB_APP_URL } from '../../config/registration';
import useRegistrationDirectories from './useRegistrationDirectories';
import { FILE_FIELDS, REGISTRATION_STEPS, emptyRegistration, formatFileSize, hasNoIdentity, registrationPayload, validateStep } from './registrationModel';
import { submitRegistration } from './registrationApi';
import { AddressFields, Field, FileUpload, LoadingState, LocationFields, Section, SelectField } from './components/RegistrationFields';
import RegistrationReview from './components/RegistrationReview';
import AcademicHistoryFields from './components/AcademicHistoryFields';
import './registration.css';

export default function RegistrationPage() {
  const directories = useRegistrationDirectories();
  const config = directories.bootstrap?.config;
  const [values, setValues] = useState(emptyRegistration);
  const [files, setFiles] = useState({});
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [sameAddress, setSameAddress] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const content = useRef(null);
  const submission = useRef(null);
  const submitting = useRef(false);
  const dirty = Object.values(values).some(Boolean) || Object.values(files).some(list => list.length);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Đăng ký nhập học | Kho học liệu';
    return () => { document.title = previousTitle; };
  }, []);
  useEffect(() => {
    if (!dirty || result) return;
    const beforeLeave = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeLeave);
    return () => window.removeEventListener('beforeunload', beforeLeave);
  }, [dirty, result]);

  const update = patch => {
    if (submitting.current) return;
    setValues(previous => {
      const next = { ...previous, ...patch };
      if ('coSoHoc' in patch && patch.coSoHoc !== previous.coSoHoc) next.lopHoc = '';
      if (sameAddress) { next.tinhThanhHK = next.tinhThanh; next.xaPhuongHK = next.xaPhuong; next.soNhaHK = next.soNha; }
      return next;
    });
    setErrors(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !(key in patch))));
    setConfirmed(false); setMessage('');
  };
  const move = next => {
    if (submitting.current) return;
    setStep(next); setErrors({}); setMessage('');
    window.requestAnimationFrame(() => { content.current?.focus(); content.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  };
  const focusError = nextErrors => {
    window.requestAnimationFrame(() => {
      const element = document.querySelector(`[data-field="${Object.keys(nextErrors)[0]}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element?.querySelector('input, select')?.focus();
    });
  };
  const advance = () => {
    const found = validateStep(step, values, files, config);
    if (Object.keys(found).length) { setErrors(found); focusError(found); return; }
    move(step + 1);
  };
  const submit = async event => {
    event.preventDefault();
    if (step < 4) { advance(); return; }
    if (submitting.current) return;
    for (let index = 0; index < 4; index++) {
      const found = validateStep(index, values, files, config);
      if (Object.keys(found).length) { move(index); setErrors(found); focusError(found); return; }
    }
    if (!confirmed) { setErrors({ confirmed: 'Vui lòng xác nhận thông tin trước khi gửi.' }); return; }
    if (Number(config.publicApiVersion) < 1 || !config.publicApiVersion) { setMessage('Biểu mẫu đang được cập nhật. Bạn có thể gửi hồ sơ bằng biểu mẫu dự phòng bên dưới.'); return; }
    submitting.current = true; setSending(true); setMessage('');
    try {
      const form = registrationPayload(values, config);
      const fingerprint = JSON.stringify([form, Object.fromEntries(Object.entries(files).map(([key, list]) => [key, list.map(file => [file.name, file.size, file.lastModified])]))]);
      if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, id: `dk-${globalThis.crypto.randomUUID()}` };
      setResult(await submitRegistration(form, files, submission.current.id, setProgress));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) { setMessage(error.message); }
    finally { submitting.current = false; setSending(false); }
  };
  const backToLogin = () => {
    if (sending) return;
    if (dirty && !result && !window.confirm('Thông tin chưa gửi sẽ không được giữ khi rời trang. Quay lại đăng nhập?')) return;
    window.location.hash = '';
  };
  const fieldProps = { values, errors, onChange: update };
  const school = config?.schools.find(item => item.key === values.coSoHoc);
  const visibleFiles = FILE_FIELDS.filter(spec => spec.key !== 'anhCanCuoc' || !hasNoIdentity(values.maDinhDanh)).flatMap(spec => files[spec.key] || []);
  const totalFiles = visibleFiles.length;
  const totalSize = visibleFiles.reduce((sum, file) => sum + file.size, 0);

  return <div className="registration-page">
    <header className="reg-topbar"><button className="reg-brand" type="button" disabled={sending} onClick={backToLogin}><span className="reg-brand-icon"><GraduationCap size={23} /></span><span>Kho học liệu<small>CỔNG ĐĂNG KÝ HỌC SINH</small></span></button><button type="button" className="reg-back-link" onClick={backToLogin} disabled={sending}><ArrowLeft size={15} /><span>Về đăng nhập</span></button></header>
    <main className="reg-main">
      <div className="reg-intro"><h1>Đăng ký nhập học</h1>{config && <span className="reg-year"><i aria-hidden="true" /><span className="reg-year-label">Năm học</span>{config.currentSchoolYear}</span>}</div>
      {result ? <div className="reg-success" role="status"><div className="reg-success-icon"><CheckCircle2 size={34} /></div><span className="reg-eyebrow">ĐÃ TIẾP NHẬN HỒ SƠ</span><h2>Đăng ký thành công!</h2><p>Hồ sơ của <strong>{values.hoVaTen}</strong> đã được gửi đến nhà trường để xét duyệt.</p><dl><div><dt>Cơ sở</dt><dd>{school?.name}</dd></div><div><dt>Lớp đăng ký</dt><dd>{values.lopHoc}</dd></div><div><dt>Năm học</dt><dd>{result.schoolYear || config.currentSchoolYear}</dd></div></dl><p className="reg-hint">Bạn chưa cần gửi lại hồ sơ. Nhà trường sẽ kiểm tra và hướng dẫn bước tiếp theo.</p><button className="reg-primary" onClick={backToLogin}>Về trang đăng nhập<ArrowRight size={16} /></button></div> : <div className="reg-layout">
        <div className="reg-form-shell"><div className="reg-form-heading" ref={content} tabIndex={-1}><div className="reg-step-caption">Bước {step + 1} / {REGISTRATION_STEPS.length}<span>Dấu <b>*</b> là bắt buộc</span></div><h2>{REGISTRATION_STEPS[step]}</h2></div>
          {directories.loading && !config ? <LoadingState /> : <>
            {directories.error && <div className="reg-banner reg-banner-error" role="alert"><span>{directories.error}</span><button type="button" onClick={directories.refresh} disabled={directories.loading}>{directories.loading ? 'Đang tải…' : 'Tải lại'}</button></div>}
            {config && <form onSubmit={submit} noValidate><fieldset className="reg-form-fields" disabled={sending}>
              {step === 0 && <>
                <Section title="Cơ sở và lớp đăng ký"><div className="reg-grid reg-campus-grid">
                  <SelectField {...fieldProps} name="coSoHoc" label="Cơ sở đăng ký học" required options={config.schools.map(item => ({ value: item.key, label: item.name }))} placeholder="Chọn cơ sở đăng ký" />
                  <SelectField {...fieldProps} name="lopHoc" label="Lớp đăng ký" required options={school ? Array.from({ length: 9 }, (_, index) => ({ value: `${index + 1}${school.suffix}`, label: `Lớp ${index + 1}${school.suffix}` })) : []} disabled={!school} placeholder={school ? 'Chọn lớp đăng ký' : 'Vui lòng chọn cơ sở trước'} />
                </div></Section>
                <AcademicHistoryFields {...fieldProps} />
                <Section title="Thông tin cá nhân"><div className="reg-grid reg-student-grid">
                  <Field {...fieldProps} name="hoVaTen" label="Họ và tên học sinh" required autoComplete="name" placeholder="Nguyễn Văn An" maxLength={120} />
                  <Field {...fieldProps} name="ngaySinh" label="Ngày sinh" required type="date" autoComplete="bday" min="1900-01-01" max={new Date().toLocaleDateString('sv-SE')} />
                  <SelectField {...fieldProps} name="gioiTinh" label="Giới tính" required options={['Nam', 'Nữ']} placeholder="Chọn giới tính" />
                  <Field {...fieldProps} name="soDienThoai" label="Số điện thoại liên hệ" required type="tel" inputMode="tel" autoComplete="tel" placeholder="Nhập số điện thoại" maxLength={20} />
                </div><Field {...fieldProps} name="maDinhDanh" label="Mã định danh cá nhân" required placeholder="12 số hoặc ghi: học sinh chưa có" maxLength={30} hint="Có mã định danh: cần đính kèm ảnh CCCD ở bước hồ sơ." /></Section>
              </>}
              {step === 1 && <>
                <Section title="Thông tin trên giấy khai sinh" description="Tỉnh, huyện, xã theo chính quyền 3 cấp cũ, như trên giấy tờ.">
                  <LocationFields {...fieldProps} prefix="birth" label="Nơi sinh" directories={directories} />
                  <Field {...fieldProps} name="birthPlaceName" label="Tên bệnh viện / nơi sinh" placeholder="Tên bệnh viện hoặc nơi sinh ghi trên giấy khai sinh" maxLength={200} />
                  <LocationFields {...fieldProps} prefix="birthRegistration" label="Nơi đăng ký khai sinh" directories={directories} />
                  <LocationFields {...fieldProps} prefix="hometown" label="Quê quán" directories={directories} />
                </Section>
                <Section title="Nơi ở hiện tại" description="Tỉnh, thành phố và xã, phường theo chính quyền 2 cấp hiện tại."><AddressFields {...fieldProps} directories={directories} /></Section>
                <Section title="Địa chỉ thường trú" description="Điền theo thông tin thường trú của học sinh."><label className="reg-checkbox"><input type="checkbox" checked={sameAddress} onChange={event => { setSameAddress(event.target.checked); if (event.target.checked) update({ tinhThanhHK: values.tinhThanh, xaPhuongHK: values.xaPhuong, soNhaHK: values.soNha }); }} /><span>Giống địa chỉ nơi ở hiện tại</span></label><AddressFields {...fieldProps} household directories={directories} readOnly={sameAddress} /></Section>
              </>}
              {step === 2 && <>
                {['Cha', 'Mẹ'].map((label, index) => { const suffix = index ? 'Me' : 'Cha'; return <Section key={suffix} title={`Thông tin ${label.toLocaleLowerCase('vi-VN')}`} description="Có thể bỏ trống thông tin không có."><div className="reg-grid">
                  <Field {...fieldProps} name={`ten${suffix}`} label={`Họ và tên ${label.toLocaleLowerCase('vi-VN')}`} placeholder="Nhập họ và tên" maxLength={120} />
                  <Field {...fieldProps} name={`namSinh${suffix}`} label="Năm sinh" inputMode="numeric" maxLength={4} placeholder="Ví dụ: 1985" />
                  <Field {...fieldProps} name={`ngheNghiep${suffix}`} label="Nghề nghiệp" maxLength={120} placeholder="Nhập nghề nghiệp" />
                  <Field {...fieldProps} name={`sdt${suffix}`} label="Số điện thoại" type="tel" inputMode="tel" maxLength={20} placeholder="Nhập số điện thoại" />
                </div></Section>; })}
                <Section title="Thông tin bổ sung"><div className="reg-grid"><SelectField {...fieldProps} name="tinhTrangTamTru" label="Tình trạng tạm trú" required options={['Đang có hộ khẩu/tạm trú', 'Chuẩn bị làm tạm trú']} /><SelectField {...fieldProps} name="diXe" label="Đăng ký đi xe" required options={['Có', 'Không']} /></div></Section>
              </>}
              {step === 3 && <><p className="reg-upload-note">Ảnh rõ nét hoặc PDF học bạ · Tối đa 10 MB / tệp, 25 MB / hồ sơ.</p>{hasNoIdentity(values.maDinhDanh) && <p className="reg-identity-note">Không yêu cầu ảnh CCCD vì học sinh chưa có mã định danh.</p>}<div className="reg-uploads">{FILE_FIELDS.filter(spec => spec.key !== 'anhCanCuoc' || !hasNoIdentity(values.maDinhDanh)).map(spec => <FileUpload key={spec.key} spec={spec} files={files} errors={errors} onChange={(key, list) => { setFiles(previous => ({ ...previous, [key]: list })); setErrors(previous => ({ ...previous, [key]: '', files: '' })); setConfirmed(false); }} />)}</div>{errors.files && <p className="reg-field-error" role="alert">{errors.files}</p>}<div className="reg-upload-summary"><FileCheck2 size={17} />{totalFiles} tệp đã chọn<span>{formatFileSize(totalSize)} / 25 MB</span></div></>}
              {step === 4 && <><RegistrationReview values={values} config={config} files={files} onEdit={move} /><label className="reg-checkbox reg-confirmation"><input type="checkbox" checked={confirmed} onChange={event => { setConfirmed(event.target.checked); setErrors({}); }} /><span>Tôi đã kiểm tra và xác nhận các thông tin, hồ sơ đính kèm là chính xác.</span></label>{errors.confirmed && <p className="reg-field-error" role="alert">{errors.confirmed}</p>}</>}
            </fieldset>
            {message && <div className="reg-banner reg-banner-error" role="alert"><span>{message}</span>{/Năm.*thay đổi/i.test(message) && <button type="button" onClick={directories.refresh}>Cập nhật năm học</button>}</div>}
            {sending && <div className="reg-sending" role="status"><Loader2 size={18} className="reg-spin" />{progress}</div>}
            <div className="reg-form-footer"><button type="button" className="reg-secondary" onClick={() => step ? move(step - 1) : backToLogin()} disabled={sending}><ArrowLeft size={16} />{step ? 'Quay lại' : 'Đăng nhập'}</button><button type="submit" className="reg-primary" disabled={sending || directories.loading || Boolean(directories.error)}>{sending ? 'Đang gửi hồ sơ…' : step === 4 ? 'Gửi hồ sơ đăng ký' : 'Tiếp tục'}{sending ? <Loader2 size={17} className="reg-spin" /> : <ArrowRight size={17} />}</button></div>
          </form>}
          </>}
        </div>
      </div>}
      <footer className="reg-page-footer"><span>© {new Date().getFullYear()} Kho học liệu · Cổng đăng ký học sinh</span>{!sending && !result && <a href={REGISTRATION_WEB_APP_URL} target="_blank" rel="noopener noreferrer">Biểu mẫu dự phòng<ArrowRight size={13} /></a>}</footer>
    </main>
  </div>;
}
