-- =============================================================================
-- Splooshly redesign migration (Oct 2026)
--
-- SAFE TO RUN ON THE LIVE DATABASE. Read this first:
--   * It never drops, deletes or overwrites any existing data.
--   * Step 0 copies every existing table into a private "splooshly_backup"
--     schema before anything else happens. That schema is not reachable
--     from the app or the public API.
--   * Every other step only ADDS tables/columns, then fills in the NEW
--     columns. Existing columns (name, quantity, unit, dates, etc.) are
--     never modified.
--   * It runs inside a single transaction: if anything fails, nothing changes.
--   * It is idempotent: running it twice is harmless.
--   * The old version of the app keeps working after this runs, so it's fine
--     to run it before the new code is deployed.
--
-- How to run: Supabase dashboard > SQL Editor > New query > paste all > Run.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Backup (only created once; a second run keeps the original snapshot)
-- -----------------------------------------------------------------------------
create schema if not exists splooshly_backup;
revoke all on schema splooshly_backup from public;
do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke all on schema splooshly_backup from anon, authenticated';
  end if;
end $$;

create table if not exists splooshly_backup.inventory_items_20261025 as table public.inventory_items;
create table if not exists splooshly_backup.usage_log_20261025       as table public.usage_log;
create table if not exists splooshly_backup.shopping_list_20261025   as table public.shopping_list;
create table if not exists splooshly_backup.households_20261025      as table public.households;
create table if not exists splooshly_backup.household_members_20261025 as table public.household_members;

-- -----------------------------------------------------------------------------
-- 1. Products: one canonical row per real-world thing
-- -----------------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  normalized_key text not null,
  aliases text[] not null default '{}',
  category text not null check (category in ('seasoning','oil','meat','produce','pantry','essentials','other')),
  unit_kind text not null default 'count' check (unit_kind in ('weight','volume','count')),
  display_unit text not null default 'count' check (display_unit in ('oz','lb','g','kg','count','ml','l')),
  default_package_size numeric,
  default_shelf_life_days integer,
  is_meat boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, normalized_key)
);
create index if not exists idx_products_household on products(household_id);

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at before update on products
for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Packages (inventory_items): new columns only
--    Columns are added WITHOUT defaults first, backfilled from existing data,
--    and only then given a default, so existing rows get real values rather
--    than "today".
-- -----------------------------------------------------------------------------
alter table inventory_items add column if not exists product_id uuid references products(id) on delete set null;
alter table inventory_items add column if not exists added_at date;
alter table inventory_items add column if not exists original_quantity numeric;
alter table inventory_items add column if not exists storage text;
alter table inventory_items add column if not exists source text;

