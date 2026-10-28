CREATE TABLE IF NOT EXISTS profile_intake_reviews (
  request_id TEXT PRIMARY KEY REFERENCES profile_intake(id),
  version INTEGER NOT NULL DEFAULT 0,
  decisions_json TEXT NOT NULL DEFAULT '{}',
  applied_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT 0,
  last_operation TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS profile_intake_review_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES profile_intake(id),
  version INTEGER NOT NULL,
  action TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS profile_intake_review_history ON profile_intake_review_events(request_id,version);

