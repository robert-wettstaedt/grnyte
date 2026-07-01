<script module lang="ts">
  import type { Grade } from '$lib/entities/grade/dto'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import GradeHistogram from './GradeHistogram.svelte'

  const { Story } = defineMeta({
    title: 'Components/GradeHistogram',
    component: GradeHistogram,
    tags: ['autodocs'],
    parameters: { layout: 'centered' },
    args: { gradingScale: 'FB' },
  })

  // The seeded Font/V grade table (5A … 9A), ids 0–21 — mirrors production, so the
  // bars pick up the same 4-tier colours as the live app.
  const grades: Grade[] = (
    [
      ['5A', 'V1'], ['5B', 'V1'], ['5C', 'V2'], ['6A', 'V3'], ['6A+', 'V3'], ['6B', 'V4'], ['6B+', 'V4'],
      ['6C', 'V5'], ['6C+', 'V5'], ['7A', 'V6'], ['7A+', 'V7'], ['7B', 'V8'], ['7B+', 'V8'], ['7C', 'V9'],
      ['7C+', 'V10'], ['8A', 'V11'], ['8A+', 'V12'], ['8B', 'V13'], ['8B+', 'V14'], ['8C', 'V15'], ['8C+', 'V16'], ['9A', 'V17'],
    ] as const
  ).map(([FB, V], id) => ({ id, FB: `FB ${FB}`, V }))

  const counts = (entries: [number, number][]) => new Map(entries)

  // A typical crag: bulk in the easy tier (6A–7A), tapering into medium, a couple hard.
  const typical = counts([[2, 1], [3, 4], [4, 6], [5, 8], [6, 7], [7, 9], [8, 6], [9, 5], [10, 3], [11, 2], [12, 1], [15, 1]])
  // Counts in every tier, so all four band colours appear at once.
  const fullRange = counts([[0, 2], [3, 5], [6, 7], [9, 6], [11, 4], [13, 3], [16, 2], [19, 1]])
  // Too few distinct grades for a chart → compact chip fallback.
  const sparse = counts([[5, 4], [8, 2]])
</script>

{#snippet template(args: ComponentProps<typeof GradeHistogram>)}
  <div style="width: 340px;">
    <GradeHistogram {...args} />
  </div>
{/snippet}

<!-- Typical distribution, coloured by the 4-tier difficulty scale (very easy → hard). -->
<Story name="Typical crag" args={{ grades, countByGrade: typical }} {template} />

<!-- Counts across every tier — shows all four band colours together. -->
<Story name="Full range" args={{ grades, countByGrade: fullRange }} {template} />

<!-- Some routes ungraded: held out of the chart and counted below it. -->
<Story name="With ungraded" args={{ grades, countByGrade: typical, ungraded: 4 }} {template} />

<!-- Too few grades for bars: falls back to compact colour-swatch chips. -->
<Story name="Sparse (chips)" args={{ grades, countByGrade: sparse }} {template} />

<!-- Same data on the V scale. -->
<Story name="V scale" args={{ grades, gradingScale: 'V', countByGrade: fullRange }} {template} />
