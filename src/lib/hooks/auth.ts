import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { db } from '$lib/db/db.server'
import { getPageState } from '$lib/helper.server'
import { authLogger } from '$lib/logging'
import { createServerClient } from '@supabase/ssr'
import { type Handle, redirect } from '@sveltejs/kit'

export const supabase: Handle = async ({ event, resolve }) => {
  const start = Date.now()

  authLogger.debug('Supabase client initialization started', {
    pathname: event.url.pathname,
    method: event.request.method,
  })

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
        authLogger.debug('Setting authentication cookies', {
          cookieCount: cookiesToSet.length,
          cookieNames: cookiesToSet.map((c) => c.name),
        })
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
    const sessionStart = Date.now()

    authLogger.debug('Starting safe session retrieval')

    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession()

    if (!session) {
      authLogger.debug('No session found', {
        sessionRetrievalTime: Date.now() - sessionStart,
      })
      return {
        session: undefined,
        user: undefined,
        userPermissions: undefined,
        userRole: undefined,
        userRegions: [],
      }
    }

    authLogger.debug('Session found, loading user data', {
      sessionUserId: session.user.id,
      sessionEmail: session.user.email,
    })

    try {
      const pageState = await getPageState(db, session.user.id)

      return { ...pageState, session }
    } catch (error) {
      const totalSessionTime = Date.now() - sessionStart

      authLogger.error('Failed to load user session data', {
        sessionUserId: session.user.id,
        sessionEmail: session.user.email,
        totalSessionTime,
        error,
      })

      // Return minimal session data on error
      return {
        session,
        user: undefined,
        userPermissions: undefined,
        userRegions: [],
        userRole: undefined,
      }
    }
  }

  const duration = Date.now() - start

  authLogger.debug('Supabase client initialization completed', {
    pathname: event.url.pathname,
    duration,
  })

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
  const start = Date.now()

  authLogger.debug('Auth guard started', {
    pathname: event.url.pathname,
    method: event.request.method,
  })

  const { session, user, userPermissions, userRole, userRegions } = await event.locals.safeGetSession()

  event.locals.session = session
  event.locals.user = user
  event.locals.userPermissions = userPermissions
  event.locals.userRegions = userRegions
  event.locals.userRole = userRole

  authLogger.debug('Session data loaded', {
    hasSession: !!session,
    hasUser: !!user,
    userId: user?.id,
    userRole,
    userRegionsCount: userRegions.length,
    userPermissionsCount: userPermissions?.length ?? 0,
  })

  // Check if user needs authentication
  if (
    event.locals.session == null &&
    event.url.pathname !== '/' &&
    !['/legal', '/auth', '/f/', '/api/notifications', '/api/zero'].some((path) => event.url.pathname.startsWith(path))
  ) {
    authLogger.info('Redirecting unauthenticated user to auth', {
      originalPath: event.url.pathname,
      method: event.request.method,
    })
    redirect(303, '/auth')
  }

  // Redirect authenticated users away from auth pages
  if (event.locals.session != null && event.url.pathname.startsWith('/auth')) {
    authLogger.info('Redirecting authenticated user away from auth page', {
      userId: user?.id,
      userEmail: session?.user?.email,
      attemptedPath: event.url.pathname,
    })
    redirect(303, '/')
  }

  // Handle users without regions (potential invites)
  const email = event.locals.session?.user.email
  if (email != null && event.locals.userRegions.length === 0) {
    authLogger.debug('User has no regions, checking for invitations', {
      userId: user?.id,
      userEmail: email,
      pathname: event.url.pathname,
    })

    if (event.url.pathname === '/') {
      try {
        const invitation = await db.query.regionInvitations.findFirst({
          where: (table, { and, eq, gt }) =>
            and(eq(table.email, email), eq(table.status, 'pending'), gt(table.expiresAt, new Date())),
        })

        if (invitation != null) {
          authLogger.info('Redirecting user to accept pending invitation', {
            userId: user?.id,
            userEmail: email,
            invitationToken: invitation.token,
            invitationExpires: invitation.expiresAt,
          })
          redirect(303, '/invite/accept?token=' + invitation.token)
        } else {
          authLogger.warn('User has no regions and no pending invitations', {
            userId: user?.id,
            userEmail: email,
          })
        }
      } catch (error) {
        authLogger.error('Failed to check for region invitations', {
          userId: user?.id,
          userEmail: email,
          error,
        })
      }
    }
  }

  const duration = Date.now() - start

  authLogger.debug('Auth guard completed', {
    pathname: event.url.pathname,
    method: event.request.method,
    hasSession: !!session,
    userId: user?.id,
    userRegionsCount: userRegions.length,
    duration,
  })

  return resolve(event)
}
