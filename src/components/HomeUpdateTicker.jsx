import { BookOpen } from 'lucide-react';

export default function HomeUpdateTicker({ items, onOpen, error = '', grade = '' }) {
  return <div className="home-update-ticker" aria-label="Cập nhật bài học và bài kiểm tra">
    <span className="home-update-label"><BookOpen aria-hidden="true" /> Mới cập nhật{grade ? ` · Khối ${grade}` : ''}</span>
    {items.length ? <div className="home-update-window"><div className="home-update-track" style={{ '--update-duration': `${Math.max(28, items.length * 10)}s` }}>
      {[0, 1].map(copy => <div key={copy} className="home-update-group" aria-hidden={copy === 1 ? true : undefined}>{items.map(item => <button key={item.id} tabIndex={copy ? -1 : 0} type="button" onClick={() => onOpen(item)} className={item.iconType === 'quiz' ? 'text-rose-700' : item.isAuto ? 'text-emerald-800' : 'text-slate-700'}>{item.title}<span aria-hidden="true"> • </span></button>)}</div>)}
    </div></div> : <span className="home-update-empty">{error || 'Chưa có cập nhật mới.'}</span>}
  </div>;
}
