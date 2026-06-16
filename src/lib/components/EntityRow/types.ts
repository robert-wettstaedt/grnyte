/**
 * Shared presentational types for the entity-row primitives ({@link AreaRow},
 * {@link BlockRow}, {@link RouteRow}, {@link UserRow}). Each row component owns
 * its own `Props`; these are the leaf types those props reference. Grades arrive
 * already resolved to a display string plus a heat {@link GradeBand}, so a row
 * stays decoupled from the app's grading scale.
 */

/** Difficulty band of the shared grade heat scale (1 = easy → 7 = hard). */
export type GradeBand = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** Logged ascent state, mapped to the `--st-*` status accents. */
export type AscentStatus = 'flash' | 'redpoint' | 'attempt' | 'repeat'
