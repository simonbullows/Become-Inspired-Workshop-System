import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, safeJson } from './db.mjs';

const PORT = Number(process.env.PORT || 8787);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (req, res) => res.json({ ok: true }));

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

app.listen(PORT, () => {
  console.log(`[bi-api] listening on http://0.0.0.0:${PORT}`);
});
