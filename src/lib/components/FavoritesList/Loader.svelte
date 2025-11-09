<script lang="ts">
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper, { type ZeroQueryWrapperBaseProps } from '$lib/components/ZeroQueryWrapper'
  import { queries } from '$lib/db/zero'
  import FavoritesList from './FavoritesList.svelte'

  interface Props extends ZeroQueryWrapperBaseProps {
    authUserId: string
  }

  const { authUserId }: Props = $props()
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'skeleton', count: 15 }}
  query={queries.favorites(page.data, { authUserFk: authUserId })}
>
  {#snippet children(favorites)}
    {@const routeIds = favorites.filter((fav) => fav.entityType === 'route').map((fav) => Number(fav.entityId))}

    <ZeroQueryWrapper
      loadingIndicator={{ type: 'skeleton', count: 15 }}
      query={queries.listRoutesWithRelations(page.data, { routeId: routeIds, userId: pageState.user?.id })}
    >
      {#snippet children(routes)}
        <FavoritesList {routes} />
      {/snippet}
    </ZeroQueryWrapper>
  {/snippet}
</ZeroQueryWrapper>
