import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { copyTextSafely } from '../utils/clipboard';

export default function AttendanceCopyButton({ message, disabled, className = '' }) {
  const [state, setState] = useState('idle');
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setState('idle');
    return () => { generation.current += 1; };
  }, [message, disabled]);
  const copy = async () => {
    if (disabled || state === 'copying') return;
    const revision = generation.current;
    setState('copying');
    const copied = await copyTextSafely(message);
    if (generation.current === revision) setState(copied ? 'copied' : 'error');
  };
  const label = state === 'copied' ? 'Đã sao chép' : state === 'copying' ? 'Đang sao chép' : 'Sao chép Zalo';
  const Icon = state === 'copied' ? Check : state === 'copying' ? Loader2 : Copy;
  return <div className="attendance-copy-control">
    <button type="button" title={label} aria-label={label} disabled={disabled || state === 'copying'}
      onClick={copy} data-copy-state={state} className={`attendance-copy-button ${className}`}>
      <Icon size={14} className={state === 'copying' ? 'animate-spin' : ''} /><span aria-live="polite">{label}</span>
    </button>
    {state === 'error' && <span role="alert" className="attendance-copy-error">Chưa sao chép được. Vui lòng thử lại.</span>}
  </div>;
}
