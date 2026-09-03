import { afterNavigate, goto, replaceState } from '$app/navigation'
import { page } from '$app/state'

// How many same-origin history entries deep we are since entering the app.
// 0 means the current page is the app's entry point: there is no in-app
// previous entry, so history.back() would leave the origin (another domain,
// a search engine, etc.).
let depth = $state(0)

// afterNavigate reports a replaceState goto as a plain 'goto' (SvelteKit exposes
// no replace signal), which would count as a pushed entry and permanently inflate
// `depth` (e.g. the media viewer paging siblings via replace). Navigations issued
// through replaceUrl() raise this flag; the tracker consumes it instead of counting.
let replacing = false

/**
 * Go back within the app, or navigate to `fallback` when the previous history
 * entry is on another origin (or there is none).
 */
export function back(fallback: string) {
  if (depth > 0) {
    history.back()
  } else {
    void replaceUrl(fallback)
  }
}

/** True when there is a same-origin entry we can safely go back to. */
export function canGoBack(): boolean {
  return depth > 0
}

/** Close the viewer: pop the `?media` entry, or replace it away on a deep link. */
export function closeMedia() {
  const url = mediaUrl(null)
  back(url.pathname + url.search)
}

/** Open the viewer for `id`: pushes `?media` so the back button closes it. */
export function openMedia(id: string) {
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- same-page query change, not a route.
  return goto(mediaUrl(id), { keepFocus: true, noScroll: true })
}

/** Page to sibling `id`: replaces `?media` so paging stays one history entry. */
export function pageMedia(id: string) {
  return replaceUrl(mediaUrl(id), { keepFocus: true, noScroll: true })
}

/**
 * `goto` with `replaceState: true` that the depth tracker ignores. Use this (not a
 * raw goto) for every replace navigation, or the back-button fallback logic drifts.
 */
export function replaceUrl(url: string | URL, opts: Omit<object & Parameters<typeof goto>[1], 'replaceState'> = {}) {
  replacing = true
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved/same-page URLs
  return goto(url, { ...opts, replaceState: true }).catch((error) => {
    // The navigation never completed, so afterNavigate won't consume the flag.
    replacing = false
    throw error
  })
}

/**
 * Mirror a page's own state into the query string, leaving every param it does not own alone.
 *
 * `replaceState` rather than a `goto`: the values are already in memory, so there is nothing to
 * load, and the back button keeps meaning "the page before this one" rather than "the filter
 * before this one". Call it from an `$effect` over the state being mirrored.
 */
export function syncSearchParams(values: Record<string, number | string | undefined>) {
  const url = withSearchParams(page.url, values)

  // Guarded, because the effect re-runs on the `page.url` its own write produces.
  if (url.search !== page.url.search) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is `page.url`'s own, already resolved; only the query changes
    replaceState(url, page.state)
  }
}

/** Register once from a top-level layout to track same-origin navigation depth. */
export function trackHistoryDepth() {
  afterNavigate((navigation) => {
    switch (navigation.type) {
      case 'enter':
        depth = 0
        break
      case 'popstate':
        depth = Math.max(0, depth + navigation.delta)
        break
      default:
        // link / goto / form: a new entry was pushed onto the stack, unless it
        // was a replaceUrl() navigation, which swapped the current one in place.
        if (replacing) {
          replacing = false
        } else {
          depth += 1
        }
    }
  })
}

/**
 * A copy of `url` with `values` written onto its query: set when a value is there, deleted when
 * it is `undefined` or empty. Every other param keeps its key, its value and its position.
 *
 * Not byte-for-byte, though: a write re-serialises the whole query through `URLSearchParams`, so
 * params this call never named are normalised along with it (`%20` becomes `+`, a valueless
 * `?debug` becomes `?debug=`). Do not mirror state next to a param whose exact bytes are the
 * point, a signature or a base64 token; read those before the first write, or keep them in the
 * path.
 *
 * Split out from {@link syncSearchParams} because this half is the one with the sharp edge, and
 * it is testable without a browser. Normalising through a `URL` is also what makes the round trip
 * a fixed point: hand-building the string with `encodeURIComponent` and comparing it against what
 * the browser reports back compares two different serialisers (a space is `%20` on one side and
 * `+` on the other), so the guard in `syncSearchParams` never matches and it replaces forever.
 */
export function withSearchParams(url: URL, values: Record<string, number | string | undefined>): URL {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a throwaway value, built and read within the call; nothing reads it reactively
  const next = new URL(url)

  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === '') {
      next.searchParams.delete(key)
    } else {
      next.searchParams.set(key, String(value))
    }
  }

  return next
}

// The `?media=<file id>` param drives the fullscreen media viewer for a set of
// files: opening pushes a history entry (back closes it), paging replaces it in
// place, closing pops it. One place owns the URL mechanics so the open/page/close
// history semantics can't drift between the thumbnail, the overflow chip, and the
// viewer's own paging.
function mediaUrl(id: null | string): URL {
  return withSearchParams(page.url, { media: id ?? undefined })
}
