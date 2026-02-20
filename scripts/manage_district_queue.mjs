import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const districtWorkDir = path.join(root, 'data', 'district_work');
const districtsDir = path.join(districtWorkDir, 'districts');
const indexPath = path.join(districtWorkDir, 'district_index.csv');

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

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text);
  const header = rows.shift() || [];
  return { header, rows };
}

function asBool(v) {
  const t = String(v ?? '').trim().toLowerCase();
  return t === 'yes' || t === 'true' || t === '1';
}

function readExistingStatus() {
  if (!fs.existsSync(indexPath)) return new Map();

  const { header, rows } = readCsv(indexPath);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  if (!(idx.district_code >= 0) || !(idx.status >= 0)) return new Map();

  const out = new Map();
  for (const r of rows) {
    const code = String(r[idx.district_code] ?? '').trim();
    const status = String(r[idx.status] ?? '').trim();
    if (code) out.set(code, status || 'pending');
  }
  return out;
}

function buildRows(existingStatus = new Map()) {
  if (!fs.existsSync(districtsDir)) {
    throw new Error(`Missing districts directory: ${districtsDir}`);
  }

  const files = fs.readdirSync(districtsDir).filter(f => f.endsWith('.csv')).sort();
  const rows = [];

  for (const file of files) {
    const full = path.join(districtsDir, file);
    const { header, rows: dataRows } = readCsv(full);
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));

    const districtCode = String(dataRows[0]?.[idx.district_code] ?? '').trim();
    const districtName = String(dataRows[0]?.[idx.district_name] ?? '').trim();

    let emailsCollected = 0;
    for (const r of dataRows) {
      if (asBool(r[idx.has_email_collected])) emailsCollected++;
    }

    const total = dataRows.length;
    const remaining = Math.max(0, total - emailsCollected);
    const coverage = total ? ((emailsCollected / total) * 100) : 0;

    let status = existingStatus.get(districtCode) || 'pending';
    if (remaining === 0) status = 'done';

    rows.push({
      district_code: districtCode,
      district_name: districtName,
      total_schools: total,
      emails_collected: emailsCollected,
      remaining_to_scrape: remaining,
      coverage_pct: coverage.toFixed(1),
      status,
      district_file: `districts/${file}`,
    });
  }

  rows.sort((a, b) => {
    if (b.remaining_to_scrape !== a.remaining_to_scrape) return b.remaining_to_scrape - a.remaining_to_scrape;
    return a.district_name.localeCompare(b.district_name);
  });

  return rows;
}

function writeIndex(rows) {
  const outRows = [[
    'district_code',
    'district_name',
    'total_schools',
    'emails_collected',
    'remaining_to_scrape',
    'coverage_pct',
    'status',
    'district_file',
  ]];

  for (const r of rows) {
    outRows.push([
      r.district_code,
      r.district_name,
      String(r.total_schools),
      String(r.emails_collected),
      String(r.remaining_to_scrape),
      r.coverage_pct,
      r.status,
      r.district_file,
    ]);
  }

  fs.writeFileSync(indexPath, toCsv(outRows), 'utf8');
}

function readIndexRows() {
  if (!fs.existsSync(indexPath)) return [];
  const { header, rows } = readCsv(indexPath);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return rows.map(r => ({
    district_code: String(r[idx.district_code] ?? '').trim(),
    district_name: String(r[idx.district_name] ?? '').trim(),
    total_schools: Number(r[idx.total_schools] ?? 0),
    emails_collected: Number(r[idx.emails_collected] ?? 0),
    remaining_to_scrape: Number(r[idx.remaining_to_scrape] ?? 0),
    coverage_pct: String(r[idx.coverage_pct] ?? '').trim(),
    status: String(r[idx.status] ?? 'pending').trim() || 'pending',
    district_file: String(r[idx.district_file] ?? '').trim(),
  }));
}

