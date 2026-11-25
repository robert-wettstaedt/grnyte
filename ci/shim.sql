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

-- auth schema: the `users` table (FK target for 6 app tables; the columns the app reads, as GoTrue types them)
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
-- Sign-up protection reads confirmation state and account age. `alter`, so a DB shimmed before this gains them.
alter table auth.users add column if not exists created_at timestamptz default now();
alter table auth.users add column if not exists email_confirmed_at timestamptz;
-- The identity guard, sign-in methods and the session check read these. Each statement is a no-op
-- on a database GoTrue already migrated.
alter table auth.users add column if not exists encrypted_password text;
alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}';
alter table auth.users add column if not exists email_change text;

create table if not exists auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  provider_id text not null,
  identity_data jsonb not null default '{}',
  email text,
  created_at timestamptz,
  updated_at timestamptz,
  last_sign_in_at timestamptz
);

create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet
);

create table if not exists auth.refresh_tokens (
  id bigserial primary key,
  session_id uuid references auth.sessions on delete cascade
);

create table if not exists auth.audit_log_entries (
  id uuid primary key,
  payload json,
  created_at timestamptz
);

-- Verbatim Supabase definitions: read request.jwt.claim.sub / request.jwt.claims, set per-transaction
-- by createDrizzle (db.server.ts) and by the RLS test harness. Created only when missing, so a real
-- Supabase database keeps its own.
do $shim$ begin
  if to_regprocedure('auth.uid()') is null then
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;
  end if;
  if to_regprocedure('auth.jwt()') is null then
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
      )::jsonb
    $$;
  end if;
end $shim$;

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

do $shim$ begin
  if to_regprocedure('storage.foldername(text)') is null then
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select string_to_array(name, '/')
    $$;
  end if;
end $shim$;

-- Supabase's value: float8 text is 15 digits, so a stored double can read back changed. Stock Postgres
-- round-trips it, which hides what the block pin fingerprint guards. New sessions only.
do $shim$ begin
  execute format('alter database %I set extra_float_digits = 0', current_database());
end $shim$;

-- Zero's push bookkeeping, which zero-cache creates on first connect and CI never runs. The mutator
-- suites push through Zero's real processor, which writes both tables in every mutation's transaction.
CREATE SCHEMA IF NOT EXISTS zero_0;
CREATE TABLE IF NOT EXISTS zero_0.clients (
  "clientGroupID" text NOT NULL,
  "clientID" text NOT NULL,
  "lastMutationID" bigint NOT NULL,
  "userID" text,
  PRIMARY KEY ("clientGroupID", "clientID")
);
CREATE TABLE IF NOT EXISTS zero_0.mutations (
  "clientGroupID" text NOT NULL,
  "clientID" text NOT NULL,
  "mutationID" bigint NOT NULL,
  result json NOT NULL,
  PRIMARY KEY ("clientGroupID", "clientID", "mutationID")
);
