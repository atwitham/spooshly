-- =============================================================================
-- Splooshly: invite people to your household (Oct 29, 2026)
--
-- Adds a household_invites table and two helper functions. Doesn't change
-- any existing data. Safe to run twice.
--
-- How it works: a member invites an email address. When someone signs in
-- with that exact email (and isn't in a household yet), the app calls
-- accept_household_invite(), which adds them to the household.
-- =============================================================================

create table if not exists household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  email text not null,
  display_name text,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);
alter table household_invites enable row level security;
create unique index if not exists household_invites_one_pending
  on household_invites (household_id, lower(email)) where accepted_at is null;

drop policy if exists "household_invites select" on household_invites;
create policy "household_invites select" on household_invites for select
  using (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "household_invites insert" on household_invites;
create policy "household_invites insert" on household_invites for insert
  with check (household_id in (select household_id from household_members where user_id = auth.uid()));
drop policy if exists "household_invites delete" on household_invites;
create policy "household_invites delete" on household_invites for delete
  using (household_id in (select household_id from household_members where user_id = auth.uid()));

-- Joins the signed-in person to the household that invited their email.
-- Does nothing if they're already in a household or have no pending invite.
create or replace function public.accept_household_invite()
returns uuid
language sql
security definer
set search_path = public
as '
  with inv as (
    select id, household_id, display_name
    from household_invites
    where accepted_at is null
      and lower(email) = lower(auth.jwt() ->> ''email'')
      and not exists (select 1 from household_members where user_id = auth.uid())
    order by created_at desc
    limit 1
  ),
  joined as (
    insert into household_members (user_id, household_id, display_name)
    select auth.uid(), household_id, coalesce(display_name, split_part(auth.jwt() ->> ''email'', ''@'', 1))
    from inv
    returning household_id
  ),
  marked as (
    update household_invites
    set accepted_at = now(), accepted_by = auth.uid()
    where id in (select id from inv)
    returning id
  )
  select household_id from joined
';

-- Lists everyone in your household (names and emails) for Settings.
create or replace function public.household_people()
returns table (user_id uuid, display_name text, email text, is_me boolean)
language sql
stable
security definer
set search_path = public
as '
  select m.user_id, m.display_name, u.email::text, m.user_id = auth.uid()
  from household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id in (select household_id from household_members where user_id = auth.uid())
  order by m.created_at
';

revoke all on function public.accept_household_invite() from public, anon;
revoke all on function public.household_people() from public, anon;
grant execute on function public.accept_household_invite() to authenticated;
grant execute on function public.household_people() to authenticated;
