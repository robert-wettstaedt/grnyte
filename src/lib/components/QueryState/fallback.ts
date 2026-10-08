import type { QueryPhase } from '$lib/zero/resource.svelte'

export type Fallback =
  | { excluded: boolean; kind: 'offline' }
  | { kind: 'denied' }
  | { kind: 'error' }
  | { kind: 'loading' }
  | { kind: 'notFound'; title: string | undefined }
  | { kind: 'open' }

/** One query a screen needs before its content can render. */
export interface FallbackWait {
  /** Title of the not-found state; without one, an empty answer is just empty. */
  notFound?: string
  phase: QueryPhase
  /** Also wait for the server's whole answer, not just the rows on hand. */
  whole?: boolean
}

/** What a screen shows instead of its content, in the one order every screen uses. Waits are read in
 *  order, so one keyed off an earlier query is never judged on its placeholder. */
export function resolveFallback(waits: readonly FallbackWait[], { denied = false } = {}): Fallback {
  for (const { notFound, phase } of waits) {
    if (phase.kind === 'unavailable') {
      return { excluded: phase.excluded, kind: 'offline' }
    }
    if (phase.kind === 'error') {
      return { kind: 'error' }
    }
    if (phase.kind === 'answered' && phase.empty) {
      return { kind: 'notFound', title: notFound }
    }
    if (phase.kind === 'loading') {
      // Denial is judged from rows already here, so it outranks a later wait still loading.
      return denied ? { kind: 'denied' } : { kind: 'loading' }
    }
  }

  if (denied) {
    return { kind: 'denied' }
  }

  // Rows on hand, related rows not: still coming online, and offline not coming at all.
  const unwhole = waits.find(({ phase, whole }) => whole === true && phase.kind !== 'answered')
  if (unwhole != null) {
    return unwhole.phase.kind === 'partial' ? { excluded: false, kind: 'offline' } : { kind: 'loading' }
  }

  return { kind: 'open' }
}
