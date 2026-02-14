import { db } from '../src/db.mjs';

const BATCH = Number(process.env.BATCH || 100);
const SLEEP_MS = Number(process.env.SLEEP_MS || 120);

function nowIso() {
  return new Date().toISOString();
}

function normPostcode(p) {
  return String(p || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function lookup(postcode) {
  // postcodes.io: UK postcode → centroid.
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  const r = await fetch(url, { headers: { 'user-agent': 'BecomeInspiredWorkshopSystem/0.1' } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j || j.status !== 200 || !j.result) return null;
  return { lat: j.result.latitude, lng: j.result.longitude };
}

async function main() {
  // Find unique postcodes from schools table.
  const rows = db.prepare(`
    SELECT DISTINCT postcode
    FROM schools
    WHERE postcode IS NOT NULL AND TRIM(postcode) != ''
  `).all();

  const have = new Set(db.prepare('SELECT postcode FROM postcodes').all().map(r => r.postcode));

  const todo = rows
    .map(r => normPostcode(r.postcode))
    .filter(Boolean)
    .filter(p => !have.has(p));

  console.log(`[geocode] unique postcodes: ${rows.length}; cached: ${have.size}; todo: ${todo.length}`);

  const upsert = db.prepare(
    'INSERT INTO postcodes (postcode, lat, lng, updatedAt) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(postcode) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, updatedAt=excluded.updatedAt'
  );

  let ok = 0;
  let miss = 0;

  for (let i = 0; i < todo.length; i++) {
    const pc = todo[i];
    const res = await lookup(pc);
    if (res && typeof res.lat === 'number' && typeof res.lng === 'number') {
      upsert.run(pc, res.lat, res.lng, nowIso());
      ok++;
    } else {
      // Cache misses too so we don't hammer repeatedly.
      upsert.run(pc, null, null, nowIso());
      miss++;
    }

    if ((i + 1) % BATCH === 0) {
      console.log(`[geocode] processed ${i + 1}/${todo.length} (ok=${ok}, miss=${miss})`);
    }
    await sleep(SLEEP_MS);
  }

  console.log(`[geocode] done. ok=${ok}, miss=${miss}`);

  // Apply cached coords to schools.
  const updated = db.prepare(`
    UPDATE schools
    SET lat = (SELECT lat FROM postcodes WHERE postcodes.postcode = UPPER(TRIM(schools.postcode))),
        lng = (SELECT lng FROM postcodes WHERE postcodes.postcode = UPPER(TRIM(schools.postcode)))
    WHERE postcode IS NOT NULL AND TRIM(postcode) != ''
  `).run().changes;

  console.log(`[geocode] applied coords to schools (rows touched: ${updated})`);
}

main().catch(err => {
  console.error('[geocode] error', err);
  process.exitCode = 1;
});
