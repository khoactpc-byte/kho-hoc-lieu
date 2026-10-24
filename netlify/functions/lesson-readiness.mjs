import { lessonServerReadiness } from '../lib/lessonReadiness.mjs';

export function createLessonReadinessHandler(env = process.env) {
  return async event => {
    const respond = (statusCode, data) => ({ statusCode,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      body: JSON.stringify(data) });
    if (env.KHL_LESSON_PILOT_DIAGNOSTICS !== 'true') return respond(404, { error: 'Không tìm thấy.' });
    if (event.httpMethod !== 'GET') return respond(405, { error: 'Chỉ nhận GET.' });
    return respond(200, lessonServerReadiness(env));
  };
}
export const handler = createLessonReadinessHandler();
