import type { LayoutServerLoad } from './$types'

// Loads nothing, and exists so that a client-side navigation into signin/signup asks the server at
// all: without a server load Kit never does, so `authGuard`'s signed-in bounce cannot fire on back.
export const load: LayoutServerLoad = () => {}
