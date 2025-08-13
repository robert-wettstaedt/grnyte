<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import AreaFormFields from '$lib/components/AreaFormFields'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import type { Row } from '$lib/db/zero'
  import { enhanceForm, type EnhanceState } from '$lib/forms/enhance.svelte'
  import { deleteArea, updateArea } from './page.remote'

  interface Props {
    area: Row<'areas'>
  }

  let { area }: Props = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)
  let state = $state<EnhanceState>({})
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

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateArea.enhance(enhanceForm(state))}>
  <AreaFormFields {...area} />
  <FormActionBar label="Update area" {state} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], area.regionFk)}
  <DangerZone name="area" onDelete={() => (area.id == null ? undefined : deleteArea(area.id))} />
{/if}
