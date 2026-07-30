import { m } from '$lib/paraglide/messages'

/** A resolved message cut into literal text and the placeholders a caller renders itself. */
export type MessageSegment = { part: string; text?: never } | { part?: never; text: string }

type MessageFn = (params?: Record<string, unknown>) => string

/** Whether paraglide has a message under this key, for callers that pick between candidates. */
export function hasMessage(key: string): boolean {
  return key in m
}

/**
 * Resolve a paraglide key that is only known at runtime: server-emitted form issues and the
 * activity feed's `(entityType, type, columnName)` verbs both compute their keys.
 * ponytail: an unknown key falls back to the key itself, so a miss shows up on screen rather
 * than blanking the copy.
 */
export function resolveMessage(key: string, params?: Record<string, unknown>): string {
  const message = (m as unknown as Record<string, MessageFn | undefined>)[key]
  return message?.(params) ?? key
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
export function splitMessage(key: string, params: Record<string, unknown>, parts: readonly string[]): MessageSegment[] {
  const sentinels = Object.fromEntries(parts.map((part) => [part, `${SENTINEL}${part}${SENTINEL}`]))

  // Each placeholder contributes exactly two separators, so odd indices are the part names.
  return resolveMessage(key, { ...params, ...sentinels })
    .split(SENTINEL)
    .map((segment, index): MessageSegment => (index % 2 === 1 ? { part: segment } : { text: segment }))
    .filter((segment) => segment.part != null || segment.text!.length > 0)
}