-- Pause the updated_at trigger so backfilling new columns doesn't touch the
-- existing updated_at timestamps.
alter table inventory_items disable trigger trg_inventory_updated_at;
update inventory_items set added_at = (created_at at time zone 'America/Indiana/Indianapolis')::date where added_at is null;
update inventory_items set original_quantity = quantity where original_quantity is null;
alter table inventory_items enable trigger trg_inventory_updated_at;
alter table inventory_items alter column added_at set default current_date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_storage_check') then
    alter table inventory_items add constraint inventory_items_storage_check
      check (storage is null or storage in ('freezer','fridge','pantry'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_source_check') then
    alter table inventory_items add constraint inventory_items_source_check
      check (source is null or source in ('manual','barcode','photo','shopping_list'));
  end if;
end $$;

create index if not exists idx_inventory_product on inventory_items(product_id);

-- -----------------------------------------------------------------------------
-- 3. Usage events (usage_log): new columns only
--    kind:      'used' feeds pace/runway; 'tossed' is waste.
--    Existing rows: reason 'expired' -> tossed, everything else -> used
--    (the handoff says to keep old "remove" records as usage).
-- -----------------------------------------------------------------------------
alter table usage_log add column if not exists product_id uuid references products(id) on delete set null;
alter table usage_log add column if not exists package_id uuid;
alter table usage_log add column if not exists kind text;
alter table usage_log add column if not exists toss_reason text;
alter table usage_log add column if not exists occurred_at timestamptz;

update usage_log set kind = case when reason = 'expired' then 'tossed' else 'used' end where kind is null;
update usage_log set toss_reason = 'expired' where kind = 'tossed' and toss_reason is null and reason = 'expired';
update usage_log set occurred_at = created_at where occurred_at is null;
alter table usage_log alter column occurred_at set default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usage_log_kind_check') then
    alter table usage_log add constraint usage_log_kind_check
      check (kind is null or kind in ('used','tossed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usage_log_toss_reason_check') then
    alter table usage_log add constraint usage_log_toss_reason_check
      check (toss_reason is null or toss_reason in ('expired','spoiled'));
  end if;
end $$;

create index if not exists idx_usage_product on usage_log(product_id, occurred_at);
create index if not exists idx_usage_household_occurred on usage_log(household_id, occurred_at);

-- -----------------------------------------------------------------------------
-- 4. Shopping list: new columns only
-- -----------------------------------------------------------------------------
alter table shopping_list add column if not exists product_id uuid references products(id) on delete set null;
alter table shopping_list add column if not exists quantity_text text;
alter table shopping_list add column if not exists source text not null default 'manual';
alter table shopping_list add column if not exists checked boolean not null default false;

-- -----------------------------------------------------------------------------
-- 5. Activity log (audit trail) and household settings
-- -----------------------------------------------------------------------------
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  type text not null check (type in ('add','use','toss','edit','delete','merge','reset')),
  product_id uuid,
  package_id uuid,
  summary text,
  before jsonb,
  after jsonb,
  actor uuid references auth.users(id),
  at timestamptz not null default now()
);
create index if not exists idx_activity_household on activity_log(household_id, at desc);
create index if not exists idx_activity_package on activity_log(package_id);

create table if not exists household_settings (
  household_id uuid primary key references households(id) on delete cascade,
  shop_every_days integer not null default 7 check (shop_every_days in (7,14,30)),
  target_supply_weeks integer not null default 4 check (target_supply_weeks in (2,4,8)),
  low_stock_warn_weeks integer not null default 2 check (low_stock_warn_weeks in (1,2)),
  expiry_reminder_days integer not null default 3 check (expiry_reminder_days in (3,7)),
  last_trip_at date,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6. Row Level Security for the new tables + the new actions
--    (each household can only see and change its own rows)
-- -----------------------------------------------------------------------------
alter table products enable row level security;
alter table activity_log enable row level security;
alter table household_settings enable row level security;

do $$
declare
  t text;
  member_check text := 'household_id in (select household_id from household_members where user_id = auth.uid())';
begin
  foreach t in array array['products','activity_log','household_settings'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || ' select') then
      execute format('create policy %I on %I for select using (%s)', t || ' select', t, member_check);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || ' insert') then
      execute format('create policy %I on %I for insert with check (%s)', t || ' insert', t, member_check);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || ' update') then
      execute format('create policy %I on %I for update using (%s)', t || ' update', t, member_check);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || ' delete') then
      execute format('create policy %I on %I for delete using (%s)', t || ' delete', t, member_check);
    end if;
  end loop;

  -- usage_log: update (link to products, merge, edit date) and delete
  -- (Undo, and the user-confirmed "Erase usage history" reset).
  if not exists (select 1 from pg_policies where tablename = 'usage_log' and policyname = 'usage_log update') then
    execute format('create policy %I on usage_log for update using (%s)', 'usage_log update', member_check);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'usage_log' and policyname = 'usage_log delete') then
    execute format('create policy %I on usage_log for delete using (%s)', 'usage_log delete', member_check);
  end if;

  -- shopping_list: update (check off items)
  if not exists (select 1 from pg_policies where tablename = 'shopping_list' and policyname = 'shopping_list update') then
    execute format('create policy %I on shopping_list for update using (%s)', 'shopping_list update', member_check);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Quick check: these counts should match the backup counts exactly.
-- -----------------------------------------------------------------------------
commit;

select 'inventory_items' as table_name,
       (select count(*) from public.inventory_items) as now_count,
       (select count(*) from splooshly_backup.inventory_items_20261025) as backup_count
union all
select 'usage_log',
       (select count(*) from public.usage_log),
       (select count(*) from splooshly_backup.usage_log_20261025)
union all
select 'shopping_list',
       (select count(*) from public.shopping_list),
       (select count(*) from splooshly_backup.shopping_list_20261025);

-- NOTE: Linking existing items to products (and merging naming variants like
-- "Boneless Chicken Breasts" -> "Boneless Chicken Breast") happens inside the
-- app the first time it opens after the update. It only fills in the new
-- product_id column and never renames or removes anything.
