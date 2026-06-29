<script lang="ts">
  import type { AreaDetail } from '$lib/entities/area/dto'
  import Form from '$lib/forms/Form.svelte'
  import { createExploreMapData } from '$lib/map/exploreData.svelte'
  import { parseRouteFilter } from '$lib/map/filter'
  import { userLocation } from '$lib/map/geolocation.svelte'
  import LocationPickerScreen from '$lib/map/LocationPickerScreen.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { toaster } from '$lib/state/toast'
  import type { RemoteForm } from '@sveltejs/kit'
  import BlockFormFields from './BlockFormFields.svelte'
  import BlockLocationConfirm from './BlockLocationConfirm.svelte'
  import type { BlockFormInput } from './blocks.remote'
  import { blockList } from './resources.svelte'

  type Coords = { lat: number; long: number }

  // The combined add/edit-block form: an optional name + an optional, recommended location.
  // Switches between the field form and a full-screen picker sub-editor, and gates the
  // submit with a confirm when no location is set. Edit reuses this verbatim — pass
  // `updateBlock`, an `initialLocation`, and an "Edit block"/"Save" title and label.
  interface Props {
    form: RemoteForm<BlockFormInput, unknown>
    /** The crag the block belongs to — drives the breadcrumb and the picker's framing. */
    area: AreaDetail
    title: string
    submitLabel: string
    onCancel: () => void
    /** Pre-fill the location, e.g. the block's existing pin when editing. */
    initialLocation?: Coords | null
    /** Open straight on the map picker (the "Move on the map" shortcut) instead of the form. */
    initialStep?: 'form' | 'pin'
    /** Move mode: when set, the picker's "Done" commits the pin directly through this callback
     *  (typically a save + navigate) instead of returning to the form to be submitted. */
    onLocationCommit?: (coords: Coords) => void
    /** Editing an existing block — switches the no-location confirm to "Save …" wording. */
    editing?: boolean
  }

  const {
    form,
    area,
    title,
    submitLabel,
    onCancel,
    initialLocation = null,
    initialStep = 'form',
    onLocationCommit,
    editing = false,
  }: Props = $props()

  const global = getGlobalState()
  const blocks = blockList(() => ({ areaId: area.id }))

  // The same blocks/areas/parking the /explore map renders, for the picker + located preview.
  const explore = createExploreMapData(
    () => parseRouteFilter(new URLSearchParams()),
    () => global.user?.id,
  )

  // Frame the picker on the bounding box of the area's existing blocks.
  const areaExtent = $derived.by<[number, number, number, number] | null>(() => {
    const coords = blocks.data.map((block) => block.geolocation).filter((geo) => geo != null)
    if (coords.length === 0) return null
    const lats = coords.map((geo) => geo.lat)
    const lngs = coords.map((geo) => geo.long)
    return [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)]
  })

  // svelte-ignore state_referenced_locally
  let step = $state<'form' | 'pin'>(initialStep)
  // svelte-ignore state_referenced_locally
  let committed = $state<Coords | null>(initialLocation)
  let confirmOpen = $state(false)
  // Resolves the held submit (see beforeSubmit) once the user answers the confirm dialog.
  let confirmResolve: ((saveAnyway: boolean) => void) | undefined

  // One-shot device location via the shared watcher: enable on tap, commit the first
  // fix, then disable. The "Located" card is the confirmation, so only a failure toasts.
  let locating = $state(false)
  const location = userLocation(() => locating)
  $effect(() => {
    if (!locating) return
    const current = location.current
    if (current === undefined) return // still waiting for the first fix
    locating = false
    if (current === null) {
      toaster.create({ type: 'error', title: m.blocks_add_locateError() })
    } else {
      committed = { lat: current.lat, long: current.long }
    }
  })

  // Gate the submit: a located block saves immediately; an unlocated one holds the submit
  // open while the confirm dialog asks, resolving true (save anyway) or false (cancel).
  const beforeSubmit = () =>
    committed != null
      ? true
      : new Promise<boolean>((resolve) => {
          confirmResolve = resolve
          confirmOpen = true
        })

  const closeConfirm = (saveAnyway: boolean) => {
    confirmOpen = false
    confirmResolve?.(saveAnyway)
    confirmResolve = undefined
  }
</script>

{#if step === 'pin'}
  <LocationPickerScreen
    mapData={explore}
    {areaExtent}
    initial={committed}
    title={m.blocks_add_setLocationTitle()}
    backLabel={title}
    onBack={() => (onLocationCommit != null ? onCancel() : (step = 'form'))}
    onDone={(coords) => {
      // Move mode commits straight away; otherwise carry the pin back to the form to be saved.
      if (onLocationCommit != null) {
        onLocationCommit(coords)
      } else {
        committed = coords
        step = 'form'
      }
    }}
  />
{:else}
  <Form {form} onBeforeSubmit={beforeSubmit} {onCancel} {submitLabel} {title}>
    <BlockFormFields
      {area}
      {form}
      {locating}
      location={committed}
      mapData={explore}
      onPickLocation={() => (step = 'pin')}
      onRemove={() => (committed = null)}
      onUseCurrentLocation={() => (locating = true)}
    />
  </Form>

  <BlockLocationConfirm
    open={confirmOpen}
    title={editing ? m.blocks_edit_confirmTitle() : undefined}
    confirmLabel={editing ? m.blocks_edit_saveWithoutLocation() : undefined}
    onCancel={() => closeConfirm(false)}
    onConfirm={() => closeConfirm(true)}
    onPinNow={() => {
      closeConfirm(false)
      step = 'pin'
    }}
  />
{/if}
