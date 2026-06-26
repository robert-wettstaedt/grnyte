import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { initZero } from '$lib/zero/z.svelte'
import { createBrowserClient } from '@supabase/ssr'
import type { LayoutLoad } from './$types'

// The authenticated app renders client-side only — Zero is a browser-only sync
// engine. ssr=false also guarantees this load runs on the client every time the
// (app) group is entered (e.g. navigating in from the SSR'd landing page), which
// is why Zero is initialized here rather than in a root load whose client-run
// timing is unreliable once (landing) is server-rendered.
export const ssr = false

export const load = (async ({ depends, fetch }) => {
  // Re-runs on `supabase:auth` invalidation, swapping the Zero client on
  // login/logout (see initZero).
  depends('supabase:auth')

  const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    global: { fetch },
  })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Sets up the Zero client singleton before any (app) page reads getZ().
  initZero(session)

  return {
    authUserId: session?.user.id,
    session,
    supabase,
  }
}) satisfies LayoutLoad
