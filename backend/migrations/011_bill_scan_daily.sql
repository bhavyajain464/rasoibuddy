-- Free-tier bill scans reset daily (count applies to bill_scan_count_date only).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS bill_scan_count_date DATE;
