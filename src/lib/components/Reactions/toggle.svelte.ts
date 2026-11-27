import { toAuthor } from '$lib/entities/displayName'
import type { ReactionChip } from '$lib/entities/reaction/dto'
import { withOwnEmoji } from '$lib/entities/reaction/mapper'
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
 * A refusal is swallowed: Zero rolls back its stand-in row and the overlay drops, so the bar shows the read again.
 */
export function createReactionToggle(target: () => ReactionTarget, read: () => ReactionChip[]) {
  const global = getGlobalState()
  let busy = $state(false)
  let wanted = $state.raw<{ emoji: string | undefined; key: string }>()
  const targetKey = () => `${target().eventId}:${target().commentId ?? ''}`
  const own = $derived(
    wanted?.key === targetKey() && (busy || read().find((chip) => chip.mine)?.emoji !== wanted.emoji)
      ? wanted
      : undefined,
  )
  const name = $derived(toAuthor(global.user?.id, global.user?.username).name)
  const chips = $derived(own == null ? read() : withOwnEmoji(read(), own.emoji, name))
  $effect(() => {
    if (wanted != null && own == null) wanted = undefined
  })

  return {
    /** Whether a toggle is in flight, which is what disables the whole bar meanwhile. */
    get busy() {
      return busy
    },
    get chips() {
      return chips
    },
    async toggle(emoji: string): Promise<void> {
      if (busy) {
        return
      }

      busy = true
      const tapped = targetKey()
      wanted = { emoji: chips.some((chip) => chip.emoji === emoji && chip.mine) ? undefined : emoji, key: tapped }

      try {
        const { data: held } = await toggleReaction({ ...target(), emoji, userId: global.user?.id })
        wanted = { emoji: held ? emoji : undefined, key: tapped }
      } catch {
        wanted = undefined
      } finally {
        busy = false
      }
    },
  }
}
