import type { CommentListItem, ReactionChip, ReactionListItem } from './dto'

/** A reaction as Zero syncs it: the row plus the joined author. */
export interface ReactionRow {
  body: string
  /** The answers, on a top-level comment. Absent on a reply and on every emoji row. */
  children?: readonly ReactionRow[]
  createdAt?: null | number
  id: number
  type: string
  user?: undefined | { username: string }
  userFk: number
}

/**
 * One event's reactions, folded into its chips.
 *
 * No dedupe by person needed: `reactions_one_emoji_idx` is one emoji per person per event, so a
 * second row for the same pair cannot exist.
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

/**
 * One comment, with its answers under it.
 *
 * The reader is a parameter rather than something the mapper reaches for, the way `toEvent` takes
 * the regions: `mine` is what the delete control reads, and it is the only field here that is
 * about who is looking rather than about the row.
 */
export function toComment(row: ReactionRow, currentUserFk: number | undefined): CommentListItem {
  const children = row.children ?? []

  return {
    authorFk: row.userFk,
    authorName: row.user?.username ?? '',
    body: row.body,
    createdAt: row.createdAt ?? 0,
    id: row.id,
    mine: row.userFk === currentUserFk,
    // Both hang off `parent_fk` and arrive through one relation, so the split is here rather than
    // in the query. See `listComments`.
    reactions: reactionChips(children.filter((child) => child.type === 'emoji').map(toReaction), currentUserFk),
    replies: children.filter((child) => child.type === 'comment').map((child) => toComment(child, currentUserFk)),
  }
}

export function toReaction(row: ReactionRow): ReactionListItem {
  return {
    emoji: row.body,
    userFk: row.userFk,
    userName: row.user?.username ?? '',
  }
}
