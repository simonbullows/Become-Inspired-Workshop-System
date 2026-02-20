# Kosmos data layer (starter)

This folder contains additive CSV templates and generated exports for district/council mapping.

## Structure

- `templates/` → editable seed files for human + scraper workflows
- `exports/` → generated outputs used by downstream tools

## Required district label convention

Every operational output should include:
- `district_code`
- `district_name`
- `district_label` as `<district_code> - <district_name>`

## Starter workflow

1. Fill/update files in `templates/`.
2. Build district-labelled school mapping export:
   - `node scripts/build_kosmos_district_map.mjs`
3. Validate generated output quality:
   - `node scripts/validate_kosmos_district_map.mjs`

## Notes

- This is intentionally non-destructive and does not change existing school CSVs.
- DB schema proposal lives at `app/api/sql/kosmos_schema.sql`.
