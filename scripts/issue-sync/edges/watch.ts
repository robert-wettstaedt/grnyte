import { existsSync, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'

/** Quiet time after a change's last file event, so a burst of ticks becomes one pass. */
const DEBOUNCE_MS = 30_000
const TICK_MS = 60_000
const HOUR_MS = 3_600_000
const WAKE_GAP_MS = 120_000

export function watchChanges(roots: () => string[], pass: (full: boolean) => void): void {
  const watchers = new Map<string, FSWatcher>()
  const timers = new Map<string, NodeJS.Timeout>()

  /** Watches every root's changes folder; true when a new one appeared, such as a fresh worktree. */
  const refresh = (): boolean => {
    let added = false
    const dirs = new Set(
      roots()
        .map((root) => path.join(root, 'openspec', 'changes'))
        .filter((dir) => existsSync(dir)),
    )
    for (const [dir, watcher] of watchers) {
      if (dirs.has(dir)) continue
      watcher.close()
      watchers.delete(dir)
    }
    for (const dir of dirs) {
      if (watchers.has(dir)) continue
      const watcher = watch(dir, { recursive: true }, (_event, file) => {
        if (file == null) return
        const key = `${dir}:${file.split(path.sep)[0]}`
        clearTimeout(timers.get(key))
        timers.set(
          key,
          setTimeout(() => {
            timers.delete(key)
            pass(false)
          }, DEBOUNCE_MS),
        )
      })
      watcher.on('error', () => {
        watcher.close()
        watchers.delete(dir)
      })
      watchers.set(dir, watcher)
      added = true
    }
    return added
  }

  refresh()
  pass(true)
  let lastTick = Date.now()
  let lastFull = Date.now()
  setInterval(() => {
    const now = Date.now()
    const newRoot = refresh()
    if (now - lastTick > WAKE_GAP_MS || now - lastFull >= HOUR_MS) {
      lastFull = now
      pass(true)
    } else if (newRoot) pass(false)
    lastTick = now
  }, TICK_MS)
}
