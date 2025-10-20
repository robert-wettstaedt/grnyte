<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import GenericList from '$lib/components/GenericList'
  import Image from '$lib/components/Image'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import ZeroQueryWrapper, { type ZeroQueryWrapperBaseProps } from '$lib/components/ZeroQueryWrapper'
  import { routeWithPathname } from '$lib/db/utils.svelte'
  import type { RowWithRelations } from '$lib/db/zero'
  import { DEFAULT_PAGE_SIZE, hasReachedEnd } from '$lib/pagination.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import RoutesFilter from './components/RoutesFilter'
  import { getRoutesFilterQuery } from './lib'

  interface Props extends ZeroQueryWrapperBaseProps {
    areaFk?: number | null
  }
  const { areaFk, ...rest }: Props = $props()

  function mapRoutes<T extends RowWithRelations<'routes', { block: true }>>(routes: T[]) {
    return routes
      .map((route) => routeWithPathname(route))
      .filter((route) => route != null)
      .filter((route) => route.id != null)
      .map((route) => ({ ...route, id: route.id! }))
  }
</script>

<div class="mt-8">
  <RoutesFilter />
</div>

<ZeroQueryWrapper {...rest} query={getRoutesFilterQuery(areaFk)}>
  {#snippet children(_routes)}
    {@const routes = mapRoutes(_routes)}

    <GenericList items={routes.flat()}>
      {#snippet left(item)}
        <div class="flex gap-2">
          <Image path="/blocks/{item.block?.id}/preview-image" size={64} />

          <div class="flex flex-col gap-1 overflow-hidden">
            <p class="overflow-hidden text-xs text-ellipsis whitespace-nowrap text-white opacity-50">
              {item.block?.area?.name} / {item.block?.name}
            </p>

            <RouteName route={item} />

            <MarkdownRenderer className="short" encloseReferences="strong" markdown={item.description ?? ''} />
          </div>
        </div>
      {/snippet}
    </GenericList>
  {/snippet}

  {#snippet after(_routes, details)}
    {@const routes = mapRoutes(_routes)}

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
  {/snippet}
</ZeroQueryWrapper>
