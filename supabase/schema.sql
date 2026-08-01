-- Kitchen Inventory schema for Supabase
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)

-- 1. Households: lets exactly the people you invite share one inventory
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Household',
  created_at timestamptz not null default now()
);

-- 2. Link each authenticated user to a household
create table if not exists household_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- 3. Inventory items
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  category text not null check (category in ('seasoning','oil','meat','produce','pantry','essentials','other')),
  quantity numeric not null default 1,
  unit text not null default 'count' check (unit in ('oz','lb','g','kg','count','ml','l')),
  expiration_date date,
  barcode text,
  photo_url text,
  notes text,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_household on inventory_items(household_id);
create index if not exists idx_inventory_category on inventory_items(household_id, category);

-- 4. Usage log: every time an item is removed, we record it here.
--    This is what powers the "how much meat do we go through" analytics.
create table if not exists usage_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_name text not null,
  category text not null check (category in ('seasoning','oil','meat','produce','pantry','essentials','other')),
  quantity_removed numeric not null,
  unit text not null default 'count',
  reason text not null default 'used' check (reason in ('used','expired','restocked','other')),
  removed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_household_category on usage_log(household_id, category, created_at);

-- 4b. Shopping list: fed by the "Restock" action on any item. Cleared when
--     marked purchased.
create table if not exists shopping_list (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_name text not null,
  category text not null check (category in ('seasoning','oil','meat','produce','pantry','essentials','other')),
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_shopping_list_household on shopping_list(household_id);

-- 5. Keep updated_at fresh
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_inventory_updated_at on inventory_items;
create trigger trg_inventory_updated_at
before update on inventory_items
for each row execute function set_updated_at();

-- 6. Row Level Security: each person can only see/edit their own household's data
alter table households enable row level security;
alter table household_members enable row level security;
alter table inventory_items enable row level security;
alter table usage_log enable row level security;
alter table shopping_list enable row level security;

create policy "members can read own household" on households
  for select using (
    id in (select household_id from household_members where user_id = auth.uid())
  );

create policy "users can read their own membership row" on household_members
  for select using (user_id = auth.uid());

create policy "members can read own household's inventory" on inventory_items
  for select using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "members can insert into own household's inventory" on inventory_items
  for insert with check (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "members can update own household's inventory" on inventory_items
  for update using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "members can delete own household's inventory" on inventory_items
  for delete using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );

create policy "members can read own household's usage log" on usage_log
  for select using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "members can insert into own household's usage log" on usage_log
  for insert with check (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );

create policy "members can read own household's shopping list" on shopping_list
  for select using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "members can insert into own household's shopping list" on shopping_list
  for insert with check (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );
create policy "members can delete from own household's shopping list" on shopping_list
  for delete using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );

-- 7. Storage bucket for item photos (create via Storage UI or this helper insert)
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

create policy "anyone authenticated can upload item photos"
  on storage.objects for insert
  with check (bucket_id = 'item-photos' and auth.role() = 'authenticated');

create policy "anyone can view item photos"
  on storage.objects for select
  using (bucket_id = 'item-photos');

-- 8. One-time setup: after you and your wife both sign up, create a household
--    and add both of you to it. Run this manually with your real user IDs,
--    which you can find in Supabase > Authentication > Users.
--
-- insert into households (id, name) values ('00000000-0000-0000-0000-000000000001', 'Our Kitchen');
-- insert into household_members (user_id, household_id, display_name) values
--   ('<alec-user-id>', '00000000-0000-0000-0000-000000000001', 'Alec'),
--   ('<wife-user-id>', '00000000-0000-0000-0000-000000000001', 'Wife');
