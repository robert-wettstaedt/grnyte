import { m } from '$lib/paraglide/messages'

/**
 * A route's name for reading, which is the placeholder when it has none.
 *
 * A route may genuinely be nameless, and the swap happens here so nothing downstream ever sees
 * the empty string: a screen that checked for itself would be a second opinion about what a
 * nameless route is called.
 *
 * Its own module rather than `mapper.ts` so `topo/mapper.ts` can reach it. `route/mapper.ts`
 * imports `routeTopoThumb` from there, so a name helper living beside it would close a cycle
 * that survives only while both ends stay hoisted function declarations.
 *
 * Trimmed, not length-checked: names are trimmed on write, but imported and legacy rows are
 * not, and a whitespace name renders as a blank link exactly like an empty one.
 */
export function routeDisplayName(name: string): string {
  const trimmed = name.trim()
  return trimmed.length === 0 ? m.common_unnamed() : trimmed
}
