/**
 * The type of a name that has been through an entity's mapper.
 *
 * AGENTS.md required this by docstring and the docstring lost: a push about a nameless route
 * arrived blank while the screen it linked to read "Unnamed". A `DisplayName` slot will not take
 * `row.name`, so every consumer has to be looked at once, at build time.
 */
import { m } from '$lib/paraglide/messages'
import type { Locale } from '$lib/paraglide/runtime'

declare const brand: unique symbol

/** A name safe to render: trimmed, never empty. Assignable to `string`, but not the reverse. */
export type DisplayName = string & { readonly [brand]: 'display' }

/** For a name that is already one by construction (a username, which the schema requires).
 *  A bare cast, so keep the uses countable: a third one should catch a reviewer's eye. */
export function alreadyDisplayable(name: string): DisplayName {
  return name as DisplayName
}

/** Mint one. For mappers and the server digest; a renderer calling this holds a second opinion
 *  about what a nameless thing is called. Trimmed, because legacy rows are not. */
export function mintDisplayName(name: string, fallback: () => string): DisplayName {
  const trimmed = name.trim()
  if (trimmed.length > 0) {
    return trimmed as DisplayName
  }

  // A blank VALUE in a locale file would otherwise blank every name in one language: the i18n rule
  // checks that both files carry a key, not that either is non-empty. Loud rather than blank.
  const fallen = fallback().trim()
  if (fallen.length === 0) {
    throw new Error('mintDisplayName: fallback produced an empty name')
  }
  return fallen as DisplayName
}

/**
 * The common case: a name, or `common_unnamed`. Most entities call this directly; an entity earns
 * its own helper only by answering differently (`blockName` falls back to a position).
 *
 * Fixtures mint through the entity's own helper too, never `as DisplayName`.
 * `locale` is explicit for the push digest, which renders once per recipient.
 */
export function toDisplayName(name: string, locale?: Locale): DisplayName {
  return mintDisplayName(name, () => m.common_unnamed({}, { locale }))
}
