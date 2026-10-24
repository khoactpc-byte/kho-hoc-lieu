import { useMemo, useState } from 'react';
import { Calendar, Pin, Sparkles, ArrowRight } from 'lucide-react';
import { createNewsPreview } from '../utils/newsPreview';

export default function HomeNewsCard({ news, image = '', fallback = '', fileId = '', onOpen, compact = false }) {
  const [failedImage, setFailedImage] = useState('');
  const preview = useMemo(() => createNewsPreview(window, news.content), [news.content]);
  return <button type="button" onClick={() => onOpen(news)} className={`home-news-card ${compact ? 'is-compact' : ''}`}>
    {image && failedImage !== image && <div className="home-news-card-image"><img key={image} src={image} alt={news.title} onError={event => {
      const node = event.currentTarget, attempt = Number(node.dataset.attempt || 0);
      if (fileId && attempt === 0) { node.dataset.attempt = '1'; node.src = `https://lh3.googleusercontent.com/d/${fileId}=w1000`; }
      else if (fallback && attempt < 2 && node.src !== fallback) { node.dataset.attempt = '2'; node.src = fallback; }
      else setFailedImage(image);
    }} /></div>}
    <div className="home-news-card-meta">
      {news.isPinned ? <span className="text-amber-700"><Pin aria-hidden="true" /> Tin ghim</span> : news.isHot ? <span className="text-rose-700"><Sparkles aria-hidden="true" /> Tin nóng</span> : <span className="text-violet-700">Tin mới</span>}
      <span><Calendar aria-hidden="true" />{new Date(news.createdAt).toLocaleDateString('vi-VN')}</span>
    </div>
    <h4 className={news.isHot ? 'text-rose-800' : 'text-blue-900'}>{news.title}</h4>
    {preview.summary && <p className="home-news-card-summary">{preview.summary}</p>}
    {(!image || failedImage === image) && preview.tableHtml && <div className="home-news-table-preview"><span>Lịch học · xem trước</span><div dangerouslySetInnerHTML={{ __html: preview.tableHtml }} /></div>}
    <span className="home-news-card-open">Xem đầy đủ <ArrowRight aria-hidden="true" /></span>
  </button>;
}
