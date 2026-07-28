import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { acceptPath } from '$lib/entities/region/dto'
import { findLiveInvitationByEmail } from '$lib/entities/region/invite.server'
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
    settings: member.region.settings ?? undefined,
  }))

  return {
    session: undefined,
    user: undefined,
    userPermissions,
    userRegions: userRegionsResult,
    userRole: userRole?.role,
  }
}

export const supabase: Handle = async ({ event, resolve }) => {
  async function getPageState(authUserId: string): Promise<App.SafeSession> {
    const user = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.authUserFk, authUserId),
      with: {
        userSettings: {
          columns: {
            gradingScale: true,
            notifyModerations: true,
            notifyNewAscents: true,
            notifyNewUsers: true,
            unitSystem: true,
          },
        },
      },
    })

    return {
      ...(await getUserPermissions(db, authUserId)),
      session: undefined,
      user,
    }
  }

  /**
   * Creates a Supabase client specific to this server request.
   *
   * The Supabase client gets the Auth token from the request cookies.
   */
  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      /**
       * SvelteKit's cookies API requires `path` to be explicitly set in
       * the cookie options. Setting `path` to `/` replicates previous/
       * standard behavior.
       */
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, options, value }) => {
          event.cookies.set(name, value, { ...options, path: '/', secure: process.env.NODE_ENV !== 'development' })
        })
      },
    },
  })

  /**
   * Unlike `supabase.auth.getSession()`, which returns the session _without_
   * validating the JWT, this function also calls `getUser()` to validate the
   * JWT before returning the session.
   */
  event.locals.safeGetSession = async () => {
    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession()

    if (!session) {
      return {
        session: undefined,
        user: undefined,
        userPermissions: undefined,
        userRegions: [],
        userRole: undefined,
      }
    }

    try {
      const pageState = await getPageState(session.user.id)

      return { ...pageState, session }
    } catch {
      return {
        session,
        user: undefined,
        userPermissions: undefined,
        userRegions: [],
        userRole: undefined,
      }
    }
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      /**
       * Supabase libraries use the `content-range` and `x-supabase-api-version`
       * headers, so we need to tell SvelteKit to pass it through.
       */
      return name === 'content-range' || name === 'x-supabase-api-version'
    },
  })
}

export const authGuard: Handle = async ({ event, resolve }) => {
  const { session, user, userPermissions, userRegions, userRole } = await event.locals.safeGetSession()

  event.locals.session = session
  event.locals.user = user
  event.locals.userPermissions = userPermissions
  event.locals.userRegions = userRegions
  event.locals.userRole = userRole

  if (
    event.locals.session == null &&
    event.url.pathname !== '/' &&
    // '/invite' is public: the emailed link is opened by someone who may have no account yet, and
    // bouncing them to /auth would drop the token.
    !['/legal', '/auth', '/f/', '/image/', '/api/', '/invite', '/offline'].some((path) =>
      event.url.pathname.startsWith(path),
    )
  ) {
    redirect(303, '/auth')
  }

  // Redirect authenticated users away from auth pages. The emailed-link routes are exempt:
  // reset-password and confirm are both opened while already signed in (a settings-initiated
  // email change confirms through /auth/confirm), so bouncing them would drop the token
  // unprocessed, and /auth/error is where an expired one of those lands.
  const emailedLinkRoutes = ['/auth/confirm', '/auth/error', '/auth/reset-password']

  if (
    event.locals.session != null &&
    event.url.pathname.startsWith('/auth') &&
    !emailedLinkRoutes.some((path) => event.url.pathname.startsWith(path))
  ) {
    redirect(303, '/')
  }

  // A signed-in user with no regions whose address has a live invitation goes straight to it.
  // '/explore' as well as '/', because `signIn` redirects to /explore - without it this could
  // never fire after a fresh sign in. That plus the email-keyed lookup is what makes "sign up,
  // then immediately join" work without threading the token through signup and its confirmation
  // mail. Same validity predicate as everywhere else: pending AND not expired.
  const email = event.locals.session?.user.email
  if (email != null && event.locals.userRegions.length === 0) {
    if (event.url.pathname === '/' || event.url.pathname === '/explore') {
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
    }
  }

  return resolve(event)
}
