// ponytail: metric vs imperial picked from the locale region; swap for a user setting if people ask.
const IMPERIAL_REGIONS = ['US', 'GB', 'LR', 'MM']

/** Whether the runtime locale prefers imperial units (shared by distance and temperature). */
export const isImperialLocale = (): boolean => {
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