function printRow(prefix, row) {
  console.log(`${prefix} ${row.district_code} ${row.district_name} | remaining=${row.remaining_to_scrape} | coverage=${row.coverage_pct}% | status=${row.status} | file=${row.district_file}`);
}

function pickNextRow(rows) {
  const active = rows.find(r => r.remaining_to_scrape > 0 && r.status === 'in_progress');
  if (active) return active;
  const pending = rows.find(r => r.remaining_to_scrape > 0 && (r.status === 'pending' || !r.status));
  if (pending) return pending;
  return rows.find(r => r.remaining_to_scrape > 0 && r.status !== 'done') || null;
}

function main() {
  const [command = 'rebuild', arg1, arg2] = process.argv.slice(2);

  if (command === 'rebuild') {
    const existing = readExistingStatus();
    const rows = buildRows(existing);
    writeIndex(rows);
    console.log(`[district-queue] rebuilt ${rows.length} districts -> ${indexPath}`);
    return;
  }

  if (!fs.existsSync(indexPath)) {
    const rows = buildRows(readExistingStatus());
    writeIndex(rows);
  }

  if (command === 'next') {
    const rows = readIndexRows();
    const next = pickNextRow(rows);
    if (!next) {
      console.log('[district-queue] all districts complete');
      return;
    }
    printRow('[district-queue] next:', next);
    return;
  }

  if (command === 'claim-next') {
    const rows = readIndexRows();
    const next = pickNextRow(rows);
    if (!next) {
      console.log('[district-queue] all districts complete');
      return;
    }

    if (next.status !== 'in_progress') {
      next.status = 'in_progress';
      writeIndex(rows);
    }

    printRow('[district-queue] claimed:', next);
    return;
  }

  if (command === 'set-status') {
    const code = String(arg1 ?? '').trim();
    const status = String(arg2 ?? '').trim();
    const allowed = new Set(['pending', 'in_progress', 'blocked', 'done']);
    if (!code || !allowed.has(status)) {
      console.error('Usage: node scripts/manage_district_queue.mjs set-status <district_code> <pending|in_progress|blocked|done>');
      process.exit(1);
    }

    const rows = readIndexRows();
    const target = rows.find(r => r.district_code === code);
    if (!target) {
      console.error(`[district-queue] district not found: ${code}`);
      process.exit(1);
    }

    target.status = status;
    writeIndex(rows);
    printRow('[district-queue] updated:', target);
    return;
  }

  if (command === 'complete') {
    const code = String(arg1 ?? '').trim();
    if (!code) {
      console.error('Usage: node scripts/manage_district_queue.mjs complete <district_code>');
      process.exit(1);
    }

    const rows = buildRows(readExistingStatus());
    const target = rows.find(r => r.district_code === code);
    if (!target) {
      console.error(`[district-queue] district not found: ${code}`);
      process.exit(1);
    }

    target.status = target.remaining_to_scrape === 0 ? 'done' : 'pending';
    writeIndex(rows);
    printRow('[district-queue] completed-pass:', target);
    return;
  }

  if (command === 'summary') {
    const rows = readIndexRows();
    const totals = {
      districts: rows.length,
      pending: rows.filter(r => r.status === 'pending').length,
      in_progress: rows.filter(r => r.status === 'in_progress').length,
      blocked: rows.filter(r => r.status === 'blocked').length,
      done: rows.filter(r => r.status === 'done').length,
      schools: rows.reduce((n, r) => n + r.total_schools, 0),
      remaining: rows.reduce((n, r) => n + r.remaining_to_scrape, 0),
      collected: rows.reduce((n, r) => n + r.emails_collected, 0),
    };

    console.log(`[district-queue] districts=${totals.districts} pending=${totals.pending} in_progress=${totals.in_progress} blocked=${totals.blocked} done=${totals.done}`);
    console.log(`[district-queue] schools=${totals.schools} emails_collected=${totals.collected} remaining=${totals.remaining}`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error('Commands: rebuild | next | claim-next | set-status | complete | summary');
  process.exit(1);
}

main();
