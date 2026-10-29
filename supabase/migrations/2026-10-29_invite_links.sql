-- Splooshly: private invite links (Oct 29, 2026)
-- Gives every invite its own unguessable link token. Doesn't change any
-- existing data. Safe to run twice.
alter table household_invites add column if not exists token uuid not null default gen_random_uuid();
create unique index if not exists household_invites_token on household_invites (token);
