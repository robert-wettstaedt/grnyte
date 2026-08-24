<script lang="ts" generics="TOut">
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { isOnline } from '$lib/state/online.svelte'
  import type { QueryResource } from '$lib/zero/resource.svelte'
  import type { Snippet } from 'svelte'
  import { fade } from 'svelte/transition'

  let {
    class: className = '',
    empty,
    error,
    forceState,
    loading,
    offlineExcluded = false,
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
    /**
     * Set on resources whose data is deliberately NOT kept for offline use: events, changes,
     * reactions, and other people's ascents. See `preloadForOffline` in `$lib/zero/z.svelte` for
     * what is kept and why.
     *
     * Offline those queries never reach the server and so never leave `unknown`, which means without
     * this they sit on the loading skeleton forever and read as a broken screen. Worse is the empty
     * branch, where a caller states the absence as a fact: "no grade opinions", "no ascents", "event
     * not found". Say the data is not here, never that it does not exist.
     */
    offlineExcluded?: boolean
    /** Rendered once there is data to show; receives the DTO-mapped data. */
    ready: Snippet<[NonNullable<TOut>]>
    resource: QueryResource<TOut>
  } = $props()

  const status = $derived(forceState ?? resource.status)
  const isEmpty = $derived(forceState === 'empty' || resource.isEmpty)

  // Tested ahead of the loading branch on purpose. Offline, a query with nothing in the local store
  // is *stuck* loading rather than passing through it: `resource.svelte` reports unknown-and-empty
  // as `loading`, and without a server there is nothing to move it on. Left alone that is a skeleton
  // that pulses until the tab is closed.
  //
  // Deliberately not limited to `offlineExcluded`. Any resource can be in this state, including ones
  // that are meant to be available offline but were never synced on this device. `offlineExcluded`
  // only picks the wording: data we chose not to keep, against data that simply is not here yet.
  //
  // `loading` only, never `isEmpty`. An empty result that reached `ready` is an answer: the query
  // completed and there genuinely are no rows. Calling that "not downloaded" because the connection
  // happens to be down now is the same inversion this branch exists to prevent, running the other
  // way, and it told readers a crag they had fully synced was missing from their device.
  const unavailableOffline = $derived(!isOnline() && status === 'loading')
</script>

{#if unavailableOffline}
  <OfflineNotice excluded={offlineExcluded} />
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
