export const normalizeEssayRotation = turns => ((turns % 4) + 4) % 4;

// Annotations remain in the original page coordinates, regardless of viewing angle.
export function essayPointFromView(x, y, turns) {
  const u = Math.max(0, Math.min(1, x)), v = Math.max(0, Math.min(1, y));
  const point = [[u, v], [v, 1 - u], [1 - u, 1 - v], [1 - v, u]][normalizeEssayRotation(turns)];
  return { x: Math.round(point[0] * 1000), y: Math.round(point[1] * 1000) };
}

export function essayRotationLayout(width, height, turns) {
  const rotation = normalizeEssayRotation(turns), ratio = width > 0 && height > 0 ? width / height : 1;
  return {
    aspectRatio: rotation % 2 ? 1 / ratio : ratio,
    width: `${rotation % 2 ? ratio * 100 : 100}%`,
    transform: ['none', 'rotate(90deg) translateY(-100%)', 'rotate(180deg) translate(-100%, -100%)', 'rotate(270deg) translateX(-100%)'][rotation],
  };
}
