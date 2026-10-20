import { untrack } from 'svelte'

/** {@link seedOnKeyChange}, re-seeding on a newer `version` only while `values()` is what the last
 *  seed wrote: an edited form keeps its edits and leaves the stale save to its `known` guard. */
export function seedFollowingRows(
  key: () => number | string | undefined,
  version: () => string,
  values: () => unknown,
  seed: () => void,
): void {
  let applied: number | string | undefined
  let appliedVersion: string | undefined
  let written = ''

  $effect(() => {
    const next = key()
    const nextVersion = version()

    if (next === undefined || Number.isNaN(next) || (next === applied && nextVersion === appliedVersion)) {
      return
    }

    untrack(() => {
      const edited = next === applied && JSON.stringify(values()) !== written
      appliedVersion = nextVersion
      if (edited) return
      applied = next
      seed()
      written = JSON.stringify(values())
    })
  })
}

/**
 * Run `seed` when the identity a surface is about changes, and once when it arrives. Every add
 * and edit form on a parameterised route needs it; AGENTS.md says why, and which key to pass.
 *
 * An undefined or NaN key means "not loaded yet", never a new identity, so a row that goes away
 * and comes back does not re-seed over edits in progress.
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
