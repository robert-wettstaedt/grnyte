<script lang="ts" generics="TOut">
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import OfflineNotice from '$lib/components/OfflineNotice/OfflineNotice.svelte'
  import SkeletonRows from '$lib/components/Skeleton/SkeletonRows.svelte'
  import StatusPill from '$lib/components/StatusPill/StatusPill.svelte'
  import { m } from '$lib/paraglide/messages.js'
  import { motion } from '$lib/state/motion.svelte'
  import type { QueryPhase, QueryResource } from '$lib/zero/resource.svelte'
  import type { Snippet } from 'svelte'
  import { fade } from 'svelte/transition'
  import { resolveFallback } from './fallback'
  import QueryError from './QueryError.svelte'

  let {
    class: className = '',
    empty,
    error,
    forceState,
    loading,
    notFound,
    ready,
    resource,
    syncing,
  }: {
    /** Classes for the ready content's column (a `gap-*`), which fills the wrapper as `flex-1`. */
    class?: string
    /** Rendered when the result is `ready` but empty (`[]` or `undefined`). */
    empty?: Snippet
    error?: Snippet
    /**
     * Dev/test override: force a branch regardless of the real resource state,
     * so the loading / error / empty UI can be eyeballed in place anywhere it's
     * used. Leave unset in real usage.
     */
    forceState?: 'empty' | 'error' | 'loading' | 'syncing'
    loading?: Snippet
    /**
     * Title for the "this entity does not exist" empty branch, which is what a detail or edit route
     * wants instead of the generic empty line. Ignored when `empty` is given.
     */
    notFound?: string
    /** Rendered once there is data to show; receives the DTO-mapped data. */
    ready: Snippet<[NonNullable<TOut>]>
    resource: QueryResource<TOut>
    /** Replaces the pinned pill while more rows are expected, e.g. with nothing when the page has its
     *  own pill. No timeout: slow and stalled look the same. */
    syncing?: Snippet
  } = $props()

  // The override bends the phase, so a story goes down the same path the app does.
  const phase: QueryPhase = $derived(
    forceState === 'empty'
      ? { empty: true, kind: 'answered' }
      : forceState === 'error'
        ? { kind: 'error' }
        : forceState === 'loading'
          ? { kind: 'loading' }
          : forceState === 'syncing'
            ? { kind: 'arriving' }
            : resource.phase,
  )

  // The one ladder every screen uses: offline ahead of loading, since offline a never-synced query
  // is stuck rather than on its way, and an empty answer ahead of loading too.
  const fallback = $derived(resolveFallback([{ notFound, phase }]))
</script>

{#if fallback.kind === 'offline'}
  <OfflineNotice excluded={fallback.excluded} />
{:else if fallback.kind === 'error'}
  {#if error}
    {@render error()}
  {:else}
    <QueryError />
  {/if}
{:else if fallback.kind === 'notFound'}
  {#if empty}
    {@render empty()}
  {:else if fallback.title != null}
    <ErrorState type="notfound" title={fallback.title} />
  {:else}
    <p class="text-surface-600-400 py-8 text-center" in:fade={{ duration: motion(150) }}>{m.queryState_empty()}</p>
  {/if}
{:else if fallback.kind === 'loading'}
  <!-- No transition: the skeleton holds its first 250 ms itself, so a fast load shows none. -->
  {#if loading}
    {@render loading()}
  {:else}
    <SkeletonRows class="py-2" />
  {/if}
{:else}
  <!-- `in` only: an out transition would keep the leaving skeleton in flow. The pill sits outside the
       caller's column, so its gap never spaces the content below a pill of no height. -->
  <div class="flex min-h-full flex-col" in:fade={{ duration: motion(150) }}>
    <!-- One flat `if`, so the pill's own transition plays when it comes and goes. -->
    {#if phase.kind === 'arriving' && syncing}
      {@render syncing()}
    {:else if phase.kind === 'arriving'}
      <StatusPill>{m.common_syncing()}</StatusPill>
    {/if}
    <div class="flex flex-1 flex-col {className}">
      {@render ready(resource.data as NonNullable<TOut>)}
    </div>
  </div>
{/if}
