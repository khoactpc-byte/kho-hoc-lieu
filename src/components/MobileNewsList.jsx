import { ChevronRight, Pin } from 'lucide-react';

export default function MobileNewsList({ items, onOpen }) {
  return <ul className="home-mobile-headlines" aria-label="Thông báo của trung tâm">{items.map(item => <li key={item.id}>
    <button type="button" onClick={() => onOpen(item)} aria-label={`Xem thông báo: ${item.title}`}>
      <span><strong>{item.isPinned && <Pin size={13} aria-label="Tin ghim" />}{item.title}</strong><time>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</time></span>
      <ChevronRight size={17} aria-hidden="true" />
    </button>
  </li>)}</ul>;
}
