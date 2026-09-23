<script lang="ts">
  import { beforeNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import ErrorState from '$lib/components/ErrorState/ErrorState.svelte'
  import QueryState from '$lib/components/QueryState/QueryState.svelte'
  import { addParking } from '$lib/entities/area/areas.remote'
  import { canAddParking } from '$lib/entities/area/permissions'
  import { areaDetail } from '$lib/entities/area/resources.svelte'
  import { entityHref } from '$lib/entities/href'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
  import { createAreaPickerMapData } from '$lib/map/exploreData.svelte'
  import LocationPicker from '$lib/map/LocationPicker.svelte'
  import { coordsFromParams } from '$lib/map/map'
  import { encodePath } from '$lib/map/polyline'
  import type { MapFocus } from '$lib/map/types'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import StepPath from './StepPath.svelte'

  const global = getGlobalState()
  const areaId = $derived(Number(page.params.id))
  const area = areaDetail(() => areaId)

  // The same blocks/areas/parking the /explore map renders, framed on the area's blocks.
  const picker = createAreaPickerMapData(
    () => areaId,
    () => global.user?.id,
  )

  // Location handed over by the quick-create map flow: frames the picker there, so the
  // map-centre pin starts on the pressed point.
  const prefill = $derived(coordsFromParams(page.url.searchParams))

  // Step 1 form state, kept here so it survives the per-step remount of StepPlace.
  let mode = $state<'coordinates' | 'map'>('map')
  let latText = $state('')
  let lngText = $state('')
  let picked = $state<null | { lat: number; long: number }>(null)
  // Whether the reader has actually moved the pin or typed a coordinate. NOT `picked != null`:
  // `picked` mirrors the map centre, so it is set the moment the picker frames itself and every
  // visit would have counted as an unsaved edit.
  let touched = $state(false)
  // The parking committed when advancing to step 2, so StepPlace reframes there on return.
  // Deliberately the initial value only: the effect below re-seeds it when the area changes.
  // svelte-ignore state_referenced_locally
  let placedCenter = $state<[number, number] | null>(prefill == null ? null : [prefill.lat, prefill.long])

  // Step 2: the walking path as [lat, lng] points, starting at the parking. The path is
  // optional (save works with none); the encoded form is mirrored into the hidden input.
  let pathPoints = $state<[number, number][]>([])
  const encodedPath = $derived(pathPoints.length >= 2 ? encodePath(pathPoints) : '')

  // The wizard's position, bound so the reset can return it to step 1. Left behind, the next
  // area opens on the last step with nothing placed and Save posts empty coordinates.
  let step = $state(0)

  // The steps are local state, not history entries, so the platform's back gesture leaves the whole
  // wizard where the header's control only steps back one. Confirm rather than discard silently.
  const dirty = $derived(touched || pathPoints.length > 0)
  let saved = false
  const onSubmitted = () => {
    saved = true
  }

  // Two ways a save leaves, and neither is the reader abandoning anything: the handler's redirect,
  // raised from inside `submit()` while the form is still pending, and the exit `Form` issues after
  // `onSubmitted`. A submit that FAILS clears `pending` without setting `saved`, so the guard
  // re-arms on its own rather than staying disabled for the rest of the session.
  beforeNavigate((navigation) => {
    if (saved || addParking.pending > 0) return
    if (dirty && !confirm(m.form_leaveConfirm())) {
      navigation.cancel()
    }
  })

  // Otherwise the hidden `areaId` follows the reader, saving one area's parking at another's
  // coordinates.
  seedOnKeyChange(
    () => areaId,
    () => {
      addParking.fields.set({})
      saved = false
      step = 0
      mode = 'map'
      latText = ''
      lngText = ''
      picked = null
      touched = false
      placedCenter = prefill == null ? null : [prefill.lat, prefill.long]
      pathPoints = []
    },
  )

  // Leaving the place step: seed the path at the parking, keeping any waypoints already traced.
  const seedPath = () => {
    if (picked == null) return
    placedCenter = [picked.lat, picked.long]
    pathPoints = [[picked.lat, picked.long], ...pathPoints.slice(1)]
  }

  // Frame step 2 on both the parking and the area, so the trail's ends are visible.
  const pathFocus = $derived.by<MapFocus | null>(() => {
    if (picked == null) return null
    const areaExtent = picker.areaExtent
    const lats = [picked.lat]
    const lngs = [picked.long]
    if (areaExtent != null) {
      lats.push(areaExtent[0], areaExtent[2])
      lngs.push(areaExtent[1], areaExtent[3])
    }
    return { extent: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)] }
  })
</script>

<svelte:head>
  <title>{m.areas_addParkingLocation()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<QueryState notFound={m.areas_notFound()} resource={area}>
  {#snippet ready(data)}
    {#if !canAddParking(global.userRegions, data)}
      {#if data.type !== 'sector'}
        <!-- Not a permission problem: parking hangs off a sector, and this is not one. -->
        <ErrorState
          type="generic"
          title={m.areas_parkingNeedsSectorTitle()}
          description={m.areas_parkingNeedsSectorBody()}
          primaryAction={{
            href: entityHref('areas', data.id),
            label: m.areas_viewArea(),
          }}
        />
      {:else}
        <ErrorState
          type="generic"
          title={m.form_noPermissionTitle()}
          description={m.form_noEditPermission()}
          primaryAction={{
            href: entityHref('areas', data.id),
            label: m.areas_viewArea(),
          }}
        />
      {/if}
    {:else}
      <Form
        fill
        {onSubmitted}
        bind:step
        form={addParking}
        cancelTo={entityHref('areas', areaId)}
        submitLabel={m.common_save()}
        title={m.areas_addParkingLocation()}
        steps={[
          { body: placeStep, canContinue: picked != null, label: m.parking_stepPlace(), onContinue: seedPath },
          { body: pathStep, label: m.parking_stepPath() },
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
</QueryState>

{#snippet placeStep()}
  <LocationPicker
    mapData={picker.mapData}
    areaExtent={picker.areaExtent}
    {placedCenter}
    bind:mode
    bind:latText
    bind:lngText
    bind:picked
    onedit={() => (touched = true)}
  />
{/snippet}

{#snippet pathStep()}
  <StepPath mapData={picker.mapData} {pathFocus} bind:pathPoints />
{/snippet}
