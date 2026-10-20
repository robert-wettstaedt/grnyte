// No value imports: e2e specs and `tsx` scripts load this before paraglide is compiled.
import type { Pathname } from '$app/types'

/** The invitation screen, without its `token`. Typed as a {@link Pathname} so a moved route is a
 *  compile error rather than a dead link in an email that has already gone out. */
const INVITE_ACCEPT_PATH: Pathname = '/invite/accept'

/**
 * Where a user with no region is bounced from: the post-sign-in landing page and the map, the two
 * places the app puts somebody who has nowhere to go.
 *
 * Shared because the bounce is enforced twice and the two halves must not drift: `authGuard` has
 * it for document loads, the `(app)` layout for in-app navigation (that group is `ssr = false`
 * with no server loads, so the hook never sees one). '/' is the (landing) group's, which is why
 * only the hook ever matches it.
 */
export const REGIONLESS_PATHS: Pathname[] = ['/', '/explore']

/** Where {@link REGIONLESS_PATHS} bounces to, and the one path the bounce must not fire on. */
export const REGION_CREATE_PATH: Pathname = '/regions/new'

/**
 * The one accept link, relative.
 *
 * Lives here rather than in `invite.server.ts` because the accept page needs it on the client, and
 * that module imports the database. The invitation mail is the only caller that prefixes an
 * origin, since it is the only one that leaves the app.
 */
export function acceptPath(token: string): string {
  return `${INVITE_ACCEPT_PATH}?token=${encodeURIComponent(token)}`
}
