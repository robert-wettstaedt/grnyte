import { queries } from '$lib/zero/queries'
import { zeroCaller } from '$lib/zero/server/caller.server'
import { schema } from '$lib/zero/zero-schema'
import { mustGetQuery } from '@rocicorp/zero'
import { handleQueryRequest } from '@rocicorp/zero/server'
import { error } from '@sveltejs/kit'

export async function POST({ request }) {
  // Verified here rather than read off `locals`: the token arrives as a header, and `authGuard`
  // skips this prefix precisely so it is verified exactly once, here.
  const caller = await zeroCaller(request)

  if (!caller.ok) {
    // zero-cache retries only 502 and 504: an expired token gets a window for the client's refresh,
    // a JWKS outage one for the keys to come back. A 401 ends sync on the first attempt.
    error(caller.reason === 'expired' || caller.reason === 'unavailable' ? 502 : 401)
  }

  // `regionMemberCan` leaves a query unfiltered when the context carries no memberships (the client
  // path, against an already-filtered replica), so this is where a region query's scope is decided.
  const ctx = { authUserId: caller.claims.sub, pageState: caller.permissions }

  // Options-object form, required since Zero 1.5. The `userID` is the point of it: zero-cache uses
  // it to enforce that only tabs belonging to the same user share a client group. The old positional
  // signature still compiles and is deprecated.
  const q = await handleQueryRequest({
    handler: (name, args) => mustGetQuery(queries, name).fn({ args, ctx }),
    request,
    schema,
    userID: caller.claims.sub,
  })

  return new Response(JSON.stringify(q))
}
