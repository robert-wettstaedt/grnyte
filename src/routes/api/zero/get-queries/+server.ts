import { db } from '$lib/db/db.server'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { queries } from '$lib/zero/queries'
import { schema } from '$lib/zero/zero-schema'
import { mustGetQuery } from '@rocicorp/zero'
import { handleQueryRequest } from '@rocicorp/zero/server'
import { error } from '@sveltejs/kit'
import { jwtDecode } from 'jwt-decode'

export async function POST({ request }) {
  const jwt = request.headers.get('authorization')?.replace('Bearer ', '')
  const { sub } = jwt == null ? {} : jwtDecode(jwt)

  if (jwt == null || sub == null) {
    error(401)
  }

  const pageState = await getUserPermissions(db, sub)

  // The one place a region query's scope is decided. `regionMemberCan` leaves a query unfiltered
  // when the context carries no memberships (that is the client path, against an already-filtered
  // local replica), so serving from here without them would hand zero-cache queries that sync
  // every region in the database. An account with no memberships has `[]`, not a missing list.
  if (pageState.userRegions == null) {
    error(500, 'Could not resolve region memberships')
  }

  const ctx = { authUserId: sub, pageState }

  const q = await handleQueryRequest((name, args) => mustGetQuery(queries, name).fn({ args, ctx }), schema, request)

  return new Response(JSON.stringify(q))
}
