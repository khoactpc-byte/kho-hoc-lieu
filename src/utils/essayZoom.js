export const ESSAY_ZOOM_LEVELS = [25, 33, 50, 67, 75, 100, 125, 150, 200];

export function essayPageWidth(zoom, viewport, aspectRatio) {
  if (zoom !== 'fit') return `${zoom === 'width' ? 100 : zoom}%`;
  if (!(viewport.width > 0 && viewport.height > 0 && aspectRatio > 0)) return '100%';
  return `${Math.max(1, Math.floor(Math.min(viewport.width, viewport.height * aspectRatio)))}px`;
}

export function stepEssayZoom(zoom, direction, viewport, aspectRatio) {
  const current = zoom === 'width' ? 100 : zoom === 'fit'
    ? Math.min(100, viewport.width > 0 ? viewport.height * aspectRatio / viewport.width * 100 : 100) : Number(zoom);
  return direction > 0 ? ESSAY_ZOOM_LEVELS.find(level => level > current + .1) ?? 200
    : [...ESSAY_ZOOM_LEVELS].reverse().find(level => level < current - .1) ?? 25;
}
