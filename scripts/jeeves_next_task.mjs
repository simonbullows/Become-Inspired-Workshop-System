import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'data', 'district_work', 'district_index.csv');

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

function main() {
  if (!fs.existsSync(indexPath)) {
    console.error(`Missing index: ${indexPath}`);
    process.exit(1);
  }

  const text = fs.readFileSync(indexPath, 'utf8');
  const rows = parseCsv(text);
  const header = rows.shift() || [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const data = rows.map(r => ({
    district_code: String(r[idx.district_code] ?? '').trim(),
    district_name: String(r[idx.district_name] ?? '').trim(),
    remaining: Number(r[idx.remaining_to_scrape] ?? 0),
    status: String(r[idx.status] ?? 'pending').trim() || 'pending',
    district_file: String(r[idx.district_file] ?? '').trim(),
  }));

  const next = data.find(r => r.remaining > 0 && r.status === 'in_progress')
    || data.find(r => r.remaining > 0 && r.status === 'pending')
    || data.find(r => r.remaining > 0 && r.status !== 'done');

  if (!next) {
    console.log('All districts are complete.');
    return;
  }

  const prompt = [
    `Jeeves scraping task`,
    `District: ${next.district_code} ${next.district_name}`,
    `File: data/district_work/${next.district_file}`,
    `Goal: Scrape missing school emails for rows where has_email_collected = no.`,
    `Rules:`,
    `- Only scrape schools from this district file.`,
    `- Update has_email_collected to yes when valid email found.`,
    `- Keep data clean (no placeholder/no-reply junk).`,
    `- Save progress every 25 schools.`,
    `- When district pass is done, report: processed, newly_found, still_missing, blockers.`,
  ].join('\n');

  console.log(prompt);
}

main();
