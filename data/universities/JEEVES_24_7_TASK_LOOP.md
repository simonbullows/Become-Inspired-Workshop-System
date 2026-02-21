# JEEVES 24/7 TASK LOOP — UK Universities Deep Research

## Objective
For each UK university, collect:
1. Career-skill workshop opportunities Become Inspired can deliver.
2. Adjacent services (employability, staff development, leadership, wellbeing/performance, digital/AI workplace skills).
3. Procurement pathway (supplier registration, tender portals, frameworks, policy requirements).
4. Relevant contacts (careers, employability, procurement, partnerships, student services, comms).

## Base Queue
- `data/universities/universities_comms_clean.csv`

## Output Files
- `data/universities/universities_master.csv`
- `data/universities/universities_contacts.csv`
- `data/universities/universities_procurement.csv`
- `data/universities/universities_services_fit.csv`
- `data/universities/universities_issues.csv`
- `data/universities/progress_log.md`

## Non-Negotiable Rules
- No guessing.
- No inferred contacts.
- Source URL required for every important claim.
- If uncertain, add to issues and continue.
- Deduplicate contacts by (university + email + role).

## Execution Loop (Autopilot)
- Work in cycles of 3–5 universities.
- After each cycle:
  1) Update all output files.
  2) Append to `progress_log.md`:
     - universities processed
     - contacts added
     - procurement records added
     - service-fit records added
     - issues logged
  3) Commit with message:
     - `data: universities deep-research cycle <timestamp> <count> universities`
  4) Continue next cycle automatically.

## Priority
1) Leicester + East Midlands first.
2) Then continue queue order.

## Stop Rule
Stop only if blocked by critical error. Otherwise continue cycles 24/7.
