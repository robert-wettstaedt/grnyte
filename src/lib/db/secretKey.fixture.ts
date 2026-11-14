/** Shared by the tests of the clients built on `secretKeyFetch`: the two key shapes, an env loader, a fetch spy. */
import { vi } from 'vitest'

export const SECRET = 'sb_secret_test'
export const LEGACY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.legacy'

/** Stubs the base fetch and returns the headers of every request that reached it. */
export function spyBaseFetch(): Headers[] {
  const seen: Headers[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    seen.push(new Headers(init?.headers))
    return Response.json({})
  })
  return seen
}

/** Re-imports a module with `SUPABASE_SECRET_KEY` set to `key`. */
export async function withSecretKey<T>(key: string, load: () => Promise<T>): Promise<T> {
  vi.resetModules()
  vi.doMock('$env/static/private', async (original) => ({ ...(await original()), SUPABASE_SECRET_KEY: key }))
  vi.doMock('$env/static/public', async (original) => ({
    ...(await original()),
    PUBLIC_SUPABASE_URL: 'http://supabase.test',
  }))
  return load()
}
