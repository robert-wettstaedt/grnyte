import { browser } from '$app/environment'

let current = $state(Date.now())

// ponytail: one shared minute tick; day-granularity labels only need to roll past midnight.
if (browser) {
  setInterval(() => (current = Date.now()), 60_000)
}

/** Reactive wall clock (minute granularity) so relative-time labels don't go stale. */
export function now(): number {
  return current
}
