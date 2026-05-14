<script lang="ts">
  import { page } from '$app/state'
  import Image from '$lib/components/Image'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import { queries, type RowWithRelations } from '$lib/db/zero'
  import type { Snippet } from 'svelte'

  interface Props {
    description?: Snippet
    route: RowWithRelations<'routes', { block: true }>
    showPath?: boolean
  }

  const { description, route, showPath = false }: Props = $props()

  const block = $derived(route.block as RowWithRelations<'blocks', { area: true }> | undefined)

  const favoritesResult = $derived(
    page.data.z.q(queries.favorites({ entity: { type: 'route', id: String(route.id) } })),
  )
  const byUser = $derived(favoritesResult.data.some((fav) => fav.authUserFk === page.data.authUserId))
</script>

<div class="flex gap-2">
  <div class="relative">
    <Image path="/blocks/{block?.id}/preview-image" size={64} />

    {#if favoritesResult.data.length > 0}
      <div class="absolute top-1 left-1">
        <i class="fa-solid fa-heart {byUser ? 'text-red-500' : 'text-white'}"></i>
      </div>
    {/if}
  </div>

  <div class="flex w-full flex-col justify-center gap-1 overflow-hidden">
    {#if showPath}
      <p class="overflow-hidden text-xs text-ellipsis whitespace-nowrap text-white opacity-50">
        {block?.area?.name} / {block?.name}
      </p>
    {/if}

    <RouteName {route} />

    {#if description == null}
      <MarkdownRenderer className="short" encloseReferences="strong" markdown={route.description ?? ''} />
    {:else}
      {@render description()}
    {/if}
  </div>
</div>
