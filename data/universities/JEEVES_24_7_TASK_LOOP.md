# JEEVES 24/7 TASK LOOP — UK Universities Comms

## Global Rules
- No guessing
- No inferred emails
- If uncertain: write to issues file
- After each task output:
  1) files changed
  2) row counts
  3) error count
  4) commit hash
- Stop after each task and wait

## Canonical Files
- `data/universities/universities_comms_raw.md`
- `data/universities/universities_comms_clean.csv`
- `data/universities/universities_comms_issues.csv`

## Required columns (clean CSV)
- university
- email
- phone_raw
- phone_normalized
- contact_url
- status (valid|needs_review)
- issue_reason
- last_checked_utc
- territory_priority (high|normal)

## Task A — Parse + Clean
Input: `universities_comms_raw.md`
Output:
- `universities_comms_clean.csv`
- `universities_comms_issues.csv`

Checks:
- valid email format
- valid URL format
- phone normalized
- malformed/merged rows moved to issues

## Task B — URL Verification
For each `contact_url`:
- check reachable (200/301/302)
- store final URL + HTTP status + checked timestamp
- update status + issue_reason

## Task C — Duplicate + Conflict Detection
- dedupe by university
- flag conflicting email/phone/url to issues

## Task D — Midlands Priority Pass
Prioritize rows linked to:
- Leicester
- Leicestershire
- East Midlands nearby

Set `territory_priority=high` for priority rows.

## Task E — Daily Summary
Report:
- total rows
- valid rows
- needs_review rows
- newly fixed rows
- top unresolved issues
