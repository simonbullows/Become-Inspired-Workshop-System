import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db, safeJson } from './db.mjs';

const PORT = Number(process.env.PORT || 8787);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PROJECTS = {
  schools: { key: 'schools', name: 'Schools Outreach', entityLabel: 'school' },
  universities: { key: 'universities', name: 'Universities Outreach', entityLabel: 'university' },
  hotels: { key: 'hotels', name: 'Hotels Outreach', entityLabel: 'hotel' },
};

function getProjectOr404(projectKey, res) {
  const p = PROJECTS[String(projectKey || '')];
  if (!p) {
    res.status(404).json({ error: 'unknown_project' });
    return null;
  }
  return p;
}

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/api/projects', (req, res) => res.json({ projects: Object.values(PROJECTS) }));

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] || '').trim();
    });
    return row;
  });
}

function loadUniversitiesRows() {
  const root = path.resolve(process.cwd(), '..', '..');
  const cleanPath = path.join(root, 'data', 'universities', 'universities_comms_clean.csv');
  const mapPath = path.join(root, 'data', 'universities', 'universities_map.csv');
  const masterPath = path.join(root, 'data', 'universities', 'universities_master.csv');

  const readRows = (p) => {
    if (!fs.existsSync(p)) return [];
    return parseCsv(fs.readFileSync(p, 'utf8'));
  };

  const masterRows = readRows(masterPath);
  const mapRows = readRows(mapPath);
  const cleanRows = readRows(cleanPath);
  return masterRows.length > 0 ? masterRows : (mapRows.length > 0 ? mapRows : cleanRows);
}

app.get('/api/universities', (req, res) => {
  const rows = loadUniversitiesRows();
  const withEmail = rows.filter(r => String(r.email || '').includes('@')).length;
  res.json({ universities: rows, meta: { total: rows.length, withEmail } });
});

app.get('/api/:project/entities', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;

  if (project.key === 'schools') {
    const rows = db.prepare('SELECT urn, name, phase, region, town, postcode, website, telephone, emails_json, lat, lng FROM schools ORDER BY name ASC LIMIT 2000').all();
    return res.json({ entities: rows.map(r => ({ id: r.urn, name: r.name, project: 'schools', lat: r.lat, lng: r.lng, data: { ...r, emails: safeJson(r.emails_json, []) } })) });
  }

  if (project.key === 'universities') {
    const rows = loadUniversitiesRows();
    return res.json({ entities: rows.map(r => ({ id: String(r.university || ''), name: String(r.university || ''), project: 'universities', lat: Number(r.lat), lng: Number(r.lng), data: r })) });
  }

  return res.json({ entities: [] });
});

// ---- Schools API (v0.1) ----

