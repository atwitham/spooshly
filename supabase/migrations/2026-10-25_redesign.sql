-- =============================================================================
-- Splooshly redesign migration (Oct 2026)
--
-- SAFE TO RUN ON THE LIVE DATABASE:
--   * Step 0 copies every existing table into a private "splooshly_backup"
--     schema first. The app and public API can't reach it.
--   * Everything else only ADDS tables/columns, then fills in the NEW
--     columns. Existing values (names, quantities, units, dates) are never
--     modified or deleted.
--   * One transaction: if anything fails, nothing changes.
--   * Safe to run twice.
--   * The current app keeps working after this runs.
--
-- The only "drop" statements remove objects this script itself creates
-- (a trigger, check constraints and access policies) so it can recreate them
-- when run twice. They never touch data.
--
-- How to run: Supabase > SQL Editor > New query > paste all > Run.
-- If Supabase asks about RLS, choose "Run without RLS": this script already
-- turns RLS on for every table it creates.
-- =============================================================================

begin;

-- 0. Backup ------------------------------------------------------------------
create schema if not exists splooshly_backup;
revoke all on schema splooshly_backup from public, anon, authenticated;

create table if not exists splooshly_backup.inventory_items_20261025 as table public.inventory_items;
create table if not exists splooshly_backup.usage_log_20261025 as table public.usage_log;
create table if not exists splooshly_backup.shopping_list_20261025 as table public.shopping_list;
create table if not exists splooshly_backup.households_20261025 as table public.households;
create table if not exists splooshly_backup.household_members_20261025 as table public.household_members;

alter table splooshly_backup.inventory_items_20261025 enable row level security;
alter table splooshly_backup.usage_log_20261025 enable row level security;
alter table splooshly_backup.shopping_list_20261025 enable row level security;
alter table splooshly_backup.households_20261025 enable row level security;
alter table splooshly_backup.household_members_20261025 enable row level security;

-- 1. Products: one canonical row per real-world thing ------------------------
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
alter table products enable row level security;
create index if not exists idx_products_household on products(household_id);

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at before update on products
for each row execute function set_updated_at();

-- 2. Packages (inventory_items): new columns only ----------------------------
-- Added without defaults, backfilled from existing data, then given a default,
-- so existing rows get their real dates rather than "today".
alter table inventory_items add column if not exists product_id uuid references products(id) on delete set null;
alter table inventory_items add column if not exists added_at date;
alter table inventory_items add column if not exists original_quantity numeric;
alter table inventory_items add column if not exists storage text;
alter table inventory_items add column if not exists source text;

-- Pause the updated_at trigger so the backfill doesn't change existing timestamps.
alter table inventory_items disable trigger trg_inventory_updated_at;
update inventory_items set added_at = (created_at at time zone 'America/Indiana/Indianapolis')::date where added_at is null;
update inventory_items set original_quantity = quantity where original_quantity is null;
alter table inventory_items enable trigger trg_inventory_updated_at;
alter table inventory_items alter column added_at set default current_date;

alter table inventory_items drop constraint if exists inventory_items_storage_check;
alter table inventory_items add constraint inventory_items_storage_check
  check (storage is null or storage in ('freezer','fridge','pantry'));
alter table inventory_items drop constraint if exists inventory_items_source_check;
alter table inventory_items add constraint inventory_items_source_check
  check (source is null or source in ('manual','barcode','photo','shopping_list'));

create index if not exists idx_inventory_product on inventory_items(product_id);

-- 3. Usage events (usage_log): new columns only ------------------------------
-- kind: 'used' feeds pace/runway; 'tossed' is waste.
-- Existing rows: reason 'expired' -> tossed, everything else -> used.
alter table usage_log add column if not exists product_id uuid references products(id) on delete set null;
alter table usage_log add column if not exists package_id uuid;
alter table usage_log add column if not exists kind text;
alter table usage_log add column if not exists toss_reason text;
alter table usage_log add column if not exists occurred_at timestamptz;

update usage_log set kind = case when reason = 'expired' then 'tossed' else 'used' end where kind is null;
update usage_log set toss_reason = 'expired' where kind = 'tossed' and toss_reason is null and reason = 'expired';
update usage_log set occurred_at = created_at where occurred_at is null;
alter table usage_log alter column occurred_at set default now();

alter table usage_log drop constraint if exists usage_log_kind_check;
alter table usage_log add constraint usage_log_kind_check
  check (kind is null or kind in ('used','tossed'));
alter table usage_log drop constraint if exists usage_log_toss_reason_check;
alter table usage_log add constraint usage_log_toss_reason_check
  check (toss_reason is null or toss_reason in ('expired','spoiled'));

create index if not exists idx_usage_product on usage_log(product_id, occurred_at);
create index if not exists idx_usage_household_occurred on usage_log(household_id, occurred_at);

-- 4. Shopping list: new columns only -----------------------------------------
alter table shopping_list add column if not exists product_id uuid references products(id) on delete set null;
alter table shopping_list add column if not exists quantity_text text;
alter table shopping_list add column if not exists source text not null default 'manual';
alter table shopping_list add column if not exists checked boolean not null default false;

-- 5. Activity log and household settings -------------------------------------
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
alter table activity_log enable row level security;
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
alter table household_settings enable row level security;

-- 6. Access rules: each household only sees and changes its own rows ---------
drop policy if exists "products select" on products;
create policy "products select" on products for select
  using (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "products insert" on products;
create policy "products insert" on products for insert
  with check (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "products update" on products;
create policy "products update" on products for update
  using (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "products delete" on products;
create policy "products delete" on products for delete
  using (household_id in (select household_id from household_members where user_id = auth.uid()));

drop policy if exists "activity_log select" on activity_log;
create policy "activity_log select" on activity_log for select
  using (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "activity_log insert" on activity_log;
create policy "activity_log insert" on activity_log for insert
  with check (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "activity_log update" on activity_log;
create policy "activity_log update" on activity_log for update
  using (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "activity_log delete" on activity_log;
create policy "activity_log delete" on activity_log for delete
  using (household_id in (select household_id from household_members where user_id = auth.uid()));

drop policy if exists "household_settings select" on household_settings;
create policy "household_settings select" on household_settings for select
  using (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "household_settings insert" on household_settings;
create policy "household_settings insert" on household_settings for insert
  with check (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "household_settings update" on household_settings;
create policy "household_settings update" on household_settings for update
  using (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "household_settings delete" on household_settings;
create policy "household_settings delete" on household_settings for delete
  using (household_id in (select household_id from household_members where user_id = auth.uid()));

-- usage_log: update (linking, merge) and delete (Undo, and the user-confirmed
-- "Erase usage history" reset). shopping_list: update (check items off).
drop policy if exists "usage_log update" on usage_log;
create policy "usage_log update" on usage_log for update
  using (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "usage_log delete" on usage_log;
create policy "usage_log delete" on usage_log for delete
  using (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "shopping_list update" on shopping_list;
create policy "shopping_list update" on shopping_list for update
  using (household_id in (select household_id from household_members where user_id = auth.uid()));

commit;

-- 7. Check: each now_count should equal its backup_count ---------------------
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

-- Linking existing items to products (grouping naming variants like
-- "Boneless Chicken Breasts" -> "Boneless Chicken Breast") happens in the app
-- the first time it opens. It only fills in the new product_id column.
