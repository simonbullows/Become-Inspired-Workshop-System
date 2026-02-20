import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.mjs';

const csvPath = process.argv[2] || path.resolve(process.cwd(), '..', '..', 'data', 'KOSMOS_Schools_Full.csv');

function parseBool(v) {
  const s = String(v ?? '').toLowerCase();
  return (s === 'true' || s === '1' || s === 'yes') ? 1 : 0;
}

const EMAIL_EXACT_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const BAD_SUFFIX_RE = /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i;

function splitEmails(raw) {
  if (!raw) return [];
  const s = String(raw);
  const parts = s
    .replace(/[\[\]"]+/g, '')
    .split(/[,;\s]+/g)
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
    .filter(e => e.includes('@'))
    .filter(e => !BAD_SUFFIX_RE.test(e))
    .filter(e => EMAIL_EXACT_RE.test(e));

  const uniq = [...new Set(parts)];
  return uniq.slice(0, 20);
}

function readCsvRows(file) {
  const text = fs.readFileSync(file, 'utf8');
  // naive CSV split is risky; but for MVP we can do a basic streaming-ish parse
  // using a small custom parser. Here we implement a minimal RFC4180 parser.

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
    if (c === '\n') {
      row.push(field); field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    if (c === '\r') { i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function main() {
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }

  console.log('[import] reading', csvPath);
  const rows = readCsvRows(csvPath);
  const header = rows.shift();
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const get = (r, col) => r[idx[col]] ?? '';

  const insert = db.prepare(`
    INSERT INTO schools (
      urn, name, phase, la_code, la_name, street, town, county, postcode, website, telephone, emails_json,
      has_pupil_premium, has_send, has_governors, ofsted_mention, region, scrape_date
    ) VALUES (
      @urn, @name, @phase, @la_code, @la_name, @street, @town, @county, @postcode, @website, @telephone, @emails_json,
      @has_pupil_premium, @has_send, @has_governors, @ofsted_mention, @region, @scrape_date
    )
    ON CONFLICT(urn) DO UPDATE SET
      name=excluded.name,
      phase=excluded.phase,
      la_code=excluded.la_code,
      la_name=excluded.la_name,
      street=excluded.street,
      town=excluded.town,
      county=excluded.county,
      postcode=excluded.postcode,
      website=excluded.website,
      telephone=excluded.telephone,
      emails_json=excluded.emails_json,
      has_pupil_premium=excluded.has_pupil_premium,
      has_send=excluded.has_send,
      has_governors=excluded.has_governors,
      ofsted_mention=excluded.ofsted_mention,
      region=excluded.region,
      scrape_date=excluded.scrape_date;
  `);

  const tx = db.transaction((items) => {
    for (const it of items) insert.run(it);
  });

  const batch = [];
  let n = 0;
  for (const r of rows) {
    const urn = String(get(r, 'URN') || '').trim();
    if (!urn) continue;

    const item = {
      urn,
      name: String(get(r, 'EstablishmentName') || '').trim(),
      phase: String(get(r, 'PhaseOfEducation (name)') || '').trim(),
      la_code: String(get(r, 'LA (code)') || '').trim(),
      la_name: String(get(r, 'LA (name)') || '').trim(),
      street: String(get(r, 'Street') || '').trim(),
      town: String(get(r, 'Town_x') || get(r, 'Town_y') || '').trim(),
      county: String(get(r, 'County (name)') || '').trim(),
      postcode: String(get(r, 'Postcode_x') || get(r, 'Postcode_y') || '').trim(),
      website: String(get(r, 'Website') || get(r, 'SchoolWebsite') || '').trim(),
      telephone: String(get(r, 'TelephoneNum') || '').trim(),
      emails_json: JSON.stringify(splitEmails(get(r, 'All_Emails'))),
      has_pupil_premium: parseBool(get(r, 'Has_Pupil_Premium')),
      has_send: parseBool(get(r, 'Has_SEND')),
      has_governors: parseBool(get(r, 'Has_Governors')),
      ofsted_mention: String(get(r, 'Ofsted_Mention') || '').trim(),
      region: String(get(r, 'Region') || '').trim(),
      scrape_date: String(get(r, 'Scrape_Date') || '').trim(),
    };

    batch.push(item);
    if (batch.length >= 500) {
      tx(batch.splice(0, batch.length));
    }
    n++;
    if (n % 5000 === 0) console.log('[import] processed', n);
  }

  if (batch.length) tx(batch);

  const count = db.prepare('SELECT COUNT(*) as c FROM schools').get().c;
  console.log('[import] done. schools in db:', count);
}

main();
