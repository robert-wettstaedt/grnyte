import type { DisplayName } from '$lib/entities/displayName'

/**
 * "Area · Block" location breadcrumb for a block-scoped entity (route or ascent
 * row). Drops the parts that are absent so a route with no area still renders cleanly.
 *
 * It used to drop empty strings too, which was a second copy of "an empty name is not a name" and
 * did the wrong thing with it: a nameless area VANISHED from the trail rather than reading
 * "Unnamed", and a missing crumb is harder to notice than a blank one. Both fields are
 * `DisplayName` now, so absent is the only case left.
 */
export const locationCrumb = (entity: { areaName?: DisplayName; blockName?: DisplayName }): DisplayName[] =>
  // No `name is DisplayName` predicate here, deliberately. A user-defined type guard ASSERTS the
  // narrowing, so it launders a raw `string` into `DisplayName` exactly like a cast and undoes the
  // guarantee this signature is making. The inferred predicate does not.
  [entity.areaName, entity.blockName].filter((name) => name != null)
