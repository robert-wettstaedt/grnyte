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
