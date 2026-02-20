# KOSMOS Data Status

Last updated: 2026-02-20

## Current snapshot

- `data/KOSMOS_Schools_Full.csv`: **22,011** rows (baseline full school set)
- `data/KOSMOS_Schools_Complete.csv`: **22,013** rows
- `data/KOSMOS_With_Emails.csv`: **3,329** rows
- `data/KOSMOS_Schools_Enriched.csv`: **2,626** rows
- DB `data/schools.db` (`schools`): **22,011** rows

## Overlap checks (URN)

- `Complete ∩ Full`: **22,011 / 22,013**
- `With_Emails ∩ Full`: **3,328 / 3,329**
- `Enriched ∩ Full`: **2,626 / 2,626**

Differences found:
- `Complete - Full`: **2 URNs**
  - `125791` Stratford Preparatory School
  - `125814` Aidenswood School
- `With_Emails - Full`: **1 URN**
  - `125814` Aidenswood School

## Geocoding status

From helper scripts in `app/api/scripts`:
- Schools in DB: **22,011**
- Schools with coordinates: **21,968**
- Cached postcodes: **20,913**
- Cached postcodes with coordinates: **20,873**

## Canonical-source decision (working)

- **Canonical school universe:** `KOSMOS_Schools_Full.csv` + `schools.db`
- **Operational enrichment layer:** `KOSMOS_Schools_Complete.csv`
- **Email subset:** `KOSMOS_With_Emails.csv`
- **Focused enrichment subset:** `KOSMOS_Schools_Enriched.csv`

## Next actions checklist

- [ ] Verify whether URNs `125791` and `125814` should be added to canonical full set or removed from downstream files.
- [ ] Re-run merge/enrichment so `Complete` and `With_Emails` are consistent with canonical source.
- [ ] Fill remaining missing coordinates in DB (21,968 / 22,011 currently geocoded).
- [ ] Add a small script that prints these counts in one command for daily sanity checks.
- [ ] Freeze naming/versioning convention for exports to stop file drift.
