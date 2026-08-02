<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import ActivityFilters from './ActivityFilters.svelte'
  import { ME } from './fixtures'

  const { Story } = defineMeta({
    component: ActivityFilters,
    parameters: { backgrounds: { value: 'root' }, layout: 'padded' },
    tags: ['autodocs'],
    title: 'Components/ActivityFeed/ActivityFilters',
  })

  const regions = [
    { name: 'Frankenjura', regionFk: 1 },
    { name: 'Ticino', regionFk: 2 },
  ]
</script>

{#snippet template(args: ComponentProps<typeof ActivityFilters>)}
  <div style="width: 420px; max-width: 100%; margin: 0 auto;">
    <ActivityFilters {...args} />
  </div>
{/snippet}

<!-- Two regions: the current one reads out next to the filter button. -->
<Story name="Default" args={{ currentUserFk: ME, regions }} {template} />

<!-- One region is nothing to choose between, so the region controls stay hidden. -->
<Story name="Single region" args={{ currentUserFk: ME, regions: regions.slice(0, 1) }} {template} />

<Story name="Ascents only" args={{ category: 'ascent', currentUserFk: ME, regions }} {template} />

<!-- Narrowed: a removable chip per filter, so a filtered feed never reads as an empty one. -->
<Story name="Filtered" args={{ currentUserFk: ME, regionFk: 2, regions, userFk: ME }} {template} />
