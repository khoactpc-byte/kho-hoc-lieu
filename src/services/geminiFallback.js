import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, normalizeServiceErrorMessage } from '../utils/helpers.js';

export async function requestWithGeminiFallback(requestForModel, { preferredModel, onWorkingModel } = {}) {
  const supported = GEMINI_MODELS.map(model => model.id);
  const modelIds = [...new Set([preferredModel, DEFAULT_GEMINI_MODEL, ...supported].filter(model => supported.includes(model)))];
  const failures = [];
  for (const modelId of modelIds) {
    try {
      const data = await requestForModel(modelId);
      onWorkingModel?.(data.model || modelId);
      return { data, modelId: data.model || modelId };
    } catch (error) {
      const message = normalizeServiceErrorMessage(error?.message || error);
      failures.push(`${GEMINI_MODELS.find(model => model.id === modelId)?.label || modelId}: ${message}`);
      const retryable = /429|quota|RESOURCE_EXHAUSTED|rate limit|TooManyRequests|GenerateRequestsPer|503|ServiceUnavailable|UNAVAILABLE|overloaded|404|not found|model/i.test(message);
      // New servers already try their model/key list; keep fallback only for older deployments.
      if (error.aiFallbackExhausted || !retryable || modelId === modelIds[modelIds.length - 1]) {
        throw new Error(failures.length > 1 ? `Đã tự động thử các model AI nhưng chưa thành công:\n${failures.map(item => `- ${item}`).join('\n')}` : message, { cause: error });
      }
    }
  }
}
