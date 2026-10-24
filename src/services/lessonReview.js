export async function clearLessonReview(material, { serverEnabled, request, clearLegacy }) {
  if (!material?.id || material.type !== 'quick_quiz') throw new Error('Không tìm thấy bộ câu hỏi ôn tập.');
  if (!serverEnabled) return clearLegacy(material.id);
  return request('clear', { kind: 'material', quizId: material.id, expectedVersion: material.serverVersion ?? null, expectedLegacyUpdatedAt: material.updatedAt ?? null });
}
