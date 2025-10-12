<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import { getAreaContext } from '$lib/contexts/area'
  import type { Row } from '$lib/db/zero'
  import type { Snapshot } from './$types'
  import AddAreaPage from './AddAreaPage.svelte'

  const { area } = getAreaContext()

  let description: Partial<Row<'areas'>>['description'] = $state('')
  let name: Partial<Row<'areas'>>['name'] = $state()
  let type: Partial<Row<'areas'>>['type'] = $state()

  export const snapshot: Snapshot<Partial<Row<'areas'>>> = {
    capture: () => ({ description, name, type }),
    restore: (snapshot) => {
      description = snapshot.description ?? ''
      name = snapshot.name
      type = snapshot.type
    },
  }
</script>

{#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
  <Error status={401} />
{:else}
  <AddAreaPage bind:description bind:name bind:type />
{/if}
