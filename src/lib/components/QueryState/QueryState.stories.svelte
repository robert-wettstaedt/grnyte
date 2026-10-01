<script module lang="ts">
  import type { QueryResource } from '$lib/zero/resource.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import QueryState from './QueryState.svelte'

  const ROUTES = ['Hidden Arete', 'Slab Dance', 'The Roof']

  // Settled and complete; each story bends it through `forceState`, the same override the app has.
  const resource: QueryResource<string[]> = {
    availability: 'ready',
    data: ROUTES,
    isComplete: true,
    isEmpty: false,
    isSyncing: false,
    settled: true,
    status: 'ready',
  }

  const { Story } = defineMeta({
    component: QueryState,
    parameters: { layout: 'padded', width: 375 },
    tags: ['autodocs'],
    title: 'Components/QueryState',
  })
</script>

{#snippet list(rows: string[])}
  <ul class="divide-surface-200-800 divide-y">
    {#each rows as name (name)}
      <li class="py-3">{name}</li>
    {/each}
  </ul>
{/snippet}

<Story name="Ready">
  {#snippet template()}
    <QueryState {resource} ready={list} />
  {/snippet}
</Story>

<!-- Rows on hand while more are expected: the rows render and the affordance sits under them. -->
<Story name="Syncing">
  {#snippet template()}
    <QueryState {resource} forceState="syncing" ready={list} />
  {/snippet}
</Story>

<Story name="Loading">
  {#snippet template()}
    <QueryState {resource} forceState="loading" ready={list} />
  {/snippet}
</Story>

<Story name="Empty">
  {#snippet template()}
    <QueryState {resource} forceState="empty" ready={list} />
  {/snippet}
</Story>

<Story name="Error">
  {#snippet template()}
    <QueryState {resource} forceState="error" ready={list} />
  {/snippet}
</Story>
