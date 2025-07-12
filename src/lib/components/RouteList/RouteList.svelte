<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import GenericList from '$lib/components/GenericList'
  import Image from '$lib/components/Image'
  import RouteName from '$lib/components/RouteName'
  import RoutesFilter from '$lib/components/RoutesFilter'
  import { getRoutesFilterQuery } from '$lib/components/RoutesFilter/handle.svelte'
  import { routeWithPathname } from '$lib/db/utils.svelte'
  import { DEFAULT_PAGE_SIZE, hasReachedEnd } from '$lib/pagination.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { Query } from 'zero-svelte'

  interface Props {
    areaFk?: number | null
    onLoad?: () => void
  }
  const { areaFk, onLoad }: Props = $props()

  const { current: routes, details } = $derived(new Query(getRoutesFilterQuery(areaFk ?? undefined)))

  const enrichedRoutes = $derived(
    routes
      .map((route) => routeWithPathname(route))
      .filter((route) => route != null)
      .filter((route) => route.id != null)
      .map((route) => ({ ...route, id: route.id!, ascents: [...route.ascents] })),
  )

  $effect(() => {
    if (details.type === 'complete') {
      onLoad?.()
    }
  })
</script>

<div class="mt-8">
  <RoutesFilter />
</div>

<div class="mt-8">
  {#if routes.length === 0 && details.type !== 'complete'}
    <nav class="list-nav">
      <ul class="overflow-auto">
        {#each Array(10) as _}
          <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
        {/each}
      </ul>
    </nav>
  {:else}
    <GenericList items={enrichedRoutes}>
      {#snippet left(item)}
        <div class="flex gap-2">
          <Image path="/blocks/{item.block?.id}/preview-image" size={64} />

          <div class="flex flex-col gap-1">
            <p class="overflow-hidden text-xs text-ellipsis whitespace-nowrap text-white opacity-50">
              {item.block?.area?.name} / {item.block?.name}
            </p>

            <RouteName route={item} />
          </div>
        </div>
      {/snippet}
    </GenericList>

    {#if page.url.searchParams.get('pageSize') != null || !hasReachedEnd(routes.length)}
      <div class="my-8 flex justify-center">
        <button
          class="btn preset-filled-primary-500"
          disabled={details.type !== 'complete' || hasReachedEnd(routes.length)}
          onclick={() => {
            const url = new URL(page.url)
            url.searchParams.set('pageSize', String(routes.length + DEFAULT_PAGE_SIZE))
            goto(url, { noScroll: true, replaceState: true })
          }}
        >
          {#if details.type !== 'complete'}
            <span class="me-2">
              <ProgressRing size="size-4" value={null} />
            </span>
          {/if}

          Load more
        </button>
      </div>
    {/if}
  {/if}
</div>
