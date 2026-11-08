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
  const key = () => `${entityType()}:${entityId()}`
  let wanted = $state.raw<{ key: string; saved: boolean }>()
  // Held while writes are out: a second tap can agree with the stale read before the first write syncs back.
  let writing = $state(0)
  const unsynced = $derived(
    wanted?.key === key() && (writing > 0 || wanted.saved !== favorited.data) ? wanted.saved : undefined,
  )
  // Dropped once the read agrees: kept, it would resurface when another device later flips the same save.
  $effect(() => {
    if (wanted != null && unsynced == null) wanted = undefined
  })

  return {
    // 0 (no badge) until it is whole: your own row alone read as "1".
    get count() {
      if (count.phase.kind !== 'answered') return 0
      // Only the difference the read has not seen yet: it may already hold the write, or be a tap behind.
      return unsynced == null ? count.data : count.data + Number(unsynced) - Number(favorited.data)
    },
    /** Loading only, not unanswered: Zero clears `complete` on its own background-tab disconnect. */
    get pending() {
      return favorited.phase.kind === 'loading'
    },
    get saved() {
      return unsynced ?? favorited.data
    },
    toggle: async () => {
      const id = userId()
      if (id == null) {
        return
      }
      const next = { key: key(), saved: !(unsynced ?? favorited.data) }
      wanted = next
      writing++
      try {
        await saveFavorite({ entityId: entityId(), entityType: entityType(), saved: next.saved, userId: id })
      } catch (cause) {
        if (wanted === next) wanted = undefined
        notifyError(cause)
      } finally {
        writing--
      }
    },
  }
}
