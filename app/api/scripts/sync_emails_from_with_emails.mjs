import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.mjs';

const csvPath = path.resolve(process.cwd(), '..', '..', 'data', 'KOSMOS_With_Emails.csv');

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const EMAIL_EXACT_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const BAD_SUFFIX_RE = /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i;

function extractEmails(raw) {
  if (!raw) return [];
  const m = String(raw).match(EMAIL_RE) || [];
  const uniq = [...new Set(
    m.map(x => x.toLowerCase().trim())
      .filter(x => !BAD_SUFFIX_RE.test(x))
      .filter(x => EMAIL_EXACT_RE.test(x))
  )];
  return uniq.slice(0, 30);
}

function main() {
  if (!fs.existsSync(csvPath)) {
    console.error('Missing file:', csvPath);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const header = rows.shift() || [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  if (!(idx.urn >= 0) || !(idx.all_emails >= 0)) {
    console.error('CSV missing required columns: urn, all_emails');
    process.exit(1);
  }

  const updates = [];
  for (const r of rows) {
    const urn = String(r[idx.urn] ?? '').trim();
    if (!urn) continue;
    const emails = extractEmails(r[idx.all_emails] ?? '');
    if (!emails.length) continue;
    updates.push({ urn, emails_json: JSON.stringify(emails) });
  }

  const clear = db.prepare("UPDATE schools SET emails_json='[]'");
  const up = db.prepare('UPDATE schools SET emails_json=@emails_json WHERE urn=@urn');

  const tx = db.transaction((items) => {
    clear.run();
    for (const it of items) up.run(it);
  });

  tx(updates);

  const counts = db.prepare("SELECT COUNT(*) as schools, SUM(CASE WHEN emails_json != '[]' THEN 1 ELSE 0 END) as withEmails FROM schools").get();
  console.log(`[sync-emails] schools=${counts.schools} withEmails=${counts.withEmails} updates=${updates.length}`);
}

main();
