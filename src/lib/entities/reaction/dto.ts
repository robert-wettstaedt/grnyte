/**
 * One emoji chip on an event: the emoji, how many people sent it, and whether you are one of them.
 *
 * Counted over one event's reactions and nothing else. The old shape had to union a card's rows
 * together, because a reaction was stored against one activity row of a card that had no id;
 * an event has one, so a chip is simply what its own rows say.
 */
export interface ReactionChip {
  count: number
  emoji: string
  /** Whether the signed-in user is one of the reactors, which is what the toggle reads. */
  mine: boolean
  /** Every reactor, in the order they arrived. What the long press popover lists. */
  names: string[]
}

/**
 * How long a comment may be, matching the `reactions_body_fits_type` CHECK.
 *
 * Stated here rather than only in the database so the composer can count down to the same number
 * the constraint enforces, instead of failing the write at 5001 characters.
 */
export const COMMENT_MAX_LENGTH = 5000

/** One comment under a card, ready to render. */
export interface CommentListItem {
  authorFk: number
  /** The author's username; empty while the user row has not synced. */
  authorName: string
  /** Markdown, with the same `!type:id!` references every description carries. */
  body: string
  createdAt: number
  id: number
  /** Whether the signed-in user wrote it, which is what the delete control reads. */
  mine: boolean
  /**
   * The emoji sent on THIS comment, already folded into chips.
   *
   * A comment is a thing people react to as much as a card is, and the table already allows it:
   * an emoji whose `parent_fk` is a comment takes its own slot in `reactions_one_emoji_idx`, so
   * one person holds one emoji per comment on top of the one they hold on the card.
   */
  reactions: ReactionChip[]
  /**
   * The answers to this comment, oldest first.
   *
   * One level, and only one: `postComment` re-points a reply to a reply at the same parent, so a
   * thread is a list of comments each with a flat list of answers rather than a tree nobody can
   * read on a phone. Empty on a reply itself.
   */
  replies: CommentListItem[]
}

/** One person's one emoji on one event. */
export interface ReactionListItem {
  emoji: string
  userFk: number
  /** The reactor's username; empty while the user row has not synced. */
  userName: string
}

/**
 * The quick row, in this order, for everyone.
 *
 * Fixed rather than recently-used: a recents row reorders, so the button under your thumb would
 * mean something different this week than last, and for five fingertip-sized targets that is how
 * the wrong one gets sent. Muscle memory is the whole point of a quick row; anything you have to
 * look at, you may as well open the picker for.
 *
 * Five distinct meanings rather than three shades of "nice": agreement, disagreement, effort,
 * impressed, and doubt. The picker behind them is the full set, so this is only what the app
 * promotes, not what it permits.
 */
export const QUICK_REACTIONS = ['👍', '👎', '💪', '🔥', '🤔'] as const

/**
 * Whether a string is exactly one emoji, as the Unicode RGI set defines one.
 *
 * `RGI_Emoji` is a property OF STRINGS, so it needs the `v` flag, and that is the point: it
 * matches a skin tone modifier and a ZWJ sequence (🧗‍♀️) as the single emoji a reader sees, which
 * `\p{Extended_Pictographic}` splits into pieces. Node 24 and every browser the app supports have
 * it.
 */
export function isEmoji(value: string): boolean {
  return /^\p{RGI_Emoji}$/v.test(value)
}

/**
 * Drop a variation selector that says what the character already says.
 *
 * The picker's data stores 152 of its emoji with a trailing U+FE0F even where the base character
 * is `Emoji_Presentation` on its own: its thumbs up is `U+1F44D U+FE0F`. RGI does not match those
 * (`Basic_Emoji` is emoji-presentation alone OR emoji-plus-FE0F, never both), so validating them
 * as sent rejects most of the picker; storing them as sent files a second chip beside the quick
 * row's identical-looking one.
 *
 * Only where it is redundant. `U+2764 U+FE0F` is a red heart and `U+2764` alone is a text glyph,
 * so stripping unconditionally would change what the reader sees.
 */
export function normalizeEmoji(value: string): string {
  return value.replaceAll(/(\p{Emoji_Presentation})\uFE0F/gu, '$1')
}
