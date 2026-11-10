// Sync timeline for the remeasure: when this document's first sync passed each step, in ms since the page started.
// Kept for the latest document only; goes in R1 with the measurement switch.
const KEY = 'grnyte:syncMarks'
const PREVIOUS_KEY = 'grnyte:syncMarks:previous'

let marks: [string, number][] = []

/** Records `name` once per document. */
export function syncMark(name: string): void {
  if (marks.some(([seen]) => seen === name)) return
  marks = [...marks, [name, Math.round(performance.now())]]
  try {
    // The page before this one, so a cold start can be read from a fresh load of Sync health.
    if (marks.length === 1) localStorage.setItem(PREVIOUS_KEY, localStorage.getItem(KEY) ?? '[]')
    localStorage.setItem(KEY, JSON.stringify(marks))
  } catch {
    // Storage refused: the timeline is only a measurement aid.
  }
}

/** The latest document's timeline, in the order it happened; `previous` for the one before it. */
export function syncMarks(previous = false): [string, number][] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(previous ? PREVIOUS_KEY : KEY) ?? '[]')
    return Array.isArray(value) ? (value as [string, number][]) : []
  } catch {
    return []
  }
}
