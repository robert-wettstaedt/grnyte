import { browser } from '$app/environment'
import { getLocale } from '$lib/paraglide/runtime'

const IMPERIAL_REGIONS = ['US', 'GB', 'LR', 'MM']

// null follows the runtime locale (the default); an explicit user setting overrides it. Reactive
// $state so a mid-session change (or signing in as another user) re-renders already-mounted views
// that format distance/temperature. Fed by the (app) layout and the /f share page from settings.
let unitOverride = $state<'imperial' | 'metric' | null>(null)

/** Apply the signed-in user's unit preference (null clears it, back to locale inference). */
export const setUnitPreference = (system: 'imperial' | 'metric' | null): void => {
  unitOverride = system
}

/**
 * Whether to render imperial units (shared by distance and temperature): user override, else the
 * browser's region.
 *
 * Metric on the server, deliberately. The `(app)` layout sets `ssr = false`, so the only
 * server-rendered page that reaches this is `/f/<id>`, which mounts a ConditionsPill, so this runs
 * in node. Node defines `globalThis.navigator.language` as `en-US`, which maximizes to a region in
 * the list, so without the guard every share page would server-render °F and flip to °C on
 * hydration for the metric majority. `typeof navigator === 'undefined'` does not catch that, hence
 * `browser`. The signed-in user's own preference only lands in an `$effect` after hydration, so the
 * server has no better signal than the safer default.
 */
export const isImperialLocale = (): boolean => {
  if (unitOverride != null) {
    return unitOverride === 'imperial'
  }
  if (!browser) {
    return false
  }
  // The browser's region, not paraglide's locale: `en` maximizes to `en-Latn-US`, which would put
  // every English reader on Fahrenheit. Where someone is picks the unit system; which language they
  // read picks the number format (below).
  const region = new Intl.Locale(navigator.language).maximize().region ?? ''
  return IMPERIAL_REGIONS.includes(region)
}

/** Localized "18°C" / "18 °C" / "64°F" for a Celsius value: unit system from the region, spacing and
 *  decimal separator from the app's locale (a German reader on an en-US browser still gets "18 °C"). */
export const formatCelsius = (celsius: number): string => {
  const imperial = isImperialLocale()
  return new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 0,
    style: 'unit',
    unit: imperial ? 'fahrenheit' : 'celsius',
  }).format(imperial ? celsius * 1.8 + 32 : celsius)
}

/** "45%" in English, "45 %" (no-break space) in German. Its own function so the conditions pill, the
 *  ascent form and the change list cannot drift apart the way they would if each wrote the format
 *  out, which is exactly how they all ended up with the German spacing in English. `style: 'percent'`
 *  scales by 100 and the column stores whole percent, hence the division. */
export const formatHumidity = (humidity: number): string =>
  new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 0, style: 'percent' }).format(humidity / 100)

/** "18°C · 45%" from an ascent's optional conditions; empty when neither is set. */
export const formatConditions = (temperature: number | undefined, humidity: number | undefined): string =>
  [temperature == null ? null : formatCelsius(temperature), humidity == null ? null : formatHumidity(humidity)]
    .filter(Boolean)
    .join(' · ')
