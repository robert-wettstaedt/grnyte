/** grnyte's own count of guessed GoTrue codes per address: 5 tries in a fixed 10-minute window. */
import { reachable, sql } from '$lib/db/testDb'
import { afterAll, describe, expect, it } from 'vitest'
import { clearCodeTries, takeCodeTry } from './codeAttempts.server'

const run = crypto.randomUUID().slice(0, 8)
const subjects: string[] = []
const address = () => {
  const email = `tries-${crypto.randomUUID().slice(0, 8)}-${run}@example.org`
  subjects.push(email)
  return email
}

const windowOf = async (email: string) => {
  const [row] = await sql<{ started: Date; tries: number }[]>`
    select window_started_at as started, tries from public.auth_code_attempts
    where subject = ${email} and kind = 'signup'`
  return row
}

afterAll(async () => {
  if (reachable) await sql`delete from public.auth_code_attempts where subject = any(${subjects})`
})

describe.skipIf(!reachable)('takeCodeTry', () => {
  it('answers false on the 6th try for one address and kind', async () => {
    const email = address()
    const answers = []
    for (let i = 0; i < 6; i++) answers.push(await takeCodeTry(email, ['signup']))

    expect(answers).toEqual([true, true, true, true, true, false])
  })

  it('starts over after clearCodeTries', async () => {
    const email = address()
    for (let i = 0; i < 6; i++) await takeCodeTry(email, ['signup'])
    await clearCodeTries(email, ['signup'])

    expect(await takeCodeTry(email, ['signup'])).toBe(true)
  })

  it('lets at most 5 of ten concurrent tries through', async () => {
    const email = address()
    const answers = await Promise.all(Array.from({ length: 10 }, () => takeCodeTry(email, ['signup'])))

    expect(answers.filter(Boolean)).toHaveLength(5)
  })

  it('does not move the window on a refused try', async () => {
    const email = address()
    for (let i = 0; i < 5; i++) await takeCodeTry(email, ['signup'])
    const before = await windowOf(email)
    await takeCodeTry(email, ['signup'])

    expect((await windowOf(email)).started).toEqual(before.started)
  })

  it('counts from 1 again once the 10-minute window passed', async () => {
    const email = address()
    for (let i = 0; i < 6; i++) await takeCodeTry(email, ['signup'])
    await sql`update public.auth_code_attempts set window_started_at = now() - interval '10 minutes 1 second'
      where subject = ${email}`

    expect(await takeCodeTry(email, ['signup'])).toBe(true)
    expect((await windowOf(email)).tries).toBe(1)
  })
})
