import express from 'express';
import cors from 'cors';
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

  res.json({
    schools: rows.map(r => ({
      ...r,
      emails: safeJson(r.emails_json, []),
    }))
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
    }
  });
});

app.get('/api/stats', (req, res) => {
  const byRegion = db.prepare('SELECT region, COUNT(*) as count FROM schools GROUP BY region ORDER BY count DESC').all();
  const byPhase = db.prepare('SELECT phase, COUNT(*) as count FROM schools GROUP BY phase ORDER BY count DESC').all();
  res.json({ byRegion, byPhase });
});

app.listen(PORT, () => {
  console.log(`[bi-api] listening on http://0.0.0.0:${PORT}`);
});
