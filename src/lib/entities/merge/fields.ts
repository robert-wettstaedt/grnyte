/** Field rules both halves of a merge share: the sheet asks about `conflicts`, the server writes `resolved`. */

type Row = Record<string, unknown>

const empty = (value: unknown) => value == null || (typeof value === 'string' && value.trim() === '')

/** The fields where both sides hold a value and the values differ: the only ones a person is asked about. */
export function conflicts<K extends string>(survivor: Row, source: Row, keys: readonly K[]): K[] {
  return keys.filter((key) => !empty(survivor[key]) && !empty(source[key]) && survivor[key] !== source[key])
}

/** The survivor's new values: each empty field filled from the source, then the person's choices on top. */
export function resolved<K extends string>(
  survivor: Row,
  source: Row,
  keys: readonly K[],
  chosen: Partial<Record<K, unknown>>,
): Partial<Record<K, unknown>> {
  const patch: Partial<Record<K, unknown>> = {}
  for (const key of keys) {
    if (empty(survivor[key]) && !empty(source[key])) patch[key] = source[key]
    if (key in chosen) patch[key] = chosen[key]
  }
  return patch
}

/** The survivor's values before `patch`, for the history entry that records the merge's edits. */
export const before = (survivor: Row, patch: object): Row =>
  Object.fromEntries(Object.keys(patch).map((key) => [key, survivor[key]]))

/** After the survivor is picked: ask about the conflicts, or go straight to the confirmation when there are none. */
export const stepAfterPick = (asking: readonly string[]): 'confirm' | 'fields' =>
  asking.length > 0 ? 'fields' : 'confirm'
