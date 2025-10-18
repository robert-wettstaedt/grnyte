<script lang="ts">
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import type { Snippet } from 'svelte'
  import type { References as ReferencesType } from '.'
  import References from './References.svelte'

  interface Props {
    id: number
    type: 'routes' | 'blocks' | 'areas'
    children?: Snippet<[ReferencesType]>
  }
  const { children, id, type }: Props = $props()

  const areasQuery = $derived(page.data.z.query.areas.where('description', 'ILIKE', `%!${type}:${id}!%`))
  // svelte-ignore state_referenced_locally
  const areasResult = page.data.z.createQuery(areasQuery)
  $effect(() => areasResult.updateQuery(areasQuery))

  const ascentsQuery = $derived(
    page.data.z.query.ascents.where('notes', 'ILIKE', `%!${type}:${id}!%`).related('author').related('route'),
  )
  // svelte-ignore state_referenced_locally
  const ascentsResult = page.data.z.createQuery(ascentsQuery)
  $effect(() => ascentsResult.updateQuery(ascentsQuery))

  const routesQuery = $derived(
    page.data.z.query.routes
      .where('description', 'ILIKE', `%!${type}:${id}!%`)
      .related('ascents', (q) => q.where('createdBy', '=', pageState.user?.id!)),
  )
  // svelte-ignore state_referenced_locally
  const routesResult = page.data.z.createQuery(routesQuery)
  $effect(() => routesResult.updateQuery(routesQuery))

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
