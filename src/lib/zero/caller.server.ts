import { verifyAccessToken } from '$lib/auth/verify.server'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { error } from '@sveltejs/kit'

/**
 * The caller of a zero-cache request: its Bearer token verified, and the region memberships every
 * query scope and mutator gate reads. A bad token comes back unthrown, since each endpoint answers
 * it with a different status. `alongside` loads more for the same caller in parallel.
 */
export async function zeroCaller<Extra = undefined>(
  request: Request,
  alongside?: (authUserId: string) => Promise<Extra>,
) {
  const verified = await verifyAccessToken(request.headers.get('authorization')?.replace('Bearer ', ''))
  if (!verified.ok) {
    return verified
  }

  const [permissions, extra] = await Promise.all([
    getUserPermissions(verified.claims.sub),
    alongside?.(verified.claims.sub),
  ])

  // An account with no memberships has `[]`. Missing means unread, and a query scoped by nothing
  // would sync every region in the database.
  if (permissions.userRegions == null) {
    error(500, 'Could not resolve region memberships')
  }

  return { ...verified, extra, permissions, userRegions: permissions.userRegions }
}
