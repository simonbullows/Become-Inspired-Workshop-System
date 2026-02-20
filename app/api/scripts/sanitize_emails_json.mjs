import { db } from '../src/db.mjs';

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const BAD_SUFFIX = /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i;

function clean(list) {
  const arr = Array.isArray(list) ? list : [];
  return [...new Set(arr
    .map(v => String(v || '').trim().toLowerCase())
    .filter(v => v.includes('@'))
    .filter(v => !BAD_SUFFIX.test(v))
    .filter(v => EMAIL_RE.test(v))
  )].slice(0, 20);
}

const rows = db.prepare('SELECT urn, emails_json FROM schools').all();
const upd = db.prepare('UPDATE schools SET emails_json = ? WHERE urn = ?');
let changed = 0;

const tx = db.transaction(() => {
  for (const r of rows) {
    let parsed = [];
    try { parsed = JSON.parse(r.emails_json || '[]'); } catch {}
    const next = clean(parsed);
    const nextJson = JSON.stringify(next);
    if (nextJson !== (r.emails_json || '[]')) {
      upd.run(nextJson, r.urn);
      changed++;
    }
  }
});

tx();

const stats = db.prepare("SELECT COUNT(*) AS schools, SUM(CASE WHEN emails_json != '[]' THEN 1 ELSE 0 END) AS withEmails FROM schools").get();
console.log(`[sanitize-emails] changed=${changed} schools=${stats.schools} withEmails=${stats.withEmails}`);
