import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const districtsDir = path.join(root, 'data', 'district_work', 'districts');
const outDir = path.join(root, 'data', 'kosmos', 'exports');
const outFile = path.join(outDir, 'kosmos_school_district_map.csv');

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

function esc(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsv(rows) {
  return rows.map(r => r.map(esc).join(',')).join('\n') + '\n';
}

function main() {
  if (!fs.existsSync(districtsDir)) {
    throw new Error(`Missing directory: ${districtsDir}`);
  }

  const files = fs.readdirSync(districtsDir).filter(f => f.endsWith('.csv')).sort();
  const output = [[
    'urn',
    'school_name',
    'district_code',
    'district_name',
    'district_label',
    'website',
    'town',
    'postcode',
    'region',
    'has_email_collected',
    'source_file'
  ]];

  let rowCount = 0;
  for (const file of files) {
    const full = path.join(districtsDir, file);
    const text = fs.readFileSync(full, 'utf8');
    const rows = parseCsv(text);
    if (!rows.length) continue;

    const header = rows.shift();
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));

    for (const r of rows) {
      const districtCode = (r[idx.district_code] ?? '').trim();
      const districtName = (r[idx.district_name] ?? '').trim();
      output.push([
        (r[idx.urn] ?? '').trim(),
        (r[idx.school_name] ?? '').trim(),
        districtCode,
        districtName,
        districtCode && districtName ? `${districtCode} - ${districtName}` : '',
        (r[idx.website] ?? '').trim(),
        (r[idx.town] ?? '').trim(),
        (r[idx.postcode] ?? '').trim(),
        (r[idx.region] ?? '').trim(),
        (r[idx.has_email_collected] ?? '').trim(),
        file,
      ]);
      rowCount++;
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, toCsv(output), 'utf8');

  console.log(`[kosmos-map] files=${files.length} rows=${rowCount} out=${outFile}`);
}

main();
