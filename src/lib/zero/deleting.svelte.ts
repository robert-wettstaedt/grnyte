import { SvelteMap } from 'svelte/reactivity'
import type { QueryPhase, QueryResource } from './resource.svelte'

/** How long a delete may take before the screen says so: the skeletons' hold, so a fast one never flashes. */
export const DELETING_HOLD_MS = 250

// Entities this client is deleting, keyed `kind:id`; `true` once the delete has outlasted the hold.
const pending = new SvelteMap<string, boolean>()

const keyOf = (kind: string, id: number) => `${kind}:${id}`

export interface HeldResource<T> extends QueryResource<T> {
  /** This client's own delete has outlasted the hold, whether or not its row has gone yet. */
  readonly deleting: boolean
}

/**
 * A detail resource that keeps its last row when that row vanishes under this client's own delete,
 * until the screen leaves: the sync drops the row before the delete's answer arrives and the
 * navigation finishes. Anyone else's delete, and a row absent from the start, still read as gone.
 */
export function holdWhileDeleting<T>(resource: QueryResource<T>, kind: string, id: () => number): HeldResource<T> {
  // Plain fields: written while rendering, where reactive state may not be. The reads below that
  // decide them (the resource, the pending map) are reactive, so a change still re-renders.
  let last: T | undefined
  let heldKey: string | undefined
  let slow = false

  const settle = () => {
    const key = keyOf(kind, id())
    const data = resource.data
    if (heldKey != null && heldKey !== key) {
      heldKey = undefined
      slow = false
    }
    if (heldKey == null) {
      if (data != null) {
        last = data
      } else if (last != null && pending.has(key)) {
        heldKey = key
      }
    }
    if (heldKey != null && pending.get(key) === true) {
      slow = true
    }
    return heldKey != null
  }

  return {
    get data() {
      return settle() ? (last as T) : resource.data
    },
    get deleting() {
      const held = settle()
      return pending.get(keyOf(kind, id())) === true || (held && slow)
    },
    get phase(): QueryPhase {
      return settle() ? { empty: false, kind: 'answered' } : resource.phase
    },
  }
}

/** Marks the entity for as long as `run` (its delete) takes. A second delete of the same entity
 *  while one runs answers an empty envelope: no snapshot, so no second toast, and no navigation. */
export async function whileDeleting<T extends object>(kind: string, id: number, run: () => Promise<T>): Promise<T> {
  const key = keyOf(kind, id)
  if (pending.has(key)) {
    return {} as T
  }
  pending.set(key, false)
  const slow = setTimeout(() => pending.has(key) && pending.set(key, true), DELETING_HOLD_MS)
  try {
    return await run()
  } finally {
    clearTimeout(slow)
    pending.delete(key)
  }
}
