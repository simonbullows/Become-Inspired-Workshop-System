# Prototype status (auto)

## Running locally
- API: http://localhost:8787
- Web: http://localhost:5174

## Implemented
- Import pipeline: `app/api/scripts/import_schools.mjs`
- Search + filters: q/region/phase/SEND/pupil premium
- Map base layer (OpenStreetMap via Leaflet)
- School detail panel
- Stats endpoint
- Segments + Campaigns database + API scaffolding (draft only)
- Postcode geocoding script (postcodes.io) + caching

## Screenshots
- `app/web/screenshots/01-dashboard.png`
- `app/web/screenshots/02-selected-school.png`

## Next
- Marker clustering + marker updates
- Segment save UI + export to CSV
- Campaign compose UI + template variables
- Auth (team login)
- Deployment to Hetzner (Ubuntu + Docker)
