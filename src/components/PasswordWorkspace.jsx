import { useState } from 'react';
import { Loader2, Lock, Save, X } from 'lucide-react';

export default function PasswordWorkspace({
  newAdminPassword, onAdminPasswordChange, onSaveAdminPassword, isSavingAdminPassword,
  staffPassword, onStaffPasswordChange, onSaveStaffPassword, isSavingStaffPassword,
  onClose, children, students
}) {
  const [tab, setTab] = useState('teachers');
  return (
    <section className="password-workspace" aria-label="Quản lý mật khẩu">
      <header className="password-workspace-header">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-normal text-slate-800"><Lock className="h-4 w-4 text-slate-500" />Quản lý mật khẩu</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng quản lý mật khẩu" title="Đóng" className="password-button password-close"><X className="h-4 w-4" /></button>
      </header>

      <div className="password-workspace-content">
        <div role="tablist" aria-label="Nhóm tài khoản" className="mb-3 flex gap-2">
          {[['teachers', 'Giáo viên'], ['students', 'Học sinh'], ['system', 'Quản trị & Trần Hưng Đạo']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} id={`password-tab-${key}`} aria-controls={`password-panel-${key}`} onClick={() => setTab(key)} className={`password-button ${tab === key ? 'password-primary' : ''}`}>{label}</button>)}
        </div>
        <div role="tabpanel" id={`password-panel-${tab}`} aria-labelledby={`password-tab-${tab}`}>
        {tab === 'system' && <>
        <div className="password-settings-grid">
          <form className="password-panel password-setting" onSubmit={event => { event.preventDefault(); onSaveAdminPassword(); }}>
            <h4 className="password-section-title">Mật khẩu admin</h4>
            <p id="admin-password-note" className="password-note">Tài khoản addmin · ít nhất 8 ký tự.</p>
            <div className="password-setting-controls">
              <input aria-label="Mật khẩu admin mới" aria-describedby="admin-password-note" type="password" autoComplete="new-password" minLength={8} required placeholder="Nhập mật khẩu mới" className="password-input" value={newAdminPassword} onChange={event => onAdminPasswordChange(event.target.value)} />
              <button type="submit" disabled={isSavingAdminPassword || newAdminPassword.length < 8} className="password-button password-primary">
                {isSavingAdminPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{isSavingAdminPassword ? 'Đang lưu...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>

          <form className="password-panel password-setting" onSubmit={event => { event.preventDefault(); onSaveStaffPassword(); }}>
            <h4 className="password-section-title">Mật khẩu Trần Hưng Đạo</h4>
            <p id="staff-password-note" className="password-note">Tài khoản thd · ít nhất 8 ký tự.</p>
            <div className="password-setting-controls">
              <input aria-label="Mật khẩu Trần Hưng Đạo mới" aria-describedby="staff-password-note" type="password" autoComplete="new-password" minLength={8} required placeholder="Nhập mật khẩu mới" className="password-input" value={staffPassword} onChange={event => onStaffPasswordChange(event.target.value)} />
              <button type="submit" disabled={isSavingStaffPassword || staffPassword.length < 8} className="password-button password-primary">
                {isSavingStaffPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{isSavingStaffPassword ? 'Đang lưu...' : 'Lưu mật khẩu'}
              </button>
            </div>
          </form>

        </div>
        </>}
        {tab === 'teachers' && children}
        {tab === 'students' && students}
        </div>
      </div>
    </section>
  );
}
