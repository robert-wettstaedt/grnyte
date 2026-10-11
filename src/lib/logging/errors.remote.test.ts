// @vitest-environment node
/** The open error endpoint writes on the privileged handle, so its payload has to be bounded. */
import { reachable, sql } from '$lib/db/testDb'
import { asAnonymousRequest, statusOf } from '$lib/remote/testHarness'
import { afterAll, describe, expect, it } from 'vitest'
import { logClientError } from './errors.remote'

const TAG = '__log_client_error_test__'

afterAll(async () => {
  if (reachable) await sql`delete from public.client_error_logs where error = ${TAG}`
  await sql.end()
})

const log = (navigator: unknown) =>
  asAnonymousRequest({}, () => logClientError({ error: TAG, navigator: navigator as never }))

const count = async () => (await sql`select 1 from public.client_error_logs where error = ${TAG}`).length

describe.skipIf(!reachable)('logClientError', () => {
  it('stores a small navigator blob', async () => {
    await log({ userAgent: 'x' })
    expect(await count()).toBe(1)
  })

  it('refuses an oversized navigator blob and writes nothing', async () => {
    const before = await count()
    expect(await statusOf(() => log({ blob: 'x'.repeat(5000) }))).toBe(400)
    expect(await count()).toBe(before)
  })

  it('measures the cap in bytes, not UTF-16 units', async () => {
    const before = await count()
    // 1,500 code points of 4 UTF-8 bytes each: well under 4,096 units, well over 4,096 bytes.
    expect(await statusOf(() => log({ blob: '🧗'.repeat(1500) }))).toBe(400)
    expect(await count()).toBe(before)
  })
})
