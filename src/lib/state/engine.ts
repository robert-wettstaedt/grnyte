import type { ResumeState } from '$lib/components/StatusBar/statusBar'
import { initZero } from '$lib/zero/z.svelte'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

// The app's one engine seam: the PowerSync build swaps this module for `engine.powersync.ts`.

/** Clears local data on sign-out beyond Zero's own stores, which `wipe.ts` drops in both builds. */
export async function clearLocal(): Promise<void> {}

/** Whether the sync server refused the download, so an empty local store is not still arriving. */
export function downloadRefused(): boolean {
  return false
}

/** The catch-up after a return to the foreground: Zero reconnects by itself and has none to show. */
export function resume(): ResumeState {
  return 'idle'
}

/** Starts the build's sync for the signed-in session, before any (app) page reads it. */
export function start(session: null | Session | undefined, _supabase: SupabaseClient): void {
  initZero(session)
}
