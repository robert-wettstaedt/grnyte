/**
 * Shared presentational types for the entity-row primitives ({@link AreaRow},
 * {@link BlockRow}, {@link RouteRow}, {@link UserRow}). Each row component owns
 * its own `Props`; these are the leaf types those props reference.
 */

/**
 * Logged ascent state, mapped to the `--st-*` status accents. An alias of the
 * ascent entity's own type, so rows accept a `UserAscent.type` directly.
 */
export type { AscentType as AscentStatus } from '$lib/entities/ascent/dto'
