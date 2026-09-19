import type { DisplayName } from '$lib/entities/displayName'

/**
 * "Area · Block" location breadcrumb for a block-scoped entity (route or ascent
 * row). Drops the parts that are absent so a route with no area still renders cleanly.
 *
 * It used to drop empty strings too, which made a nameless area vanish from the trail rather than
 * read "Unnamed". Both fields are `DisplayName` now, so absent is the only case left.
 */
export const locationCrumb = (entity: { areaName?: DisplayName; blockName?: DisplayName }): DisplayName[] =>
  // No `name is DisplayName` predicate: a user-defined guard ASSERTS the narrowing, laundering a
  // raw string exactly like a cast.
  [entity.areaName, entity.blockName].filter((name) => name != null)
