# District Work Pack for Jeeves

## Daily workflow (one district at a time)

1. Rebuild index from live district CSVs:
   - `node scripts/manage_district_queue.mjs rebuild`
2. Pull current next district:
   - `node scripts/manage_district_queue.mjs next`
3. Mark it in progress:
   - `node scripts/manage_district_queue.mjs set-status <district_code> in_progress`
4. Work the district file shown in `district_file`.
   - Prioritize rows where `has_email_collected = no`.
5. When finished:
   - `node scripts/manage_district_queue.mjs rebuild`
   - If complete, mark done: `node scripts/manage_district_queue.mjs set-status <district_code> done`

## Useful commands

- `node scripts/manage_district_queue.mjs summary` -> global district progress totals
- `node scripts/manage_district_queue.mjs next` -> current district target (prefers `in_progress`, otherwise highest pending)
- `node scripts/manage_district_queue.mjs claim-next` -> auto-claim next district and mark `in_progress`
- `node scripts/manage_district_queue.mjs complete <code>` -> refresh counts and auto set `done` if remaining is 0
- `node scripts/manage_district_queue.mjs set-status <code> <pending|in_progress|blocked|done>` -> manual status control
- `node scripts/jeeves_next_task.mjs` -> print ready-to-send task prompt for Jeeves
