<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import { GRADES as grades } from '../../../../.storybook/grades'
  import GradeHistogram from './GradeHistogram.svelte'

  const { Story } = defineMeta({
    args: { gradingScale: 'FB' },
    component: GradeHistogram,
    parameters: { layout: 'centered' },
    tags: ['autodocs'],
    title: 'Components/GradeHistogram',
  })

  const counts = (entries: [number, number][]) => new Map(entries)

  // A typical crag: bulk in the easy tier (6A–7A), tapering into medium, a couple hard.
  const typical = counts([
    [2, 1],
    [3, 4],
    [4, 6],
    [5, 8],
    [6, 7],
    [7, 9],
    [8, 6],
    [9, 5],
    [10, 3],
    [11, 2],
    [12, 1],
    [15, 1],
  ])
  // Counts in every tier, so all four band colours appear at once.
  const fullRange = counts([
    [0, 2],
    [3, 5],
    [6, 7],
    [9, 6],
    [11, 4],
    [13, 3],
    [16, 2],
    [19, 1],
  ])
  // Too few distinct grades for a chart → compact chip fallback.
  const sparse = counts([
    [5, 4],
    [8, 2],
  ])
</script>

{#snippet template(args: ComponentProps<typeof GradeHistogram>)}
  <div style="width: 340px;">
    <GradeHistogram {...args} />
  </div>
{/snippet}

<!-- Typical distribution, coloured by the 4-tier difficulty scale (very easy → hard). -->
<Story name="Typical crag" args={{ countByGrade: typical, grades }} {template} />

<!-- Counts across every tier — shows all four band colours together. -->
<Story name="Full range" args={{ countByGrade: fullRange, grades }} {template} />

<!-- Some routes ungraded: held out of the chart and counted below it. -->
<Story name="With ungraded" args={{ countByGrade: typical, grades, ungraded: 4 }} {template} />

<!-- Too few grades for bars: falls back to compact colour-swatch chips. -->
<Story name="Sparse (chips)" args={{ countByGrade: sparse, grades }} {template} />

<!-- Same data on the V scale. -->
<Story name="V scale" args={{ countByGrade: fullRange, grades, gradingScale: 'V' }} {template} />
