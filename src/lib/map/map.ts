import { browser } from '$app/environment'

// iOS deep-links into Apple Maps; everywhere else Google Maps' universal URL
// handles both the Android app and desktop browsers. (iPadOS reports as Mac, so
// also sniff touch points.)
const isIOS = () =>
  browser &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export type Coords = { lat: number; long: number }
export type MapsDestination = Coords | { query: string }

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

/** Great-circle distance in metres between two coordinates (haversine). */
export const haversineMetres = (a: Coords, b: Coords): number => {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.long - a.long)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ponytail: metric vs imperial picked from the locale region; swap for a user setting if people ask.
const IMPERIAL_REGIONS = ['US', 'GB', 'LR', 'MM']

/** Display value + Intl unit, switching to the smaller unit (metres/feet) up close. */
export const pickDistanceUnit = (metres: number, imperial: boolean): { value: number; unit: string } => {
  if (imperial) {
    return metres < 1609.344
      ? { value: Math.round(metres / 0.3048 / 10) * 10, unit: 'foot' }
      : { value: metres / 1609.344, unit: 'mile' }
  }
  return metres < 1000
    ? { value: Math.round(metres / 10) * 10, unit: 'meter' }
    : { value: metres / 1000, unit: 'kilometer' }
}

/** Localized "18 km" / "300 m" / "0.5 mi" for a raw metre value; unit inferred from the runtime locale. */
export const formatMetres = (metres: number): string => {
  const region = new Intl.Locale(navigator.language).maximize().region ?? ''
  const { value, unit } = pickDistanceUnit(metres, IMPERIAL_REGIONS.includes(region))
  return new Intl.NumberFormat(navigator.language, {
    style: 'unit',
    unit,
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value)
}

/** Localized distance between two coords. */
export const formatDistance = (from: Coords, to: Coords): string => formatMetres(haversineMetres(from, to))
