import type { Grade } from '../src/lib/entities/grade/dto'

/**
 * The seeded Font/V grade table (5A … 9A), ids 0–21 — mirrors production, so anything
 * rendering a grade in Storybook picks up the same labels and 4-tier colours as the
 * live app. Shared by the preview decorator's global state and the stories that take
 * grades as a prop.
 */
export const GRADES: Grade[] = (
  [
    ['5A', 'V1'],
    ['5B', 'V1'],
    ['5C', 'V2'],
    ['6A', 'V3'],
    ['6A+', 'V3'],
    ['6B', 'V4'],
    ['6B+', 'V4'],
    ['6C', 'V5'],
    ['6C+', 'V5'],
    ['7A', 'V6'],
    ['7A+', 'V7'],
    ['7B', 'V8'],
    ['7B+', 'V8'],
    ['7C', 'V9'],
    ['7C+', 'V10'],
    ['8A', 'V11'],
    ['8A+', 'V12'],
    ['8B', 'V13'],
    ['8B+', 'V14'],
    ['8C', 'V15'],
    ['8C+', 'V16'],
    ['9A', 'V17'],
  ] as const
).map(([FB, V], id) => ({ FB: `FB ${FB}`, id, V }))

/**
 * Route counts keyed by grade id, the shape every grade chart takes. Two spreads cover what the
 * charts need to show, so the donut, the histogram and the map's range filter read the same
 * crag instead of each inventing one.
 */

/** A typical crag: bulk in the easy tier (6A–7A), tapering into medium, a couple hard. */
export const TYPICAL_COUNTS = new Map<number, number>([
  [2, 1],
  [3, 4],
  [4, 6],
  [5, 8],
  [6, 7],
  [7, 9],
  [8, 6],
  [9, 5],
  [10, 4],
  [11, 3],
  [12, 2],
  [13, 1],
  [15, 1],
])

/** One bucket per difficulty tier: very easy, easy, medium, hard, so all four colours show. */
export const TIER_COUNTS = new Map<number, number>([
  [1, 6],
  [5, 14],
  [12, 5],
  [17, 2],
])

/** What the charts label as the total: every graded route, before any ungraded tail. */
export const graded = (counts: ReadonlyMap<number, number>) => [...counts.values()].reduce((a, b) => a + b, 0)
