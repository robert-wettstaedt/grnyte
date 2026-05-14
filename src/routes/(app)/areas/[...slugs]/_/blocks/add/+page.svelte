<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { getAreaContext } from '$lib/contexts/area'
  import type { Row } from '$lib/db/zero'
  import type { Snapshot } from './$types'
  import AddBlockPage from './AddBlockPage.svelte'

  const { data } = $props()
  const { area } = getAreaContext()

  let name: Partial<Row<'blocks'>>['name'] = $state()

  export const snapshot: Snapshot<Partial<Row<'blocks'>>> = {
    capture: () => ({ name }),
    restore: (snapshot) => {
      name = snapshot.name
    },
  }
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} query={data.query}>
  {#snippet children(blocks)}
    {(name = `Block ${blocks.length + 1}`)}

    {#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
      <Error status={401} />
    {:else}
      <AddBlockPage bind:name />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
