/**
 * Row identities for a repeatable remote-form field.
 *
 * A remote form addresses its values by path (`mapLayers[2].url`), so the row list is positional:
 * dropping a row from the middle shifts every row below it onto its neighbour's values unless the
 * whole list is re-seeded. This owns that, and the stable keys an `{#each}` needs to keep a removed
 * row's inputs from sliding up with it.
 *
 * `read` is the form's current values and is deliberately allowed to be sparse: a row nobody has
 * typed in yet has no entry at all, and reading it as a hole rather than as blanks is what
 * misaligns the list when an untouched row is removed.
 */
export function fieldRows<T extends Record<string, string>>(options: {
  /** Every field of an empty row. Its keys are the fields carried across a re-seed. */
  blank: T
  /** How many rows to start with, one per stored entry. */
  count: number
  read: () => (Partial<T> | undefined)[]
  write: (rows: T[]) => void
}) {
  let keys = $state(Array.from({ length: options.count }, (_, index) => index))
  let nextKey = options.count

  /** Every row's current values, one entry per key, holes filled with blanks. */
  const snapshot = (): T[] => {
    const values = options.read()

    return keys.map((_, index) => {
      const row = { ...options.blank }

      for (const key of Object.keys(options.blank) as (keyof T)[]) {
        const value = values[index]?.[key]

        if (value != null) {
          row[key] = value
        }
      }

      return row
    })
  }

  return {
    add() {
      keys = [...keys, nextKey]
      nextKey += 1
    },

    get keys() {
      return keys
    },

    remove(index: number) {
      const remaining = snapshot().filter((_, position) => position !== index)
      keys = keys.filter((_, position) => position !== index)
      options.write(remaining)
    },
  }
}
