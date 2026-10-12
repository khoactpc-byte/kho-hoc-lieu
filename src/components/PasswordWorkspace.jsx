import { Loader2, Lock, Save, X } from 'lucide-react';

export default function PasswordWorkspace({
  newAdminPassword, onAdminPasswordChange, onSaveAdminPassword, isSavingAdminPassword,
  staffPassword, onStaffPasswordChange, onSaveStaffPassword, isSavingStaffPassword,
  isStudentCodeEnabled, onToggleStudentCode, onClose, children
}) {
  return (
    <section className="password-workspace" aria-label="Quản lý mật khẩu">
      <header className="password-workspace-header">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-normal text-slate-800"><Lock className="h-4 w-4 text-slate-500" />Quản lý mật khẩu</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng quản lý mật khẩu" title="Đóng" className="password-button password-close"><X className="h-4 w-4" /></button>
      </header>

      <div className="password-workspace-content">
        <div className="password-settings-grid">
          <form className="password-panel password-setting" onSubmit={event => { event.preventDefault(); onSaveAdminPassword(); }}>
            <h4 className="password-section-title">Mật khẩu admin</h4>
            <p id="admin-password-note" className="password-note">Đăng nhập khu quản trị · ít nhất 8 ký tự.</p>
            <div className="password-setting-controls">
              <input aria-label="Mật khẩu admin mới" aria-describedby="admin-password-note" type="password" autoComplete="new-password" minLength={8} required placeholder="Nhập mật khẩu mới" className="password-input" value={newAdminPassword} onChange={event => onAdminPasswordChange(event.target.value)} />
              <button type="submit" disabled={isSavingAdminPassword || newAdminPassword.length < 8} className="password-button password-primary">
                {isSavingAdminPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{isSavingAdminPassword ? 'Đang lưu...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </form>

          <form className="password-panel password-setting" onSubmit={event => { event.preventDefault(); onSaveStaffPassword(); }}>
            <h4 className="password-section-title">Mật khẩu Trần Hưng Đạo</h4>
            <p id="staff-password-note" className="password-note">Truy cập khu Trần Hưng Đạo · ít nhất 8 ký tự.</p>
            <div className="password-setting-controls">
              <input aria-label="Mật khẩu Trần Hưng Đạo mới" aria-describedby="staff-password-note" type="password" autoComplete="new-password" minLength={8} required placeholder="Nhập mật khẩu mới" className="password-input" value={staffPassword} onChange={event => onStaffPasswordChange(event.target.value)} />
              <button type="submit" disabled={isSavingStaffPassword || staffPassword.length < 8} className="password-button password-primary">
                {isSavingStaffPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{isSavingStaffPassword ? 'Đang lưu...' : 'Lưu mật khẩu'}
              </button>
            </div>
          </form>

          <section className="password-panel password-setting">
            <h4 className="password-section-title">Mã học sinh</h4>
            <label className="password-code-toggle">
              <input type="checkbox" checked={isStudentCodeEnabled} onChange={onToggleStudentCode} />
              Bật yêu cầu nhập mã học sinh
            </label>
            <p className="password-note">{isStudentCodeEnabled ? 'Học sinh phải nhập mã để vào học.' : 'Học sinh vào học không cần mã.'}</p>
          </section>
        </div>

        {children}
      </div>
    </section>
  );
}
