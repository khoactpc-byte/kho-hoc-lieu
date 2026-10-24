export const LESSON_SERVER_VARIABLES = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON',
  'APPS_SCRIPT_URL', 'APPS_SCRIPT_CLIENT_TOKEN', 'IDENTITY_BRIDGE_TOKEN'
];

// Only presence is reported; never serialize environment values or parsed keys.
export function lessonServerReadiness(env) {
  const configured = Object.fromEntries(LESSON_SERVER_VARIABLES.map(key => [key, Boolean(String(env[key] || '').trim())]));
  return { configured, missing: LESSON_SERVER_VARIABLES.filter(key => !configured[key]),
    migrationEnabled: env.KHL_LESSON_MIGRATION_ENABLED === 'true',
    credentialsVerified: false };
}
