# District Work Pack for Jeeves

- Start with `district_index.csv` (sorted by highest remaining to scrape).
- Work one district at a time using the `district_file` path.
- In each district file, prioritize rows where `has_email_collected = no`.
- Update `status` in `district_index.csv` as you go: pending -> in_progress -> done.
