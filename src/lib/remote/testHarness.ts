/**
 * Calls a remote function the way a request does, so a test can drive the real handler.
 *
 * `authedCommand` and friends read `getRequestEvent().locals` (`authed.server.ts`), which only
 * resolves inside SvelteKit's request store. Kit exposes `with_request_store` for exactly this, and
 * it is backed by `AsyncLocalStorage`, so the store survives the awaits inside a handler.
 *
 * Two fakes, both as small as they can be:
 *
 * - The Supabase client, because `createDrizzleSupabaseClient` calls one method on it,
 *   `auth.getSession()`, and then throws the session away except for its access token.
 * - The access token, because `decodeToken` is `jwtDecode`, which base64-decodes the payload and
 *   never verifies a signature. An unsigned token with the right `sub` is therefore indistinguishable
 *   from a real one to everything downstream, and the claims it carries are what `auth.uid()` reads
 *   inside RLS.
 *
 * Everything else is real: the permissions come from `getUserPermissions` against the actual
 * database, the handler runs in a real RLS transaction, and the statements it issues are the
 * statements production issues.
 *
 * NOTE: this file is imported by `*.remote.test.ts`, which run in the `server` vitest project
 * (`vite.config.ts`). They cannot run in the jsdom project: `$app/paths` resolves to its client
 * build under the `browser` condition and touches `window` at import time.
 */
import { db } from '$lib/db/db.server'
import { getUserPermissions } from '$lib/hooks/auth.server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { with_request_store } from '@sveltejs/kit/internal/server'

/**
 * Runs `fn` as the account behind `authUserId`, with the locals a real request would carry.
 *
 * Permissions are read live rather than passed in: a test that hand-builds `userRegions` proves the
 * handler agrees with the test's idea of the memberships, not with the database's.
 */
export async function asRequest<T>(authUserId: string, fn: () => Promise<T> | T): Promise<T> {
  // `getUserPermissions` deliberately returns `user: undefined`; the `supabase` handle's own
  // `getPageState` is what loads the row, with `userSettings` attached. Mirror it, or every handler
  // 401s on `user == null` in `authed.server.ts`.
  const [permissions, user] = await Promise.all([
    getUserPermissions(db, authUserId),
    db.query.users.findFirst({
      where: (table, { eq }) => eq(table.authUserFk, authUserId),
      with: {
        userSettings: {
          columns: {
            gradingScale: true,
            notifyAscents: true,
            notifyCommunity: true,
            notifyCragEdits: true,
            notifyDirected: true,
            unitSystem: true,
          },
        },
      },
    }),
  ])

  const session = { ...permissions, session: undefined, user }
  const locals = {
    ...session,
    safeGetSession: async () => session,
    supabase: fakeSupabase(fakeJwt({ role: 'authenticated', sub: authUserId })),
  }

  // `state.remote.data` is the per-request memo Kit's remote wrappers read through `get_cache`.
  // A real request always has one; without it the first `form`/`query` call dereferences undefined.
  //
  // `transport` is what a `query` needs on top of that: calling one runs `stringify_remote_arg`,
  // which does `Object.entries(state.transport)` to build its devalue reducers and throws on
  // undefined before the handler is ever reached. Empty because this app registers no custom
  // transport types. A `form` never touches it, which is why the harness got this far without one.
  //
  // `handleValidationError` is how a schema rejection is reported: `create_validator` hands it the
  // issues and throws its return value as a 400. A real request gets it from the server hooks;
  // without it a test that submits input the schema refuses dies on "handleValidationError is not a
  // function" instead of the 400 production returns.
  const state = {
    handleValidationError: ({ issues }: { issues: unknown }) => ({ issues, message: 'Bad Request' }),
    remote: { data: new Map() },
    transport: {},
  }

  // A `command` goes through Kit's own wrapper (a `form` does not, because `callForm` calls past
  // it), and that wrapper refuses to run from a non-mutative request: `event.request.method` has to
  // be one of POST/PUT/PATCH/DELETE. The fake event carried no `request` at all, so every command
  // test died on `Cannot read properties of undefined (reading 'method')` before reaching the
  // handler.
  const request = new Request('http://localhost/', { method: 'POST' })

  // `url` too: `mailContext()` and anything else building an absolute link reads
  // `getRequestEvent().url.origin`, so without it the first test of `inviteRegionMember` dies on
  // `Cannot read properties of undefined` instead of exercising the gate it was written for.
  const url = new URL('http://localhost/')

  return with_request_store({ event: { locals, request, url }, state } as never, fn) as Promise<T>
}

/**
 * Invokes a `form` remote function with `data`.
 *
 * A `command` is callable directly; a form is not, because the thing the module exports is the
 * object a `<form>` binds to (`{ method, action }`) and the handler hangs off its internal `__`.
 * Kit's own dispatcher calls `__.fn(data, meta, form_data)`, and `meta.validate_only` is the only
 * field the wrapper reads.
 *
 * This is internal Kit API with no compatibility guarantee, which is why it lives behind one helper:
 * a Kit upgrade that moves it breaks this file, not every test that drives a form.
 */
export function callForm<T>(form: unknown, data: Record<string, unknown>): Promise<T> {
  const internal = (form as { __?: { fn?: (...args: unknown[]) => Promise<T> } }).__
  if (typeof internal?.fn !== 'function') {
    throw new Error('not a form remote function, or Kit moved its internals')
  }

  return internal.fn(data, { validate_only: false }, new FormData())
}

/** An unsigned JWT carrying `claims`. `jwtDecode` reads the payload segment and nothing else. */
function fakeJwt(claims: Record<string, unknown>): string {
  const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${segment({ alg: 'none', typ: 'JWT' })}.${segment(claims)}.`
}

/** The one method `createDrizzleSupabaseClient` calls. */
function fakeSupabase(accessToken: string): SupabaseClient {
  return {
    auth: {
      getSession: async () => ({ data: { session: { access_token: accessToken } }, error: null }),
    },
  } as unknown as SupabaseClient
}
