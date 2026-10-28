CREATE TABLE IF NOT EXISTS student_profile_overrides (
  school_code TEXT NOT NULL,
  school_year TEXT NOT NULL,
  grade INTEGER NOT NULL,
  access_code TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (school_code, school_year, access_code)
);
CREATE INDEX IF NOT EXISTS student_profile_overrides_year ON student_profile_overrides(school_year, grade, access_code);
