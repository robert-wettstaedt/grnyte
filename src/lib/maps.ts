import { browser } from '$app/environment'

// iOS deep-links into Apple Maps; everywhere else Google Maps' universal URL
// handles both the Android app and desktop browsers. (iPadOS reports as Mac, so
// also sniff touch points.)
const isIOS = () =>
  browser &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export type MapsDestination = { lat: number; long: number } | { query: string }

/** Platform-specific maps deep link: driving directions to coords, or a name search. */
export const mapsUrl = (dest: MapsDestination): string => {
  const apple = isIOS()
  if ('query' in dest) {
    return apple
      ? `https://maps.apple.com/?q=${encodeURIComponent(dest.query)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest.query)}`
  }
  return apple
    ? `https://maps.apple.com/?daddr=${dest.lat},${dest.long}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.long}`
}
