import { untrack } from 'svelte'

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

    // `undefined` means "not loaded yet", never a new identity: a Zero resource can blink out and
    // back, and re-seeding on the way back reverts what was typed. NaN too, which equals nothing.
    if (next === undefined || Number.isNaN(next) || next === applied) {
      return
    }

    applied = next
    // untrack: the seed's reads are not identity, and would wake this effect an extra time.
    untrack(seed)
  })
}
