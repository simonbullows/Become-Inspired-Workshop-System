# Jeeves Scraping System

Purpose: let Jeeves run district scraping end-to-end with minimal human coordination.

## Control loop

1. Build/refresh queue:
   - `node scripts/manage_district_queue.mjs rebuild`
2. Claim next district:
   - `node scripts/manage_district_queue.mjs claim-next`
3. Generate prompt for Jeeves:
   - `node scripts/jeeves_next_task.mjs`
4. Jeeves scrapes district file and updates `has_email_collected`.
5. Close district pass:
   - `node scripts/manage_district_queue.mjs complete <district_code>`
6. Repeat from step 2.

## Notes

- Queue is ordered by highest `remaining_to_scrape` first.
- `claim-next` keeps work focused on one district at a time.
- `complete` recalculates from district CSVs so status reflects actual file state.
- If Jeeves gets blocked, set district status to `blocked` and move on:
  - `node scripts/manage_district_queue.mjs set-status <district_code> blocked`

## Quick status checks

- `node scripts/manage_district_queue.mjs summary`
- `node scripts/manage_district_queue.mjs next`
