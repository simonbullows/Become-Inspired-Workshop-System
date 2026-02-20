# JEEVES DATA LANE INSTRUCTIONS (BUILD-SAFE)

## Your role

You are on the **data lane**.
Your job is to **collect and update school contact data only** while Pepper/Simon continue building the app/system.

## Mission

Gather contact details from school websites and keep data files up to date, district by district.

## Hard boundaries (do not cross)

You MUST only edit data files:
- `data/KOSMOS_With_Emails.csv`
- `data/district_work/district_index.csv`
- `data/district_work/districts/*.csv`
- `data/kosmos/exports/*.csv` (if asked to refresh exports)

You MUST NOT edit system/code files:
- `app/web/src/*`
- `app/api/src/*`
- `package.json` / app configs
- UI/layout/styles

If a task requires code changes, stop and report back.

## One-by-one queue rule

Process districts strictly in sequence using:
- `data/district_work/JEEVES_INSTRUCTIONS.md`
- `data/district_work/JEEVES_PROJECT_BRIEF.md`

No skipping unless status is explicitly set to `blocked`.

## Git workflow (while app is being built)

### 1) Work on data branch only
- Branch: `data-collection`

### 2) Commit data updates in small chunks
Suggested commit message format:
- `data: district 888 lancashire +42 emails`

### 3) Push your branch
- Push to `origin/data-collection`
- Do not push directly to `main` unless Simon explicitly says so.

### 4) Handover message after each push
Report:
- district code + district name
- sequence number
- newly found emails
- still missing
- blockers
- branch + commit hash pushed

### Push failure fallback (mandatory)
If `git push` fails for auth/network reasons:
1. Create a patch artifact for the latest commit:
   - `git format-patch -1 --stdout > queueNNN.patch`
2. Upload the patch file into chat (or paste full patch text in chat).
3. Include the exact files changed and commit hash.

Do not stop at a local filesystem path only. The patch content must be delivered in chat so Pepper/Simon can apply it.

## Conflict-safe merge approach

Pepper/Simon will merge your branch and sync DB from your latest `KOSMOS_With_Emails.csv`.
Do not try to resolve app-code conflicts.

## Daily operating loop

1. `node scripts/manage_district_queue.mjs claim-next`
2. `node scripts/jeeves_next_task.mjs`
3. Scrape current district (`has_email_collected = no` first)
4. Save every 25 schools
5. `node scripts/manage_district_queue.mjs complete <district_code>`
6. `node scripts/build_kosmos_ops_layers.mjs`
7. Commit + push to `data-collection`
8. Send handover summary
