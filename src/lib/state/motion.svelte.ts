import { MediaQuery } from 'svelte/reactivity'

// One query for the whole app rather than one per component. Safe at module scope: Svelte's
// server build swaps in a `MediaQuery` that never touches `window`.
const query = new MediaQuery('(prefers-reduced-motion: reduce)')

/** A transition duration, or 0 when the reader asked for stillness. A Svelte transition ignores
 *  the query on its own, so every one of them has to pass through here.
 *
 *  The default has to stay a DEFAULT PARAMETER: callers pass computed delays, and `motion(0)` for
 *  the first item of a staggered list must be 0, which `base || 150` would turn into 150. */
export function motion(base = 150): number {
  return query.current ? 0 : base
}

/** The same answer as a boolean, for the few places that skip an animation rather than shorten it. */
export function prefersStill(): boolean {
  return query.current
}
