import { createWanted } from '$lib/state/wanted.svelte'
import { isFavorited, saveCount } from './resources.powersync.svelte'
import { saveFavorite } from './writes'

export type SaveState = {
  readonly count: number
  readonly pending: boolean
  readonly saved: boolean
  toggle: () => Promise<void>
}

/**
 * Live save state for one entity. The read only sees a write once it syncs back, so the wanted state shows
 * until it does, and is dropped if the server refuses. Keyed to the entity: the page is reused across ids.
 */
export function createSaveState(
  userId: () => number | undefined,
  entityType: () => 'area' | 'block' | 'route',
  entityId: () => number,
): SaveState {
  const favorited = isFavorited(userId, entityType, entityId)
  const count = saveCount(entityType, entityId)
  const saved = createWanted(
    () => favorited.data,
    () => `${entityType()}:${entityId()}`,
  )

  return {
    // 0 (no badge) until it is whole: your own row alone read as "1".
    get count() {
      if (count.phase.kind !== 'answered') return 0
      // Only the difference the read has not seen yet: it may already hold the write, or be a tap behind.
      const unsynced = saved.unsynced
      return unsynced == null ? count.data : count.data + Number(unsynced) - Number(favorited.data)
    },
    /** Loading only, not unanswered: Zero clears `complete` on its own background-tab disconnect. */
    get pending() {
      return favorited.phase.kind === 'loading'
    },
    get saved() {
      return saved.value
    },
    toggle: async () => {
      const id = userId()
      if (id == null) {
        return
      }
      // Taken at the tap: the write may wait for an earlier one, and the page may show another entity by then.
      const favorite = { entityId: entityId(), entityType: entityType(), saved: !saved.value, userId: id }
      await saved.set(favorite.saved, () => saveFavorite(favorite))
    },
  }
}
