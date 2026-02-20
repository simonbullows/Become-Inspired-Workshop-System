-- Kosmos Layer Schema (additive, non-destructive)
-- Apply manually when ready: sqlite3 data/schools.db < app/api/sql/kosmos_schema.sql

CREATE TABLE IF NOT EXISTS kosmos_districts (
  district_code TEXT PRIMARY KEY,
  district_name TEXT NOT NULL,
  district_label TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  county TEXT NOT NULL DEFAULT '',
  nation TEXT NOT NULL DEFAULT 'England',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kosmos_authorities (
  authority_id TEXT PRIMARY KEY,
  authority_name TEXT NOT NULL,
  authority_type TEXT NOT NULL DEFAULT 'other',
  ons_code TEXT NOT NULL DEFAULT '',
  gss_code TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  main_phone TEXT NOT NULL DEFAULT '',
  main_email TEXT NOT NULL DEFAULT '',
  address_line_1 TEXT NOT NULL DEFAULT '',
  address_line_2 TEXT NOT NULL DEFAULT '',
  address_line_3 TEXT NOT NULL DEFAULT '',
  town TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kosmos_contacts (
  contact_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'general',
  contact_label TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_primary INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  last_verified_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (authority_id) REFERENCES kosmos_authorities(authority_id)
);

CREATE TABLE IF NOT EXISTS kosmos_district_authority_map (
  district_code TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'local_authority',
  is_primary INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (district_code, authority_id),
  FOREIGN KEY (district_code) REFERENCES kosmos_districts(district_code),
  FOREIGN KEY (authority_id) REFERENCES kosmos_authorities(authority_id)
);

CREATE INDEX IF NOT EXISTS idx_kosmos_districts_region ON kosmos_districts(region);
CREATE INDEX IF NOT EXISTS idx_kosmos_authorities_type ON kosmos_authorities(authority_type);
CREATE INDEX IF NOT EXISTS idx_kosmos_contacts_authority ON kosmos_contacts(authority_id);
CREATE INDEX IF NOT EXISTS idx_kosmos_contacts_type ON kosmos_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_kosmos_map_authority ON kosmos_district_authority_map(authority_id);
