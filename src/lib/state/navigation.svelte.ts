import { afterNavigate, goto, replaceState } from '$app/navigation'
import { page } from '$app/state'
import { onNavigation } from './scroll'
import { createTrail } from './trail.svelte'

// One trail for the app, over the browser. `createTrail` holds the rules; this supplies the two
// moves it can ask for, so a test can supply a recording fake instead.
const trail = createTrail({
  back: () => history.back(),
  replace: (href, options) => replaceUrl(href, options),
})

// afterNavigate reports a replaceState goto as a plain 'goto', because SvelteKit exposes no replace
// signal, so `replaceUrl` records where it is headed and the tracker matches that arrival.
//
// The DESTINATION, not a boolean. A boolean is claimed by whichever navigation arrives first, and
// two of them legitimately arrive before the one that raised it: a resolver forwards from an
// `$effect` during its own mount, and the `goto` can settle before its own `afterNavigate`.
//
// Each record is discarded after one further navigation, so one that never arrives cannot go stale.
// One, because the resolver's own mount is the navigation it has to survive. The residual: a replace
// that never lands (a `beforeNavigate` guard cancelled it, and Kit resolves rather than rejects
// those) followed by a genuine push to that same pathname reads as a replace, costing the trail one
// entry.
const replaced = createNavigationRecord()

// The same shape for a different question: `replaced` decides push versus replace for the trail,
// `forwarded` decides whether the scroll rule sees a screen change. A redirect is both.
const forwarded = createNavigationRecord()

// The route a feedback report is about: the form is reached through settings, so settings
// pathnames are skipped.
let lastAppPath = $state('')

/**
 * Go back within the app, or navigate to `up` when nothing of the app is behind us: a shared link,
 * a notification, or a cold start. `up` is that screen's parent, never a general fallback.
 */
export function back(up: string) {
  trail.back(up)
}

/** True when there is a same-origin entry we can safely go back to. */
export function canGoBack(): boolean {
  return trail.canGoBack()
}

/** Close the viewer: pop the `?media` entry, or replace it away on a deep link. */
export function closeMedia() {
  const url = mediaUrl(null)
  back(url.pathname + url.search)
}

/**
 * Leave a finished task for `destination`, retiring the screen it was performed on so back can
 * never return to it. Pops when `destination` is what a back press would already reach, otherwise
 * replaces the finished screen in place.
 */
export function exit(destination: string): Promise<void> {
  return trail.exit(destination)
}

/** Last non-settings route, `''` when there has not been one. */
export function lastAppRoute(): string {
  return lastAppPath
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
 * Plain forward navigation onto a new entry. The only sanctioned `goto` wrapper, so the lint rule
 * can ban every other import of it and the push/replace/exit choice stays explicit at the call site.
 */
export function push(href: string | URL, opts: Omit<object & Parameters<typeof goto>[1], 'replaceState'> = {}) {
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved app paths
  return goto(href, opts)
}

/**
 * Forward to the canonical URL for what the reader asked for, replacing this entry so back does not
 * bounce through the resolver. The destination is exempt from the scroll reset.
 *
 * Only for a destination that POSITIONS ITSELF, such as the ascent deep link scrolling to its row.
 * A screen with no position of its own would keep the previous screen's offset.
 */
export function redirectTo(url: string | URL, opts: Omit<object & Parameters<typeof goto>[1], 'replaceState'> = {}) {
  forwarded.expect(url)
  return replaceUrl(url, opts)
}

/**
 * `goto` with `replaceState: true` that the trail records as a replace rather than a push. Use
 * this (not a raw goto) for every replace navigation, or the back-button logic drifts.
 */
export function replaceUrl(url: string | URL, opts: Omit<object & Parameters<typeof goto>[1], 'replaceState'> = {}) {
  replaced.expect(url)
  // eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved/same-page URLs
  return goto(url, { ...opts, replaceState: true })
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

/**
 * Register once from a top-level layout to track same-origin navigation.
 *
 * Guarded by unit tests that drive the adverse orderings by hand, because the real ones are races:
 * a `goto` can settle before its own `afterNavigate`, and a resolver can forward during its mount.
 */
export function trackHistoryDepth() {
  afterNavigate((navigation) => {
    const to = navigation.to?.url
    if (to != null && !to.pathname.startsWith('/settings')) {
      lastAppPath = to.pathname
    }

    // link / goto / form pushes a new entry, unless this is the arrival a replaceUrl() was waiting
    // for, which swapped the current one in place.
    //
    // Only a `goto` can be that arrival, since `replaceUrl` produces nothing else, so nothing else
    // may consume a record. An `enter` or `popstate` landing on the same pathname would otherwise
    // spend it and leave the real replace counted as a push.
    const couldBeTheReplace = navigation.type === 'goto'
    const wasReplace = couldBeTheReplace && replaced.claims(to)
    const wasForward = couldBeTheReplace && forwarded.claims(to)

    // Classified once and read twice, so the trail and the scroll rule cannot disagree.
    const type =
      navigation.type === 'enter' || navigation.type === 'popstate' ? navigation.type : wasReplace ? 'replace' : 'push'

    trail.record({
      delta: navigation.type === 'popstate' ? navigation.delta : undefined,
      href: to == null ? '' : to.pathname + to.search,
      type,
    })

    // `from.url` is null on a document's first navigation. An unknown origin counts as a different
    // screen, because two nullish pathnames would compare equal and suppress the reset.
    const fromPathname = navigation.from?.url?.pathname
    onNavigation(type, wasForward || (fromPathname != null && fromPathname === to?.pathname))
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

/**
 * One expected navigation, matched by where it is going. Survives arrivals that are not it, and is
 * dropped after one of those so a navigation that never lands cannot go stale.
 */
function createNavigationRecord() {
  let pathname: string | undefined
  let misses = 0

  return {
    /** True when `to` is the arrival this record was waiting for. Consumes it either way.
     *  Pathname only: matching on the href would break `pageMedia`, which replaces its own query. */
    claims(to: undefined | URL): boolean {
      if (pathname == null) return false
      if (pathname === to?.pathname) {
        pathname = undefined
        return true
      }

      misses += 1
      if (misses > 1) pathname = undefined
      return false
    },

    expect(url: string | URL) {
      pathname = new URL(url, location.href).pathname
      misses = 0
    },
  }
}

// The `?media=<file id>` param drives the fullscreen media viewer for a set of
// files: opening pushes a history entry (back closes it), paging replaces it in
// place, closing pops it. One place owns the URL mechanics so the open/page/close
// history semantics can't drift between the thumbnail, the overflow chip, and the
// viewer's own paging.
function mediaUrl(id: null | string): URL {
  return withSearchParams(page.url, { media: id ?? undefined })
}
