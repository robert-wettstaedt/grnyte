/** Hidden longer than this, a page may have been frozen (Safari froze one after 4 s, design D14), so the sync restarts. */
export const RESUME_STALE_MS = 3_000
/** A page that was still live catches up within about this long, so the status bar waits it out. */
export const RESUME_SHOW_MS = 1_000
/** A connected sync with no checkpoint this long is stuck: WebKit's slowest catch-up measured was about 22 s. */
export const RESUME_STALL_MS = 30_000

/** `pending`: stale and catching up, but not shown yet. */
export type ResumeState = 'catchingUp' | 'idle' | 'pending' | 'stalled'

export function isStale(hiddenFor: number): boolean {
  return hiddenFor > RESUME_STALE_MS
}

/** In ms: `since` the return, `sinceConnected` the later of the return and the sync's last reconnect. */
export function resumeState({
  checkpoint,
  hiddenFor,
  since,
  sinceConnected,
}: {
  checkpoint: boolean
  hiddenFor: number
  since: number
  sinceConnected: number
}): ResumeState {
  if (!isStale(hiddenFor) || checkpoint) return 'idle'
  if (since < RESUME_SHOW_MS) return 'pending'
  return sinceConnected < RESUME_STALL_MS ? 'catchingUp' : 'stalled'
}
