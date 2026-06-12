<script lang="ts" generics="TOut">
  import { m } from '$lib/paraglide/messages.js'
  import type { QueryResource } from '$lib/zero/resource.svelte'
  import type { Snippet } from 'svelte'

  let {
    resource,
    ready,
    loading,
    error,
    empty,
  }: {
    resource: QueryResource<TOut>
    /** Rendered once there is data to show; receives the DTO-mapped data. */
    ready: Snippet<[NonNullable<TOut>]>
    loading?: Snippet
    error?: Snippet
    /** Rendered when the result is `ready` but empty (`[]` or `undefined`). */
    empty?: Snippet
  } = $props()
</script>

{#if resource.status === 'error'}
  {#if error}
    {@render error()}
  {:else}
    <div class="card preset-tonal-error px-4 py-3 text-sm" role="alert">
      {m.queryState_error()}
    </div>
  {/if}
{:else if resource.status === 'loading'}
  {#if loading}
    {@render loading()}
  {:else}
    <div class="space-y-4 py-4" aria-busy="true">
      <div class="placeholder animate-pulse"></div>
      <div class="placeholder animate-pulse"></div>
      <div class="placeholder animate-pulse"></div>
    </div>
  {/if}
{:else if resource.isEmpty}
  {#if empty}
    {@render empty()}
  {:else}
    <p class="text-surface-600-400 py-8 text-center">{m.queryState_empty()}</p>
  {/if}
{:else}
  {@render ready(resource.data as NonNullable<TOut>)}
{/if}
