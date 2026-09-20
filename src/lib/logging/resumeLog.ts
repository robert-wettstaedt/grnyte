import { PUBLIC_APPLICATION_NAME } from '$env/static/public'

/**
 * Resumes that turned out to need a reconnect, kept on this device only.
 *
 * Temporary instrumentation. Zero reports `connected` for as long as it takes its own ping cycle to
 * notice a socket that died while the app was away, so while that is happening there is no error, no
 * status bar and no state change: the condition leaves no trace to read afterwards. This is the
 * trace. Delete it, and the section on `/settings/errors`, once the question it answers is settled.
 *
 * Nothing is transmitted. See `design.md` in the change for why this is not server-side telemetry.
 */
export interface ResumeEntry {
  /** Epoch ms of the resume that triggered it. */
  at: number
  /** Ms from that resume to the connection being back. */
  elapsedMs: number
}

const KEY = `${PUBLIC_APPLICATION_NAME}.resumeLog`

/** Enough to see a pattern, small enough that nobody has to think about the quota. */
const CAP = 20

/**
 * Append, newest last, dropping the oldest past `cap`. Pure, so the eviction is assertable without
 * a storage mock.
 */
export function appendResume(entries: ResumeEntry[], entry: ResumeEntry, cap = CAP): ResumeEntry[] {
  return [...entries, entry].slice(-cap)
}

export function clearResumeLog(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // As above.
  }
}

/** Reading storage throws in a private window or with site data blocked, and a diagnostic must
 *  never be the thing that breaks the app. Every access here is guarded for that reason. */
export function readResumeLog(): ResumeEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw == null ? [] : JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isResumeEntry) : []
  } catch {
    return []
  }
}

export function recordResume(entry: ResumeEntry): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(appendResume(readResumeLog(), entry)))
  } catch {
    // Storage is unavailable or full. Losing a diagnostic is the correct outcome.
  }
}

/** Checked rather than cast: this is parsed from storage a previous release wrote. */
function isResumeEntry(value: unknown): value is ResumeEntry {
  return (
    typeof value === 'object' &&
    value != null &&
    typeof (value as ResumeEntry).at === 'number' &&
    typeof (value as ResumeEntry).elapsedMs === 'number'
  )
}
