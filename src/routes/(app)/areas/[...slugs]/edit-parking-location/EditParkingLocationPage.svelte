<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_DELETE } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import DangerZone from '$lib/components/DangerZone'
  import FormActionBar from '$lib/components/FormActionBar'
  import { pageState } from '$lib/components/Layout'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import type { Coordinate } from 'ol/coordinate'
  import type { ChangeEventHandler } from 'svelte/elements'
  import type { PageProps } from './$types'
  import { deleteParkingLocation, updateParkingLocation } from './page.remote'

  interface Props {
    area: ZeroQueryResult<PageProps['data']['query']>
  }

  let { area }: Props = $props()
  let basePath = $derived(`/areas/${page.params.slugs}`)

  let coordinate: Coordinate | null = $state(null)
  let polyline: string | null = $state(null)
  let tabSet = $state('map')

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
  <title>Edit parking location of {area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    <span>Edit parking location of</span>
    <a class="anchor" href={basePath}>{area.name}</a>
  {/snippet}
</AppBar>

<form class="card preset-filled-surface-100-900 mt-8 p-2 md:p-4" {...updateParkingLocation.enhance(enhanceForm())}>
  <input type="hidden" name="areaId" value={area.id} />

  <Tabs onValueChange={(event) => (tabSet = event.value ?? 'map')} value={tabSet}>
    {#snippet list()}
      <Tabs.Control value="map">Map</Tabs.Control>
      <Tabs.Control value="latlong">Lat Long</Tabs.Control>
    {/snippet}

    {#snippet content()}
      <Tabs.Panel value="map">
        <div use:fitHeightAction>
          {#await import('$lib/components/BlocksMapWithAddableMarker') then BlocksMap}
            <BlocksMap.default
              modes={[
                { icon: 'fa-solid fa-parking', value: 'click' },
                { icon: 'fa-solid fa-draw-polygon', value: 'draw' },
              ]}
              onChange={(value) => {
                if (typeof value === 'string') {
                  polyline = value
                } else {
                  coordinate = value
                }
              }}
              selectedArea={area}
            />
          {/await}
        </div>

        <input hidden name="lat" value={coordinate?.at(1)} />
        <input hidden name="long" value={coordinate?.at(0)} />
        <input hidden name="polyline" value={polyline} />
      </Tabs.Panel>

      <Tabs.Panel value="latlong">
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
      </Tabs.Panel>
    {/snippet}
  </Tabs>

  <FormActionBar label="Update parking location" pending={updateParkingLocation.pending} />
</form>

{#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], area.regionFk)}
  <DangerZone name="parking location" onDelete={() => (area.id == null ? undefined : deleteParkingLocation(area.id))} />
{/if}
