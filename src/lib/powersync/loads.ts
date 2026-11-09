// Rule 8's reload counter for the remeasure: every document load of this origin, kept across reloads. Goes in R1 with
// the measurement switch.
const KEY = 'grnyte:pageLoads'
const KEEP = 50

// Module state lives exactly one document. Not a timeOrigin comparison: WebKit counted one document three times.
let recorded = false

/** Document start times (epoch ms), oldest first. */
export function pageLoads(): number[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((at): at is number => typeof at === 'number') : []
  } catch {
    return []
  }
}

/** Once per document: the layout load runs again on every auth change. */
export function recordPageLoad(): void {
  if (recorded) return
  recorded = true
  try {
    localStorage.setItem(KEY, JSON.stringify([...pageLoads(), Math.round(performance.timeOrigin)].slice(-KEEP)))
  } catch {
    // Storage refused (private mode): the counter is only a measurement aid.
  }
}
