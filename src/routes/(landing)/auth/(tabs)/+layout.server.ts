import { lastMethod } from '$lib/auth/lastMethod.server'
import { configuredProviders } from '$lib/auth/oauth/providers.server'
import type { LayoutServerLoad } from './$types'

// Also makes a client-side navigation into signin/signup ask the server at all: without a server
// load Kit never does, so `authGuard`'s signed-in bounce cannot fire on back.
export const load: LayoutServerLoad = (event) => ({
  lastUsed: lastMethod(event.cookies),
  providers: configuredProviders(event),
})
