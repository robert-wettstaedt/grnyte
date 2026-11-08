/** `syncHealth` driven as real requests: only an app admin reaches the sidecar, and its verdict comes back as served. */
import { createThrowawayUser, dropThrowawayUser, reachable, seedUsers, sql, type SeedUser } from '$lib/db/testDb'
import { asRequest, statusOf } from '$lib/remote/testHarness'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { syncHealth } from './syncHealth.remote'

const UNHEALTHY = { errorCount: 1, lagBytes: 96, reasons: ['errors'], status: 'unhealthy' }

let appAdmin: SeedUser
let outsider: SeedUser

beforeAll(async () => {
  if (!reachable) return
  appAdmin = (await seedUsers({ appAdmin: 'admin@grnyte.rocks' })).appAdmin
  outsider = await createThrowawayUser('sync-health-outsider')
})

afterAll(async () => {
  if (reachable) await dropThrowawayUser(outsider)
  await sql.end()
})

afterEach(() => vi.unstubAllGlobals())

const stubSidecar = (status: number, body: unknown) => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe.skipIf(!reachable)('syncHealth', () => {
  it('refuses a signed-in non-admin before asking the sidecar', async () => {
    const fetch = stubSidecar(200, UNHEALTHY)
    expect(await statusOf(() => asRequest(outsider.authId, () => syncHealth()))).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("serves an app admin the sidecar's 503 verdict", async () => {
    stubSidecar(503, UNHEALTHY)
    expect(await asRequest(appAdmin.authId, () => syncHealth())).toEqual(UNHEALTHY)
  })

  it('answers unreachable when nginx, not the sidecar, answered', async () => {
    stubSidecar(502, '<html>Bad Gateway</html>')
    expect(await asRequest(appAdmin.authId, () => syncHealth())).toEqual({
      reasons: ['unreachable'],
      status: 'unreachable',
    })
  })

  it('answers unreachable when a 200 carries something other than a verdict', async () => {
    stubSidecar(200, { reasons: 'none', status: 'ok' })
    expect(await asRequest(appAdmin.authId, () => syncHealth())).toEqual({
      reasons: ['unreachable'],
      status: 'unreachable',
    })
  })
})
