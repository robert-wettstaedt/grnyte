/**
 * One test run at a time per database.
 *
 * Fixture names are unique per suite, so nothing collides inside a run. Two runs are the problem:
 * several agents work this repo at once and the DB-backed suites tear down by fixture name or fixed
 * id, so a second run deletes the first one's rows mid-suite. It never looks like a race, only like
 * ordinary failures in whichever file lost, each passing again in isolation.
 */
import { createHash } from 'node:crypto'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Vitest calls a global setup once per project WITH SPECS, plus once for the root project. */
const ROOT_PROJECT = ''

const WAIT_TIMEOUT_MS = 10 * 60 * 1000
const POLL_MS = 250

interface Project {
  config?: { watch?: boolean }
  name?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Keyed on the database, so runs pointed at different ones never wait for each other. */
const lockPathFor = (url: string) =>
  join(tmpdir(), `grnyte-tests-${createHash('sha256').update(url).digest('hex').slice(0, 16)}.lock`)

const holderOf = (path: string): number | undefined => {
  try {
    const pid = Number.parseInt(readFileSync(path, 'utf8').trim(), 10)
    return Number.isInteger(pid) ? pid : undefined
  } catch {
    return undefined
  }
}

/** Signal 0 tests for existence without delivering anything. */
const running = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function setup(project?: Project): Promise<() => void> {
  const noop = () => {}

  // The root project is the one invocation guaranteed to happen, and the only one told about watch.
  // Taking the lock on each project instead would have this run wait on itself.
  if (project?.name !== ROOT_PROJECT) {
    return noop
  }

  // A watch session lives as long as its terminal, so locking one would block every other run.
  if (project.config?.watch === true) {
    return noop
  }

  const url = process.env.DATABASE_URL

  // No database: the DB-backed suites skip themselves and there is nothing to serialise.
  if (url == null || url.length === 0) {
    return noop
  }

  const path = lockPathFor(url)
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  let announced = false

  for (;;) {
    try {
      writeFileSync(path, String(process.pid), { flag: 'wx' })
      break
    } catch {
      const holder = holderOf(path)

      // A run killed hard leaves its file behind; the pid is what says whether it is still there.
      if (holder == null || !running(holder)) {
        try {
          unlinkSync(path)
        } catch {
          // Lost the race to clear it, which is fine: the next attempt sees the new holder.
        }
        continue
      }

      if (Date.now() > deadline) {
        throw new Error(
          `Another test run (pid ${holder}) has held ${path} for over ${WAIT_TIMEOUT_MS / 60_000} minutes. ` +
            'Stop it, or delete that file if the process is gone.',
        )
      }

      if (!announced) {
        announced = true
        console.warn(`[vitest] pid ${holder} is running against this database; waiting rather than racing it`)
      }

      await sleep(POLL_MS)
    }
  }

  return () => {
    // Only ever remove our own: a stale-clear above may have handed the file to somebody else.
    if (holderOf(path) === process.pid) {
      try {
        unlinkSync(path)
      } catch {
        // Already gone.
      }
    }
  }
}
