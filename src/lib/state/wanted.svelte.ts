import { notifyError } from '$lib/state/toast/toast'
import { forgetUnanswered } from '$lib/zero/write'
import { untrack } from 'svelte'

export type Wanted<T> = {
  /** `persist` runs once earlier writes have settled: take its arguments at the tap, not inside it. */
  set: (next: T, persist: () => Promise<unknown>) => Promise<void>
  /** The tapped value while the read has not caught up, else `undefined`. */
  readonly unsynced: T | undefined
  readonly value: T
}

export function createWanted<T>(read: () => T, key: () => string): Wanted<T> {
  let wanted = $state.raw<{ key: string; value: T }>()
  // Held while writes are out: a second tap can agree with the stale read before the first write syncs back.
  let writing = $state(0)
  const unsynced = $derived(wanted?.key === key() && (writing > 0 || wanted.value !== read()) ? wanted : undefined)
  // Dropped once the read agrees: kept, it would hide a later change from another device.
  $effect(() => {
    if (wanted != null && unsynced == null) wanted = undefined
  })
  // The row may have moved elsewhere, unwatched before mount: a write id kept for a retry could replay a stale answer.
  // Derived, so a rerun that answers the same value is no change.
  const current = $derived(read())
  $effect(() => {
    void current
    untrack(forgetUnanswered)
  })
  // One write at a time, so taps reach the server in order. Its gap: a send the client gave up on
  // (`SEND_LIMIT_MS`) may still commit after the next one.
  let queue: Promise<unknown> = Promise.resolve()

  return {
    set: async (next, persist) => {
      const tap = { key: key(), value: next }
      wanted = tap
      writing++
      const sent = queue.then(persist)
      queue = sent.catch(() => {})
      try {
        await sent
      } catch (cause) {
        if (wanted === tap) wanted = undefined
        notifyError(cause)
      } finally {
        writing--
      }
    },
    get unsynced() {
      return unsynced?.value
    },
    get value() {
      return unsynced == null ? read() : unsynced.value
    },
  }
}
