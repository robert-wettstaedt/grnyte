<script module lang="ts">
  import { GRADES as grades, TYPICAL_COUNTS as routeCountByGrade } from '$storybook/grades'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import GradeRange from './GradeRange.svelte'

  // Titled under the screen it belongs to, not under Components: this is a field of the map's
  // filter panel and lives in the route, unlike everything in `$lib/components`.
  const { Story } = defineMeta({
    args: { grades, gradingScale: 'FB', routeCountByGrade },
    component: GradeRange,
    parameters: { layout: 'centered', width: 300 },
    tags: ['autodocs'],
    title: 'Map/Filter/GradeRange',
  })
</script>

<!-- Full histogram + range slider, bars coloured by the 4-tier difficulty scale. -->
<Story name="Default" args={{ value: [3, 14] }} />

<!-- A narrow selection: out-of-range bars dim. -->
<Story name="Narrow selection" args={{ value: [5, 9] }} />

<!-- V-scale labels, whole range selected. -->
<Story name="V scale" args={{ gradingScale: 'V', value: [0, 21] }} />
