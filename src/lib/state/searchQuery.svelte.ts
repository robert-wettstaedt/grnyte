// The live text in the explore search bar, shared so the map can filter its
// markers as the user types: independent of the committed `?q=` that the
// /search list reads (that only updates on submit). The bar writes this
// on every keystroke and deliberately keeps it when it unmounts (opening a detail
// route), so the text survives the round trip and the bar restores it on remount;
// the clear (×) button is what resets it.
let query = $state('')

/** Reactive live search-bar text (trimmed), or '' when the bar is idle/unmounted. */
export function liveSearchQuery(): { current: string } {
  return {
    get current() {
      return query
    },
  }
}

/** Owned by the search bar: pushes its current text (and '' on teardown). */
export function setLiveSearchQuery(value: string) {
  query = value
}
