import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { applyUpdate, getInstallSnapshot, installLink, requestInstall, subscribeInstall } from '../pwa/install.js';

export default function PwaInstallManager() {
  const state = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getInstallSnapshot);
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('install') === '1');
  const [updateOpen, setUpdateOpen] = useState(false);
  const [later, setLater] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const panel = useRef(null);
  useEffect(() => {
    const show = () => { setMessage(''); setOpen(true); };
    window.addEventListener('tmt-open-install', show);
    return () => window.removeEventListener('tmt-open-install', show);
  }, []);
  const shown = open || updateOpen;
  useEffect(() => {
    if (!shown) return undefined;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('button')?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { setOpen(false); setUpdateOpen(false); }
      if (event.key === 'Tab') {
        const fields = panel.current?.querySelectorAll('button:not(:disabled), input, a[href]');
        if (!fields?.length) return;
        const first = fields[0], last = fields[fields.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus?.(); };
  }, [shown]);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const embedded = /Zalo|FBAN|FBAV|Instagram|Line\//i.test(navigator.userAgent);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const install = async () => {
    setPending(true);
    const result = await requestInstall();
    setPending(false);
    setMessage(result === 'accepted' ? 'Đã xác nhận cài. Hãy chờ điện thoại hoàn tất, rồi mở biểu tượng ứng dụng.' : result === 'dismissed' ? 'Bạn đã đóng hộp cài. Có thể thử lại qua menu trình duyệt.' : 'Hãy làm theo hướng dẫn cho điện thoại bên dưới.');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(installLink()); setMessage('Đã sao chép đường dẫn cài ứng dụng.'); }
    catch { setMessage('Hãy nhấn giữ ô đường dẫn bên dưới để sao chép.'); }
  };
  return <>
    {state.waiting && !later && <div className="pwa-update-notice" role="status"><span>Có phiên bản mới</span><button type="button" onClick={() => { setOpen(false); setUpdateOpen(true); }}>Xem cập nhật</button><button type="button" aria-label="Để sau" onClick={() => setLater(true)}><X size={15} /></button></div>}
    {shown && createPortal(<div className="pwa-dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) { setOpen(false); setUpdateOpen(false); } }}>
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="pwa-dialog-title" className="pwa-dialog">
        <header><div className="pwa-dialog-brand"><img src="/logo/icon-192.png" alt="" width="48" height="48" /><div><h2 id="pwa-dialog-title">{updateOpen ? 'Cập nhật ứng dụng' : 'Cài ứng dụng'}</h2><p>TTHTCĐ phường Trung Mỹ Tây</p></div></div><button type="button" aria-label="Đóng hướng dẫn cài ứng dụng" onClick={() => { setOpen(false); setUpdateOpen(false); }}><X size={20} /></button></header>
        {updateOpen ? <div className="pwa-dialog-content"><p>Hãy lưu bài làm hoặc dữ liệu đang nhập trước khi cập nhật. Trang này sẽ tải lại.</p><button type="button" className="pwa-primary" onClick={applyUpdate}>Đã lưu xong, cập nhật</button><button type="button" className="pwa-secondary" onClick={() => { setUpdateOpen(false); setLater(true); }}>Để sau</button></div> : <div className="pwa-dialog-content">
          <p>Mở nhanh bằng biểu tượng trên điện thoại, không cần tìm lại đường dẫn.</p>
          {state.installed ? <p className="pwa-feedback" role="status">Ứng dụng đã được cài trên thiết bị này.</p> : <>
            {embedded && <p className="pwa-feedback">Bạn đang mở trong ứng dụng khác. Hãy chọn menu ⋯ → Mở bằng trình duyệt, hoặc sao chép đường dẫn sang Chrome / Safari.</p>}
            {state.prompt && !ios && <button type="button" className="pwa-primary" disabled={pending} onClick={install}><Download size={18} />{pending ? 'Đang mở hộp cài…' : 'Cài trên thiết bị này'}</button>}
            <div className="pwa-steps"><h3>{ios ? 'iPhone / iPad' : 'Điện thoại Android'}</h3>{ios ? <ol><li>Mở trang này bằng Safari.</li><li>Chọn <strong>Chia sẻ</strong> → <strong>Thêm vào màn hình chính</strong>.</li><li>Nếu có, bật <strong>Mở dưới dạng ứng dụng web</strong>, rồi chọn <strong>Thêm</strong>.</li></ol> : <ol><li>Mở trang này bằng Chrome.</li><li>Bấm nút cài phía trên. Nếu chưa có, mở menu <strong>⋮</strong> → <strong>Cài ứng dụng</strong> hoặc <strong>Thêm vào màn hình chính</strong>.</li><li>Xác nhận cài, rồi mở biểu tượng ứng dụng.</li></ol>}</div>
            <details className="pwa-other-device"><summary>{ios ? 'Cài trên Android' : 'Cài trên iPhone / iPad hoặc máy tính'}</summary><p>{ios ? 'Mở bằng Chrome → menu ⋮ → Cài ứng dụng / Thêm vào màn hình chính → xác nhận.' : 'iPhone / iPad: mở bằng Safari → Chia sẻ → Thêm vào màn hình chính → Thêm. Máy tính: dùng Chrome hoặc Edge, chọn biểu tượng cài ở thanh địa chỉ hoặc mục cài trong menu trình duyệt.'}</p></details>
          </>}
          <p className="pwa-network-note">Cần Internet để xem bài và gửi dữ liệu. Đăng nhập một lần trong ứng dụng và chọn “Ghi nhớ đăng nhập” trên thiết bị cá nhân.</p>
          {!local && <div className="pwa-share"><label htmlFor="pwa-install-link">Đường dẫn gửi cho học sinh</label><div><input id="pwa-install-link" readOnly value={installLink()} onFocus={event => event.target.select()} /><button type="button" onClick={copy}>Sao chép</button></div></div>}
          {local && <p className="pwa-feedback">Đây là bản xem thử trên máy tính. Sau khi đưa lên web chính thức, đường dẫn cài cho học sinh sẽ hiện tại đây.</p>}
          {(message || state.error) && <p className="pwa-feedback" role="status">{message || state.error}</p>}
        </div>}
      </section>
    </div>, document.body)}
  </>;
}
