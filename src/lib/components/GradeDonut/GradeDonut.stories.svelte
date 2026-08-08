<script module lang="ts">
  import { graded, TIER_COUNTS, TYPICAL_COUNTS } from '$storybook/grades'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import GradeDonut from './GradeDonut.svelte'

  const { Story } = defineMeta({
    component: GradeDonut,
    parameters: { layout: 'centered' },
    tags: ['autodocs'],
    title: 'Components/GradeDonut',
  })

  // Arcs are grouped and coloured by the 4 tiers (very easy → hard). Whatever `total`
  // exceeds the graded sum shows as a grey ungraded tail.
  const tiers = { countByGrade: TIER_COUNTS, total: graded(TIER_COUNTS) }
</script>

{#snippet template(args: ComponentProps<typeof GradeDonut>)}
  <!-- Padding, not width: the ring sizes itself, and the centered canvas would clip its edge. -->
  <div style="padding: 12px;">
    <GradeDonut {...args} />
  </div>
{/snippet}

<!-- All four difficulty tiers, sized to the ring. -->
<Story name="All tiers" args={tiers} {template} />

<!-- Typical crag: mostly easy, tapering to a couple of hard problems. -->
<Story name="Mostly easy" args={{ countByGrade: TYPICAL_COUNTS, total: graded(TYPICAL_COUNTS) }} {template} />

<!-- Some routes ungraded: the grey tail arc fills the remainder of the ring. -->
<Story name="With ungraded" args={{ ...tiers, total: tiers.total + 8 }} {template} />

<!-- Larger diameter (e.g. an area header vs a map marker). -->
<Story name="Large" args={{ ...tiers, size: 96 }} {template} />
