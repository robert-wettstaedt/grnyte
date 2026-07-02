<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import GradeDonut from './GradeDonut.svelte'

  const { Story } = defineMeta({
    title: 'Components/GradeDonut',
    component: GradeDonut,
    tags: ['autodocs'],
    parameters: { layout: 'centered' },
  })

  // Route counts keyed by grade id; arcs are grouped and coloured by the 4 tiers
  // (very easy → hard). Whatever `total` exceeds the graded sum shows as a grey
  // ungraded tail.
  const counts = (entries: [number, number][]) => new Map(entries)
  const sum = (map: Map<number, number>) => [...map.values()].reduce((a, b) => a + b, 0)

  // One arc per tier: very easy (id 1), easy (5), medium (12), hard (17).
  const allTiers = counts([
    [1, 6],
    [5, 14],
    [12, 5],
    [17, 2],
  ])
  // Skewed to the easy end, as a typical crag looks.
  const mostlyEasy = counts([
    [2, 3],
    [4, 12],
    [6, 9],
    [9, 4],
    [11, 1],
  ])
</script>

{#snippet template(args: ComponentProps<typeof GradeDonut>)}
  <div style="padding: 12px;">
    <GradeDonut {...args} />
  </div>
{/snippet}

<!-- All four difficulty tiers, sized to the ring. -->
<Story name="All tiers" args={{ countByGrade: allTiers, total: sum(allTiers) }} {template} />

<!-- Typical crag: mostly easy, tapering to a couple of hard problems. -->
<Story name="Mostly easy" args={{ countByGrade: mostlyEasy, total: sum(mostlyEasy) }} {template} />

<!-- Some routes ungraded: the grey tail arc fills the remainder of the ring. -->
<Story name="With ungraded" args={{ countByGrade: allTiers, total: sum(allTiers) + 8 }} {template} />

<!-- Larger diameter (e.g. an area header vs a map marker). -->
<Story name="Large" args={{ countByGrade: allTiers, total: sum(allTiers), size: 96 }} {template} />
