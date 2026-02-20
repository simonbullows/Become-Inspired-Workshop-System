# KOSMOS Authority Model

This model separates **geography truth** from **operational scraping scope**.

## Layers

1. **authorities_master** (full universe)
   - Purpose: canonical list of UK/England authorities for procurement + expansion planning.
   - Scope: eventually all principal authorities (and optional extras like combined authorities).
   - Stability: slow-changing reference data.

2. **kosmos_target_set** (current delivery scope)
   - Purpose: authorities/districts currently in active KOSMOS scope.
   - Current phase: `kosmos_2026_phase1` (derived from district_work index).
   - This avoids confusing “all UK councils” with current scraping scope.

3. **district_scrape_queue** (execution state)
   - Purpose: one-row-per-district execution tracking for Jeeves.
   - Driven by `remaining_to_scrape` + `queue_status`.
   - Directly used by automation loop.

## Build command

Generate operational layers from the live district queue:

- `node scripts/build_kosmos_ops_layers.mjs`

Outputs:
- `data/kosmos/exports/kosmos_target_set.csv`
- `data/kosmos/exports/district_scrape_queue.csv`

## Jeeves run loop

1. `node scripts/manage_district_queue.mjs claim-next`
2. `node scripts/jeeves_next_task.mjs`
3. Jeeves runs district scraping
4. `node scripts/manage_district_queue.mjs complete <district_code>`
5. `node scripts/build_kosmos_ops_layers.mjs` (refresh operational exports)
