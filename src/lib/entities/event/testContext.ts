/**
 * The database-backed context the two event suites that run queries the way zero-cache does both
 * need: a real seed member who can read a region that has events, carrying their real permissions.
 *
 * Not in `fixture.ts`. That one is pure data and Storybook imports it, so it has to stay free of
 * `postgres`. Vitest isolates modules per file, so each suite still owns its own pool and is free
 * to end it in `afterAll`.
 */
import { reachable, sql } from '$lib/db/testDb'
import { getUserPermissions } from '$lib/hooks/auth.server'
import type { QueryContext } from '$lib/zero/permissions'
import { schema } from '$lib/zero/zero-schema'
import { zeroPostgresJS } from '@rocicorp/zero/server/adapters/postgresjs'

/** `authUserId` narrowed to a string: `regionMemberCan` refuses an anonymous context, and the
 *  callers only build one when the lookup below found somebody. */
export type EventQueryContext = Omit<QueryContext, 'authUserId'> & { authUserId: string }

/** Same cast `tenancy.test.ts` uses: the postgres.js generic does not line up with what Zero's
 *  adapter declares, and the mismatch is purely nominal. */
export const zero = zeroPostgresJS(schema, sql as unknown as Parameters<typeof zeroPostgresJS>[1])

/** Whoever the seed made a member: this only needs somebody who can read a region with events.
 *  `undefined` when there is no database or the seed has none, which is what the suites skip on. */
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
