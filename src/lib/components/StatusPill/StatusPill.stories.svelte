<script module lang="ts">
  import type { PillOffer } from '$lib/state/pill.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import StatusPill from './StatusPill.svelte'

  const { Story } = defineMeta({
    component: StatusPill,
    parameters: { layout: 'padded', width: 375 },
    tags: ['autodocs'],
    title: 'Components/StatusPill',
  })

  const placement = 'sticky top-2 z-20 h-0'
  const status: PillOffer = { kind: 'status', label: 'Loading…' }
  const action: PillOffer = { icon: 'arrow-up-down', kind: 'action', label: '3 new activities', onclick: () => {} }
  const dismiss: PillOffer = {
    announcement: 'Map shows matches for Rubber Gun',
    dismissLabel: 'Clear search',
    icon: 'search',
    kind: 'dismiss',
    label: 'Rubber Gun',
    ondismiss: () => {},
  }
</script>

<script lang="ts">
  let morphed = $state(false)
</script>

<!-- Every story over the same rows, since a pill is only judged against what it floats over. -->
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
    <StatusPill class={placement} content={action} />
    {@render rows()}
  {/snippet}
</Story>

<!-- A screen still syncing, or the map while it loads: a plain surface, because it only reports. -->
<Story name="Status">
  {#snippet template()}
    <StatusPill class={placement} content={status} />
    {@render rows()}
  {/snippet}
</Story>

<!-- A search narrowing the map under a detail sheet: quiet, and only the clear button acts. -->
<Story name="Dismiss">
  {#snippet template()}
    <StatusPill class={placement} content={dismiss} />
    {@render rows()}
  {/snippet}
</Story>

<!-- New activity arriving mid-sync: one box resizing and crossfading, never two pills. -->
<Story name="Status to action">
  {#snippet template()}
    <StatusPill class={placement} content={morphed ? action : status} />
    {@render rows()}
    <button type="button" class="btn preset-outlined-surface-200-800 mt-4" onclick={() => (morphed = !morphed)}>
      Toggle
    </button>
  {/snippet}
</Story>
