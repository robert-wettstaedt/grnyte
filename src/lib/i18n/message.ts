import { m } from '$lib/paraglide/messages'
import type { Locale } from '$lib/paraglide/runtime'

/**
 * Every key paraglide compiled, as a literal union. Keys that are only known at runtime
 * narrow into it through {@link hasMessage}, so a computed key is checked once, at the point
 * it stops being a guess, rather than staying `string` all the way to the screen.
 */
export type MessageKey = keyof typeof m

/** Paraglide's own second argument. Only the locale is ever worth passing here. */
export interface MessageOptions {
  locale?: Locale
}

/** A resolved message cut into literal text and the placeholders a caller renders itself. */
export type MessageSegment = { part: string; text?: never } | { part?: never; text: string }

type MessageFn = (params?: Record<string, unknown>, options?: MessageOptions) => string

/** Whether paraglide has a message under this key, for callers that pick between candidates. */
export function hasMessage(key: string): key is MessageKey {
  return key in m
}

/**
 * Resolve a paraglide key that is only known at runtime: server-emitted form issues and the
 * activity feed's `(entityType, type, columnName)` verbs both compute their keys.
 * `options.locale` is what makes this usable off the request's ambient locale: the push cron
 * renders the SAME keys the feed card does, once per recipient, in whichever language that
 * account is written to. Omitted, it follows the ambient locale exactly as before.
 *
 * ponytail: an unknown key falls back to the key itself, so a miss shows up on screen rather
 * than blanking the copy. The type makes that unreachable for every caller but the one that
 * casts deliberately (`card.ts`, where a missing verb is meant to fail loudly).
 */
export function resolveMessage(key: MessageKey, params?: Record<string, unknown>, options?: MessageOptions): string {
  const message = (m as unknown as Record<string, MessageFn | undefined>)[key]
  return message?.(params, options) ?? key
}

/** Cannot occur in message text, so splitting on it can never cut a translation in half. */
const SENTINEL = '\u0000'

/**
 * Resolve a message, then cut it around the placeholders the caller wants to render as
 * markup rather than text. `Message.svelte` renders the pieces.
 *
 * Paraglide has no `<Trans>`: messages compile to functions returning a plain string, so
 * interpolating sentinels and splitting on them is the only way to keep a sentence whole
 * for the translator while still rendering two of its parts as markup. The word order has
 * to stay the translation's, since German puts the participle after the object ("hat die
 * Route X hinzugefügt"), which a fixed actor-verb-name markup order cannot express.
 */
export function splitMessage(
  key: MessageKey,
  params: Record<string, unknown>,
  parts: readonly string[],
): MessageSegment[] {
  const sentinels = Object.fromEntries(parts.map((part) => [part, `${SENTINEL}${part}${SENTINEL}`]))

  // Each placeholder contributes exactly two separators, so odd indices are the part names.
  return resolveMessage(key, { ...params, ...sentinels })
    .split(SENTINEL)
    .map((segment, index): MessageSegment => (index % 2 === 1 ? { part: segment } : { text: segment }))
    .filter((segment) => segment.part != null || segment.text!.length > 0)
}
