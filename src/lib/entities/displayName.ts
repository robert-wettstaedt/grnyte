/**
 * The type of a name that has been through an entity's mapper.
 *
 * AGENTS.md has stated for a while that an entity's display name comes from its mapper and nowhere
 * else, and that an entity must never render as an empty string. It was enforced by docstring, and
 * the docstring lost. The record, because the shape of the failure is the argument for the type:
 * `digest.server.ts` was written at 395d902a with all five names read straight off the row, and
 * `routeDisplayName` already existed at that commit and was simply not reached for. One day later
 * 08060e56, a commit about the search bar, extracted `blockName` out of the block mapper, gave it
 * a `locale` parameter and wired it into the digest, all three together. The block line was fixed
 * because somebody happened to be editing both files. The rest never were, and a month afterwards
 * 2ce32593 factored the helpers out properly without looking at the digest. Of those four, `user`
 * was never a defect: a username is required by the schema, which is why it takes
 * `alreadyDisplayable` below rather than a mint. So three were.
 *
 * The three entities were in three different states at 395d902a, which is what settles it: routes
 * had `routeDisplayName` as a named helper, already called two functions below in the same file;
 * blocks had the fallback inlined in the mapper with nothing to call; areas had neither. So the
 * digest had exactly one reusable helper within reach and wrote `row.name` regardless. And when
 * the author did meet the locale problem, at 08060e56, they added the parameter in the same commit
 * while already editing the digest, so a missing parameter cannot explain leaving routes raw: the
 * identical one-line fix was demonstrably made, for another entity, in that same change.
 *
 * The sharpest version of it: `routeDisplayName`'s docstring at 395d902a already read "the swap
 * happens here so nothing downstream ever sees the empty string", and that same commit created the
 * downstream that did. The sentence was true when written and false by the end of its own commit.
 *
 * So this is not carelessness at one call site; it is a call site nobody had a reason to revisit,
 * which is exactly what a docstring cannot sweep and a type can. A `DisplayName` slot will not
 * take `row.name`, so every existing consumer has to be looked at once, at build time.
 *
 * Its own module one level above the entity folders, for the reason `route/name.ts` gives for
 * sitting beside its mapper rather than in it: a helper several mappers need cannot live inside any
 * one of them.
 */
import { m } from '$lib/paraglide/messages'
import type { Locale } from '$lib/paraglide/runtime'

declare const brand: unique symbol

/**
 * A name safe to render: trimmed, and never empty.
 *
 * Assignable TO a string, so every renderer keeps working untouched, but a plain string is not
 * assignable to it, which is the whole mechanism.
 */
export type DisplayName = string & { readonly [brand]: 'display' }

/**
 * For a name that is already one by construction: a username, which the schema requires, or a
 * string a mapper has already resolved. Deliberately noisy to write, so it reads as a claim.
 *
 * The residual risk in this module, stated rather than defended: this is a bare cast with no
 * check, so it launders a blank string as happily as a good one, and its name invites "I am sure
 * this one is fine", which is the assumption that failed in the first place. It cannot be
 * constrained while it stays exported, and it has to stay exported because two modules use it.
 * The control is that there are exactly two uses, and a third should catch a reviewer's eye.
 */
export function alreadyDisplayable(name: string): DisplayName {
  return name as DisplayName
}

/**
 * Mint one. For mappers, and the digest that has to build the same names on the server; a renderer
 * calling this is a renderer holding a second opinion about what a nameless thing is called, which
 * is the thing AGENTS.md forbids.
 *
 * Trimmed rather than length-checked: names are trimmed on write,
 * imported and legacy rows are not, and a whitespace name renders as a blank link exactly like an
 * empty one.
 */
export function mintDisplayName(name: string, fallback: () => string): DisplayName {
  const trimmed = name.trim()
  if (trimmed.length > 0) {
    return trimmed as DisplayName
  }

  // The one way the type above could lie. `fallback` is arbitrary, so a caller passing `() => ''`
  // mints precisely the value the brand exists to exclude. What actually fires this is a blank
  // VALUE in a locale file: the i18n rule checks that both files carry a key, not that either is
  // non-empty, so a translation typo would otherwise blank every route name in one language.
  // Loud rather than blank, and it is loud: mappers run inside `$derived`, so this takes a
  // component tree down rather than showing one empty label. That is the right trade here.
  const fallen = fallback().trim()
  if (fallen.length === 0) {
    throw new Error('mintDisplayName: fallback produced an empty name')
  }
  return fallen as DisplayName
}

/**
 * A note for fixtures, because this is where the type is most likely to be fought rather than used:
 * a story or a test that builds a DTO by hand mints through the entity's own helper, exactly like
 * production. Never `as DisplayName`. The cast compiles and teaches the next author to reach for
 * it, which is worse than not having the brand at all, and a fixture that bypasses the rule is a
 * fixture that cannot show the nameless case. Several story files hand-build the same crag
 * ancestor; a shared factory would be the better answer to that and is not this change's job.
 */

/**
 * The common case: a name, or `common_unnamed` when there is not one. Most entities want exactly
 * this, so they call it directly rather than owning a one-line helper that forwards to it.
 *
 * `routeDisplayName` and `areaDisplayName` were two such helpers and are gone. They predate this
 * module and were pure pass-throughs by the end, which also retired `route/name.ts`: that file
 * existed only to keep `topo/mapper.ts` from closing an import cycle back through
 * `route/mapper.ts`, and nothing can cycle through here, because this module imports only
 * paraglide. `blockName` and `regionDisplayName` stay: they answer the question differently, with
 * a position and with a syncing state, which is what earns an entity its own helper.
 *
 * `locale` is explicit for the push digest, which renders once per recipient rather than in the
 * reader's own session.
 */
export function toDisplayName(name: string, locale?: Locale): DisplayName {
  return mintDisplayName(name, () => m.common_unnamed({}, { locale }))
}
