# Become Inspired Workshop System (MVP)

Internal webapp to coordinate school outreach + workshops.

## What it does (v0.1)
- Imports Gov/merged school data (22,011 rows) into a local DB
- Search + filter schools
- Map view (postcode-level coordinates)
- School detail panel (emails/phone/website/flags)

## Local dev (Windows)

### 1) API

```powershell
cd app\api
npm install
npm run import:schools
npm run geocode:postcodes   # optional, fills lat/lng
npm run dev
# API: http://localhost:8787
```

### 2) Web

```powershell
cd app\web
npm install
npm run dev
# Web: http://localhost:5174
```

## Data
- Source CSV: `data/KOSMOS_Schools_Full.csv`
- SQLite DB: `data/schools.db`

## Notes
- Map coordinates are postcode-centroid level (good enough for visual sales targeting).
- Email sending is not implemented yet (segmentation + export will come first).
