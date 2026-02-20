import fs from 'node:fs';
import path from 'node:path';

const csvPath = path.join(process.cwd(), 'data', 'kosmos', 'exports', 'kosmos_school_district_map.csv');

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

if (!fs.existsSync(csvPath)) {
  console.error(`[kosmos-validate] missing file: ${csvPath}`);
  process.exit(1);
}

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const header = rows.shift() || [];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const required = ['district_code', 'district_name', 'district_label'];

for (const col of required) {
  if (!(col in idx)) {
    console.error(`[kosmos-validate] missing required column: ${col}`);
    process.exit(1);
  }
}

let missingCode = 0;
let missingName = 0;
let missingLabel = 0;
let badFormat = 0;

for (const r of rows) {
  const code = (r[idx.district_code] ?? '').trim();
  const name = (r[idx.district_name] ?? '').trim();
  const label = (r[idx.district_label] ?? '').trim();

  if (!code) missingCode++;
  if (!name) missingName++;
  if (!label) missingLabel++;

  if (code && name) {
    const expected = `${code} - ${name}`;
    if (label !== expected) badFormat++;
  }
}

console.log(`[kosmos-validate] rows=${rows.length} missingCode=${missingCode} missingName=${missingName} missingLabel=${missingLabel} badFormat=${badFormat}`);

if (missingCode || missingName || missingLabel || badFormat) {
  process.exit(2);
}
