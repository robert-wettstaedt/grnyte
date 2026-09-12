/**
 * The hash a replacement-shaped form posts to prove which list it is replacing.
 *
 * `updateRoute` and the map-layers save both delete whatever the submit leaves out, so each sends a
 * fingerprint of what it loaded and the handler refuses one that no longer matches. A count cannot
 * stand in: a delete plus an add leaves it unchanged.
 *
 * One copy, because the browser that seeds a form and the Node process that checks it have to agree
 * forever. Callers build `canonical` and must sort with `<`, never `localeCompare`: two collators
 * disagreeing means a permanent stale refusal on every save of that row.
 */
export function fingerprint(canonical: string): string {
  // djb2. Not a security boundary, just a short stable value two readers of the same rows agree on.
  let hash = 5381
  for (let index = 0; index < canonical.length; index += 1) {
    hash = ((hash * 33) ^ canonical.charCodeAt(index)) >>> 0
  }

  return hash.toString(36)
}
