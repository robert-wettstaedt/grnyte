<script
  lang="ts"
  generics="TTable extends keyof Schema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TReturn = PullRow<TTable, Schema>,
  TContext = DefaultContext"
>
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import type { Schema } from '$lib/db/zero/zero-schema'
  import type { DefaultContext, PullRow } from '@rocicorp/zero'
  import type { ReadonlyJSONValue } from 'drizzle-zero'
  import type { ZeroQueryWrapperProps } from '.'

  const {
    after,
    children,
    loadingIndicator,
    onLoad,
    query,
    showEmpty = false,
  }: ZeroQueryWrapperProps<TTable, TInput, TOutput, TReturn, TContext> = $props()

  const result = $derived(page.data.z.q(query))
  const isEmpty = $derived(Array.isArray(result.data) ? result.data.length === 0 : result.data == null)

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
    <LoadingIndicator class="flex justify-center" size={12} />
  {/if}
{:else}
  {@render children?.(result.data, result.details)}
{/if}

{@render after?.(result.data, result.details)}
