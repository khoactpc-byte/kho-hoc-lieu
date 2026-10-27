import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { getInstallSnapshot, openInstallHelp, subscribeInstall } from '../pwa/install.js';

export default function PwaInstallButton({ compact = false }) {
  const { installed } = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getInstallSnapshot);
  if (installed) return null;
  return <button type="button" className={`pwa-install-button${compact ? ' pwa-install-compact' : ''}`} onClick={openInstallHelp} aria-label="Cài ứng dụng" title="Cài ứng dụng"><Download size={16} aria-hidden="true" /><span>Cài ứng dụng</span></button>;
}
