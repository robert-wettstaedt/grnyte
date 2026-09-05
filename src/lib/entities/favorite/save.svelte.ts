import { toggleFavorite } from './favorites.remote'
import { isFavorited, saveCount } from './resources.svelte'

export type SaveState = {
  readonly count: number
  readonly pending: boolean
  readonly saved: boolean
  toggle: () => Promise<void>
}

/**
 * Live save state for one entity. The write is a remote command, not a Zero mutator, so it never
 * reflects optimistically: `override` pins the user's intent until the write syncs back.
 */
export function createSaveState(
  userId: () => number | undefined,
  entityType: () => 'area' | 'block' | 'route',
  entityId: () => number,
): SaveState {
  const favorited = isFavorited(userId, entityType, entityId)
  const count = saveCount(entityType, entityId)

  let override = $state<boolean | undefined>(undefined)
  const saved = $derived(override ?? favorited.data)

  return {
    // The synced count already includes the user's own row, so only an unconverged override moves it.
    get count() {
      if (override == null || override === favorited.data) {
        return count.data
      }
      return override ? count.data + 1 : count.data - 1
    },
    /** `availability`, not `isSyncing`: Zero clears `complete` on its own background-tab disconnect. */
    get pending() {
      return favorited.availability === 'loading'
    },
    get saved() {
      return saved
    },
    toggle: async () => {
      const next = !saved
      override = next
      try {
        const result = await toggleFavorite({ entityId: entityId(), entityType: entityType() })
        override = result?.data ?? next
      } catch {
        override = !next
      }
    },
  }
}
