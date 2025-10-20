<script lang="ts">
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import type { Snippet } from 'svelte'
  import { Query } from 'zero-svelte'
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
  const areasResult = new Query(areasQuery)
  $effect(() => areasResult.updateQuery(areasQuery))

  const ascentsQuery = $derived(
    page.data.z.query.ascents.where('notes', 'ILIKE', `%!${type}:${id}!%`).related('author').related('route'),
  )
  // svelte-ignore state_referenced_locally
  const ascentsResult = new Query(ascentsQuery)
  $effect(() => ascentsResult.updateQuery(ascentsQuery))

  const routesQuery = $derived(
    page.data.z.query.routes
      .where('description', 'ILIKE', `%!${type}:${id}!%`)
      .related('ascents', (q) => q.where('createdBy', '=', pageState.user?.id!)),
  )
  // svelte-ignore state_referenced_locally
  const routesResult = new Query(routesQuery)
  $effect(() => routesResult.updateQuery(routesQuery))

  const references = $derived(
    areasResult.current.length + ascentsResult.current.length + routesResult.current.length === 0
      ? null
      : ({
          areas: areasResult.current,
          ascents: ascentsResult.current,
          routes: routesResult.current,
        } as ReferencesType),
  )
</script>

{#if references != null}
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
