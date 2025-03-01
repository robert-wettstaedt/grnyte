import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { db } from '$lib/db/db.server'
import * as schema from '$lib/db/schema'
import { createServerClient } from '@supabase/ssr'
import { type Handle, redirect } from '@sveltejs/kit'
import { eq } from 'drizzle-orm'

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
      return { session: undefined, user: undefined, userPermissions: undefined, userRole: undefined }
    }

    const user = await db.query.users.findFirst({
      where: eq(schema.users.authUserFk, session.user.id),
      with: {
        userSettings: {
          columns: {
            gradingScale: true,
          },
        },
      },
    })

    const userRole = await db.query.userRoles.findFirst({
      where: eq(schema.userRoles.authUserFk, session.user.id),
    })

    const userPermissions =
      userRole == null
        ? undefined
        : await db.query.rolePermissions.findMany({ where: eq(schema.rolePermissions.role, userRole.role) })

    return {
      session,
      user,
      userPermissions: userPermissions?.map(({ permission }) => permission),
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
  const { session, user, userPermissions, userRole } = await event.locals.safeGetSession()

  event.locals.session = session
  event.locals.user = user
  event.locals.userPermissions = userPermissions
  event.locals.userRole = userRole

  if (
    event.locals.session == null &&
    event.url.pathname !== '/' &&
    !event.url.pathname.startsWith('/auth') &&
    !event.url.pathname.startsWith('/f/')
  ) {
    redirect(303, '/auth')
  }

  if (event.locals.session != null && event.url.pathname.startsWith('/auth')) {
    redirect(303, '/')
  }

  return resolve(event)
}
