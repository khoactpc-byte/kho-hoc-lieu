import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, RefreshCw, Save, ShieldCheck, UserRound, UserRoundX } from 'lucide-react';
import { postAppsScript } from '../utils/helpers';
import { teacherUsernameFromName } from '../utils/teacherAccess';
import TeacherNameInput from './TeacherNameInput';

const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const SUBJECTS = [
  'Toán', 'Ngữ Văn', 'Khoa học tự nhiên', 'Lịch sử & Địa Lý',
  'Giáo dục công dân', 'Giáo dục địa phương', 'Công nghệ', 'HĐTT', 'Chủ nhiệm'
];
const SCHOOLS = [
  { code: 'NAN', name: 'THCS Nguyễn An Ninh' },
  { code: 'TQK', name: 'THCS Trần Quang Khải' }
];
const emptyDraft = () => ({ id: '', username: '', fullName: '', password: '123456', schoolCode: 'NAN', grades: [], subjects: [] });

export default function TeacherAccountManager({ showNotification, nanTeachers = [], tqkTeachers = [], grades = GRADES, subjects = SUBJECTS }) {
  const [accounts, setAccounts] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const passwordInputId = useId();
  const formRef = useRef(null);
  const passwordInputRef = useRef(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState('');
  const [error, setError] = useState('');

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await postAppsScript({ action: 'listTeacherAccounts' });
      if (response.status !== 'success') throw new Error(response.message || 'Không tải được danh sách tài khoản.');
      setAccounts(Array.isArray(response.accounts) ? response.accounts : []);
    } catch (loadError) {
      setError(loadError.message || 'Không tải được danh sách tài khoản.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const toggleScope = (key, value) => setDraft(previous => ({
    ...previous,
    [key]: previous[key].includes(value)
      ? previous[key].filter(item => item !== value)
      : [...previous[key], value]
  }));

  const resetDraft = () => {
    setDraft(emptyDraft());
    setIsPasswordVisible(true);
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      const response = await postAppsScript({ action: 'saveTeacherAccount', ...draft });
      if (response.status !== 'success') throw new Error(response.message || 'Không lưu được tài khoản.');
      showNotification?.(draft.id ? 'Đã cập nhật tài khoản và phạm vi giảng dạy.' : `Đã tạo tài khoản ${draft.username}.`);
      resetDraft();
      await loadAccounts();
    } catch (saveError) {
      setError(saveError.message || 'Không lưu được tài khoản.');
    } finally {
      setIsSaving(false);
    }
  };

  const editAccount = (account, focusPassword = false) => {
    setDraft({
      id: account.id,
      username: account.username,
      fullName: account.fullName,
      password: '',
      schoolCode: account.schoolCode,
      grades: [...(account.grades || [])],
      subjects: [...(account.subjects || [])]
    });
    setIsPasswordVisible(false);
    formRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    if (focusPassword) passwordInputRef.current?.focus({ preventScroll: true });
  };

  const toggleAccountStatus = async (account) => {
    setBusyAccountId(account.id);
    setError('');
    try {
      const response = await postAppsScript({ action: 'setTeacherAccountStatus', id: account.id, isActive: !account.isActive });
      if (response.status !== 'success') throw new Error(response.message || 'Không đổi được trạng thái tài khoản.');
      await loadAccounts();
      showNotification?.(account.isActive ? `Đã khóa tài khoản ${account.username}.` : `Đã mở lại tài khoản ${account.username}.`);
    } catch (statusError) {
      setError(statusError.message || 'Không đổi được trạng thái tài khoản.');
    } finally {
      setBusyAccountId('');
    }
  };

  const visibleAccounts = accounts.filter(account => !account.grades?.length || account.grades.some(grade => grades.includes(String(grade))));

  return (
    <div className="teacher-account-manager">
      <form ref={formRef} onSubmit={saveAccount} className="password-panel account-form">
        <div className="account-section-header">
          <div>
            <h4 className="password-section-title flex items-center gap-1.5"><UserRound className="h-4 w-4 text-slate-500" />{draft.id ? 'Cập nhật giáo viên' : 'Tạo tài khoản giáo viên'}</h4>
            <p className="password-note mt-0.5">Chọn cơ sở, khối và môn giáo viên được truy cập.</p>
          </div>
          {draft.id && <button type="button" onClick={resetDraft} className="password-button">Tạo mới</button>}
        </div>

        <div className="account-form-fields">
          <div className="account-basic-fields">
            <fieldset className="account-fieldset account-inline-school">
              <legend>Cơ sở</legend>
              <div className="account-school-options">
                {SCHOOLS.map(school => (
                  <button key={school.code} type="button" aria-pressed={draft.schoolCode === school.code} onClick={() => setDraft(previous => ({ ...previous, schoolCode: school.code }))} className="password-button account-scope-option">
                    {school.name}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="account-identity-grid">
              <div className="account-teacher-name">
                <TeacherNameInput
                  key={(draft.id || 'new') + ':' + draft.schoolCode}
                  value={draft.fullName}
                  schoolCode={draft.schoolCode}
                  teachersByCampus={{ NAN: nanTeachers, TQK: tqkTeachers }}
                  onChange={fullName => {
                    setDraft(previous => ({
                      ...previous,
                      fullName,
                      ...(!previous.id ? { username: teacherUsernameFromName(fullName) } : {})
                    }));
                  }}
                />
              </div>
              <label className="account-field">Tên đăng nhập
                <input required minLength={1} maxLength={40} pattern="[a-z0-9][a-z0-9._-]*" title="Dùng chữ thường không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới." value={draft.username} onChange={event => setDraft(previous => ({ ...previous, username: event.target.value.toLowerCase() }))} autoComplete="username" className="password-input" placeholder="Ví dụ: khoa" />
                {!draft.id && <span className="password-note">Tự lấy tên cuối không dấu; sửa lại nếu trùng.</span>}
              </label>
              <div className="account-field account-password-field">
                <label htmlFor={passwordInputId}>{draft.id ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu'}</label>
                <div className="relative">
                  <input ref={passwordInputRef} id={passwordInputId} type={isPasswordVisible ? 'text' : 'password'} required={!draft.id} minLength={6} maxLength={256} value={draft.password} onChange={event => setDraft(previous => ({ ...previous, password: event.target.value }))} autoComplete="new-password" className="password-input pr-10" placeholder="Ít nhất 6 ký tự" />
                  <button type="button" onClick={() => setIsPasswordVisible(previous => !previous)} aria-label={isPasswordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={isPasswordVisible} className="account-password-visibility">
                    {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="account-permission-fields">
            <fieldset className="account-fieldset account-inline-grades">
              <legend>Khối được dạy</legend>
              <div className="flex flex-wrap gap-1.5">
                {grades.map(grade => <button key={grade} type="button" aria-pressed={draft.grades.includes(grade)} onClick={() => toggleScope('grades', grade)} className="password-button account-scope-option">Khối {grade}</button>)}
              </div>
            </fieldset>

            <fieldset className="account-fieldset">
              <legend>Môn được dạy</legend>
              <div className="account-subject-options">
                {subjects.map(subject => <button key={subject} type="button" aria-pressed={draft.subjects.includes(subject)} onClick={() => toggleScope('subjects', subject)} className="password-button account-scope-option">{subject}</button>)}
              </div>
            </fieldset>
          </div>
        </div>

        {error && <div role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">{error}</div>}
        <div className="account-form-footer">
          <p className="password-note flex items-start gap-1.5"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />Mật khẩu được băm khi lưu và không hiện lại trong danh sách.</p>
          <button type="submit" disabled={isSaving} className="password-button password-primary">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : draft.id ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{isSaving ? 'Đang lưu...' : draft.id ? 'Lưu thay đổi' : 'Tạo tài khoản'}
          </button>
        </div>
      </form>

      <section className="password-panel account-list" aria-label="Tài khoản giáo viên đã tạo">
        <div className="account-section-header">
          <h4 className="password-section-title">Tài khoản đã tạo <span className="ml-1 text-xs text-slate-500">({visibleAccounts.length})</span></h4>
          <button type="button" onClick={loadAccounts} disabled={isLoading} className="password-button">
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Tải lại
          </button>
        </div>
        {isLoading ? <div className="account-empty" role="status">Đang tải...</div> : visibleAccounts.length === 0 ? <div className="account-empty">Chưa có tài khoản giáo viên.</div> : (
          <>
            <div className="account-table-scroll" role="region" aria-label="Bảng tài khoản giáo viên" tabIndex={0}>
              <table className="account-table">
                <caption className="sr-only">Tên đăng nhập và phân công của các tài khoản giáo viên</caption>
                <colgroup>
                  {[16, 11, 10, 17, 7, 20, 10, 9].map((width, index) => <col key={index} style={{ width: width + '%' }} />)}
                </colgroup>
                <thead><tr>
                  <th scope="col">Giáo viên</th>
                  <th scope="col">Tên đăng nhập</th>
                  <th scope="col">Mật khẩu</th>
                  <th scope="col">Cơ sở</th>
                  <th scope="col">Khối</th>
                  <th scope="col">Môn được dạy</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Thao tác</th>
                </tr></thead>
                <tbody>
                  {visibleAccounts.map(account => (
                    <tr key={account.id}>
                      <th scope="row">{account.fullName}</th>
                      <td className="account-username">{account.username}</td>
                      <td><button type="button" onClick={() => editAccount(account, true)} aria-label={'Đặt lại mật khẩu cho ' + account.fullName} title="Nhập mật khẩu mới trong biểu mẫu, rồi bấm Lưu thay đổi" className="password-button account-reset-password"><KeyRound className="h-3.5 w-3.5" />Đặt lại</button></td>
                      <td className="account-cell-left">{SCHOOLS.find(school => school.code === account.schoolCode)?.name || account.schoolCode}</td>
                      <td>{(account.grades || []).join(', ') || '—'}</td>
                      <td className="account-cell-left">{(account.subjects || []).join(', ') || 'Chưa phân môn'}</td>
                      <td><span className={'account-status' + (account.isActive ? '' : ' account-status-locked')}>{account.isActive ? 'Đang hoạt động' : 'Đã khóa'}</span></td>
                      <td><div className="flex justify-center gap-1">
                        <button type="button" onClick={() => editAccount(account)} aria-label={'Sửa tài khoản ' + account.fullName} title="Sửa phân công hoặc đặt lại mật khẩu" className="password-button account-icon-button"><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => toggleAccountStatus(account)} disabled={busyAccountId === account.id} aria-label={(account.isActive ? 'Khóa' : 'Mở') + ' tài khoản ' + account.fullName} title={account.isActive ? 'Khóa tài khoản' : 'Mở tài khoản'} className="password-button account-icon-button">
                          {busyAccountId === account.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : account.isActive ? <UserRoundX className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        </button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="password-note mt-2">Mật khẩu đã lưu không xem lại được. Chọn Đặt lại để nhập mật khẩu mới.</p>
          </>
        )}
      </section>
    </div>
  );
}
