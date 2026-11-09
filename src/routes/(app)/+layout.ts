import { dev } from '$app/environment'
import { env } from '$env/dynamic/public'
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public'
import { dropZeroStoreOnce, initPowerSync, powerSyncOnly } from '$lib/powersync/db.svelte'
import { recordPageLoad } from '$lib/powersync/loads'
import { initZero } from '$lib/zero/z.svelte'
import { WASQLiteVFS } from '@powersync/web'
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
  const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    global: { fetch },
  })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Before Zero: whether Zero syncs at all is decided by the measurement switch PowerSync holds.
  initPowerSync(session, async () => (await supabase.auth.getSession()).data.session?.access_token, {
    // shortcut: dev falls back to the local service until PUBLIC_POWERSYNC_URL is in every .env.
    endpoint: env.PUBLIC_POWERSYNC_URL || (dev ? 'http://localhost:58100' : ''),
    only: env.PUBLIC_SYNC_ONLY_POWERSYNC === '1',
    // shortcut: a storage experiment for the remeasure; goes with the switch in R1.
    vfs: Object.values(WASQLiteVFS).find((vfs) => vfs === env.PUBLIC_POWERSYNC_VFS),
  })
  if (powerSyncOnly()) {
    void dropZeroStoreOnce()
    recordPageLoad()
  }

  // Sets up the Zero client singleton before any (app) page reads getZ().
  initZero(session)

  return {
    authUserId: session?.user.id,
    session,
    supabase,
  }
}) satisfies LayoutLoad
