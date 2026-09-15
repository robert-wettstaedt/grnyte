import { fingerprint } from '$lib/forms/fingerprint'

/** The lines a topo editor loaded, so a Save proves what it replaces. Route ids alone, because
 *  `erased()` deletes on route membership: hashing paths would refuse a save after a mere nudge. */
export function topoLinesFingerprint(routeFks: number[]): string {
  const sorted = [...new Set(routeFks)].sort((a, b) => a - b)

  return `${sorted.length}-${fingerprint(JSON.stringify(sorted))}`
}
