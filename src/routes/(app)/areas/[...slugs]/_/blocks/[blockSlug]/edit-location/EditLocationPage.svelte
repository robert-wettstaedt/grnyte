<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { AppBar, Tabs } from '@skeletonlabs/skeleton-svelte'
  import type { Coordinate } from 'ol/coordinate'
  import type { ChangeEventHandler } from 'svelte/elements'
  import { deleteGeolocation, updateLocation } from './page.remote'

  const { block } = getBlockContext()

  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let coordinate: Coordinate | null = $state(
    block.geolocation == null ? null : [block.geolocation.long, block.geolocation.lat],
  )
  let tabSet = $state('map')

  const onChange = (value: Coordinate | string) => {
    if (typeof value === 'string') {
      return
    }

    coordinate = value
    document.scrollingElement?.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'smooth' })
  }

  const getValue: ChangeEventHandler<HTMLInputElement> = (event): number => {
    return Number((event.target as HTMLInputElement).value)
  }

  const onChangeLat: ChangeEventHandler<HTMLInputElement> = (event) => {
    coordinate = [coordinate?.at(0), getValue(event)]
  }

  const onChangeLong: ChangeEventHandler<HTMLInputElement> = (event) => {
    coordinate = [getValue(event), coordinate?.at(1)]
  }
</script>

<svelte:head>
  <title>Edit geolocation of {block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  <AppBar.Toolbar class="flex">
    <AppBar.Headline>
      Edit geolocation of
      <a class="anchor" href={basePath}>{block.name}</a>
    </AppBar.Headline>
  </AppBar.Toolbar>
</AppBar>

<form class="card preset-filled-surface-100-900 mt-4 p-2 md:mt-8 md:p-4" {...updateLocation.enhance(enhanceForm())}>
  <input type="hidden" name="blockId" value={block.id} />

  <Tabs onValueChange={(event) => (tabSet = event.value ?? 'map')} value={tabSet}>
    <Tabs.List>
      <Tabs.Trigger value="map">Map</Tabs.Trigger>
      <Tabs.Trigger value="latlong">Lat Long</Tabs.Trigger>
      <Tabs.Indicator />
    </Tabs.List>

    <Tabs.Content value="map">
      <div use:fitHeightAction>
        {#await import('$lib/components/BlocksMapWithAddableMarker') then BlocksMap}
          <BlocksMap.default selectedArea={{ id: block.areaFk }} selectedBlock={block} {onChange} />
        {/await}
      </div>

      <input hidden name="lat" value={coordinate?.at(1)} />
      <input hidden name="long" value={coordinate?.at(0)} />
    </Tabs.Content>

    <Tabs.Content value="latlong">
      <div class="flex flex-col gap-4">
        <label class="label">
          <span>Latitude</span>
          <input class="input" name="lat" onchange={onChangeLat} value={coordinate?.at(1) ?? ''} />
        </label>

        <label class="label">
          <span>Longitude</span>
          <input class="input" name="long" onchange={onChangeLong} value={coordinate?.at(0) ?? ''} />
        </label>
      </div>
    </Tabs.Content>
  </Tabs>

  <FormActionBar disabled={coordinate == null} label="Update geolocation" pending={updateLocation.pending} />
</form>

{#if block.geolocationFk != null && checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], block.regionFk)}
  <DangerZone name="geolocation" onDelete={() => (block.id == null ? undefined : deleteGeolocation(block.id))} />
{/if}
