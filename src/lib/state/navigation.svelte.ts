import { afterNavigate, goto } from '$app/navigation'

// How many same-origin history entries deep we are since entering the app.
// 0 means the current page is the app's entry point — there is no in-app
// previous entry, so history.back() would leave the origin (another domain,
// a search engine, etc.).
let depth = $state(0)

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
        // link / goto / form — a new entry was pushed onto the stack.
        depth += 1
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
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto(fallback, { replaceState: true })
  }
}
