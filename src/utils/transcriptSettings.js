export const DEFAULT_TRANSCRIPT_FIRST_YEAR = '2025-2026';
export const TRANSCRIPT_FIRST_YEAR_OPTIONS = ['2025-2026', '2024-2025', '2023-2024'];

export function transcriptFirstYear(value) {
  const compact = String(value || '').replace(/\s+/g, '');
  return TRANSCRIPT_FIRST_YEAR_OPTIONS.includes(compact) ? compact : DEFAULT_TRANSCRIPT_FIRST_YEAR;
}
