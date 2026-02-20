import fs from 'node:fs';
import path from 'node:path';

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

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing file: ${filePath}`);
  }
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const header = rows.shift() || [];
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  return { rows, header, idx };
}

function get(row, idx, col) {
  const i = idx[col];
  if (i === undefined) return '';
  return (row[i] ?? '').toString().trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isPlaceholderEmail(email) {
  const e = email.toLowerCase();
  return (
    e.includes('example@') ||
    e.includes('user@domain') ||
    e.includes('test@') ||
    e.endsWith('@example.com')
  );
}

function extractEmails(raw) {
  const value = (raw ?? '').trim();
  if (!value) return [];

  // JSON array from KOSMOS_With_Emails.all_emails
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => String(x || '').trim())
          .filter(Boolean);
      }
    } catch {
      // fall through
    }
  }

  // Evidence format: semicolon-separated list
  return value
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
}

const root = process.cwd();
const districtPath = process.argv[2] || path.join(root, 'data', 'district_work', 'districts', '888_lancashire.csv');
const evidencePath = process.argv[3];
const masterPath = process.argv[4] || path.join(root, 'data', 'KOSMOS_With_Emails.csv');

if (!evidencePath) {
  console.error('Usage: node scripts/validate_jeeves_batch25.mjs <districtCsv> <evidenceCsv> [masterEmailsCsv]');
  process.exit(1);
}

const requiredEvidenceCols = [
  'urn',
  'school_name',
  'website_url',
  'page_url_scraped',
  'emails_found',
  'checked_at_utc',
  'method',
  'notes'
];

try {
  const district = readCsv(districtPath);
  const evidence = readCsv(evidencePath);
  const master = readCsv(masterPath);

  for (const c of ['urn', 'has_email_collected']) {
    if (!(c in district.idx)) throw new Error(`district file missing column: ${c}`);
  }
  for (const c of requiredEvidenceCols) {
    if (!(c in evidence.idx)) throw new Error(`evidence file missing column: ${c}`);
  }
  for (const c of ['urn', 'all_emails']) {
    if (!(c in master.idx)) throw new Error(`master file missing column: ${c}`);
  }

  if (evidence.rows.length === 0) throw new Error('evidence file has no rows');
  if (evidence.rows.length > 25) throw new Error(`batch too large: ${evidence.rows.length} rows (max 25)`);

  const districtByUrn = new Map();
  for (const row of district.rows) {
    districtByUrn.set(get(row, district.idx, 'urn'), row);
  }

  const masterByUrn = new Map();
  for (const row of master.rows) {
    masterByUrn.set(get(row, master.idx, 'urn'), row);
  }

  let failures = 0;
  let yesRows = 0;
  let yesWithValidEvidenceEmail = 0;
  let yesWithMasterEmail = 0;
  const failLines = [];

  for (const row of evidence.rows) {
    const urn = get(row, evidence.idx, 'urn');
    if (!urn) {
      failures++;
      failLines.push('- [NO_URN] evidence row missing urn');
      continue;
    }

    const dRow = districtByUrn.get(urn);
    if (!dRow) {
      failures++;
      failLines.push(`- [${urn}] not found in district file`);
      continue;
    }

    const isYes = get(dRow, district.idx, 'has_email_collected').toLowerCase() === 'yes';
    if (!isYes) continue;

    yesRows++;

    const pageUrl = get(row, evidence.idx, 'page_url_scraped');
    const checkedAt = get(row, evidence.idx, 'checked_at_utc');
    const emails = extractEmails(get(row, evidence.idx, 'emails_found'));

    const validEvidenceEmails = emails.filter((e) => isValidEmail(e) && !isPlaceholderEmail(e));

    if (!pageUrl) {
      failures++;
      failLines.push(`- [${urn}] missing page_url_scraped`);
    }

    if (!checkedAt) {
      failures++;
      failLines.push(`- [${urn}] missing checked_at_utc`);
    }

    if (validEvidenceEmails.length === 0) {
      failures++;
      failLines.push(`- [${urn}] no valid non-placeholder email in emails_found`);
    } else {
      yesWithValidEvidenceEmail++;
    }

    const mRow = masterByUrn.get(urn);
    const masterEmails = mRow ? extractEmails(get(mRow, master.idx, 'all_emails')) : [];
    const validMasterEmails = masterEmails.filter((e) => isValidEmail(e) && !isPlaceholderEmail(e));

    if (validMasterEmails.length === 0) {
      failures++;
      failLines.push(`- [${urn}] no valid non-placeholder email in master dataset`);
    } else {
      yesWithMasterEmail++;
    }
  }

  console.log('[jeeves-batch25] Validation summary');
  console.log(`- district: ${districtPath}`);
  console.log(`- evidence: ${evidencePath}`);
  console.log(`- master: ${masterPath}`);
  console.log(`- evidenceRows: ${evidence.rows.length}`);
  console.log(`- yesRowsInBatch: ${yesRows}`);
  console.log(`- yesWithValidEvidenceEmail: ${yesWithValidEvidenceEmail}`);
  console.log(`- yesWithMasterEmail: ${yesWithMasterEmail}`);

  if (failures > 0) {
    console.log(`- result: FAIL (${failures} issue${failures === 1 ? '' : 's'})`);
    for (const l of failLines) console.log(l);
    process.exit(2);
  }

  console.log('- result: PASS');
  process.exit(0);
} catch (err) {
  console.error(`[jeeves-batch25] ${err.message}`);
  process.exit(1);
}
