import { dev } from '$app/environment'
import { tick, untrack } from 'svelte'

// In-flight `seedForm` calls. Global because a field's issues reach their wrapper without the form.
let seeding = $state(0)

/**
 * Issue renderers hold back while a seed runs: a reopened form mounts with the last open's. It hides
 * every form's issues, so seed only as a form mounts, or a live error elsewhere is re-announced.
 */
export const isSeeding = (): boolean => seeding > 0

/**
 * Seed a remote form and drop the issues an earlier entity or open left on its singleton. Kit
 * clears issues only on a `reset` event; this one is cancelled, so Svelte's `bind:` inputs keep
 * their state, and the seed is written again because Kit rebuilds its values from what is rendered.
 */
export async function seedForm<Values>(
  form: {
    readonly element: HTMLFormElement | null
    fields: { allIssues: () => undefined | unknown[]; set: (values: Values) => unknown }
  },
  values: Values,
): Promise<void> {
  form.fields.set(values)
  // Untracked: called from an effect, reading the count it writes would re-run that effect.
  untrack(() => (seeding += 1))
  try {
    // The form can mount in the same flush as the seed, before Kit is listening on it.
    await tick()
    const element = form.element
    if (element?.isConnected !== true) return

    const reset = new Event('reset', { cancelable: true })
    element.dispatchEvent(reset)
    // After the dispatch on purpose: Svelte's bindings read `defaultPrevented` a microtask later.
    reset.preventDefault()
    // In async mode a tick is a frame; this one is queued behind Kit's, so the write lands last.
    await tick()
    form.fields.set(values)
    if (dev && (form.fields.allIssues()?.length ?? 0) > 0) {
      console.warn('seedForm: Kit kept its issues through a cancelled reset, so stale errors will show')
    }
  } finally {
    seeding -= 1
  }
}

/**
 * Run `seed` when the identity a surface is about changes, and once when it arrives. Every add
 * and edit form on a parameterised route needs it; AGENTS.md says why, and which key to pass.
 *
 * An undefined or NaN key means "not loaded yet", never a new identity, so a row that goes away
 * and comes back does not re-seed over edits in progress.
 *
 * A plain `fields.set` seed leaves Kit's issues behind; seed through `seedForm` to drop them.
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
