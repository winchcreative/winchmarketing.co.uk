-- Run in Supabase > SQL Editor. Safe to re-run.
-- Replace the email below if your Supabase Auth user uses a different one.

-- 1. Prospects table
create table if not exists public.prospects (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  business       text not null,
  contact_name   text,
  email          text,
  trade          text,
  status         text not null default 'new'
                 check (status in ('new','emailed','viewed','booked','won','lost')),
  ref            text,
  last_contacted date,
  notes          text
);

alter table public.prospects enable row level security;

drop policy if exists "owner select prospects" on public.prospects;
drop policy if exists "owner insert prospects" on public.prospects;
drop policy if exists "owner update prospects" on public.prospects;

create policy "owner select prospects" on public.prospects
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'hello@winchmarketing.co.uk');

create policy "owner insert prospects" on public.prospects
  for insert to authenticated
  with check ((select auth.jwt() ->> 'email') = 'hello@winchmarketing.co.uk');

create policy "owner update prospects" on public.prospects
  for update to authenticated
  using ((select auth.jwt() ->> 'email') = 'hello@winchmarketing.co.uk')
  with check ((select auth.jwt() ->> 'email') = 'hello@winchmarketing.co.uk');

-- No delete policy on purpose: rows cannot be deleted from the browser.

-- 2. Read access to visits for you only.
-- The existing public insert-only policy on visits is NOT touched.
drop policy if exists "owner select visits" on public.visits;

create policy "owner select visits" on public.visits
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'hello@winchmarketing.co.uk');

-- 3. Outreach timeline (public.outreach is filled by the Gmail script)
-- Allow the 'replied' status, which the admin page now sets automatically.
alter table public.prospects drop constraint if exists prospects_status_check;
alter table public.prospects add constraint prospects_status_check
  check (status in ('new','emailed','viewed','replied','booked','won','lost'));

-- Let only you read outreach from the browser.
-- WARNING: enabling RLS blocks any client without a policy. The Gmail script must
-- use the service_role key (which bypasses RLS) or have its own insert/update policy.
alter table public.outreach enable row level security;

drop policy if exists "owner select outreach" on public.outreach;

create policy "owner select outreach" on public.outreach
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'hello@winchmarketing.co.uk');

-- 4. Hide + delete controls on the admin page
-- Hidden flags (rows are filtered out of the admin page by default, never removed).
alter table public.prospects add column if not exists hidden boolean not null default false;
alter table public.outreach  add column if not exists hidden boolean not null default false;

-- outreach: the browser may only change `hidden`, and can never delete
-- (a Gmail sync script re-adds deleted rows). Column grant + no delete grant enforce it.
-- The Gmail script must not write `hidden` when it syncs, or it will un-hide rows.
revoke update, delete on public.outreach from authenticated;
grant update (hidden) on public.outreach to authenticated;

drop policy if exists "owner update outreach" on public.outreach;

create policy "owner update outreach" on public.outreach
  for update to authenticated
  using ((select auth.jwt() ->> 'email') = 'hello@winchmarketing.co.uk')
  with check ((select auth.jwt() ->> 'email') = 'hello@winchmarketing.co.uk');

-- visits: you can delete test data. The public insert-only policy is NOT touched.
drop policy if exists "owner delete visits" on public.visits;

create policy "owner delete visits" on public.visits
  for delete to authenticated
  using ((select auth.jwt() ->> 'email') = 'hello@winchmarketing.co.uk');
