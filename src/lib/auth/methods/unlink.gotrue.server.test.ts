/** Unlink against the branch's local GoTrue: two real sessions; the provider identity seeded by SQL (GoTrue takes no fake-issuer token). */
import { codeDevice, createAccount, gotrueReachable } from '$lib/auth/server/gotrue.fixture'
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { sql } from '$lib/db/testDb'
import { withLocals } from '$lib/remote/testHarness'
import { handleMutate } from '$lib/zero/mutate.server'
import { isHttpError } from '@sveltejs/kit'
import { afterAll, describe, expect, it } from 'vitest'
import { sessionCaller, writeGrant } from '../reauth/reauth.server'
import { signInMethodsQuery, unlinkProvider } from './identities.remote'

const ids: string[] = []
afterAll(async () => {
  for (const id of ids) await supabaseAdmin().auth.admin.deleteUser(id)
})

/** What a request answers: its value, or the message key it was refused with. */
const answer = (run: () => Promise<unknown>) =>
  run().then(
    () => 'ok',
    (cause: { body?: { message?: string } }) => JSON.parse(cause.body?.message ?? '{}').message as string,
  )

/** A synced write's answer for this token: its HTTP refusal status, else 'passed'. */
function pushStatus(accessToken: string) {
  const request = new Request('http://localhost/api/zero/mutate?schema=zero_0&appID=zero', {
    body: JSON.stringify({ clientGroupID: 'g', mutations: [], pushVersion: 1, requestID: 'r', timestamp: Date.now() }),
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    method: 'POST',
  })
  return handleMutate(request).then(
    () => 'passed',
    (thrown: unknown) => (isHttpError(thrown) ? thrown.status : Promise.reject(thrown)),
  )
}

describe.skipIf(!gotrueReachable)('unlinking signs the other devices out', () => {
  it('ends session B after an unlink from session A, and A keeps working', async () => {
    const email = `unlink-${crypto.randomUUID().slice(0, 8)}@example.org`
    const id = await createAccount(email, { password: 'Correct-horse-9-battery' })
    ids.push(id)
    await sql.begin(async (tx) => {
      await tx`select set_config('grnyte.auth_user_created', ${id}, true)`
      // GoTrue scans these timestamps into non-null fields.
      await tx`insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
        values (${id}, 'google', ${`sub-${id}`}, ${tx.json({ email, sub: `sub-${id}` })}, now(), now())`
      // A synced write needs the profile row.
      await tx`insert into public.users (auth_user_fk, username) values (${id}, ${email.split('@')[0]})`
    })
    const a = await codeDevice(email)
    const b = await codeDevice(email)
    expect(await pushStatus(b.locals.verifiedToken.accessToken)).toBe('passed')

    await withLocals(a.locals, async () => {
      await writeGrant(sessionCaller(), 'identity.unlink', 'google', 'email_code')
      expect(await unlinkProvider({ provider: 'google' })).toEqual({ othersSignedOut: true })
    })

    expect(await sql`select 1 from auth.identities where user_id = ${id} and provider = 'google'`).toHaveLength(0)
    expect(await answer(() => withLocals(b.locals, () => signInMethodsQuery()))).toBe('auth_sessionEnded')
    expect(await pushStatus(b.locals.verifiedToken.accessToken)).toBe(401)
    expect(await answer(() => withLocals(a.locals, () => signInMethodsQuery()))).toBe('ok')
    expect(await pushStatus(a.locals.verifiedToken.accessToken)).toBe('passed')
  })
})
