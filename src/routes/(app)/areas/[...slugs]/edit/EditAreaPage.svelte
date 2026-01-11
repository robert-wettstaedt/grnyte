<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import { getAreaContext } from '$lib/contexts/area'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar } from '@skeletonlabs/skeleton-svelte'
  import { deleteArea, updateArea } from './page.remote'

  const { area } = getAreaContext()

  let basePath = $derived(`/areas/${page.params.slugs}`)
</script>

<svelte:head>
  <title>Edit {area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Edit area
      <a class="anchor" href={basePath}>{area.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateArea.enhance(enhanceForm())}>
  <AreaFormFields {...area} />
  <FormActionBar label="Update area" pending={updateArea.pending} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], area.regionFk) || (checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area.regionFk) && area.createdBy === pageState.user?.id)}
  <DangerZone name="area" onDelete={() => (area.id == null ? undefined : deleteArea(area.id))} />
{/if}
