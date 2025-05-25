import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { db } from '$lib/db/db.server'
import { createServerClient } from '@supabase/ssr'
import { type Handle, redirect } from '@sveltejs/kit'

export const supabase: Handle = async ({ event, resolve }) => {
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
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, secure: process.env.NODE_ENV !== 'development', path: '/' })
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
        userRole: undefined,
        userRegions: [],
      }
    }

    const user = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.authUserFk, session.user.id),
      with: {
        userSettings: {
          columns: {
            gradingScale: true,
            notifyModerations: true,
            notifyNewAscents: true,
            notifyNewUsers: true,
          },
        },
      },
    })

    const userRole = await db.query.userRoles.findFirst({
      where: (table, { eq }) => eq(table.authUserFk, session.user.id),
    })

    const userRegions = await db.query.regionMembers.findMany({
      where: (table, { and, eq, isNotNull }) => and(eq(table.authUserFk, session.user.id), isNotNull(table.isActive)),
      columns: {
        regionFk: true,
        role: true,
      },
      with: {
        region: {
          columns: {
            name: true,
            settings: true,
          },
        },
      },
    })

    const permissions = await db.query.rolePermissions.findMany()

    const userPermissions =
      userRole == null
        ? undefined
        : permissions.filter((permission) => permission.role === userRole.role).map(({ permission }) => permission)

    const userRegionsResult = userRegions.map((member) => ({
      ...member,
      permissions: permissions.filter(({ role }) => role === member.role).map(({ permission }) => permission),
      name: member.region.name,
      settings: member.region.settings,
    }))

    return {
      session,
      user,
      userPermissions,
      userRegions: userRegionsResult,
      userRole: userRole?.role,
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
  const { session, user, userPermissions, userRole, userRegions } = await event.locals.safeGetSession()

  event.locals.session = session
  event.locals.user = user
  event.locals.userPermissions = userPermissions
  event.locals.userRegions = userRegions
  event.locals.userRole = userRole

  if (
    event.locals.session == null &&
    event.url.pathname !== '/' &&
    !event.url.pathname.startsWith('/auth') &&
    !event.url.pathname.startsWith('/f/') &&
    !event.url.pathname.startsWith('/api/notifications')
  ) {
    redirect(303, '/auth')
  }

  if (event.locals.session != null && event.url.pathname.startsWith('/auth')) {
    redirect(303, '/')
  }

  return resolve(event)
}
