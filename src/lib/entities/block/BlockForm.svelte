<script lang="ts">
  import type { AreaDetail } from '$lib/entities/area/dto'
  import Form from '$lib/forms/Form.svelte'
  import { seedOnKeyChange } from '$lib/forms/seedOnKeyChange.svelte'
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
  import { blockPinFingerprint } from './fingerprint'
  import { blockList } from './resources.svelte'

  type Coords = { lat: number; long: number }

  /** The loaded pin as `blockPinFingerprint` measures it. */
  const pinOf = (location: Coords | null, isEstimated: boolean) =>
    blockPinFingerprint(location == null ? null : { estimated: isEstimated, lat: location.lat, long: location.long })

  // The combined add/edit-block form: switches between the field form and a full-screen picker
  // sub-editor, and gates submit with a confirm when no location is set. Edit reuses this verbatim,
  // passing `updateBlock`, an `initialLocation`, and an "Edit block"/"Save" title and label.
  interface Props {
    /** The sector the block belongs to: drives the breadcrumb and the picker's framing. */
    area: AreaDetail
    /** Editing an existing block: switches the no-location confirm to "Save …" wording. */
    editing?: boolean
    form: RemoteForm<BlockFormInput, unknown>
    /** Pre-fill the "rough guess" toggle from the block's existing pin when editing. */
    initialEstimated?: boolean
    /** Pre-fill the location, e.g. the block's existing pin when editing. */
    initialLocation?: Coords | null
    /** Open straight on the map picker (the "Move on the map" shortcut) instead of the form. */
    initialStep?: 'form' | 'pin'
    onCancel: () => void
    /** Move mode: when set, the picker's "Done" commits the pin directly through this callback
     *  (typically a save + navigate) instead of returning to the form to be submitted. */
    onLocationCommit?: (coords: Coords) => void
    /** The entity this form is about: the area when adding, the block when editing. Required,
     *  because an absent key never seeds and the previous entity's values would survive. */
    seedKey: number | string
    submitLabel: string
    title: string
  }

  const {
    area,
    editing = false,
    form,
    initialEstimated = false,
    initialLocation = null,
    initialStep = 'form',
    onCancel,
    onLocationCommit,
    seedKey,
    submitLabel,
    title,
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

  // Re-seeded here rather than by a `{#key}` from outside, which would rebuild the `<form>`:
  // a remote form object accepts exactly one form element and throws on a second.
  // svelte-ignore state_referenced_locally
  let step = $state<'form' | 'pin'>(initialStep)
  // svelte-ignore state_referenced_locally
  let committed = $state<Coords | null>(initialLocation)
  // svelte-ignore state_referenced_locally
  let estimated = $state(initialEstimated)
  /** What this form claims to replace, stamped WITH the pin. Not `$derived`: `initialLocation` is
   *  live, so a derived proof would match its own check every time. */
  // svelte-ignore state_referenced_locally
  let known = $state(pinOf(initialLocation, initialEstimated))

  seedOnKeyChange(
    () => seedKey,
    () => {
      step = initialStep
      committed = initialLocation
      estimated = initialEstimated
      known = pinOf(initialLocation, initialEstimated)
      // Answer the held submit: an unsettled promise leaves `pending` up and Save disabled.
      closeConfirm(false)
      locating = false
    },
  )
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
      toaster.create({ title: m.blocks_add_locateError(), type: 'error' })
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

  // Same reason, for the reader who navigates away with the confirm still open.
  $effect(() => () => closeConfirm(false))
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
    <!-- Only rendered fields are submitted, so the staleness proof needs an input of its own. -->
    <input name="known" type="hidden" value={known} />

    <BlockFormFields
      {area}
      {form}
      {locating}
      {estimated}
      location={committed}
      mapData={explore}
      onEstimatedChange={(value) => (estimated = value)}
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
