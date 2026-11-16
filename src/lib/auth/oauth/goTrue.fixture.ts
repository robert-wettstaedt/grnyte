/** GoTrue faked at fetch, and the helpers the OAuth tracer and the app handoff tests share. */
import { verifyAccessToken } from '$lib/auth/verify.server'
import { sql } from '$lib/db/testDb'
import { createServerClient } from '@supabase/ssr'
import { SignJWT } from 'jose'
import { vi } from 'vitest'
import type { cookieJar } from './cookieJar.fixture'
import { SUPABASE } from './testEnv.fixture'

export { ORIGIN, SECRET, SUPABASE } from './testEnv.fixture'
/** Each test file's hoisted `SUPABASE_JWT_SECRET` must be this. */
export const JWT_SECRET = 'tracer-jwt-secret-at-least-32-characters'

export interface Account {
  app_metadata: Record<string, unknown>
  id: string
}

export interface GoTrueCall {
  body: Record<string, unknown>
  headers: Headers
  url: URL
}

/** A GoTrue access token, signed as the local stack signs them. */
export const accessToken = (user: Account, sessionId: string = crypto.randomUUID()) =>
  new SignJWT({ app_metadata: user.app_metadata, role: 'authenticated', session_id: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setSubject(user.id)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET))

/**
 * Records every GoTrue call into `calls` and answers each as `account()`; a refresh answers it
 * without the contested flag (through `setAccount`). `refuseUser` refuses the lookup `setSession` makes;
 * `refuseLink` answers the ID-token link with that status.
 */
export function fakeGoTrue(
  calls: GoTrueCall[],
  account: () => Account,
  setAccount: (next: Account) => void,
  refuseUser = () => false,
  refuseLink = (): number | undefined => undefined,
) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.origin !== SUPABASE) throw new Error(`unexpected fetch ${url.href}`)
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}))
    calls.push({ body, headers: request.headers, url })
    if (url.searchParams.get('grant_type') === 'refresh_token') setAccount({ ...account(), app_metadata: {} })
    const user = { aud: 'authenticated', email: 'new@example.test', role: 'authenticated', ...account() }
    const refused = refusal(url, body, refuseUser(), refuseLink())
    if (refused != null) return refused
    if (url.pathname === '/auth/v1/user' || url.pathname.startsWith('/auth/v1/admin/')) return Response.json(user)
    return Response.json({
      access_token: await accessToken(account()),
      expires_in: 3600,
      refresh_token: 'refresh-1',
      token_type: 'bearer',
      user,
    })
  })
}

/** Where a handler redirected; Kit's redirect is thrown. */
export async function locationOf(run: () => unknown): Promise<string> {
  try {
    await run()
  } catch (thrown) {
    const { location, status } = (thrown ?? {}) as { location?: string; status?: number }
    if (status === 303 && location != null) return location
    throw thrown
  }
  throw new Error('no redirect')
}

/** The user lookup or the ID-token link answering an error instead. */
function refusal(url: URL, body: Record<string, unknown>, refuseUser: boolean, refuseLink: number | undefined) {
  if (body.link_identity === true && refuseLink != null)
    return Response.json({ code: 'unexpected_failure', msg: 'down' }, { status: refuseLink })
  if (url.pathname === '/auth/v1/user' && refuseUser) return Response.json({ code: 'bad_jwt' }, { status: 401 })
}

/** A cookie client over `jar`, as the hook builds one. */
export const cookieClient = (jar: ReturnType<typeof cookieJar>) =>
  createServerClient(SUPABASE, 'sb_publishable_test', {
    cookies: {
      getAll: () => jar.cookies.getAll(),
      setAll: (cookies) =>
        cookies.forEach(({ name, options, value }) => jar.cookies.set(name, value, { ...options, path: '/' })),
    },
  })

/** A confirmed account, its id pushed to `made`; `session()` opens a fresh live session as the hook verifies it. */
export async function confirmedAccount(made: string[], email: string) {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), ${email}, now()) returning id`
  made.push(id)
  const session = async () => {
    const [row] = await sql<{ id: string }[]>`insert into auth.sessions (user_id) values (${id}) returning id`
    const verified = await verifyAccessToken(await accessToken({ app_metadata: {}, id }, row.id))
    if (!verified.ok) throw new Error(`token did not verify: ${verified.reason}`)
    return verified.token
  }
  return { email, id, session }
}
