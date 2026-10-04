import { useCallback, useEffect, useId, useState } from 'react';
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

export default function TeacherAccountManager({ showNotification, nanTeachers = [], tqkTeachers = [] }) {
  const [accounts, setAccounts] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const passwordInputId = useId();
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

  const editAccount = (account) => {
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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
      <form onSubmit={saveAccount} className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-black uppercase text-emerald-950"><UserRound className="h-5 w-5" />{draft.id ? 'Cập nhật giáo viên' : 'Tạo tài khoản giáo viên'}</div>
            <p className="mt-1 text-xs font-medium text-slate-500">Mỗi tài khoản được giới hạn một cơ sở và các khối/môn Admin giao.</p>
          </div>
          {draft.id && <button type="button" onClick={resetDraft} className="text-xs font-bold text-slate-500 hover:text-rose-600">Tạo mới</button>}
        </div>

        <fieldset className="mb-4">
          <legend className="mb-2 text-xs font-black uppercase text-slate-600">Cơ sở</legend>
          <div className="grid grid-cols-2 gap-2">
            {SCHOOLS.map(school => (
              <button key={school.code} type="button" aria-pressed={draft.schoolCode === school.code} onClick={() => setDraft(previous => ({ ...previous, schoolCode: school.code }))} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold ${draft.schoolCode === school.code ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600'}`}>
                {school.name}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <TeacherNameInput
            key={`${draft.id || 'new'}:${draft.schoolCode}`}
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
          <label className="text-xs font-bold text-slate-600">Tên đăng nhập
            <input required minLength={1} maxLength={40} pattern="[a-z0-9][a-z0-9._-]*" title="Dùng chữ thường không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới." value={draft.username} onChange={event => setDraft(previous => ({ ...previous, username: event.target.value.toLowerCase() }))} autoComplete="username" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400" placeholder="Tự lấy tên cuối, ví dụ: khoa" />
            {!draft.id && <span className="mt-1 block font-medium text-slate-400">Tự điền theo tên cuối, không dấu; có thể sửa nếu bị trùng.</span>}
          </label>
          <div className="text-xs font-bold text-slate-600 sm:col-span-2">
            <label htmlFor={passwordInputId}>{draft.id ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu'}</label>
            <div className="relative mt-1">
              <input id={passwordInputId} type={isPasswordVisible ? 'text' : 'password'} required={!draft.id} minLength={6} maxLength={256} value={draft.password} onChange={event => setDraft(previous => ({ ...previous, password: event.target.value }))} autoComplete="new-password" className="h-10 w-full rounded-xl border border-slate-200 pl-3 pr-12 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400" placeholder="Ít nhất 6 ký tự" />
              <button type="button" onClick={() => setIsPasswordVisible(previous => !previous)} aria-label={isPasswordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={isPasswordVisible} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-black uppercase text-slate-600">Khối được dạy</legend>
          <div className="flex flex-wrap gap-2">
            {GRADES.map(grade => <button key={grade} type="button" aria-pressed={draft.grades.includes(grade)} onClick={() => toggleScope('grades', grade)} className={`rounded-lg border px-3 py-2 text-xs font-black ${draft.grades.includes(grade) ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500'}`}>Khối {grade}</button>)}
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-black uppercase text-slate-600">Môn được dạy</legend>
          <div className="grid grid-cols-2 gap-2">
            {SUBJECTS.map(subject => <button key={subject} type="button" aria-pressed={draft.subjects.includes(subject)} onClick={() => toggleScope('subjects', subject)} className={`rounded-lg border px-2.5 py-2 text-left text-[11px] font-bold ${draft.subjects.includes(subject) ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-500'}`}>{subject}</button>)}
          </div>
        </fieldset>

        {error && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">{error}</div>}
        <button type="submit" disabled={isSaving} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black uppercase text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : draft.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{isSaving ? 'Đang lưu...' : draft.id ? 'Lưu thay đổi' : 'Tạo tài khoản'}
        </button>
        <div className="mt-3 flex items-start gap-2 text-[10px] font-medium leading-relaxed text-slate-400"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />Mật khẩu được băm trước khi lưu; màn hình danh sách không hiển thị lại mật khẩu.</div>
      </form>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="font-black uppercase text-slate-900">Tài khoản đã tạo</div>
            <div className="mt-1 text-xs font-medium text-slate-500">{accounts.length} tài khoản</div>
          </div>
          <button type="button" onClick={loadAccounts} disabled={isLoading} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Tải lại
          </button>
        </div>
        {isLoading ? <div className="py-10 text-center text-sm font-semibold text-slate-400">Đang tải...</div> : accounts.length === 0 ? <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-medium text-slate-500">Chưa có tài khoản giáo viên.</div> : (
          <div className="space-y-2">
            {accounts.map(account => (
              <article key={account.id} className={`rounded-2xl border p-3 ${account.isActive ? 'border-slate-200' : 'border-rose-200 bg-rose-50/50 opacity-80'}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-slate-900">{account.fullName}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">@{account.username}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${account.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{account.isActive ? 'Đang hoạt động' : 'Đã khóa'}</span>
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">{SCHOOLS.find(school => school.code === account.schoolCode)?.name || account.schoolCode} · Khối {(account.grades || []).join(', ')} · {(account.subjects || []).join(', ')}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => editAccount(account)} title="Sửa phân công hoặc đặt lại mật khẩu" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-700"><Pencil className="h-4 w-4" /></button>
                    <button type="button" onClick={() => toggleAccountStatus(account)} disabled={busyAccountId === account.id} title={account.isActive ? 'Khóa tài khoản' : 'Mở tài khoản'} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${account.isActive ? 'border-rose-200 text-rose-600 hover:bg-rose-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                      {busyAccountId === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : account.isActive ? <UserRoundX className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
