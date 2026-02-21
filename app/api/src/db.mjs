import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), '..', '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'schools.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS schools (
  urn TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT '',
  la_code TEXT NOT NULL DEFAULT '',
  la_name TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  town TEXT NOT NULL DEFAULT '',
  county TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',
  emails_json TEXT NOT NULL DEFAULT '[]',

  has_pupil_premium INTEGER NOT NULL DEFAULT 0,
  has_send INTEGER NOT NULL DEFAULT 0,
  has_governors INTEGER NOT NULL DEFAULT 0,
  ofsted_mention TEXT NOT NULL DEFAULT '',

  region TEXT NOT NULL DEFAULT '',
  scrape_date TEXT NOT NULL DEFAULT '',
  source_row_json TEXT NOT NULL DEFAULT '{}',

  lat REAL,
  lng REAL
);

CREATE TABLE IF NOT EXISTS postcodes (
  postcode TEXT PRIMARY KEY,
  lat REAL,
  lng REAL,
  updatedAt TEXT NOT NULL
);

-- Segments: saved filters / lists
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  filters_json TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_updatedAt ON segments(updatedAt);

-- Campaign drafts (no sending yet)
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'draft',
  segmentId TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_updatedAt ON campaigns(updatedAt);

CREATE INDEX IF NOT EXISTS idx_schools_postcode ON schools(postcode);
CREATE INDEX IF NOT EXISTS idx_schools_region ON schools(region);
CREATE INDEX IF NOT EXISTS idx_schools_phase ON schools(phase);
CREATE INDEX IF NOT EXISTS idx_schools_flags ON schools(has_pupil_premium, has_send, has_governors);

-- CRM: pipeline per school
CREATE TABLE IF NOT EXISTS school_pipeline (
  urn TEXT PRIMARY KEY,
  stage TEXT NOT NULL DEFAULT 'new',
  owner TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  nextActionAt TEXT NOT NULL DEFAULT '',
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (urn) REFERENCES schools(urn) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON school_pipeline(stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_owner ON school_pipeline(owner);

-- CRM: contacts per school
CREATE TABLE IF NOT EXISTS school_contacts (
  id TEXT PRIMARY KEY,
  urn TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'medium',
  notes TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (urn) REFERENCES schools(urn) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contacts_urn ON school_contacts(urn);

-- CRM: activity timeline
CREATE TABLE IF NOT EXISTS school_activities (
  id TEXT PRIMARY KEY,
  urn TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'note',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  happenedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (urn) REFERENCES schools(urn) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_activities_urn ON school_activities(urn, happenedAt DESC);

-- CRM: tasks
CREATE TABLE IF NOT EXISTS school_tasks (
  id TEXT PRIMARY KEY,
  urn TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  owner TEXT NOT NULL DEFAULT '',
  dueAt TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (urn) REFERENCES schools(urn) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tasks_urn ON school_tasks(urn, status, dueAt);

-- Universal CRM tables (project + entity scoped)
CREATE TABLE IF NOT EXISTS crm_pipeline (
  project_key TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new',
  owner TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal',
  nextActionAt TEXT NOT NULL DEFAULT '',
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (project_key, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stage ON crm_pipeline(project_key, stage);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_owner ON crm_pipeline(project_key, owner);

CREATE TABLE IF NOT EXISTS crm_contacts (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'medium',
  notes TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_entity ON crm_contacts(project_key, entity_id, updatedAt DESC);

CREATE TABLE IF NOT EXISTS crm_activities (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'note',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT '',
  happenedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_entity ON crm_activities(project_key, entity_id, happenedAt DESC);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  owner TEXT NOT NULL DEFAULT '',
  dueAt TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_entity ON crm_tasks(project_key, entity_id, status, dueAt);
`);

// Lightweight migration: add source_row_json for legacy DBs.
const schoolCols = db.prepare("PRAGMA table_info(schools)").all().map(c => c.name);
if (!schoolCols.includes('source_row_json')) {
  db.exec("ALTER TABLE schools ADD COLUMN source_row_json TEXT NOT NULL DEFAULT '{}'");
}

export function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
