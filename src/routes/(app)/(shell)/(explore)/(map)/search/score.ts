/**
 * Name-match relevance for the mixed "Top results" ranking, 0 (no name hit) …
 * 100 (exact). Case-insensitive. Zero/Postgres `ILIKE` only tells us *that* a
 * row matched, never how well, and the four entity types are separate queries
 * that can't be sorted against each other server-side, so the merged list is
 * ranked here, client-side, from the loaded rows.
 *
 * ponytail: this is the tunable knob. Tiers are deliberately coarse (exact >
 * prefix > word-prefix > substring); nudge the weights if the order feels off.
 */
export function matchScore(name: string, query: string): number {
  const n = name.trim().toLowerCase()
  const q = query.trim().toLowerCase()

  if (q.length === 0 || n.length === 0) {
    return 0
  }
  if (n === q) {
    return 100
  }
  if (n.startsWith(q)) {
    return 80
  }
  if (n.split(/\s+/).some((word) => word.startsWith(q))) {
    return 60
  }
  if (n.includes(q)) {
    return 40
  }
  return 0
}
