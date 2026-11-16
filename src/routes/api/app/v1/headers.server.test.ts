/** Every app endpoint, found by glob: no cookie written and no CORS header, whatever cookies ride along. */
import { appCall } from '$lib/auth/app/appRequest.fixture'
import { reachable, seedUsers, type SeedUser } from '$lib/db/testDb'
import { requestLocals } from '$lib/remote/testHarness'
import type { RequestHandler } from '@sveltejs/kit'
import { beforeAll, describe, expect, it } from 'vitest'

const endpoints = Object.entries(import.meta.glob<Record<string, RequestHandler>>('./**/+server.ts', { eager: true }))
const NEAR_EXPIRY = {
  name: 'sb-127-auth-token',
  value: JSON.stringify({ expires_at: Math.floor(Date.now() / 1000) + 5 }),
}

let user: SeedUser
beforeAll(async () => {
  if (reachable) ({ user } = await seedUsers({ user: 'user@grnyte.rocks' }))
})

describe.skipIf(!reachable)('app endpoint headers', () => {
  it('finds the endpoints and exports no OPTIONS, so Kit answers it with no CORS header', () => {
    expect(endpoints.length).toBeGreaterThan(10)
    expect(endpoints.filter(([, module]) => 'OPTIONS' in module).map(([path]) => path)).toEqual([])
  })

  it('writes no cookie and no CORS header, anonymous or signed in, with near-expiry web cookies attached', async () => {
    const written: string[] = []
    const cookies = {
      delete: (name: string) => void written.push(`delete ${name}`),
      get: (name: string) => (name === NEAR_EXPIRY.name ? NEAR_EXPIRY.value : undefined),
      getAll: () => [NEAR_EXPIRY],
      set: (name: string) => void written.push(`set ${name}`),
    }
    const headers: string[] = []
    for (const [path, module] of endpoints) {
      for (const [method, handler] of Object.entries(module)) {
        for (const locals of [{}, await requestLocals(user.authId, { auth: {} })]) {
          const response = await appCall(handler, path, {
            cookies,
            headers: { cookie: `${NEAR_EXPIRY.name}=${encodeURIComponent(NEAR_EXPIRY.value)}` },
            locals,
            method: method as 'GET' | 'POST',
          }).catch(() => null)
          for (const name of ['set-cookie', 'access-control-allow-origin']) {
            if (response?.headers.has(name)) headers.push(`${path} ${method} ${name}`)
          }
        }
      }
    }
    expect(written).toEqual([])
    expect(headers).toEqual([])
  })
})
