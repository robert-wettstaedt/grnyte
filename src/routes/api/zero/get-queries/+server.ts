import { verifyAccessToken } from '$lib/auth/verify.server'
import { db } from '$lib/db/db.server'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { queries } from '$lib/zero/queries'
import { schema } from '$lib/zero/zero-schema'
import { mustGetQuery } from '@rocicorp/zero'
import { handleQueryRequest } from '@rocicorp/zero/server'
import { error } from '@sveltejs/kit'

export async function POST({ request }) {
  // Verified here rather than read off `locals`: the token arrives as a header, and `authGuard`
  // skips this prefix precisely so it is verified exactly once, here.
  const verified = await verifyAccessToken(request.headers.get('authorization')?.replace('Bearer ', ''))

  if (!verified.ok) {
    // 502 for expiry, not 401. zero-cache verifies the token once at connection setup and only
    // swaps it for one with a strictly newer `iat`, so a long-lived connection keeps forwarding a
    // token that has since expired; `jwtDecode` ignored `exp`, so that was invisible before. Its
    // fetch retries only 502 and 504, so 502 gives the client's own refresh a backoff window to
    // land, where a 401 would throw TransformFailed on the first attempt and kill sync outright.
    error(verified.reason === 'expired' ? 502 : 401)
  }

  const pageState = await getUserPermissions(db, verified.claims.sub)

  // The one place a region query's scope is decided. `regionMemberCan` leaves a query unfiltered
  // when the context carries no memberships (that is the client path, against an already-filtered
  // local replica), so serving from here without them would hand zero-cache queries that sync
  // every region in the database. An account with no memberships has `[]`, not a missing list.
  if (pageState.userRegions == null) {
    error(500, 'Could not resolve region memberships')
  }

  const ctx = { authUserId: verified.claims.sub, pageState }

  const q = await handleQueryRequest((name, args) => mustGetQuery(queries, name).fn({ args, ctx }), schema, request)

  return new Response(JSON.stringify(q))
}
