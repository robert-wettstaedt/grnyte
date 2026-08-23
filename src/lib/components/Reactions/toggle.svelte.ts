import { toggleReaction } from '$lib/entities/reaction/reactions.remote'

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
 * The failure is swallowed because nothing changed: a chip is drawn from synced rows, so a refused
 * toggle leaves the bar exactly as the reader found it. Rethrowing would only reach `window.onerror`.
 */
export function createReactionToggle(target: () => ReactionTarget) {
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

      // No optimistic write: the chip arrives back through Zero like every other read in the app,
      // and reconciling a local guess against that sync is more machinery than one round trip is
      // worth. Disabling the bar meanwhile is what stops it reading as broken.
      busy = true

      try {
        await toggleReaction({ ...target(), emoji })
      } catch {
        // See above: the bar is unchanged, so there is nothing to tell the reader about.
      } finally {
        busy = false
      }
    },
  }
}
