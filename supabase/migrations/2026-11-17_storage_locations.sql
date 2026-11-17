-- Splooshly: storage locations (Nov 17, 2026)
-- Allows "garage_freezer" as a place to keep a package, alongside the main
-- freezer ("freezer"), fridge and pantry. Doesn't change any existing data.
-- Safe to run twice.
alter table inventory_items drop constraint if exists inventory_items_storage_check;
alter table inventory_items add constraint inventory_items_storage_check
  check (storage is null or storage in ('freezer','garage_freezer','fridge','pantry'));
