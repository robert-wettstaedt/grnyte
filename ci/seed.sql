-- Test seed data for CI (and any freshly-migrated test DB). Run ONCE, after `npm run migrate`.
--
-- Two things the DB-backed suites need that no migration creates:
--   1. The `role_permissions` matrix - the role->permission grants `authorize_in_region()` reads.
--      Seeded out of band in dev/prod (like the authorize functions were), so it lives only as data.
--      These rows are dumped verbatim from the dev DB the suite is green against; keep them in sync.
--   2. The four tier logins the suites resolve by email (testDb.seedUsers), plus admin@'s app_admin
--      row. UUIDs are fixed and arbitrary - tests match on email, not id.
--
-- Idempotent: safe to re-run.

-- 1. Permission matrix (dumped from dev: 8 rows).
insert into public.role_permissions (role, permission) values
  ('app_admin', 'app.admin'),
  ('region_user', 'region.read'),
  ('region_maintainer', 'region.read'),
  ('region_maintainer', 'region.edit'),
  ('region_admin', 'region.read'),
  ('region_admin', 'region.edit'),
  ('region_admin', 'region.delete'),
  ('region_admin', 'region.admin')
on conflict do nothing;

-- 2. Tier logins: auth.users -> public.users, matched by email in seedUsers().
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@grnyte.rocks'),
  ('00000000-0000-0000-0000-000000000002', 'maintainer@grnyte.rocks'),
  ('00000000-0000-0000-0000-000000000003', 'user@grnyte.rocks'),
  ('00000000-0000-0000-0000-000000000004', 'anon@grnyte.rocks')
on conflict (id) do nothing;

insert into public.users (username, auth_user_fk) values
  ('admin', '00000000-0000-0000-0000-000000000001'),
  ('maintainer', '00000000-0000-0000-0000-000000000002'),
  ('user', '00000000-0000-0000-0000-000000000003'),
  ('anon', '00000000-0000-0000-0000-000000000004')
on conflict do nothing;

-- admin@ is the app admin (deliberately NOT a region member - see regionPolicies.test.ts).
insert into public.user_roles (role, auth_user_fk) values
  ('app_admin', '00000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- Settings row per user - real signup creates one; suites (e.g. resolveContactLocale) assume it.
insert into public.user_settings (auth_user_fk, user_fk)
select u.auth_user_fk, u.id
from public.users u
where u.username in ('admin', 'maintainer', 'user', 'anon')
  and not exists (select 1 from public.user_settings s where s.user_fk = u.id);
