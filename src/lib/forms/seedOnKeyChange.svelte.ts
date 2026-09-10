/**
 * Run `seed` when the identity a surface is about changes, and once when it arrives. Every add
 * and edit form on a parameterised route needs it; AGENTS.md says why, and which key to pass.
 *
 * An undefined or NaN key means "not loaded yet", never a new identity, so a row that goes away
 * and comes back does not re-seed over edits in progress.
 *
 * Known limit: a seed clears values but not Kit's issues, so an error raised for one entity can
 * still render under the next one's blank field.
 */
export function seedOnKeyChange(key: () => number | string | undefined, seed: () => void): void {
  let applied: number | string | undefined

  $effect(() => {
    const next = key()

    // `undefined` means "not loaded yet", never a new identity. A row can go away and come back
    // (Zero swaps its client on the hourly token refresh), and treating that as 5 -> undefined -> 5
    // would re-seed on the way back and silently revert whatever the reader had typed. Holding
    // `applied` across the gap is what makes the return a no-op.
    // NaN too: `Number(params.id)` on a non-numeric URL never equals `applied`, so the guard
    // would never hold and every dependency change would re-seed.
    if (next === undefined || Number.isNaN(next) || next === applied) {
      return
    }

    applied = next
    seed()
  })
}
