-- Splooshly: freezer space (Oct 29, 2026)
-- Adds one empty column to household settings. Doesn't change any existing data.
-- Safe to run twice.
alter table household_settings add column if not exists freezer_capacity_g numeric;
