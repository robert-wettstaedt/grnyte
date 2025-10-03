<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
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
  {#snippet lead()}
    <span>Edit geolocation of</span>
    <a class="anchor" href={basePath}>{block.name}</a>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-4 p-2 md:mt-8 md:p-4" {...updateLocation.enhance(enhanceForm())}>
  <input type="hidden" name="blockId" value={block.id} />
  <input hidden name="lat" value={coordinate?.at(1)} />
  <input hidden name="long" value={coordinate?.at(0)} />

  <Tabs onValueChange={(event) => (tabSet = event.value ?? 'map')} value={tabSet}>
    {#snippet list()}
      <Tabs.Control value="map">Map</Tabs.Control>
      <Tabs.Control value="latlong">Lat Long</Tabs.Control>
    {/snippet}

    {#snippet content()}
      <Tabs.Panel value="map">
        <div use:fitHeightAction>
          {#await import('$lib/components/BlocksMapWithAddableMarker') then BlocksMap}
            <BlocksMap.default selectedArea={{ id: block.areaFk }} selectedBlock={block} {onChange} />
          {/await}
        </div>
      </Tabs.Panel>

      <Tabs.Panel value="latlong">
        <div class="flex flex-col gap-4">
          <label class="label">
            <span>Latitude</span>
            <input class="input" onchange={onChangeLat} value={coordinate?.at(1) ?? ''} />
          </label>

          <label class="label">
            <span>Longitude</span>
            <input class="input" onchange={onChangeLong} value={coordinate?.at(0) ?? ''} />
          </label>
        </div>
      </Tabs.Panel>
    {/snippet}
  </Tabs>

  <FormActionBar disabled={coordinate == null} label="Update geolocation" pending={updateLocation.pending} />
</form>

{#if block.geolocationFk != null && checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], block.regionFk)}
  <DangerZone name="geolocation" onDelete={() => (block.id == null ? undefined : deleteGeolocation(block.id))} />
{/if}
