-- Splooshly: add "cabinet" as a storage location (Nov 17, 2026)
-- Oils & Condiments can be kept in the Cabinet, Pantry or Fridge.
-- Doesn't change any existing data. Safe to run twice.
alter table inventory_items drop constraint if exists inventory_items_storage_check;
alter table inventory_items add constraint inventory_items_storage_check
  check (storage is null or storage in ('freezer','garage_freezer','fridge','pantry','cabinet'));
