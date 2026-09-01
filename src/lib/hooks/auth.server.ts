import { building } from '$app/environment'
import type { Pathname } from '$app/types'
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { verifyAccessToken } from '$lib/auth/verify.server'
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { acceptPath, REGION_CREATE_PATH, REGIONLESS_PATHS } from '$lib/entities/region/dto'
import { findLiveInvitationByEmail } from '$lib/entities/region/invite.server'
import { regionSettingsSchema } from '$lib/entities/region/settings'
import { createServerClient } from '@supabase/ssr'
import { redirect, type Handle } from '@sveltejs/kit'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export async function getUserPermissions(
  db: PostgresJsDatabase<typeof schema>,
  authUserId: string,
): Promise<App.SafeSession> {
  // Three independent reads on a pooled connection, and this runs on every request as well as
  // every get-queries POST, so they go together rather than three round-trips deep.
  const [userRole, userRegions, permissions] = await Promise.all([
    db.query.userRoles.findFirst({
      where: (table, { eq }) => eq(table.authUserFk, authUserId),
    }),

    db.query.regionMembers.findMany({
      columns: {
        regionFk: true,
        role: true,
      },
      // `eq(isActive, true)`, not `isNotNull`: the column is NOT NULL, so the old predicate matched
      // every row and a deactivated membership kept full access. This list is what scopes every Zero
      // region query and what every checkRegionPermission call reads, and nothing downstream
      // re-checks is_active, so a deactivated member went on syncing the whole region silently.
      where: (table, { and, eq }) => and(eq(table.authUserFk, authUserId), eq(table.isActive, true)),
      with: {
        region: {
          columns: {
            name: true,
            settings: true,
          },
        },
      },
    }),

    db.query.rolePermissions.findMany(),
  ])

  const userPermissions =
    userRole == null
      ? undefined
      : permissions.filter((permission) => permission.role === userRole.role).map(({ permission }) => permission)

  const userRegionsResult = userRegions.map((member) => ({
    ...member,
    name: member.region.name,
    permissions: permissions.filter(({ role }) => role === member.role).map(({ permission }) => permission),
    // Checked rather than cast, the way `toRegionMembership` does it on the client side: the column
    // is untyped jsonb, and `regionTags` reads the vocabulary off here to decide what a route write
    // may store. An unparsed blob would make that allowlist whatever the column happened to hold.
    settings: regionSettingsSchema.safeParse(member.region.settings ?? {}).data,
  }))

  return {
    user: undefined,
    userPermissions,
    userRegions: userRegionsResult,
    userRole: userRole?.role,
  }
}

/** A request with no usable identity. A function rather than a shared const: `userRegions` is
 *  handed out to callers, and one accidental push on a shared array would leak across requests. */
function anonymous(): App.SafeSession & { claims: undefined } {
  return { claims: undefined, user: undefined, userPermissions: undefined, userRegions: [], userRole: undefined }
}

export const supabase: Handle = async ({ event, resolve }) => {
  // Prerendering has no request behind it: no cookies, so no session to load and nothing on
  // `locals` a prerendered page could read. Building the client anyway made the whole build depend
  // on PUBLIC_SUPABASE_URL parsing as a URL, which is how `/offline` took CI down: the value there
  // is the placeholder `foobar`. `rateLimit` bails on the same condition for the same reason.
  if (building) {
    Object.assign(event.locals, anonymous())
    return resolve(event)
  }

  async function getPageState(authUserId: string): Promise<App.SafeSession> {
    const user = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.authUserFk, authUserId),
      with: {
        userSettings: {
          columns: {
            gradingScale: true,
            notifyAscents: true,
            notifyCommunity: true,
            notifyDirected: true,
            notifyGuidebookEdits: true,
            unitSystem: true,
          },
        },
      },
    })

    return {
      ...(await getUserPermissions(db, authUserId)),
      user,
    }
  }

  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      // SvelteKit's cookies API requires `path` to be set explicitly; '/' matches previous/standard behavior.
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, options, value }) => {
          event.cookies.set(name, value, { ...options, path: '/', secure: process.env.NODE_ENV !== 'development' })
        })
      },
    },
  })

  /**
   * The verified claims behind this request's cookies.
   *
   * `getSession()` first, deliberately. It is the only call that refreshes a token inside its
   * expiry margin and writes the refreshed cookie back through `setAll` above, so verifying the raw
   * cookie ahead of it would refuse every session that was merely due for a refresh, and the
   * refresh would never fire. What it returns is an unsigned cookie read, so nothing out of it is
   * trusted until `verifyAccessToken` has been past it.
   *
   * Identity is `claims.sub` and never `session.user.id`. Those are two independently
   * client-controlled values, and only one of them is covered by a signature.
   */
  event.locals.safeGetSession = async () => {
    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession()

    let verified = await verifyAccessToken(session?.access_token)

    // One retry, and only for expiry. `getSession()` decides whether to refresh from the cookie's
    // `expires_at` field, never from the token's `exp`; when those disagree the session is
    // refreshable and the token is not, and bouncing the user to /auth with a live refresh token in
    // their cookie is the "everyone got logged out" failure this change would otherwise cause. Any
    // other rejection fails closed immediately: a bad signature is never worth retrying.
    if (!verified.ok && verified.reason === 'expired') {
      const { data } = await event.locals.supabase.auth.refreshSession()
      verified = await verifyAccessToken(data.session?.access_token)
    }

    if (!verified.ok) {
      return anonymous()
    }

    try {
      return { ...(await getPageState(verified.claims.sub)), claims: verified.claims }
    } catch {
      // A database failure, not an authentication failure. `user` stays undefined, so every remote
      // handler 401s in `authed.server.ts`, which is what happened here before too.
      return { ...anonymous(), claims: verified.claims }
    }
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      // Supabase libraries use `content-range` and `x-supabase-api-version`; pass them through.
      return name === 'content-range' || name === 'x-supabase-api-version'
    },
  })
}

