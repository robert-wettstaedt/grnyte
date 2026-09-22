/**
 * The database-backed context both event suites need: a real seed member who can read a region
 * with events, carrying their real permissions.
 *
 * Not in `fixture.ts`, which is pure data that Storybook imports and so must stay free of
 * `postgres`. Vitest isolates modules per file, so each suite still owns its pool.
 */
import { reachable, sql } from '$lib/db/testDb'
import { getUserPermissions } from '$lib/hooks/auth.server'
import type { QueryContext } from '$lib/zero/permissions'
import { schema } from '$lib/zero/zero-schema'
import { zeroPostgresJS } from '@rocicorp/zero/server/adapters/postgresjs'

/** `authUserId` narrowed to a string, because `regionMemberCan` refuses an anonymous context. */
export type EventQueryContext = Omit<QueryContext, 'authUserId'> & { authUserId: string }

/** The cast `tenancy.test.ts` uses: the postgres.js generic does not line up with what Zero's
 *  adapter declares, and the mismatch is nominal. */
export const zero = zeroPostgresJS(schema, sql as unknown as Parameters<typeof zeroPostgresJS>[1])

/** Whoever the seed made a member. `undefined` when there is no database or the seed has no such
 *  member, which is what the suites skip on. */
export async function eventQueryContext(): Promise<EventQueryContext | undefined> {
  if (!reachable) {
    return undefined
  }

  const [row] = await sql<{ authId: string }[]>`
    select u.auth_user_fk as "authId" from public.users u
    join public.region_members rm on rm.user_fk = u.id and rm.is_active
    join public.events e on e.region_fk = rm.region_fk
    limit 1`

  return row == null ? undefined : { authUserId: row.authId, pageState: await getUserPermissions(row.authId) }
}
