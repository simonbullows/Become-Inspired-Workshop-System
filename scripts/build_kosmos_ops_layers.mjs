import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const districtIndexPath = path.join(root, 'data', 'district_work', 'district_index.csv');
const outDir = path.join(root, 'data', 'kosmos', 'exports');
const targetSetPath = path.join(outDir, 'kosmos_target_set.csv');
const queuePath = path.join(outDir, 'district_scrape_queue.csv');

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

function nowIso() {
  return new Date().toISOString();
}

function main() {
  if (!fs.existsSync(districtIndexPath)) {
    throw new Error(`Missing district index: ${districtIndexPath}`);
  }

  const rows = parseCsv(fs.readFileSync(districtIndexPath, 'utf8'));
  const header = rows.shift() || [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const data = rows.map(r => ({
    district_code: String(r[idx.district_code] ?? '').trim(),
    district_name: String(r[idx.district_name] ?? '').trim(),
    district_label: `${String(r[idx.district_code] ?? '').trim()} - ${String(r[idx.district_name] ?? '').trim()}`,
    total_schools: Number(r[idx.total_schools] ?? 0),
    emails_collected: Number(r[idx.emails_collected] ?? 0),
    remaining_to_scrape: Number(r[idx.remaining_to_scrape] ?? 0),
    coverage_pct: String(r[idx.coverage_pct] ?? '').trim(),
    status: String(r[idx.status] ?? 'pending').trim() || 'pending',
    district_file: String(r[idx.district_file] ?? '').trim(),
  }));

  const stamp = nowIso();

  const targetRows = [[
    'target_id',
    'district_code',
    'district_name',
    'district_label',
    'nation',
    'scope_group',
    'in_scope',
    'priority_rank',
    'source',
    'updated_at',
  ]];

  const queueRows = [[
    'queue_id',
    'district_code',
    'district_name',
    'district_label',
    'district_file',
    'queue_status',
    'total_schools',
    'emails_collected',
    'remaining_to_scrape',
    'coverage_pct',
    'last_claimed_at',
    'last_completed_at',
    'notes',
    'updated_at',
  ]];

  data
    .sort((a, b) => {
      if (b.remaining_to_scrape !== a.remaining_to_scrape) return b.remaining_to_scrape - a.remaining_to_scrape;
      return a.district_name.localeCompare(b.district_name);
    })
    .forEach((d, i) => {
      const targetId = `eng-la-${d.district_code}`;
      const queueId = `queue-${d.district_code}`;

      targetRows.push([
        targetId,
        d.district_code,
        d.district_name,
        d.district_label,
        'England',
        'kosmos_2026_phase1',
        '1',
        String(i + 1),
        'district_work_index',
        stamp,
      ]);

      queueRows.push([
        queueId,
        d.district_code,
        d.district_name,
        d.district_label,
        d.district_file,
        d.status,
        String(d.total_schools),
        String(d.emails_collected),
        String(d.remaining_to_scrape),
        d.coverage_pct,
        '',
        d.status === 'done' ? stamp : '',
        '',
        stamp,
      ]);
    });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(targetSetPath, toCsv(targetRows), 'utf8');
  fs.writeFileSync(queuePath, toCsv(queueRows), 'utf8');

  console.log(`[kosmos-ops] targets=${targetRows.length - 1} queue=${queueRows.length - 1}`);
  console.log(`[kosmos-ops] wrote ${targetSetPath}`);
  console.log(`[kosmos-ops] wrote ${queuePath}`);
}

main();
