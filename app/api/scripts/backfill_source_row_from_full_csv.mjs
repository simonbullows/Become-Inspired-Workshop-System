import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db.mjs';

const csvPath = process.argv[2] || path.resolve(process.cwd(), '..', '..', 'data', 'KOSMOS_Schools_Full.csv');

function readCsvRows(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
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

if (!fs.existsSync(csvPath)) {
  console.error('CSV not found:', csvPath);
  process.exit(1);
}

console.log('[backfill] reading', csvPath);
const rows = readCsvRows(csvPath);
const header = rows.shift() || [];
const urnIdx = header.indexOf('URN');
if (urnIdx < 0) {
  console.error('Missing URN column');
  process.exit(1);
}

const update = db.prepare('UPDATE schools SET source_row_json = ? WHERE urn = ?');
const tx = db.transaction((items) => {
  for (const it of items) update.run(it.source, it.urn);
});

let n = 0;
const batch = [];
for (const r of rows) {
  const urn = String(r[urnIdx] || '').trim();
  if (!urn) continue;

  const sourceObj = {};
  for (let i = 0; i < header.length; i++) sourceObj[header[i]] = String(r[i] ?? '').trim();

  batch.push({ urn, source: JSON.stringify(sourceObj) });
  n++;
  if (batch.length >= 500) {
    tx(batch.splice(0, batch.length));
  }
  if (n % 5000 === 0) console.log('[backfill] processed', n);
}
if (batch.length) tx(batch);

const filled = db.prepare("SELECT COUNT(*) AS c FROM schools WHERE source_row_json IS NOT NULL AND source_row_json != '{}' ").get().c;
console.log(`[backfill] done rows=${n} filled=${filled}`);
