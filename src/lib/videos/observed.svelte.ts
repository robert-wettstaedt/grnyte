import { SvelteSet } from 'svelte/reactivity'
import { bunnyHls } from './bunny'

/**
 * GUIDs this client saw a playlist for while the row still said `pending`. Module level, so the tile
 * and the viewer never disagree. Promote-only and never written back.
 *
 * Module level also means one set per SSR process, shared by every request. It stays empty there
 * only because `probeUntilReady` runs from an `$effect`. Never call it on the server.
 */
// SvelteSet, not `$state(new Set())`: Svelte proxies plain objects and arrays only, so a Set signals
// nothing and every `$derived` reader here stays inert.
const observed = new SvelteSet<string>()

/** Slow, because in the healthy case no video is `pending`. */
const PROBE_INTERVAL_MS = 30_000

export const isObservedReady = (guid: string | undefined): boolean => guid != null && observed.has(guid)

/**
 * Probe one video until its playlist answers, then stop. Returns a teardown, so an `$effect` that
 * also reads visibility and connectivity gets pause-on-hidden for free.
 */
export function probeUntilReady(guid: string): () => void {
  if (observed.has(guid)) {
    return () => {}
  }
  let cancelled = false
  const probe = async () => {
    try {
      const response = await fetch(bunnyHls(guid), { method: 'HEAD' })
      if (!cancelled && response.ok) {
        observed.add(guid)
      }
    } catch {
      // Blocked or unreachable says nothing about the video. The record stays the truth.
    }
  }
  void probe()
  const timer = setInterval(() => void probe(), PROBE_INTERVAL_MS)
  return () => {
    cancelled = true
    clearInterval(timer)
  }
}
