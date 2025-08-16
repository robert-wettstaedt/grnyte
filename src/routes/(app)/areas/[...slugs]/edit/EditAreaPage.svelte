<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import type { PageProps } from './$types'
  import { deleteArea, updateArea } from './page.remote'

  interface Props {
    area: ZeroQueryResult<PageProps['data']['query']>
  }

  let { area }: Props = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)
</script>

<svelte:head>
  <title>Edit {area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit area</span>
    <a class="anchor" href={basePath}>{area.name}</a>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateArea.enhance(enhanceForm())}>
  <AreaFormFields {...area} />
  <FormActionBar label="Update area" pending={updateArea.pending} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], area.regionFk)}
  <DangerZone name="area" onDelete={() => (area.id == null ? undefined : deleteArea(area.id))} />
{/if}
