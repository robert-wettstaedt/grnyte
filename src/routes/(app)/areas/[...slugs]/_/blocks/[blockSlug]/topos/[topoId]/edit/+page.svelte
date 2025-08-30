<script lang="ts">
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import EditTopoPage from './EditTopoPage.svelte'

  const { block } = getBlockContext()

  const topo = $derived(block.topos.find((topo) => String(topo.id) === page.params.topoId))
</script>

{#if topo == null}
  <Error status={404} />
{:else if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
  <Error status={401} />
{:else}
  <EditTopoPage {topo} />
{/if}
