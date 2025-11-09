<script lang="ts">
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import ZeroQueryWrapper, { type ZeroQueryWrapperBaseProps } from '$lib/components/ZeroQueryWrapper'
  import { queries } from '$lib/db/zero'
  import FavoritesList from './FavoritesList.svelte'

  interface Props extends ZeroQueryWrapperBaseProps {
    authUserId: string
  }

  const { authUserId }: Props = $props()

  const latestAscentResult = $derived(
    pageState.user?.id == null
      ? undefined
      : page.data.z.q(
          page.data.z.query.ascents
            .where('createdBy', pageState.user.id)
            .orderBy('dateTime', 'desc')
            .related('route')
            .one(),
        ),
  )
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'skeleton', count: 15 }}
  query={queries.favorites(page.data, { authUserFk: authUserId })}
>
  {#snippet children(favorites)}
    {#if favorites.length === 0}
      <div class="my-12 flex justify-center">
        <div class="card border-warning-500 flex w-full max-w-md items-start gap-2 border p-4">
          <i class="fa-solid fa-triangle-exclamation text-warning-500 mt-1"></i>

          <div class="flex w-full flex-col overflow-hidden">
            <p class="text-warning-500">You do not have Favorites yet</p>

            <p class="text-warning-500 mt-2 text-xs opacity-70">Start by marking your favorite routes.</p>

            {#if latestAscentResult?.data?.route != null}
              <p class="text-warning-500 mt-4 mb-2 text-xs opacity-70">For example how about this?</p>

              <a
                class="anchor relative max-w-full overflow-hidden font-medium text-ellipsis whitespace-nowrap"
                href="/routes/{latestAscentResult.data.route.id}"
              >
                <RouteName route={latestAscentResult.data.route} />
              </a>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      {@const routeIds = favorites.filter((fav) => fav.entityType === 'route').map((fav) => Number(fav.entityId))}

      <ZeroQueryWrapper
        loadingIndicator={{ type: 'skeleton', count: 15 }}
        query={queries.listRoutesWithRelations(page.data, { routeId: routeIds, userId: pageState.user?.id })}
      >
        {#snippet children(routes)}
          <FavoritesList {routes} />
        {/snippet}
      </ZeroQueryWrapper>
    {/if}
  {/snippet}
</ZeroQueryWrapper>
