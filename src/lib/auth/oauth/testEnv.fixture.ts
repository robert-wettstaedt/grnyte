/** What the OAuth tests' `vi.mock` factories hand out. Imports nothing, so a factory may import it. */
import type * as OpenIdClient from 'openid-client'

export const ORIGIN = 'https://grnyte.example'
export const SUPABASE = 'http://supabase.test'
export const SECRET = 'sb_secret_test'

export const PUBLIC_ENV = {
  PUBLIC_ORIGIN: ORIGIN,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  PUBLIC_SUPABASE_URL: SUPABASE,
}

/** openid-client whose `randomNonce` answers `nonce.fixed` while a test sets it. */
export const withFixedNonce = (library: typeof OpenIdClient, nonce: { fixed?: string }) => ({
  ...library,
  randomNonce: () => nonce.fixed ?? library.randomNonce(),
})
