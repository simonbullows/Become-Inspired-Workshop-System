# Kosmos District/Council Map Layer — First-Pass Design

Date: 2026-02-20
Status: starter design + seed artifacts (non-destructive)

## Objectives covered

1. **District labels are explicit in outputs**
   - Introduce canonical output contract with required fields:
     - `district_code`
     - `district_name`
     - `district_label` (`<district_code> - <district_name>`)
2. **Separate Kosmos model/category** for:
   - districts
   - local authority / town hall entities
   - contact details
3. **Schema + file layout** compatible with current CSV + SQLite workflow.
4. **Starter artifacts** added (docs, SQL schema, CSV seed templates, build/validation scripts).
5. **Phased expansion plan** for MPs/councillors/tender portals.

---

## Proposed data model (Kosmos category)

### 1) `kosmos_districts`
Reference list of districts/geographies used by outreach and mapping.

Primary key: `district_code`

Core fields:
- `district_code` (TEXT)
- `district_name` (TEXT)
- `district_label` (TEXT, required canonical display label)
- `region` (TEXT)
- `county` (TEXT)
- `nation` (TEXT, e.g. England)
- `active` (INTEGER 0/1)
- `notes` (TEXT)
- `source` (TEXT)
- `updated_at` (TEXT ISO timestamp)

### 2) `kosmos_authorities`
Local authority / town hall entity records.

Primary key: `authority_id` (stable internal string id)

Core fields:
- `authority_id` (TEXT)
- `authority_name` (TEXT)
- `authority_type` (TEXT: unitary, metropolitan, county, london_borough, district, combined, other)
- `ons_code` (TEXT)
- `gss_code` (TEXT)
- `website` (TEXT)
- `main_phone` (TEXT)
- `main_email` (TEXT)
- `address_line_1` .. `address_line_3` (TEXT)
- `town` (TEXT)
- `postcode` (TEXT)
- `active` (INTEGER 0/1)
- `source` (TEXT)
- `updated_at` (TEXT ISO timestamp)

### 3) `kosmos_contacts`
Normalized public contact points for each authority.

Primary key: `contact_id`

Core fields:
- `contact_id` (TEXT)
- `authority_id` (TEXT, FK to `kosmos_authorities.authority_id`)
- `contact_type` (TEXT: general, schools, education, send, safeguarding, admissions, procurement, media, complaints, other)
- `contact_label` (TEXT)
- `email` (TEXT)
- `phone` (TEXT)
- `website` (TEXT)
- `department` (TEXT)
- `notes` (TEXT)
- `is_primary` (INTEGER 0/1)
- `source` (TEXT)
- `last_verified_at` (TEXT ISO timestamp)
- `updated_at` (TEXT ISO timestamp)

### 4) `kosmos_district_authority_map`
Join table for district ↔ authority mapping (future-proofs boundary complexity).

Composite key: (`district_code`, `authority_id`)

Fields:
- `district_code` (TEXT)
- `authority_id` (TEXT)
- `relationship_type` (TEXT: local_authority, upper_tier, lower_tier, town_hall, shared_service, other)
- `is_primary` (INTEGER 0/1)
- `source` (TEXT)
- `updated_at` (TEXT ISO timestamp)

---

## File layout (CSV + DB compatible)

```text
app/api/sql/kosmos_schema.sql

data/kosmos/
  README.md
  templates/
    kosmos_districts.seed.csv
    kosmos_authorities.seed.csv
    kosmos_contacts.seed.csv
    kosmos_district_authority_map.seed.csv
  exports/
    kosmos_school_district_map.csv   # generated output contract (district labels required)
```

Guidelines:
- CSVs remain spreadsheet-friendly for manual QA/editing.
- SQLite tables mirror CSV columns to keep import/upsert simple.
- `source` + timestamps included in each table for provenance.

---

## District label output contract

Any output used for queueing/scraping/analysis should include:
- `district_code`
- `district_name`
- `district_label`

`district_label` format:
- `"<district_code> - <district_name>"`
- Example: `"201 - City of London"`

A starter builder script now generates this for all district work rows into:
- `data/kosmos/exports/kosmos_school_district_map.csv`

---

## Phased expansion plan

### Phase 1 (now): district + authority foundations
- Add canonical schema + templates.
- Generate district-labelled school map export.
- Add validation checks that district labels are present in generated outputs.

### Phase 2: governance people layer (MPs/councillors)
- New tables:
  - `kosmos_people`
  - `kosmos_role_assignments` (authority_id/district_code scoped)
- Include role type, party, ward/constituency, contact channels, term dates.
- Add de-duplication keys and verification timestamps.

### Phase 3: procurement/tender intelligence
- New tables:
  - `kosmos_tender_portals`
  - `kosmos_tenders`
  - `kosmos_tender_documents`
- Link tenders to authority_id and categories (education/ICT/building/services).
- Add monitoring fields (published_at, closes_at, status, value band).

### Phase 4: productionization
- Build import/upsert scripts into `app/api/scripts`.
- Add API endpoints for Kosmos entities.
- Add dashboard cards for district coverage/contact completeness.
- Add QA checks in CI: required columns, unique IDs, null thresholds.

---

## Non-destructive implementation notes

- Existing `schools` pipelines/tables are unchanged.
- Added only new docs/templates/schema/scripts/exports.
- New artifacts are additive and safe to adopt incrementally.
