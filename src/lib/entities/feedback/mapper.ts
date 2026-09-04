import type { MessageKey } from '$lib/i18n/message'
import type { FeedbackKind } from './dto'

/** Keys, never resolved copy: the inbox and the alert mail each resolve in their reader's language. */
export const FEEDBACK_KIND_KEYS: Record<FeedbackKind, MessageKey> = {
  bug: 'feedback_kindBug',
  idea: 'feedback_kindIdea',
  other: 'feedback_kindOther',
  regression: 'feedback_kindRegression',
}

/** First line of a report, shared so a list row, a push title and a mail subject cannot disagree. */
export function feedbackExcerpt(body: string, limit = 80): string {
  const firstLine = body.trim().split('\n')[0]?.trim() ?? ''
  return firstLine.length > limit ? `${firstLine.slice(0, limit - 1).trimEnd()}…` : firstLine
}