const SchoolsQuery = z.object({
  q: z.string().optional(),
  region: z.string().optional(),
  phase: z.string().optional(),
  hasSend: z.coerce.boolean().optional(),
  hasPupilPremium: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(500),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

function buildWhere(params) {
  const where = [];
  const args = [];

  if (params.q) {
    where.push('(name LIKE ? OR urn LIKE ? OR postcode LIKE ? OR town LIKE ?)');
    const like = `%${params.q}%`;
    args.push(like, like, like, like);
  }
  if (params.region) { where.push('region = ?'); args.push(params.region); }
  if (params.phase) { where.push('phase = ?'); args.push(params.phase); }
  if (params.hasSend === true) { where.push('has_send = 1'); }
  if (params.hasPupilPremium === true) { where.push('has_pupil_premium = 1'); }

  return { clause: where.length ? ('WHERE ' + where.join(' AND ')) : '', args };
}

app.get('/api/schools', (req, res) => {
  const parsed = SchoolsQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const params = parsed.data;
  const { clause, args } = buildWhere(params);

  const rows = db.prepare(
    `SELECT urn, name, phase, region, town, postcode, website, telephone, emails_json, has_pupil_premium, has_send, ofsted_mention, lat, lng
     FROM schools
     ${clause}
     ORDER BY name ASC
     LIMIT ? OFFSET ?`
  ).all(...args, params.limit, params.offset);

  const totals = db.prepare(`SELECT COUNT(*) as schools FROM schools ${clause}`).get(...args);
  const withEmails = db.prepare(`SELECT SUM(CASE WHEN emails_json != '[]' THEN 1 ELSE 0 END) as withEmails FROM schools ${clause}`).get(...args);
  const geocoded = db.prepare(`SELECT SUM(CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 1 ELSE 0 END) as geocoded FROM schools ${clause}`).get(...args);

  res.json({
    schools: rows.map(r => ({
      ...r,
      emails: safeJson(r.emails_json, []),
    })),
    meta: {
      schools: Number(totals?.schools || 0),
      withEmails: Number(withEmails?.withEmails || 0),
      withoutEmails: Number(totals?.schools || 0) - Number(withEmails?.withEmails || 0),
      geocoded: Number(geocoded?.geocoded || 0),
    }
  });
});

app.get('/api/schools/:urn', (req, res) => {
  const urn = String(req.params.urn || '');
  const row = db.prepare('SELECT * FROM schools WHERE urn = ?').get(urn);
  if (!row) return res.status(404).json({ error: 'not_found' });
  res.json({
    school: {
      ...row,
      emails: safeJson(row.emails_json, []),
      source_row: safeJson(row.source_row_json, {}),
    }
  });
});

app.get('/api/stats', (req, res) => {
  const byRegion = db.prepare('SELECT region, COUNT(*) as count FROM schools GROUP BY region ORDER BY count DESC').all();
  const byPhase = db.prepare('SELECT phase, COUNT(*) as count FROM schools GROUP BY phase ORDER BY count DESC').all();
  const totals = db.prepare('SELECT COUNT(*) as schools FROM schools').get();
  const enriched = db.prepare("SELECT SUM(CASE WHEN emails_json != '[]' THEN 1 ELSE 0 END) as withEmails FROM schools").get();
  res.json({ byRegion, byPhase, totals, enriched });
});

// ---- Segments API (v0.1) ----

const SegmentCreate = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().default(''),
  filters: z.record(z.any()).optional().default({}),
});

const SegmentPatch = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  filters: z.record(z.any()).optional(),
});

app.get('/api/segments', (req, res) => {
  const rows = db.prepare('SELECT * FROM segments ORDER BY updatedAt DESC').all();
  res.json({ segments: rows.map(r => ({ ...r, filters: safeJson(r.filters_json, {}) })) });
});

