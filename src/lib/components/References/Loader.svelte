<script lang="ts">
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import { queries } from '$lib/db/zero'
  import type { Snippet } from 'svelte'
  import type { References as ReferencesType } from '.'
  import References from './References.svelte'

  interface Props {
    id: number
    type: 'routes' | 'blocks' | 'areas'
    children?: Snippet<[ReferencesType]>
  }
  const { children, id, type }: Props = $props()

  const areasResult = $derived(page.data.z.q(queries.listAreas({ content: `!${type}:${id}!` })))

  const ascentsResult = $derived(page.data.z.q(queries.listAscents({ notes: `!${type}:${id}!` })))

  const routesResult = $derived(
    page.data.z.q(queries.listRoutes({ content: `!${type}:${id}!`, userId: pageState.user?.id })),
  )

  const references = $derived(
    areasResult.data.length + ascentsResult.data.length + routesResult.data.length === 0
      ? null
      : ({
          areas: areasResult.data,
          ascents: ascentsResult.data,
          routes: routesResult.data,
        } as ReferencesType),
  )

  const isLoading = $derived(
    areasResult.details.type !== 'complete' ||
      ascentsResult.details.type !== 'complete' ||
      routesResult.details.type !== 'complete',
  )
</script>

{#if references == null && isLoading}
  <nav class="list-nav">
    <ul class="overflow-auto">
      <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
    </ul>
  </nav>
{:else if references != null}
  {#if children == null}
    <div class="flex p-2">
      <span class="flex-auto">
        <dt>Mentioned in</dt>

        <dd class="mt-1 flex gap-1">
          <References {references} />
        </dd>
      </span>
    </div>
  {:else}
    {@render children?.(references)}
  {/if}
{/if}
