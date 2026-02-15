# KOSMOS UK Schools Database - Notes for Pepper

## Overview
This dataset contains 22,011 UK schools with contact information scraped from their websites.

## Files

### KOSMOS_Schools_Complete.csv
All schools (22,013 rows), all columns included.

### KOSMOS_With_Emails.csv  
Only schools where emails were successfully found (10,709 rows).

## Columns Explained

| Column | Description |
|--------|-------------|
| `urn` | Unique Reference Number - school identifier |
| `school_name` | School name |
| `website` | School website URL |
| `scrape_time` | When this data was collected (ISO format) |
| `status` | See below |
| `all_emails` | JSON array of email addresses found |
| `phone_numbers` | Phone numbers found |
| `address` | Physical address |
| `staff_names` | Staff names found |
| `governor_names` | Governor names found |
| `source` | Where data came from (old/fast/stable) |
| `retry_needed` | 1 = needs retry, 0 = done |
| `retry_count` | How many times we tried |

## Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| `success` | Emails found ✅ | Ready to use |
| `error` | Website failed to load | Marked for retry |
| `no_emails` | Website loaded but no emails found | May need manual check |
| `no_website` | No website URL in original data | May have website elsewhere |

## For Your System

### Priority 1 - Ready to use
Filter: `status == 'success'`
- 10,709 schools have verified email addresses

### Priority 2 - Needs retry  
Filter: `status == 'error'`
- 8,901 websites timed out or failed
- `urls_to_scrape.csv` contains these URLs
- Can retry with better tool (FireCrawl, manual browser, etc.)

### Priority 3 - No emails found
Filter: `status == 'no_emails'`
- 2,317 websites loaded but no emails visible
- May have contact form instead of published emails
- Could try different page URLs (/contact, /about, etc.)

## Tips for Your System

1. **Email validation**: Some emails may be old or invalid
2. **Deduplication**: Some schools share email domains
3. **Contact priority**: Usually `office@` or `admin@` are best for first contact
4. **Follow-up**: Schools with no published email may respond to contact forms

## Data Quality Notes

- Data collected Feb 2026
- Some websites may have changed since scraping
- Success rate ~50% for email extraction
- Remaining 8,901 could yield more with better tools
