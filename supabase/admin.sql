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
  using ((select auth.jwt() ->> 'email') = 'alexscottmills@gmail.com');

create policy "owner insert prospects" on public.prospects
  for insert to authenticated
  with check ((select auth.jwt() ->> 'email') = 'alexscottmills@gmail.com');

create policy "owner update prospects" on public.prospects
  for update to authenticated
  using ((select auth.jwt() ->> 'email') = 'alexscottmills@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'alexscottmills@gmail.com');

-- No delete policy on purpose: rows cannot be deleted from the browser.

-- 2. Read access to visits for you only.
-- The existing public insert-only policy on visits is NOT touched.
drop policy if exists "owner select visits" on public.visits;

create policy "owner select visits" on public.visits
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'alexscottmills@gmail.com');
