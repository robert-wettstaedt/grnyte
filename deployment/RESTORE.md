# Restoring the database

The nightly dumps are produced by `.github/workflows/backup-db.yml` and live on the VPS under
`~/backups/grnyte`, thirty days deep. Each night writes two files:

- `grnyte-YYYYMMDD.dump` — `pg_dump --format=custom` of `public`, `drizzle`, `auth` and `storage`
- `grnyte-YYYYMMDD.cron.sql` — the `cron.schedule()` calls that recreate the pg_cron jobs, which no
  `pg_dump` carries because pg_cron owns those rows as extension members

Both are stored in the clear at mode 600. Whoever holds the deploy key holds their contents.

## Target

The order below assumes a project that already has its `auth` and `storage` schemas (any Supabase
project does) and has neither the public tables nor a `drizzle` schema yet.

`pg_restore` has to be 17. The archive is format 1.16, and neither a 15 nor the `postgres:16` that
`ci.yml` and the worktree recipe use gets past the header.

## The order

Each step exists because the other order lost something. Run them as written.

```bash
scp <user>@<host>:backups/grnyte/grnyte-YYYYMMDD.dump .
```

### 1. What the archive cannot carry

`--schema=drizzle` restores the objects inside the schema and never the `CREATE SCHEMA` itself, so
without this every drizzle object fails and the migration ledger is gone. Roles are in no `pg_dump`
at all, but the `GRANT`s to `app_writer` on every public table and sequence are, as ACL entries, and
they all fail unless the role exists first. `drizzle/0122_app_writer_role.sql` is the role plus the
memberships `set local role app_writer` needs, and it is idempotent.

```bash
psql "$TARGET" -c 'create schema drizzle' -f drizzle/0122_app_writer_role.sql
```

### 2. auth and storage rows, data only

Their DDL is already there. This has to come before `public`, because the public tables that foreign
key `auth.users` (eight at the time of writing) get their constraints validated the moment
`pg_restore` creates them, at the end of the public restore. With `auth.users` still empty every one
of those fails and `pg_restore` carries on without them.

The triggers have to stay quiet while the rows go in, because a data-only restore is not ordered by
foreign key.

```bash
pg_restore --no-owner --data-only --disable-triggers \
  --schema=auth --schema=storage -d "$TARGET" grnyte-YYYYMMDD.dump
```

### 3. auth.identities, second pass

Turning triggers off needs superuser. As `postgres` on a managed project, every `DISABLE TRIGGER` is
`permission denied: ... is a system trigger`, and `auth.identities`, which precedes `auth.users` in
the archive, fails on its foreign key. Its rows go in once the users are there:

```bash
pg_restore --no-owner --data-only --schema=auth --table=identities \
  -d "$TARGET" grnyte-YYYYMMDD.dump
```

### 4. public and drizzle, schema and data

```bash
pg_restore --no-owner --schema=public --schema=drizzle -d "$TARGET" grnyte-YYYYMMDD.dump
```

### 5. The cron jobs

```bash
psql "$TARGET" -f grnyte-YYYYMMDD.cron.sql
```

## Reading the errors

Against a Postgres 15 server, 17's opening `SET transaction_timeout = 0` is one
`errors ignored on restore: 1` that means nothing. Any other count means rows or constraints are
missing, and `pg_restore` does not stop for them. Read the errors before moving on.

## Afterwards

`npm run migrate` is a no-op on the ledger. It re-runs `setup-table-permissions`, which is where the
`app_writer` grants come from, and then the data backfills in `migrate.ts`. Those are idempotent on
restored rows, but two of them need the Nextcloud credentials.

## Not in the dump

- The Zero publications, replication slot and the `zero` / `zero_0` schemas. zero-cache recreates
  these on its next boot against the restored database. On the 0.25 image `main` pins, run
  `npx zero-deploy-permissions` **before** that first boot: that version lists the tables of its
  `_zero_metadata_0` publication once, when it creates it, and never repairs the list, so a
  `zero.permissions` created later is never replicated and the container crash-loops on it. Zero 1.x
  creates the table itself at init and needs no such step.
- Anything in `vault`.
