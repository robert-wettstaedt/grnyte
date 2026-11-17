import { dev } from '$app/environment'
import { env } from '$env/dynamic/public'
import type { ResumeState } from '$lib/components/StatusBar/statusBar'
import { clearPowerSync, initPowerSync, powerSyncStatus, resumeStatus } from '$lib/powersync/db.svelte'
import { initZero } from '$lib/zero/z.svelte'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

export function clearLocal(): Promise<void> {
  return clearPowerSync()
}

/** PowerSync retries a refused download for ever rather than parking, so a held error is the signal. */
export function downloadRefused(): boolean {
  return powerSyncStatus()?.dataFlowStatus.downloadError != null
}

export function resume(): ResumeState {
  return resumeStatus()
}

/** PowerSync reads the guidebook; Zero still carries writes, the feed, the inbox and comments, without a preload. */
export function start(session: null | Session | undefined, supabase: SupabaseClient): void {
  initPowerSync(session, async () => (await supabase.auth.getSession()).data.session?.access_token, {
    // shortcut: dev falls back to the local service until PUBLIC_POWERSYNC_URL is in every .env.
    endpoint: env.PUBLIC_POWERSYNC_URL || (dev ? 'http://localhost:58100' : ''),
  })
  initZero(session, { preload: false })
}
