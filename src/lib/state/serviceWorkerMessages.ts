/**
 * The one message the worker and the page exchange, in a leaf both can import.
 *
 * `src/sw.ts` cannot import `./serviceWorker` next door, which would pull Svelte and
 * `$app/navigation` into the worker bundle, but it already crosses into `$lib` for
 * `entities/notification/push` and `images/derivatives`, so a constant with no imports of its own
 * costs the worker nothing. This replaces the same literal written out in both files with a
 * source-text test policing the pair.
 */
export const CLAIM_CHECK = 'CLAIM_CHECK'
