/**
 * Shared presentational types for the entity-row primitives ({@link AreaRow},
 * {@link BlockRow}, {@link RouteRow}, {@link UserRow}). Each row component owns
 * its own `Props`; these are the leaf types those props reference.
 */

/** Logged ascent state, mapped to the `--st-*` status accents. */
export type AscentStatus = 'flash' | 'redpoint' | 'attempt' | 'repeat'
