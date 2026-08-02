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
