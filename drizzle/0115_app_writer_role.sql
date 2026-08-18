-- The app writes as its own role, and `authenticated` writes nothing.
--
-- Every logged-in browser holds a JWT whose `role` claim is `authenticated`, and that is the role
-- PostgREST and pg_graphql switch to. So for as long as the app shares it, RLS is the only thing
-- standing between a devtools console and the tables, and every policy has to be exactly right
-- forever. Splitting the roles makes that a second gate rather than the only one: a hand-written
-- request can still read (the policies decide what), but it cannot write at all, whatever any
-- future policy says.
--
-- `app_writer` is a member of `authenticated`, which is what keeps this a short migration instead
-- of a rewrite: RLS policies declared `TO authenticated` apply to any role that is a member of it,
-- so nothing about the policies changes. Membership also carries the SELECT and sequence grants,
-- so only the write privileges need saying, and those are said by
-- `scripts/setup-table-permissions.ts`, which re-asserts them after every migrate rather than once
-- here. This migration creates the role that script grants to.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_writer') THEN
    CREATE ROLE app_writer NOLOGIN INHERIT;
  END IF;
END
$$;--> statement-breakpoint

GRANT authenticated TO app_writer;--> statement-breakpoint

-- Membership for the roles that need to switch into it: whoever runs migrations, and the role the
-- app connects as. If those differ and only one of them has it, `set local role app_writer` fails
-- on every request, which is a total outage rather than a degraded path. Deliberately NOT granted
-- to `authenticator`: that is the role PostgREST switches from, and membership there would let a
-- JWT claiming `app_writer` walk straight past the split this exists to create.
DO $$
BEGIN
  EXECUTE format('GRANT app_writer TO %I', current_user);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT app_writer TO postgres;
  END IF;
END
$$;
