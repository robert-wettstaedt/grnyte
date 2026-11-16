/** GoTrue test: "Sign out other devices" on the branch's GoTrue. Skips visibly without the stack (always in CI). */
import { supabaseAdmin } from '$lib/db/supabaseAdmin.server'
import { withLocals } from '$lib/remote/testHarness'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { createAccount, codeDevice as device, gotrueReachable } from './gotrue.fixture'
import { signOutOthers } from './session.remote'

const created: string[] = []
afterAll(async () => {
  for (const id of created) await supabaseAdmin().auth.admin.deleteUser(id)
})

const works = async (client: SupabaseClient) => (await client.auth.getUser()).error == null

describe.skipIf(!gotrueReachable)('signOutOthers on GoTrue', () => {
  it('ends the other device and keeps this one, without a code', async () => {
    const email = `devices${crypto.randomUUID().slice(0, 8)}@example.test`
    created.push(await createAccount(email))
    const phone = await device(email)
    const laptop = await device(email)

    await withLocals(phone.locals, () => signOutOthers())

    expect(await works(phone.client)).toBe(true)
    expect(await works(laptop.client)).toBe(false)
  })
})
