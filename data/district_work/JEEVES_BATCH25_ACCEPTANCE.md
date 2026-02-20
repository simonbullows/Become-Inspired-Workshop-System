# JEEVES BATCH-25 ACCEPTANCE GATE (QUEUE 001 ONLY)

## Scope lock
- District: **888 Lancashire** only
- Queue item: **001** only
- Batch size: **max 25 schools** per submission

Do not touch Queue 002+.

## Required output files for each batch
1. `data/district_work/districts/888_lancashire.csv` (updated)
2. `data/district_work/evidence/queue001_batchNN_evidence.csv` (new evidence file)

### Evidence file schema (required columns)
- `urn`
- `school_name`
- `website_url`
- `page_url_scraped`
- `emails_found` (semicolon-separated)
- `checked_at_utc` (ISO timestamp)
- `method` (manual|scrapify)
- `notes`

## Hard validation rules (must pass)
For any row marked `has_email_collected = yes` in this batch:
1. Must have at least 1 valid email in `emails_found`
2. Email must pass strict format check
3. Reject placeholder/test emails (`example@`, `user@domain`, `test@`)
4. `page_url_scraped` cannot be blank
5. `checked_at_utc` cannot be blank

If any rule fails, batch is FAIL.

## Submission format (every batch)
- Batch id: `queue001_batchNN`
- Schools reviewed count
- `yes` count in batch
- `no` count in batch
- Valid emails added count
- Invalid/placeholder count
- Blockers
- Commit hash

## Stop rule
After submitting one batch of up to 25 schools, STOP and wait for approval.
