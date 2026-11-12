-- 2026-11-12: record where each view came from, domain only (google.com, bing.com, chatgpt.com, perplexity.ai).
-- Run by hand in Supabase -> SQL Editor. Safe to re-run.
-- Best run before the site change goes live. If it hasn't been run yet, the site sends the view again
-- without the referrer, and the admin page loads visits without it, so nothing breaks in the meantime.

-- 1. Nullable column, at most 100 characters.
alter table public.visits add column if not exists referrer text;

alter table public.visits drop constraint if exists visits_referrer_length;
alter table public.visits add constraint visits_referrer_length
  check (referrer is null or char_length(referrer) <= 100);

-- 2. Length check in RLS for public inserts.
-- Your existing public insert-only policy is left exactly as it is. This adds a RESTRICTIVE policy,
-- which Postgres ANDs with it, so an anonymous insert must pass every existing check plus this one.
drop policy if exists "visits referrer length" on public.visits;
create policy "visits referrer length" on public.visits
  as restrictive
  for insert
  to anon, authenticated
  with check (referrer is null or char_length(referrer) <= 100);

-- 3. Only needed if inserts on visits are granted column by column rather than for the whole table
--    (Supabase's default is the whole table, so normally skip this).
-- grant insert (referrer) on public.visits to anon;

-- Check: every policy on visits, including the new one.
select policyname, permissive, cmd, roles, with_check
from pg_policies
where schemaname = 'public' and tablename = 'visits'
order by policyname;
