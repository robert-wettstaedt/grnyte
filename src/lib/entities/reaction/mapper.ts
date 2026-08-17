import type { ReactionChip, ReactionListItem } from './dto'

/** A reaction as Zero syncs it: the row plus the joined reactor. */
export interface ReactionRow {
  body: string
  user?: undefined | { username: string }
  userFk: number
}

/**
 * One event's reactions, folded into its chips.
 *
 * No dedupe by person: `reactions_one_emoji_idx` is one emoji per person per event, so a second
 * row for the same pair cannot exist. The old shape needed one, because a card was several rows
 * and merging two of them could leave the same person holding the same emoji twice.
 *
 * Chips keep first-seen order rather than being sorted, so a new emoji appends instead of
 * shuffling the ones already under the reader's thumb.
 */
export function reactionChips(
  reactions: readonly ReactionListItem[],
  currentUserFk: number | undefined,
): ReactionChip[] {
  const chips = new Map<string, ReactionChip>()

  for (const reaction of reactions) {
    const chip = chips.get(reaction.emoji) ?? { count: 0, emoji: reaction.emoji, mine: false, names: [] }
    chip.count += 1
    chip.mine ||= reaction.userFk === currentUserFk
    chip.names.push(reaction.userName)
    chips.set(reaction.emoji, chip)
  }

  return [...chips.values()]
}

export function toReaction(row: ReactionRow): ReactionListItem {
  return {
    emoji: row.body,
    userFk: row.userFk,
    userName: row.user?.username ?? '',
  }
}
