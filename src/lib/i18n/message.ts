import { m } from '$lib/paraglide/messages'

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
