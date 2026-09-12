/** Hash a replacement-shaped form posts to prove what it replaces. One copy, because the browser
 *  and the server must agree forever. Callers sort with `<`, never `localeCompare`. */
export function fingerprint(canonical: string): string {
  // djb2, not a security boundary.
  let hash = 5381
  for (let index = 0; index < canonical.length; index += 1) {
    hash = ((hash * 33) ^ canonical.charCodeAt(index)) >>> 0
  }

  return hash.toString(36)
}
