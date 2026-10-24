import { GEMINI_MODELS, GEMINI_IMAGE_MODELS, normalizeServiceErrorMessage } from '../utils/helpers.js';

export async function requestWithGeminiFallback(requestForModel, { task = 'text', onWorkingModel } = {}) {
  // A previous fallback must never make the next request start with an older model.
  const models = task === 'image' ? GEMINI_IMAGE_MODELS : GEMINI_MODELS;
  const modelIds = models.map(model => model.id);
  const failures = [];
  for (const modelId of modelIds) {
    try {
      const data = await requestForModel(modelId);
      onWorkingModel?.(data.model || modelId);
      return { data, modelId: data.model || modelId };
    } catch (error) {
      const message = normalizeServiceErrorMessage(error?.message || error);
      failures.push(`${models.find(model => model.id === modelId)?.label || modelId}: ${message}`);
      const retryable = /429|quota|RESOURCE_EXHAUSTED|rate limit|TooManyRequests|GenerateRequestsPer|50[0234]|ServiceUnavailable|UNAVAILABLE|overloaded|404|not found|model.*(?:not supported|not available|không hỗ trợ)/i.test(message);
      // New servers already try their model/key list; keep fallback only for older deployments.
      if (error.aiFallbackExhausted || !retryable || modelId === modelIds[modelIds.length - 1]) {
        throw new Error(failures.length > 1 ? `Đã tự động thử các model AI nhưng chưa thành công:\n${failures.map(item => `- ${item}`).join('\n')}` : message, { cause: error });
      }
    }
  }
}
