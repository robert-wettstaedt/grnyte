import type { Grade } from '../src/lib/entities/grade/dto'

/**
 * The seeded Font/V grade table (3 … 9A+), ids 0–24 — mirrors production, so anything
 * rendering a grade in Storybook picks up the same labels and 4-tier colours as the
 * live app. Shared by the preview decorator's global state and the stories that take
 * grades as a prop.
 *
 * V labels repeat where Font is finer than V (6A/6A+ are both V3). That is correct, not a
 * typo: see the `grades` invariant in schema.ts.
 */
export const GRADES: Grade[] = (
  [
    ['3', 'VB'],
    ['4', 'V0'],
    ['4+', 'V0+'],
    ['5', 'V1'],
    ['5+', 'V2'],
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
    ['9A+', 'V18'],
  ] as const
).map(([FB, V], id) => ({ FB: `FB ${FB}`, id, V }))

/**
 * Route counts keyed by grade id, the shape every grade chart takes. Two spreads cover what the
 * charts need to show, so the donut, the histogram and the map's range filter read the same
 * crag instead of each inventing one.
 */

/** A typical crag: bulk in the easy tier (6A–7A), tapering into medium, a couple hard. */
export const TYPICAL_COUNTS = new Map<number, number>([
  [4, 1],
  [5, 4],
  [6, 6],
  [7, 8],
  [8, 7],
  [9, 9],
  [10, 6],
  [11, 5],
  [12, 4],
  [13, 3],
  [14, 2],
  [15, 1],
  [17, 1],
])

/** One bucket per difficulty tier: very easy, easy, medium, hard, so all four colours show. */
export const TIER_COUNTS = new Map<number, number>([
  [3, 6],
  [7, 14],
  [14, 5],
  [19, 2],
])

/** What the charts label as the total: every graded route, before any ungraded tail. */
export const graded = (counts: ReadonlyMap<number, number>) => [...counts.values()].reduce((a, b) => a + b, 0)
