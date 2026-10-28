CREATE TABLE IF NOT EXISTS profile_intake (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  school_code TEXT NOT NULL,
  school_year TEXT NOT NULL,
  grade INTEGER NOT NULL,
  access_code TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  changes_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','synced','rejected')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_intake_pending_owner ON profile_intake(owner_key) WHERE status='pending';
CREATE INDEX IF NOT EXISTS profile_intake_admin_list ON profile_intake(school_year,status,created_at,id);

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
