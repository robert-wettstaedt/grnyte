<script lang="ts" generics="TOut">
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import type { QueryResource } from '$lib/zero/resource.svelte'
  import type { Snippet } from 'svelte'
  import { fade } from 'svelte/transition'

  let {
    class: className = '',
    empty,
    error,
    forceState,
    loading,
    ready,
    resource,
  }: {
    /**
     * Extra classes for the ready wrapper. `min-h-full` only chains height while the parent
     * has a definite one, so a QueryState nested inside another one needs `flex-1` here to
     * keep filling. Without it a full-height child (the map picker) collapses to nothing.
     */
    class?: string
    /** Rendered when the result is `ready` but empty (`[]` or `undefined`). */
    empty?: Snippet
    error?: Snippet
    /**
     * Dev/test override: force a branch regardless of the real resource state,
     * so the loading / error / empty UI can be eyeballed in place anywhere it's
     * used. Leave unset in real usage.
     */
    forceState?: 'empty' | 'error' | 'loading'
    loading?: Snippet
    /** Rendered once there is data to show; receives the DTO-mapped data. */
    ready: Snippet<[NonNullable<TOut>]>
    resource: QueryResource<TOut>
  } = $props()

  const status = $derived(forceState ?? resource.status)
  const isEmpty = $derived(forceState === 'empty' || resource.isEmpty)

  // Tested ahead of the loading branch on purpose. Offline, a query with nothing in the local store
  // is *stuck* loading rather than passing through it: there is no server to move it on, so left
  // alone it is a skeleton that pulses until the tab closes.
  //
  // Which of the two messages to show is the resource's judgement now, not this component's. It is
  // the only layer that knows which query it is running and therefore whether the data is missing
  // because we chose not to keep it or because this device simply has not got it. The
  // `offlineExcluded` prop that used to carry that answer in from six call sites is gone.
  const availability = $derived(forceState == null ? resource.availability : 'ready')
</script>

{#if availability === 'excluded' || availability === 'unsynced'}
  <OfflineNotice excluded={availability === 'excluded'} />
{:else if status === 'error'}
  {#if error}
    {@render error()}
  {:else}
    <div class="card preset-tonal-error px-4 py-3 text-sm" role="alert" in:fade={{ duration: 150 }}>
      {m.queryState_error()}
    </div>
  {/if}
{:else if status === 'loading'}
  <!-- No transition: the skeleton is the first feedback on navigation, so it shows instantly. -->
  {#if loading}
    {@render loading()}
  {:else}
    <div class="space-y-4 py-4" aria-busy="true">
      <div class="placeholder animate-pulse"></div>
      <div class="placeholder animate-pulse"></div>
      <div class="placeholder animate-pulse"></div>
    </div>
  {/if}
{:else if isEmpty}
  {#if empty}
    {@render empty()}
  {:else}
    <p class="text-surface-600-400 py-8 text-center" in:fade={{ duration: 150 }}>{m.queryState_empty()}</p>
  {/if}
{:else}
  <!-- Fade the loaded content in as it replaces the skeleton. `in` only (no `out`): an out
       transition would keep the leaving skeleton in flow and jump the layout. The wrapper is
       `min-h-full flex-col` so full-height pages (sticky footers) still chain their height. -->
  <div class="flex min-h-full flex-col {className}" in:fade={{ duration: 150 }}>
    {@render ready(resource.data as NonNullable<TOut>)}
  </div>
{/if}
