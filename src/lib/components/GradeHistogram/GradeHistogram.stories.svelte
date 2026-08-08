<script module lang="ts">
  import { GRADES as grades, TIER_COUNTS, TYPICAL_COUNTS } from '$storybook/grades'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import GradeHistogram from './GradeHistogram.svelte'

  const { Story } = defineMeta({
    args: { countByGrade: TYPICAL_COUNTS, grades, gradingScale: 'FB' },
    component: GradeHistogram,
    parameters: { layout: 'centered', width: 340 },
    tags: ['autodocs'],
    title: 'Components/GradeHistogram',
  })

  // Too few distinct grades for a chart → compact chip fallback.
  const sparse = new Map<number, number>([
    [5, 4],
    [8, 2],
  ])
</script>

<!-- Typical distribution, coloured by the 4-tier difficulty scale (very easy → hard). -->
<Story name="Typical crag" />

<!-- One bucket per tier — shows all four band colours with nothing in between. -->
<Story name="Full range" args={{ countByGrade: TIER_COUNTS }} />

<!-- Some routes ungraded: held out of the chart and counted below it. -->
<Story name="With ungraded" args={{ ungraded: 4 }} />

<!-- Too few grades for bars: falls back to compact colour-swatch chips. -->
<Story name="Sparse (chips)" args={{ countByGrade: sparse }} />

<!-- Same data on the V scale. -->
<Story name="V scale" args={{ gradingScale: 'V' }} />
