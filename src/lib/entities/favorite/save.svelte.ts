import { notifyError } from '$lib/state/toast'
import { isFavorited, saveCount } from './resources.svelte'
import { saveFavorite } from './writes'

export type SaveState = {
  readonly count: number
  readonly pending: boolean
  readonly saved: boolean
  toggle: () => Promise<void>
}

/**
 * Live save state for one entity. The write is a Zero mutator, so the local store reflects it at
 * once and Zero reverts it if the server refuses.
 */
export function createSaveState(
  userId: () => number | undefined,
  entityType: () => 'area' | 'block' | 'route',
  entityId: () => number,
): SaveState {
  const favorited = isFavorited(userId, entityType, entityId)
  const count = saveCount(entityType, entityId)

  return {
    // 0 (no badge) until it is whole: your own preloaded row alone read as "1".
    get count() {
      return count.phase.kind === 'answered' ? count.data : 0
    },
    /** Loading only, not unanswered: Zero clears `complete` on its own background-tab disconnect. */
    get pending() {
      return favorited.phase.kind === 'loading'
    },
    get saved() {
      return favorited.data
    },
    toggle: async () => {
      const id = userId()
      if (id == null) {
        return
      }
      try {
        await saveFavorite({
          entityId: entityId(),
          entityType: entityType(),
          saved: !favorited.data,
          userId: id,
        })
      } catch (cause) {
        notifyError(cause)
      }
    },
  }
}
