import type { QueryPhase } from '$lib/zero/resource.svelte'

/** Whether the first window may be marked read. Only once confirmed: rows another query left on the
 *  device are not this window's newest, and marking them sends the real newest behind the pill. */
export function firstWindowConfirmed(phase: QueryPhase, rows: number): boolean {
  return phase.kind === 'answered' && rows > 0
}

/** The main feed's window as shown. Unconfirmed and unmarked, its rows on hand are other queries'
 *  leftovers posing as the newest, so it waits for the answer rather than show them. */
export function shownWindowPhase(phase: QueryPhase, marked: boolean): QueryPhase {
  return !marked && phase.kind === 'arriving' ? { kind: 'loading' } : phase
}
