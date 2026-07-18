<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import AreaRow from './AreaRow.svelte'

  const { Story } = defineMeta({
    component: AreaRow,
    parameters: {
      layout: 'centered',
    },
    tags: ['autodocs'],
    title: 'Components/EntityRow/AreaRow',
  })

  // Route counts keyed by grade id; ids span the amber → red → purple bands.
  const countByGrade = new Map<number, number>([
    [3, 6],
    [5, 9],
    [9, 12],
    [12, 7],
    [16, 5],
    [18, 3],
  ])
</script>

{#snippet template(args: ComponentProps<typeof AreaRow>)}
  <div style="width: 360px;">
    <AreaRow {...args} />
  </div>
{/snippet}

<Story
  name="Default"
  args={{
    countByGrade,
    name: 'Roadside',
    region: 'Frankenjura',
    total: 42,
  }}
  {template}
/>

<Story name="As link" args={{ countByGrade, href: '#', name: 'Roadside', total: 42 }} {template} />
