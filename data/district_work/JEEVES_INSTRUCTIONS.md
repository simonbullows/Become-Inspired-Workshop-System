# JEEVES: DISTRICT SCRAPING INSTRUCTIONS (READ FIRST)

You must work the district queue **one by one in strict sequence**.

## Non-negotiable rule

- Process queue items in `sequence_no` order: **1, then 2, then 3, ...**
- Do **not** skip ahead unless a district is explicitly marked `blocked`.

## Your workflow each cycle

1. Claim current district:
   - `node scripts/manage_district_queue.mjs claim-next`
2. Read task prompt:
   - `node scripts/jeeves_next_task.mjs`
3. Open the district file shown and scrape only rows where:
   - `has_email_collected = no`
4. Save progress regularly (every 25 schools processed).
5. End-of-pass closeout:
   - `node scripts/manage_district_queue.mjs complete <district_code>`
6. Refresh ops exports:
   - `node scripts/build_kosmos_ops_layers.mjs`

## Data quality rules

- Only mark `has_email_collected = yes` when a valid school email is found.
- Avoid placeholder/junk emails (e.g. `noreply@`, obvious generic traps).
- Do not edit other district files during this run.

## Output required after each district

Report:
- district_code + district_name
- sequence_no
- schools_processed
- newly_found_emails
- still_missing
- blockers/issues
