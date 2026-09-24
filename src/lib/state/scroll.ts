/**
 * Where a screen's scroll container lands when the app navigates.
 *
 * Nothing here scrolls the window, so Kit's own handling does nothing. Its `snapshot` export
 * restores; {@link onNavigation} resets.
 */

/** Gestures that scroll a container. A restore in progress yields to any of them.
 *  A scrollbar drag emits only pointerdown, and PageDown or the arrows emit only keydown. */
const INTERACTIONS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/** How long a restore keeps re-asserting while content syncs. Rows arrive after the route renders,
 *  so the container is short at first and the browser clamps the write. */
const RESTORE_BUDGET_MS = 1_000

/** Hard stop, so a screen that never stops growing cannot keep the watch alive forever.
 *  The trade: a sync slower than this leaves the reader part-way. */
const RESTORE_CEILING_MS = 5_000

/** The part of an element this module uses. A test supplies a fake. */
export interface ScrollContainer {
  addEventListener: (type: (typeof INTERACTIONS)[number], handler: () => void) => void
  clientHeight: number
  removeEventListener: (type: (typeof INTERACTIONS)[number], handler: () => void) => void
  scrollHeight: number
  scrollTop: number
}

/** What a layout attaches to its `<main>` and exports as `snapshot`. */
export interface ScrollSurface {
  attach: (element: ScrollContainer) => () => void
  snapshot: { capture: () => number; restore: (offset: number) => void }
}

/** Every live scrolling surface. Kit resets `window`, which none of these are. */
const surfaces = new Set<ResettableSurface>()

/** Bumped on every reset. A restore queued before its container attached is stale once this moves,
 *  because the reader is then on a different screen. */
let resetSeq = 0

/** The navigation kinds `trackHistoryDepth` classifies. Mirrors `TrailEvent['type']`. */
export type NavigationKind = 'enter' | 'popstate' | 'push' | 'replace'

/** The clock and the frame loop, injected so a test can drive them. */
export interface ScrollTiming {
  now: () => number
  schedule: (callback: () => void) => () => void
}

/** A live scrolling surface, as the navigation rule sees it. */
interface ResettableSurface {
  reset: () => void
}

/**
 * Apply the scroll rule for one navigation. A different screen starts at the top, the same screen
 * does not move.
 *
 * The pathname decides, not push versus replace. `trail.exit` replaces to a different screen on every
 * form submit and cancel, and the media viewer pushes `?media=` onto the current one.
 *
 * Resets every registered surface, not only the navigated one. Nothing scrollable sits behind an
 * explore surface today. If one ever does, OPENING that surface will drop it to the top.
 */
export function onNavigation(kind: NavigationKind, samePathname = false) {
  if (kind === 'enter' || kind === 'popstate' || samePathname) return
  resetSeq += 1
  for (const surface of surfaces) surface.reset()
}

/** For a surface with no history entry of its own, such as the explore sheet and panel.
 *  Layouts use {@link createScrollSurface} instead. */
export function resetOnNavigate(element: ScrollContainer): () => void {
  return register({ reset: () => void (element.scrollTop = 0) })
}

function register(surface: ResettableSurface): () => void {
  surfaces.add(surface)
  return () => void surfaces.delete(surface)
}

const defaultTiming: ScrollTiming = {
  now: () => performance.now(),
  schedule: (callback) => {
    const handle = requestAnimationFrame(callback)
    return () => cancelAnimationFrame(handle)
  },
}

/**
 * One scrolling surface. A layout calls this once, attaches it to its scroll container and
 * re-exports `snapshot` so Kit stores the offset against the history entry.
 */
export function createScrollSurface(timing: ScrollTiming = defaultTiming): ScrollSurface {
  let container: ScrollContainer | undefined
  // Where the reader was when the container went away. Teardown and `capture` race on the way out of
  // a layout that unmounts, and a capture that loses that race would store 0. Caught by the e2e.
  let lastOffset = 0
  let pending: number | undefined
  let pendingSeq = -1
  let stopRestore: (() => void) | undefined

  const endRestore = () => {
    stopRestore?.()
    stopRestore = undefined
  }

  const applyTo = (target: ScrollContainer, offset: number) => {
    endRestore()
    target.scrollTop = offset
    // A write that already landed needs no watch, and the top is always reachable.
    if (offset <= 0 || target.scrollTop >= offset) return

    stopRestore = watchUntilTall(target, offset, timing, () => (stopRestore = undefined))
  }

  return {
    attach(element) {
      container = element
      // Not `resetOnNavigate`: a reset must abandon an in-flight restore too, or the watch's next
      // frame drags the new screen back to the previous one's offset.
      const unregister = register({
        reset: () => {
          endRestore()
          pending = undefined
          element.scrollTop = 0
        },
      })

      // Kit calls `restore` on a remounted layout before the attachment binds the new element.
      // Without this the offset is written to nothing.
      if (pending != null && pendingSeq === resetSeq) {
        const offset = pending
        pending = undefined
        applyTo(element, offset)
      }
      pending = undefined

      return () => {
        unregister()
        if (container !== element) return
        endRestore()
        lastOffset = element.scrollTop
        container = undefined
      }
    },

    snapshot: {
      capture: () => container?.scrollTop ?? lastOffset,

      restore: (offset) => {
        endRestore()
        if (container == null) {
          pending = offset
          pendingSeq = resetSeq
          return
        }

        pending = undefined
        applyTo(container, offset)
      },
    },
  }
}

/** Re-assert `offset` until the container can hold it, the budget runs out, or the reader takes
 *  over. Returns a cancel. `onSettled` runs when it stops by itself. */
function watchUntilTall(
  container: ScrollContainer,
  offset: number,
  timing: ScrollTiming,
  onSettled: () => void,
): () => void {
  const startedAt = timing.now()
  let deadline = startedAt + RESTORE_BUDGET_MS
  let tallest = container.scrollHeight
  let cancelNext: (() => void) | undefined
  let stopped = false

  const stop = () => {
    if (stopped) return
    stopped = true
    cancelNext?.()
    for (const type of INTERACTIONS) container.removeEventListener(type, yieldToReader)
  }

  // Keyed on interaction, not `scroll`: the re-assertion emits `scroll` itself, and telling that
  // echo from the reader's own is a race the reader can lose.
  function yieldToReader() {
    stop()
    onSettled()
  }

  const step = () => {
    // Content still arriving buys more time. A fixed budget guesses how long a list takes to sync,
    // and on a slow one it expires mid-sync and leaves the reader part-way.
    if (container.scrollHeight > tallest) {
      tallest = container.scrollHeight
      deadline = timing.now() + RESTORE_BUDGET_MS
    }

    container.scrollTop = offset
    if (container.scrollTop >= offset || timing.now() >= Math.min(deadline, startedAt + RESTORE_CEILING_MS)) {
      stop()
      onSettled()
      return
    }

    cancelNext = timing.schedule(step)
  }

  for (const type of INTERACTIONS) container.addEventListener(type, yieldToReader)
  cancelNext = timing.schedule(step)

  return stop
}