app.post('/api/segments', (req, res) => {
  const parsed = SegmentCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  db.prepare('INSERT INTO segments (id, name, description, filters_json, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, parsed.data.name, parsed.data.description, JSON.stringify(parsed.data.filters), ts, ts);
  res.status(201).json({ id });
});

app.patch('/api/segments/:id', (req, res) => {
  const id = String(req.params.id);
  const parsed = SegmentPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = db.prepare('SELECT * FROM segments WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const ts = new Date().toISOString();
  const next = {
    ...existing,
    ...parsed.data,
    filters_json: (parsed.data.filters ? JSON.stringify(parsed.data.filters) : existing.filters_json),
    updatedAt: ts,
  };

  db.prepare('UPDATE segments SET name=?, description=?, filters_json=?, updatedAt=? WHERE id=?')
    .run(next.name, next.description, next.filters_json, next.updatedAt, id);
  res.json({ ok: true });
});

app.delete('/api/segments/:id', (req, res) => {
  const id = String(req.params.id);
  db.prepare('DELETE FROM segments WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- Campaigns API (draft-only) ----

const CampaignCreate = z.object({
  name: z.string().min(1).max(120),
  channel: z.enum(['email']).optional().default('email'),
  segmentId: z.string().max(80).optional().default(''),
  subject: z.string().max(200).optional().default(''),
  body: z.string().max(20000).optional().default(''),
});

const CampaignPatch = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(['draft', 'ready', 'sent', 'archived']).optional(),
  segmentId: z.string().max(80).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
});

app.get('/api/campaigns', (req, res) => {
  const rows = db.prepare('SELECT * FROM campaigns ORDER BY updatedAt DESC').all();
  res.json({ campaigns: rows });
});

app.post('/api/campaigns', (req, res) => {
  const parsed = CampaignCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const d = parsed.data;
  db.prepare('INSERT INTO campaigns (id, name, channel, status, segmentId, subject, body, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, d.name, d.channel, 'draft', d.segmentId, d.subject, d.body, ts, ts);
  res.status(201).json({ id });
});

app.patch('/api/campaigns/:id', (req, res) => {
  const id = String(req.params.id);
  const parsed = CampaignPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const ts = new Date().toISOString();
  const next = { ...existing, ...parsed.data, updatedAt: ts };
  db.prepare('UPDATE campaigns SET name=?, channel=?, status=?, segmentId=?, subject=?, body=?, updatedAt=? WHERE id=?')
    .run(next.name, next.channel, next.status, next.segmentId, next.subject, next.body, next.updatedAt, id);
  res.json({ ok: true });
});

app.delete('/api/campaigns/:id', (req, res) => {
  const id = String(req.params.id);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- School CRM API ----

const PipelinePatch = z.object({
  stage: z.string().min(1).max(40).optional(),
  owner: z.string().max(120).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  nextActionAt: z.string().max(60).optional(),
});

const ContactCreate = z.object({
  name: z.string().min(1).max(140),
  role: z.string().max(140).optional().default(''),
  email: z.string().max(240).optional().default(''),
  phone: z.string().max(80).optional().default(''),
  source: z.string().max(200).optional().default(''),
  confidence: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  notes: z.string().max(4000).optional().default(''),
});

const ActivityCreate = z.object({
  type: z.enum(['note', 'call', 'email', 'meeting', 'task']).optional().default('note'),
  summary: z.string().min(1).max(300),
  body: z.string().max(20000).optional().default(''),
  actor: z.string().max(120).optional().default(''),
  happenedAt: z.string().max(60).optional(),
});

const TaskCreate = z.object({
  title: z.string().min(1).max(300),
  owner: z.string().max(120).optional().default(''),
  dueAt: z.string().max(60).optional().default(''),
  notes: z.string().max(4000).optional().default(''),
});

const TaskPatch = z.object({
  title: z.string().min(1).max(300).optional(),
  owner: z.string().max(120).optional(),
  dueAt: z.string().max(60).optional(),
  notes: z.string().max(4000).optional(),
  status: z.enum(['open', 'done']).optional(),
});

// ---- Universal CRM API (project + entity) ----

app.get('/api/:project/entities/:id/crm', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;
  const entityId = String(req.params.id || '');

  const pipeline = db.prepare('SELECT * FROM crm_pipeline WHERE project_key = ? AND entity_id = ?').get(project.key, entityId)
    || { project_key: project.key, entity_id: entityId, stage: 'new', owner: '', priority: 'normal', nextActionAt: '', updatedAt: '' };
  const contacts = db.prepare('SELECT * FROM crm_contacts WHERE project_key = ? AND entity_id = ? ORDER BY updatedAt DESC').all(project.key, entityId);
  const activities = db.prepare('SELECT * FROM crm_activities WHERE project_key = ? AND entity_id = ? ORDER BY happenedAt DESC, createdAt DESC LIMIT 200').all(project.key, entityId);
  const tasks = db.prepare('SELECT * FROM crm_tasks WHERE project_key = ? AND entity_id = ? ORDER BY status ASC, dueAt ASC, updatedAt DESC').all(project.key, entityId);

  res.json({ pipeline, contacts, activities, tasks });
});

app.patch('/api/:project/entities/:id/pipeline', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;
  const entityId = String(req.params.id || '');
  const parsed = PipelinePatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const ts = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM crm_pipeline WHERE project_key = ? AND entity_id = ?').get(project.key, entityId)
    || { project_key: project.key, entity_id: entityId, stage: 'new', owner: '', priority: 'normal', nextActionAt: '', updatedAt: ts };
  const next = { ...existing, ...parsed.data, updatedAt: ts };

  db.prepare(`
    INSERT INTO crm_pipeline (project_key, entity_id, stage, owner, priority, nextActionAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_key, entity_id) DO UPDATE SET
      stage=excluded.stage,
      owner=excluded.owner,
      priority=excluded.priority,
      nextActionAt=excluded.nextActionAt,
      updatedAt=excluded.updatedAt
  `).run(next.project_key, next.entity_id, next.stage, next.owner, next.priority, next.nextActionAt, next.updatedAt);

  res.json({ ok: true, pipeline: next });
});

app.post('/api/:project/entities/:id/contacts', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;
  const entityId = String(req.params.id || '');
  const parsed = ContactCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const d = parsed.data;
  db.prepare(`INSERT INTO crm_contacts (id, project_key, entity_id, name, role, email, phone, source, confidence, notes, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, project.key, entityId, d.name, d.role, d.email, d.phone, d.source, d.confidence, d.notes, ts, ts);
  res.status(201).json({ id });
});

app.delete('/api/:project/entities/:id/contacts/:contactId', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;
  db.prepare('DELETE FROM crm_contacts WHERE id = ? AND project_key = ?').run(String(req.params.contactId || ''), project.key);
  res.json({ ok: true });
});

app.post('/api/:project/entities/:id/activities', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;
  const entityId = String(req.params.id || '');
  const parsed = ActivityCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const d = parsed.data;
  const happenedAt = d.happenedAt || ts;
  db.prepare(`INSERT INTO crm_activities (id, project_key, entity_id, type, summary, body, actor, happenedAt, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, project.key, entityId, d.type, d.summary, d.body, d.actor, happenedAt, ts);
  res.status(201).json({ id });
});

app.delete('/api/:project/entities/:id/activities/:activityId', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;
  db.prepare('DELETE FROM crm_activities WHERE id = ? AND project_key = ?').run(String(req.params.activityId || ''), project.key);
  res.json({ ok: true });
});

app.post('/api/:project/entities/:id/tasks', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;
  const entityId = String(req.params.id || '');
  const parsed = TaskCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const d = parsed.data;
  db.prepare(`INSERT INTO crm_tasks (id, project_key, entity_id, title, status, owner, dueAt, notes, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`)
    .run(id, project.key, entityId, d.title, d.owner, d.dueAt, d.notes, ts, ts);
  res.status(201).json({ id });
});

app.patch('/api/:project/entities/:id/tasks/:taskId', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;
  const parsed = TaskPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const taskId = String(req.params.taskId || '');
  const existing = db.prepare('SELECT * FROM crm_tasks WHERE id = ? AND project_key = ?').get(taskId, project.key);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const ts = new Date().toISOString();
  const next = { ...existing, ...parsed.data, updatedAt: ts };
  db.prepare('UPDATE crm_tasks SET title=?, status=?, owner=?, dueAt=?, notes=?, updatedAt=? WHERE id=? AND project_key=?')
    .run(next.title, next.status, next.owner, next.dueAt, next.notes, next.updatedAt, taskId, project.key);

  res.json({ ok: true });
});

app.delete('/api/:project/entities/:id/tasks/:taskId', (req, res) => {
  const project = getProjectOr404(req.params.project, res);
  if (!project) return;
  db.prepare('DELETE FROM crm_tasks WHERE id = ? AND project_key = ?').run(String(req.params.taskId || ''), project.key);
  res.json({ ok: true });
});

app.get('/api/schools/:urn/crm', (req, res) => {
  const urn = String(req.params.urn || '');
  const school = db.prepare('SELECT urn FROM schools WHERE urn = ?').get(urn);
  if (!school) return res.status(404).json({ error: 'not_found' });

  const pipeline = db.prepare('SELECT * FROM school_pipeline WHERE urn = ?').get(urn)
    || { urn, stage: 'new', owner: '', priority: 'normal', nextActionAt: '', updatedAt: '' };
  const contacts = db.prepare('SELECT * FROM school_contacts WHERE urn = ? ORDER BY updatedAt DESC').all(urn);
  const activities = db.prepare('SELECT * FROM school_activities WHERE urn = ? ORDER BY happenedAt DESC, createdAt DESC LIMIT 200').all(urn);
  const tasks = db.prepare('SELECT * FROM school_tasks WHERE urn = ? ORDER BY status ASC, dueAt ASC, updatedAt DESC').all(urn);

  res.json({ pipeline, contacts, activities, tasks });
});

app.patch('/api/schools/:urn/pipeline', (req, res) => {
  const urn = String(req.params.urn || '');
  const parsed = PipelinePatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const ts = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM school_pipeline WHERE urn = ?').get(urn)
    || { urn, stage: 'new', owner: '', priority: 'normal', nextActionAt: '', updatedAt: ts };
  const next = { ...existing, ...parsed.data, updatedAt: ts };

  db.prepare(`
    INSERT INTO school_pipeline (urn, stage, owner, priority, nextActionAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(urn) DO UPDATE SET
      stage=excluded.stage,
      owner=excluded.owner,
      priority=excluded.priority,
      nextActionAt=excluded.nextActionAt,
      updatedAt=excluded.updatedAt
  `).run(next.urn, next.stage, next.owner, next.priority, next.nextActionAt, next.updatedAt);

  res.json({ ok: true, pipeline: next });
});

app.post('/api/schools/:urn/contacts', (req, res) => {
  const urn = String(req.params.urn || '');
  const parsed = ContactCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const d = parsed.data;

  db.prepare(`INSERT INTO school_contacts (id, urn, name, role, email, phone, source, confidence, notes, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, urn, d.name, d.role, d.email, d.phone, d.source, d.confidence, d.notes, ts, ts);

  res.status(201).json({ id });
});

app.delete('/api/schools/:urn/contacts/:id', (req, res) => {
  const id = String(req.params.id || '');
  db.prepare('DELETE FROM school_contacts WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/schools/:urn/activities', (req, res) => {
  const urn = String(req.params.urn || '');
  const parsed = ActivityCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const d = parsed.data;
  const happenedAt = d.happenedAt || ts;

  db.prepare(`INSERT INTO school_activities (id, urn, type, summary, body, actor, happenedAt, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, urn, d.type, d.summary, d.body, d.actor, happenedAt, ts);

  res.status(201).json({ id });
});

app.delete('/api/schools/:urn/activities/:id', (req, res) => {
  const id = String(req.params.id || '');
  db.prepare('DELETE FROM school_activities WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/schools/:urn/tasks', (req, res) => {
  const urn = String(req.params.urn || '');
  const parsed = TaskCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const d = parsed.data;

  db.prepare(`INSERT INTO school_tasks (id, urn, title, status, owner, dueAt, notes, createdAt, updatedAt)
              VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)`)
    .run(id, urn, d.title, d.owner, d.dueAt, d.notes, ts, ts);

  res.status(201).json({ id });
});

app.patch('/api/schools/:urn/tasks/:id', (req, res) => {
  const id = String(req.params.id || '');
  const parsed = TaskPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = db.prepare('SELECT * FROM school_tasks WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const ts = new Date().toISOString();
  const next = { ...existing, ...parsed.data, updatedAt: ts };

  db.prepare('UPDATE school_tasks SET title=?, status=?, owner=?, dueAt=?, notes=?, updatedAt=? WHERE id=?')
    .run(next.title, next.status, next.owner, next.dueAt, next.notes, next.updatedAt, id);

  res.json({ ok: true });
});

app.delete('/api/schools/:urn/tasks/:id', (req, res) => {
  const id = String(req.params.id || '');
  db.prepare('DELETE FROM school_tasks WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[bi-api] listening on http://0.0.0.0:${PORT}`);
});
