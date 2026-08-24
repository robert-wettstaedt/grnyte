/**
 * Calls a remote function the way a request does, so a test can drive the real handler.
 *
 * `authedCommand` and friends read `getRequestEvent().locals` (`authed.server.ts`), which only
 * resolves inside SvelteKit's request store. Kit exposes `with_request_store` for exactly this, and
 * it is backed by `AsyncLocalStorage`, so the store survives the awaits inside a handler.
 *
 * One fake, and it is a real token. The harness signs an HS256 token with the dev secret and runs
 * it through `verifyAccessToken`, so what reaches `createRlsClient` came out of the same function
 * production uses. This file used to mint an `alg: 'none'` token, which worked precisely because
 * nothing checked one, and its own comment documented that as the mechanism.
 *
 * Everything else is real: the permissions come from `getUserPermissions` against the actual
 * database, the handler runs in a real RLS transaction, and the statements it issues are the
 * statements production issues.
 *
 * NOTE: this file is imported by `*.remote.test.ts`, which run in the `server` vitest project
 * (`vite.config.ts`). They cannot run in the jsdom project: `$app/paths` resolves to its client
 * build under the `browser` condition and touches `window` at import time.
 */
import { SUPABASE_JWT_SECRET } from '$env/static/private'
import { verifyAccessToken } from '$lib/auth/verify.server'
import { db } from '$lib/db/db.server'
import { getUserPermissions } from '$lib/hooks/auth.server'
import { with_request_store } from '@sveltejs/kit/internal/server'
import { eq } from 'drizzle-orm'
import { authUsers } from 'drizzle-orm/supabase'
import { SignJWT } from 'jose'

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
  const [permissions, user, [authUser]] = await Promise.all([
    getUserPermissions(db, authUserId),
    db.query.users.findFirst({
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
    }),
    // The address, read live from auth.users for the same reason the permissions are: it is what
    // the invitation handlers and the password re-check gate on, and those were untestable while
    // the harness had none.
    db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, authUserId)).limit(1),
  ])

  const verified = await verifyAccessToken(await signAccessToken(authUserId, authUser?.email ?? undefined))

  if (!verified.ok) {
    // A worktree whose .env carries a different SUPABASE_JWT_SECRET than the one the verifier
    // loaded. Loud here, rather than an unexplained 401 in every test that uses the harness.
    throw new Error(`testHarness could not verify its own token (${verified.reason})`)
  }

  const session = { ...permissions, claims: verified.claims, user }
  const locals = {
    ...session,
    safeGetSession: async () => session,
    // `authedRls` hands this to the storage handlers. A Proxy rather than `{}` so the first test
    // that drives one fails by name instead of on a null dereference: `locals` goes into
    // `with_request_store` as `never`, so TypeScript will not catch it.
    supabase: new Proxy(
      {},
      {
        get: (_, prop) => {
          throw new Error(`testHarness does not stub supabase.${String(prop)}`)
        },
      },
    ),
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

/**
 * A genuinely signed access token for `authUserId`, shaped like the one GoTrue issues.
 *
 * No `iss`: this stack's GoTrue sets no `GOTRUE_JWT_ISSUER`, so real local tokens carry none and a
 * fabricated one would diverge from production the moment `SUPABASE_JWT_ISSUER` is set anywhere.
 */
function signAccessToken(authUserId: string, email: string | undefined): Promise<string> {
  return new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setAudience('authenticated')
    .setSubject(authUserId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SUPABASE_JWT_SECRET))
}
