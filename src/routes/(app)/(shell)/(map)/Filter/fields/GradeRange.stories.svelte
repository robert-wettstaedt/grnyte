<script module lang="ts">
  import type { Grade } from '$lib/entities/grade/dto'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import GradeRange from './GradeRange.svelte'

  const { Story } = defineMeta({
    title: 'Components/GradeRange',
    component: GradeRange,
    tags: ['autodocs'],
    parameters: { layout: 'centered' },
    args: { gradingScale: 'FB' },
  })

  // The seeded Font/V grade table (5A … 9A), ids 0–21 — mirrors production.
  const grades: Grade[] = (
    [
      ['5A', 'V1'], ['5B', 'V1'], ['5C', 'V2'], ['6A', 'V3'], ['6A+', 'V3'], ['6B', 'V4'], ['6B+', 'V4'],
      ['6C', 'V5'], ['6C+', 'V5'], ['7A', 'V6'], ['7A+', 'V7'], ['7B', 'V8'], ['7B+', 'V8'], ['7C', 'V9'],
      ['7C+', 'V10'], ['8A', 'V11'], ['8A+', 'V12'], ['8B', 'V13'], ['8B+', 'V14'], ['8C', 'V15'], ['8C+', 'V16'], ['9A', 'V17'],
    ] as const
  ).map(([FB, V], id) => ({ id, FB: `FB ${FB}`, V }))

  // A spread of route counts so the mini-histogram above the slider has shape.
  const routeCountByGrade = new Map<number, number>([
    [2, 1], [3, 4], [4, 6], [5, 8], [6, 7], [7, 9], [8, 6], [9, 5], [10, 4], [11, 3], [12, 2], [13, 1], [15, 1],
  ])
</script>

{#snippet template(args: ComponentProps<typeof GradeRange>)}
  <div style="width: 300px;">
    <GradeRange {...args} />
  </div>
{/snippet}

<!-- Full histogram + range slider, bars coloured by the 4-tier difficulty scale. -->
<Story name="Default" args={{ grades, routeCountByGrade, value: [3, 14] }} {template} />

<!-- A narrow selection: out-of-range bars dim. -->
<Story name="Narrow selection" args={{ grades, routeCountByGrade, value: [5, 9] }} {template} />

<!-- V-scale labels, whole range selected. -->
<Story name="V scale" args={{ grades, gradingScale: 'V', routeCountByGrade, value: [0, 21] }} {template} />
