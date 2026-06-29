import type { Coords } from './map'

// ponytail: module-level singleton. Safe because `position` is only ever written
// client-side inside an effect (watchPosition never runs during SSR), so there's
// no cross-request leak; it stays undefined on the server.
let position = $state<Coords | null | undefined>(undefined)
let watchers = 0
let watchId: number | undefined

function start() {
  if (watchId != null || typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => (position = { lat: pos.coords.latitude, long: pos.coords.longitude }),
    () => {
      // Denied/unavailable — flip to null only if we never got a fix, so a later
      // error doesn't wipe a position we already have.
      if (position === undefined) {
        position = null
      }
    },
    // ponytail: high accuracy + continuous watch is battery-heavy, but it's bounded
    // to map views with a live subscriber and crag distances need the precision.
    { enableHighAccuracy: true },
  )
}

function stop() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = undefined
  }
}

// The watch should run only while subscribed *and* the tab is visible — a hidden
// tab can't show the distance, so pausing the GPS there is free battery.
function sync() {
  if (watchers > 0 && !document.hidden) {
    start()
  } else {
    stop()
  }
}

/**
 * Shared, live user location for the map section. While any component is
 * subscribed (and `enabled`), a single `watchPosition` keeps `current` updated
 * as the user moves; the watch stops once the last subscriber unmounts. Call
 * during component init.
 *
 * `current` is `undefined` until the first fix, `null` if denied/unavailable.
 *
 * @param enabled gate so a consumer can defer the permission prompt until the
 *   feature is actually used (e.g. distance sort selected).
 */
export function userLocation(enabled: () => boolean = () => true) {
  $effect(() => {
    if (!enabled()) {
      return
    }
    if (watchers === 0) {
      document.addEventListener('visibilitychange', sync)
    }
    watchers++
    sync()
    return () => {
      watchers--
      if (watchers === 0) {
        document.removeEventListener('visibilitychange', sync)
      }
      sync()
    }
  })

  return {
    get current(): Coords | null | undefined {
      return position
    },
  }
}
