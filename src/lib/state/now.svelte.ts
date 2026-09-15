import { browser } from '$app/environment'

/**
 * When the shared clock last ticked, which is the invalidation signal rather than the time.
 *
 * What a relative-time label needs from this module is a reason to be redrawn; the clock itself is
 * read when it is drawn (see {@link now}). Handing out this timestamp instead made staleness a
 * property of the module that only a caller could fix, and only one of the eleven surfaces reading
 * it ever did: anything mounted between two ticks rendered against a clock up to 59 seconds behind,
 * so a thread reopened two minutes after a comment said "60 seconds ago".
 */
let ticked = $state(Date.now())

// ponytail: one shared minute tick; day-granularity labels only need to roll past midnight.
if (browser) {
  setInterval(() => (ticked = Date.now()), 60_000)

  // And whenever the tab comes back. A backgrounded tab's interval is throttled or suspended
  // entirely, so a phone that was locked for an hour resumes on labels nothing has asked to redraw.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      ticked = Date.now()
    }
  })
}

/**
 * Reactive wall clock (minute granularity) so relative-time labels don't go stale.
 *
 * Reading `ticked` is what subscribes the caller to the minute; the value returned is the clock as it
 * is right now, so a surface mounted between two ticks is right on its first paint. `max` rather than
 * `Date.now()` alone so a system clock that steps backwards cannot make a label read as the future.
 */
export function now(): number {
  return Math.max(ticked, Date.now())
}
