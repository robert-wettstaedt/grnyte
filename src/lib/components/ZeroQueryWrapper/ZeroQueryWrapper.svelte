<script lang="ts" generics="TSchema extends Schema, TTable extends keyof TSchema['tables'] & string, TReturn">
  import Error from '$lib/components/Error'
  import type { Schema } from '@rocicorp/zero'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { Query } from 'zero-svelte'
  import type { ZeroQueryWrapperProps } from '.'

  const {
    after,
    children,
    loadingIndicator,
    onLoad,
    query,
    showEmpty = false,
  }: ZeroQueryWrapperProps<TSchema, TTable, TReturn> = $props()

  const result = new Query(query)
  $effect(() => result.updateQuery(query))

  const isEmpty = $derived(Array.isArray(result.current) ? result.current.length === 0 : result.current == null)

  $effect(() => {
    if (result.details.type === 'complete') {
      onLoad?.()
    }
  })
</script>

{#if showEmpty && isEmpty && result.details.type === 'complete'}
  <Error status={404} />
{:else if loadingIndicator != null && isEmpty && result.details.type !== 'complete'}
  {#if loadingIndicator.type === 'skeleton'}
    <nav class="list-nav">
      <ul class="overflow-auto">
        {#each Array(loadingIndicator?.count ?? 10) as _}
          <li class="placeholder my-2 w-full animate-pulse {loadingIndicator.height ?? 'h-20'}"></li>
        {/each}
      </ul>
    </nav>
  {:else if loadingIndicator.type === 'spinner'}
    <div class="flex justify-center">
      <ProgressRing size={loadingIndicator.size ?? 'size-12'} value={null} />
    </div>
  {/if}
{:else}
  {@render children?.(result.current, result.details)}
{/if}

{@render after?.(result.current, result.details)}
