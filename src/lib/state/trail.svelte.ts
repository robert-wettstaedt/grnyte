/**
 * The reader's trail through the app, and the decisions that read it: whether back can go anywhere,
 * and whether finishing a task should pop its screen or replace it.
 *
 * Built over a {@link TrailNavigator} rather than touching `history` and `goto` directly, so the
 * decisions are reachable from a test. The rules themselves were always testable as pure functions;
 * what was not was `exit`, the composition, which is where the mistakes actually live. A form once
 * cancelled and re-issued a page's own navigation, turning every push into a pop, and nothing here
 * could observe it because `exit` read a module global and called `history.back()` on the window.
 */

export interface Trail {
  /** Go back, or to `up` when nothing of the app is behind: a shared link, a notification, a cold
   *  start. `up` is that screen's parent, never a general fallback. */
  back: (up: string) => void
  canGoBack: () => boolean
  /** Leave a finished task for `destination`, retiring the screen it was performed on. */
  exit: (destination: string) => Promise<void>
  record: (event: TrailEvent) => void
}

/** What {@link Trail.record} takes, derived from one `afterNavigate`. */
export interface TrailEvent {
  /** Only for `popstate`, where it is how far the reader moved. */
  delta?: number
  href: string
  type: 'enter' | 'popstate' | 'push' | 'replace'
}

/** The two moves a trail can ask for. The browser implements one; a test implements the other. */
export interface TrailNavigator {
  /** Step one entry back, discarding nothing. */
  back: () => void
  /** Swap the current entry for `href`. `invalidateAll` re-runs the destination's loads. */
  replace: (href: string, options?: { invalidateAll?: boolean }) => Promise<void>
}

/** A same-origin entry, as `pathname + search`. The hash is not part of an entry's identity. */
type Entry = string

export function createTrail(navigator: TrailNavigator): Trail {
  // The browser exposes no way to read the URL of any entry but the current one, so the app has to
  // remember them to know what a back press would reach. In memory only: a reload starts over.
  let entries = $state<Entry[]>([])
  let index = $state(-1)

  const previous = (): Entry | undefined => (index > 0 ? entries[index - 1] : undefined)

  return {
    back(up) {
      if (index > 0) {
        navigator.back()
      } else {
        void navigator.replace(up)
      }
    },

    canGoBack: () => index > 0,

    exit(destination) {
      const behind = previous()

      if (behind == null || entryKey(behind) !== entryKey(destination)) {
        return navigator.replace(destination, { invalidateAll: true })
      }

      // No `invalidateAll` on this branch: it re-runs the loads of the page being LEFT, and the
      // page a delete just left is exactly the one whose load now 404s. The popstate reloads the
      // destination anyway, and this app's reads are live Zero queries regardless.
      navigator.back()
      return Promise.resolve()
    },

    record(event) {
      switch (event.type) {
        // A fresh document. Whatever preceded it belongs to another origin or another session.
        case 'enter':
          entries = [event.href]
          index = 0
          return

        case 'popstate':
          index = Math.min(Math.max(0, index + (event.delta ?? 0)), entries.length - 1)
          return

        case 'replace':
          // `index < 0` means nothing recorded yet, and only that. Widened to `<= 0` it would also
          // swallow a replace while sitting on the FIRST entry of a longer trail, discarding
          // everything ahead: reachable by going back to the start and changing a filter.
          if (index < 0) {
            entries = [event.href]
            index = 0
          } else {
            // Not `Array.prototype.with`: it is Safari 16.4, exactly the pinned floor, and a
            // missing built-in is a TypeError on someone's phone with no build error.
            const next = [...entries]
            next[index] = event.href
            entries = next
          }
          return

        // A push discards whatever was ahead of us, exactly as the browser does.
        default:
          entries = [...entries.slice(0, index + 1), event.href]
          index = entries.length - 1
      }
    },
  }
}

// What makes two entries the same screen: path and query, never the hash. The base is a throwaway,
// so a caller's resolved app path and a recorded entry compare the same way.
function entryKey(href: string): string {
  // A throwaway URL, built and read within the call: nothing reads it reactively.
  const url = new URL(href, 'https://grnyte.invalid')
  return url.pathname + url.search
}
