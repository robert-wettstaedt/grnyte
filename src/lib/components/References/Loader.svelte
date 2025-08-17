<script lang="ts">
  import { page } from '$app/state'
  import type { References as ReferencesType } from '$lib/references.server'
  import type { Snippet } from 'svelte'
  import { Query } from 'zero-svelte'
  import { pageState } from '$lib/components/Layout'
  import References from './References.svelte'

  interface Props {
    id: number
    type: 'routes' | 'blocks' | 'areas'
    children?: Snippet<[ReferencesType]>
  }
  const { children, id, type }: Props = $props()

  const areas = $derived(new Query(page.data.z.current.query.areas.where('description', 'ILIKE', `%!${type}:${id}!%`)))

  const ascents = $derived(
    new Query(
      page.data.z.current.query.ascents.where('notes', 'ILIKE', `%!${type}:${id}!%`).related('author').related('route'),
    ),
  )

  const routes = $derived(
    new Query(
      page.data.z.current.query.routes
        .where('description', 'ILIKE', `%!${type}:${id}!%`)
        .related('ascents', (q) => q.where('createdBy', '=', pageState.user?.id!)),
    ),
  )

  const references = $derived(
    areas.current.length + ascents.current.length + routes.current.length === 0
      ? null
      : ({
          areas: areas.current,
          ascents: ascents.current,
          routes: routes.current,
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
