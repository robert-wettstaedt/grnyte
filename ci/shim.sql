-- Supabase surface shim for CI (and any plain-Postgres test DB).
--
-- Our migrations REFERENCE Supabase-managed objects but never create them: the RLS policies are
-- `TO authenticated`, six tables FK `auth.users`, the policies call `auth.uid()`/`auth.jwt()`, and
-- migration 0075 pokes the `storage` schema. On a real Supabase cluster those come pre-baked; on a
-- bare `postgres:N` they don't, so `npm run migrate` fails on the first `TO authenticated`.
--
-- This file creates exactly that surface and nothing more (no GoTrue/PostgREST/Storage runtime).
-- Run it ONCE, as a superuser, BEFORE `npm run migrate`. `auth.uid()`/`auth.jwt()` are the real
-- Supabase definitions verbatim (they only read the request.jwt.* GUCs the app already sets), so the
-- RLS tests exercise the same auth surface as production, not an approximation.

-- Roles the policies/grants target. Deliberately non-superuser and non-BYPASSRLS so RLS actually
-- applies when a test does `set local role authenticated`. The migration/superuser connection is the
-- only thing that bypasses RLS (to build fixtures), exactly as in prod.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;

-- auth schema: the `users` table (FK target for 6 app tables; `id` + `email` are all that is read)
-- and the two claim readers the RLS policies and SECURITY DEFINER functions call.
-- Base privileges. On Supabase, anon/authenticated/service_role are granted ALL on public objects
-- and RLS narrows from there; without this `authenticated` has NO table privileges, so PG denies at
-- the GRANT layer ("permission denied for table") before any policy runs and RLS is never reached.
-- Set as DEFAULT PRIVILEGES so every table `npm run migrate` then creates picks them up. The app's
-- own setup-table-permissions step revokes `anon` again (RLS-only), exactly as in prod.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Verbatim Supabase definitions: read request.jwt.claim.sub / request.jwt.claims, set per-transaction
-- by createDrizzle (db.server.ts) and by the RLS test harness.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- storage schema: just enough for migration 0075 (a `staging` bucket + four RLS policies on
-- `storage.objects`) to APPLY. Inert in tests - nothing exercises storage-object RLS - but the DDL
-- must succeed. `foldername` mirrors Supabase's (split the object path on '/').
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);

create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
