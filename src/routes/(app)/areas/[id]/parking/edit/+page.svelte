<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { addParking } from '$lib/entities/area/areas.remote'
  import { canAddParking } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { blockList } from '$lib/entities/block/resources.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { createExploreMapData } from '$lib/map/exploreData.svelte'
  import { parseRouteFilter } from '$lib/map/filter'
  import { encodePath } from '$lib/map/polyline'
  import type { MapFocus } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import StepPath from './StepPath.svelte'
  import StepPlace from './StepPlace.svelte'

  const global = getGlobalState()
  const areaId = $derived(Number(page.params.id))
  const area = areaDetail(() => areaId)
  const blocks = blockList(() => ({ areaId }))

  // The same blocks/areas/parking the /explore map renders.
  const explore = createExploreMapData(
    () => parseRouteFilter(new URLSearchParams()),
    () => global.user?.id,
  )

  // Frame the map on the bounding box of the area's blocks.
  const areaExtent = $derived.by<[number, number, number, number] | null>(() => {
    const coords = blocks.data.map((block) => block.geolocation).filter((geo) => geo != null)
    if (coords.length === 0) return null
    const lats = coords.map((geo) => geo.lat)
    const lngs = coords.map((geo) => geo.long)
    return [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)]
  })

  // Step 1 form state, kept here so it survives the per-step remount of StepPlace.
  let mode = $state<'map' | 'coordinates'>('map')
  let latText = $state('')
  let lngText = $state('')
  let picked = $state<{ lat: number; long: number } | null>(null)
  // The parking committed when advancing to step 2, so StepPlace reframes there on return.
  let placedCenter = $state<[number, number] | null>(null)

  // Step 2: the walking path as [lat, lng] points, starting at the parking. The path is
  // optional (save works with none); the encoded form is mirrored into the hidden input.
  let pathPoints = $state<[number, number][]>([])
  const encodedPath = $derived(pathPoints.length >= 2 ? encodePath(pathPoints) : '')

  // Leaving the place step: seed the path at the parking, keeping any waypoints already traced.
  const seedPath = () => {
    if (picked == null) return
    placedCenter = [picked.lat, picked.long]
    pathPoints = [[picked.lat, picked.long], ...pathPoints.slice(1)]
  }

  // Frame step 2 on both the parking and the area, so the trail's ends are visible.
  const pathFocus = $derived.by<MapFocus | null>(() => {
    if (picked == null) return null
    const lats = [picked.lat]
    const lngs = [picked.long]
    if (areaExtent != null) {
      lats.push(areaExtent[0], areaExtent[2])
      lngs.push(areaExtent[1], areaExtent[3])
    }
    return { extent: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)] }
  })

  const exit = () => back(resolve('/(app)/(shell)/(map)/areas/[id]', { id: String(areaId) }))
</script>

<svelte:head>
  <title>{m.areas_addParkingLocation()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState resource={area}>
  {#snippet ready(data)}
    {#if !canAddParking(global.userRegions, data)}
      <ErrorState type="notfound" title={m.area_notFound()} />
    {:else}
      <Form
        fill
        form={addParking}
        onCancel={exit}
        submitLabel={m.common_save()}
        title={m.areas_addParkingLocation()}
        steps={[
          { label: m.parking_stepPlace(), body: placeStep, canContinue: picked != null, onContinue: seedPath },
          { label: m.parking_stepPath(), body: pathStep },
        ]}
      >
        <!-- The submitted parking + optional path, mirrored from state into the form. -->
        <input name="areaId" type="hidden" value={areaId} />
        <input name="lat" type="hidden" value={picked?.lat ?? ''} />
        <input name="long" type="hidden" value={picked?.long ?? ''} />
        <input name="path" type="hidden" value={encodedPath} />
      </Form>
    {/if}
  {/snippet}

  {#snippet empty()}
    <ErrorState type="notfound" title={m.area_notFound()} />
  {/snippet}
</QueryState>

{#snippet placeStep()}
  <StepPlace mapData={explore.data} {areaExtent} {placedCenter} bind:mode bind:latText bind:lngText bind:picked />
{/snippet}

{#snippet pathStep()}
  <StepPath mapData={explore.data} {pathFocus} bind:pathPoints />
{/snippet}
