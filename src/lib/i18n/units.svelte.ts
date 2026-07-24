const IMPERIAL_REGIONS = ['US', 'GB', 'LR', 'MM']

// null follows the runtime locale (the default); an explicit user setting overrides it. Reactive
// $state so a mid-session change (or signing in as another user) re-renders already-mounted views
// that format distance/temperature. Fed by the (app) layout and the /f share page from settings.
let unitOverride = $state<'imperial' | 'metric' | null>(null)

/** Apply the signed-in user's unit preference (null clears it, back to locale inference). */
export const setUnitPreference = (system: 'imperial' | 'metric' | null): void => {
  unitOverride = system
}

/** Whether to render imperial units (shared by distance and temperature): user override, else locale. */
export const isImperialLocale = (): boolean => {
  if (unitOverride != null) {
    return unitOverride === 'imperial'
  }
  const region = new Intl.Locale(navigator.language).maximize().region ?? ''
  return IMPERIAL_REGIONS.includes(region)
}

/** Localized "18°C" / "64°F" for a Celsius value; unit inferred from the runtime locale. */
export const formatCelsius = (celsius: number): string => {
  const imperial = isImperialLocale()
  return new Intl.NumberFormat(navigator.language, {
    maximumFractionDigits: 0,
    style: 'unit',
    unit: imperial ? 'fahrenheit' : 'celsius',
  }).format(imperial ? celsius * 1.8 + 32 : celsius)
}

/** "18°C · 45 %" from an ascent's optional conditions; empty when neither is set. */
export const formatConditions = (temperature: number | undefined, humidity: number | undefined): string =>
  [temperature == null ? null : formatCelsius(temperature), humidity == null ? null : `${humidity} %`]
    .filter(Boolean)
    .join(' · ')
