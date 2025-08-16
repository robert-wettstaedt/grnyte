<script>
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import EditAscentPage from './EditAscentPage.svelte'

  const { data } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.query}>
  {#snippet children(ascent)}
    {#if ascent?.route == null}
      <Error status={404} />
    {:else if page.data.session?.user.id !== ascent.author?.authUserFk && !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], ascent.route.regionFk)}
      <Error status={401} />
    {:else}
      <EditAscentPage {ascent} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
