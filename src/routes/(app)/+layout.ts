import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { start } from '$lib/state/engine'
import { createBrowserClient } from '@supabase/ssr'
import type { LayoutLoad } from './$types'

// The authenticated app renders client-side only: Zero is a browser-only sync
// engine. ssr=false also guarantees this load runs on the client every time the
// (app) group is entered (e.g. navigating in from the SSR'd landing page), which
// is why Zero is initialized here rather than in a root load whose client-run
// timing is unreliable once (landing) is server-rendered.
export const ssr = false

export const load = (async ({ depends, fetch }) => {
  // Re-runs on `supabase:auth` invalidation, swapping the Zero client on
  // login/logout (see initZero).
  depends('supabase:auth')

  // Called per run and that is fine: `createBrowserClient` returns one cached client per document
  // unless `isSingleton` says otherwise, so this cannot stack up auto-refresh timers.
  const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch },
  })

  const {
    data: { session: stored },
  } = await supabase.auth.getSession()

  // Sets up the build's sync engine before any (app) page reads it. It may answer the session the screens are to keep,
  // and it never answers while the tab leaves for another account.
  const session = (await start(stored, supabase)) ?? stored

  return {
    authUserId: session?.user.id,
    session,
    supabase,
  }
}) satisfies LayoutLoad
