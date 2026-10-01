<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import StatusPill from './StatusPill.svelte'

  const { Story } = defineMeta({
    component: StatusPill,
    parameters: { layout: 'padded', width: 375 },
    tags: ['autodocs'],
    title: 'Components/StatusPill',
  })
</script>

<!-- Both over the same rows, since a pill is only judged against what it floats over. -->
{#snippet rows()}
  <ul class="divide-surface-200-800 divide-y pt-2">
    {#each ['Today', 'Hidden Arete', 'Slab Dance', 'The Roof', 'Yesterday', 'Pocket Line'] as name (name)}
      <li class="py-3">{name}</li>
    {/each}
  </ul>
{/snippet}

<!-- The feed's "N new" pill: filled, because tapping it merges the queued rows. -->
<Story name="Action">
  {#snippet template()}
    <StatusPill icon="arrow-up-down" onclick={() => {}}>3 new activities</StatusPill>
    {@render rows()}
  {/snippet}
</Story>

<!-- A list still arriving, and the map while it loads: a plain surface, because it only reports. -->
<Story name="Status">
  {#snippet template()}
    <StatusPill>Loading…</StatusPill>
    {@render rows()}
  {/snippet}
</Story>
