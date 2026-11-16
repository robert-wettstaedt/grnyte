import {
  bigint,
  index,
  jsonb,
  primaryKey,
  smallint,
  pgTable as table,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn as AnyColumn,
} from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'

// Tables only the server reads, on the privileged handle: RLS on, no policies, never synced.
// Kept out of `schema.ts` so `generate:zero` never emits them.

/** A mailed re-auth code. One row per (account, session, action, target): a new request replaces it. */
export const reauthChallenges = table(
  'reauth_challenges',
  {
    action: text().notNull(),
    attempts: smallint().notNull().default(0),
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid('session_id').notNull(),
    target: text().notNull(),
  },
  (table) => [unique().on(table.authUserFk, table.sessionId, table.action, table.target)],
).enableRLS()

/** A confirmed re-auth, spent by deleting it. `guard_auth_identity` reads the `identity.*` ones. */
export const reauthGrants = table(
  'reauth_grants',
  {
    action: text().notNull(),
    authUserFk: uuid('auth_user_fk')
      .notNull()
      .references((): AnyColumn => authUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    id: uuid().primaryKey().defaultRandom(),
    method: text().notNull(),
    sessionId: uuid('session_id').notNull(),
    target: text().notNull(),
  },
  (table) => [unique().on(table.authUserFk, table.sessionId, table.action, table.target)],
).enableRLS()

/** Auth log. No FK on `auth_user_fk`, so `account_deleted` outlives the account. */
export const authEvents = table(
  'auth_events',
  {
    authUserFk: uuid('auth_user_fk'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    detail: jsonb().$type<Record<string, number | string>>(),
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    kind: text().notNull(),
  },
  (table) => [
    index('auth_events_kind_created_at_idx').on(table.kind, table.createdAt),
    index('auth_events_auth_user_fk_idx').on(table.authUserFk),
  ],
).enableRLS()

/** Fixed-window counters: guessed GoTrue codes per address, re-auth mails and notices per subject. */
export const authCodeAttempts = table(
  'auth_code_attempts',
  {
    kind: text().notNull(),
    subject: text().notNull(),
    tries: smallint().notNull().default(0),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.subject, table.kind] })],
).enableRLS()