/**
 * The single paths this hook redirects to or matches exactly. Typed as {@link Pathname}, the union
 * SvelteKit generates from the route tree, so renaming or moving one of these routes fails the
 * build here instead of turning into a redirect loop at runtime. `resolve()` would do the same job,
 * but it collides with the `resolve` every `Handle` is handed, and nothing here prefixes `base`.
 */
const HOME_PATH: Pathname = '/'
const AUTH_PATH: Pathname = '/auth'

/** Opened while already signed in, so the "authenticated users leave /auth" rule cannot have them:
 *  a settings-initiated email change confirms through /auth/confirm, and bouncing these would drop
 *  the token unprocessed. /auth/error is where an expired one of those lands. */
const EMAILED_LINK_PATHS: Pathname[] = ['/auth/confirm', '/auth/error', '/auth/reset-password']

/** Prefixes rather than pathnames, deliberately: each stands for a whole subtree (`/f/abc`,
 *  `/image/a/b/c`, every `/api` endpoint), which is not a thing `Pathname` can express. '/invite'
 *  is public because the emailed link is opened by somebody who may have no account yet, and
 *  bouncing them to /auth would drop the token. '/help' answers questions somebody asks before
 *  they have an account, and '/robots.txt' and '/sitemap.xml' are read by crawlers that never
 *  have one: bouncing any of them to /auth is the same bug in three places. */
const PUBLIC_PREFIXES = [
  '/legal',
  AUTH_PATH,
  '/f/',
  '/help',
  '/image/',
  '/api/',
  '/invite',
  '/offline',
  '/robots.txt',
  '/sitemap.xml',
]

/**
 * The zero-cache callbacks, which authenticate off their own Authorization header.
 *
 * Read by `rateLimit` as well as by the guard below. One prefix rather than a copy per hook: both
 * are consequences of the same fact, that this surface is called by a server and not by a browser,
 * so a move that invalidates one invalidates the other.
 */
export const ZERO_API_PREFIX = '/api/zero/'

export const authGuard: Handle = async ({ event, resolve }) => {
  // Nothing to guard while prerendering, and `safeGetSession` is not there to call: the hook above
  // returns before installing it.
  if (building) {
    return resolve(event)
  }

  // zero-cache forwards the browser's cookie alongside the Bearer (ZERO_GET_QUERIES_FORWARD_COOKIES
  // is set in every compose file), and `handle` runs for /api too. The get-queries handler verifies
  // its own Authorization header, so loading a session here would be a second, pointless
  // verification, and worse: `getSession()` can rotate the refresh token onto a response the
  // browser never sees.
  if (event.url.pathname.startsWith(ZERO_API_PREFIX)) {
    Object.assign(event.locals, anonymous())
    return resolve(event)
  }

  const { claims, user, userPermissions, userRegions, userRole } = await event.locals.safeGetSession()

  event.locals.claims = claims
  event.locals.user = user
  event.locals.userPermissions = userPermissions
  event.locals.userRegions = userRegions
  event.locals.userRole = userRole

  if (
    event.locals.claims == null &&
    event.url.pathname !== HOME_PATH &&
    !PUBLIC_PREFIXES.some((path) => event.url.pathname.startsWith(path))
  ) {
    redirect(303, AUTH_PATH)
  }

  // Redirect authenticated users away from auth pages, minus the emailed-link ones.
  if (
    event.locals.claims != null &&
    event.url.pathname.startsWith(AUTH_PATH) &&
    !EMAILED_LINK_PATHS.some((path) => event.url.pathname.startsWith(path))
  ) {
    redirect(303, HOME_PATH)
  }

  // A signed-in user with no regions whose address has a live invitation goes straight to it.
  // '/explore' as well as '/', because `signIn` redirects to /explore - without it this could
  // never fire after a fresh sign in. That plus the email-keyed lookup is what makes "sign up,
  // then immediately join" work without threading the token through signup and its confirmation
  // mail. Same validity predicate as everywhere else: pending AND not expired.
  const email = event.locals.claims?.email
  if (email != null && event.locals.userRegions.length === 0) {
    const path = event.url.pathname

    // The create screen on top of the shared list so an invitation still wins once somebody is
    // standing on it. The (app) group is `ssr = false` with no server loads, so an in-app
    // navigation never reaches this hook at all and the layout has to do its own bounce - and the
    // client cannot see invitations. Landing here is what gives this the chance to correct that.
    if (REGIONLESS_PATHS.some((regionless) => regionless === path) || path === REGION_CREATE_PATH) {
      // The lookup is what may fail (a dropped connection on a hook that runs for every request);
      // the redirect itself throws by design, so it stays OUTSIDE the catch - swallowing it left
      // the invitee on an empty page with the invitation unmentioned.
      let token: string | undefined
      try {
        token = (await findLiveInvitationByEmail(email))?.token
      } catch (error) {
        console.log(error)
      }

      if (token != null) {
        redirect(303, acceptPath(token))
      }

      // Nothing to accept, so the only thing left to offer is starting a region. Deliberately not
      // every path: /settings has to stay reachable, because "I signed up with the wrong address"
      // is the likeliest reason somebody with no invitation is standing here.
      if (path !== REGION_CREATE_PATH) {
        redirect(303, REGION_CREATE_PATH)
      }
    }
  }

  return resolve(event)
}
