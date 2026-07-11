import { afterNavigate, goto } from '$app/navigation'

// How many same-origin history entries deep we are since entering the app.
// 0 means the current page is the app's entry point — there is no in-app
// previous entry, so history.back() would leave the origin (another domain,
// a search engine, etc.).
let depth = $state(0)

// afterNavigate reports a replaceState goto as a plain 'goto' (SvelteKit exposes
// no replace signal), which would count as a pushed entry and permanently inflate
// `depth` (e.g. the media viewer paging siblings via replace). Navigations issued
// through replaceUrl() raise this flag; the tracker consumes it instead of counting.
let replacing = false

/**
 * `goto` with `replaceState: true` that the depth tracker ignores. Use this (not a
 * raw goto) for every replace navigation, or the back-button fallback logic drifts.
 */
export function replaceUrl(url: string | URL, opts: Omit<Parameters<typeof goto>[1] & object, 'replaceState'> = {}) {
  replacing = true
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved/same-page URLs
  return goto(url, { ...opts, replaceState: true }).catch((error) => {
    // The navigation never completed, so afterNavigate won't consume the flag.
    replacing = false
    throw error
  })
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

/** True when there is a same-origin entry we can safely go back to. */
export function canGoBack(): boolean {
  return depth > 0
}

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
