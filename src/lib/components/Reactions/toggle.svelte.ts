import { toggleReaction } from '$lib/entities/reaction/writes'
import { getGlobalState } from '$lib/state/global.svelte'

/** What a reaction hangs off: an event, or one comment under it. */
export interface ReactionTarget {
  /** The comment, when the reaction is on what somebody SAID rather than on the card. */
  commentId?: number
  eventId: number
}

/**
 * Send, change or clear one emoji on one target, one at a time.
 *
 * The guard is per TARGET rather than per emoji, which is the whole reason this is a module rather
 * than eight lines in each bar: `reactions_one_emoji_idx` allows one row per person per target, so
 * two emoji tapped in quick succession are two handlers racing over one slot, and a per-emoji guard
 * would let that race through (both find nothing to clear, both insert, the second hits the index).
 *
 * The failure is swallowed because nothing changed: Zero rolls a refused toggle's local flip back,
 * so the bar is left exactly as the reader found it. Rethrowing would only reach `window.onerror`.
 */
export function createReactionToggle(target: () => ReactionTarget) {
  const global = getGlobalState()
  let busy = $state(false)

  return {
    /** Whether a toggle is in flight, which is what disables the whole bar meanwhile. */
    get busy() {
      return busy
    },
    async toggle(emoji: string): Promise<void> {
      if (busy) {
        return
      }

      // The chip flips locally at once; the bar stays disabled until the server answers, so a
      // second tap cannot race the first over the one slot.
      busy = true

      try {
        await toggleReaction({ ...target(), emoji, userId: global.user?.id })
      } catch {
        // See above: the bar is unchanged, so there is nothing to tell the reader about.
      } finally {
        busy = false
      }
    },
  }
}
