/**
 * Kinds in the order the form offers them. `regression` is separate because only the author can
 * tell "this worked in the old app" from a bug in something new.
 *
 * Declared here, not in `schema.ts`: the form renders it and no `.svelte` may import Drizzle.
 *
 * NEVER add a kind that reads as a safety report about the rock, and keep that framing out of the
 * labels (`bug` is "the app is not working"). Being the designated recipient of hazard reports
 * (Empfaenger von Gefahrenmeldungen) is a DAV Kommission Recht indicator for becoming the liable
 * operator of a climbing venue. The abuse route for ILLEGAL CONTENT is the opposite case: DSA
 * Art. 16 requires it, as a separate channel.
 */
export const feedbackKind: ['regression', 'bug', 'idea', 'other'] = ['regression', 'bug', 'idea', 'other']
export type FeedbackKind = (typeof feedbackKind)[number]

/** Replying is what closes a row, so there is no third state. */
export const feedbackStatus: ['open', 'closed'] = ['open', 'closed']

export interface FeedbackItem {
  /** Always set: the form is behind the auth gate. */
  authorName: string
  body: string
  /** Millis. */
  createdAt: number
  id: number
  kind: FeedbackKind
  /** Empty when not captured. */
  locale: string
  /** Empty when not captured. */
  pathname: string
  /** Millis, or undefined while the row is open. */
  repliedAt: number | undefined
  reply: string
  status: FeedbackStatus
  userAgent: string
}

export type FeedbackStatus = (typeof feedbackStatus)[number]
