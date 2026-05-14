<script lang="ts">
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import Error from '$lib/components/Error'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import type { Row } from '$lib/db/zero'
  import type { Snapshot } from './$types'
  import AddRoutePage from './AddRoutePage.svelte'

  const { block } = getBlockContext()

  let description: Partial<Row<'routes'>>['description'] = $state()
  let gradeFk: Partial<Row<'routes'>>['gradeFk'] = $state()
  let name: Partial<Row<'routes'>>['name'] = $state()
  let rating: Partial<Row<'routes'>>['rating'] = $state()
  let routeTags: string[] | undefined = $state()

  export const snapshot: Snapshot<Partial<Row<'routes'> & { routeTags: string[] }>> = {
    capture: () => ({ description, gradeFk, name, rating, routeTags }),
    restore: (snapshot) => {
      description = snapshot.description ?? ''
      gradeFk = snapshot.gradeFk ?? null
      name = snapshot.name ?? ''
      rating = snapshot.rating ?? null
      routeTags = snapshot.routeTags ?? []
    },
  }
</script>

{#if !checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
  <Error status={401} />
{:else}
  <AddRoutePage bind:description bind:gradeFk bind:name bind:rating bind:routeTags />
{/if}
