<!-- One layer's form, for its page and for adding one. It seeds and submits the region's whole list,
     so the save path and its `known` guard stay as they were; it renders one row. -->
<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Dialog from '$lib/components/Dialog/Dialog.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { blockMapList } from '$lib/entities/block/resources.svelte'
  import { regionAdminScreen } from '$lib/entities/region/adminScreen.svelte'
  import { readCoverage } from '$lib/entities/region/coverage'
  import { regionMapLayersSchema } from '$lib/entities/region/dto'
  import {
    layerUrl,
    mapLayerKey,
    mapLayerSchema,
    mapLayerSegment,
    mapLayersFingerprint,
    toLayerForm,
    type LonLatBounds,
    type MapLayer,
  } from '$lib/entities/region/settings'
  import { updateRegionMapLayers } from '$lib/entities/region/writes'
  import EditKeys from '$lib/forms/EditKeys.svelte'
  import Form from '$lib/forms/Form.svelte'
  import { formError } from '$lib/forms/schemas'
  import { seedFollowingRows } from '$lib/forms/seed.svelte'
  import { createFormStore } from '$lib/forms/store.svelte'
  import type * as z from '$lib/forms/zod'
  import { m } from '$lib/paraglide/messages'
  import { untrack } from 'svelte'
  import LayerFields from './LayerFields.svelte'
  import LayerPreview from './LayerPreview.svelte'
  import MapLayersGate from './MapLayersGate.svelte'

  interface Props {
    segment?: string
  }

  const { segment }: Props = $props()

  const BLANK = { attributions: '', bounds: '', maxZoom: '', minZoom: '', name: '', opacity: '', url: '' }
  const DEBOUNCE_MS = 500

  const screen = regionAdminScreen()
  const store = createFormStore(regionMapLayersSchema)
  const fields = store.fields
  const stored = $derived(screen.membership?.settings.mapLayers ?? [])
  const listHref = $derived(resolve('/(app)/regions/[regionId]/map-layers', { regionId: String(screen.regionId) }))

  /** The rows as seeded, and which one this page edits: mapped once per seed, never from form
   *  values (typing the address would lose it) nor the live list (it moves on under an edit). */
  let seeded = $state<MapLayer[]>([])
  let shown = $state<number>()
  let removing = $state(false)
  let confirming = $state(false)
  let capOpen = $state(false)
  let anchor = $state<HTMLElement>()

  const row = $derived(shown == null || shown < 0 || removing ? undefined : fields.mapLayers[shown])

  seedFollowingRows(
    // fallow-ignore-next-line complexity -- the seed gate, verified by driving (13.3)
    () =>
      screen.membership?.synced === true && screen.membership.layersComplete
        ? `${screen.regionId}:${segment ?? 'add'}`
        : undefined,
    () => mapLayersFingerprint(stored),
    () => fields.value(),
    // fallow-ignore-next-line complexity -- the seed, verified by driving (13.3)
    () => {
      seeded = [...stored]
      shown = segment == null ? stored.length : stored.findIndex((layer) => mapLayerSegment(layer) === segment)
      removing = false
      fields.set({
        id: String(screen.regionId),
        known: mapLayersFingerprint(stored),
        mapLayers: [...stored.map(toLayerForm), ...(segment == null ? [BLANK] : [])],
      })
      capOpen = shown >= 0 && stored[shown]?.maxZoom != null
      startRead()
    },
  )

  // Coverage read from the service. Kept here, never in the form, so a read on open does not count
  // as an edit (which would stop the seed following newer rows after a reload).
  let readResult = $state<LonLatBounds | null>()
  let reading: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  /** One promise per answer awaited, from the first keystroke to the read that answers it: Save
   *  may already be waiting on it, so a later step must settle this one, never replace it. */
  let pending: undefined | { done: () => void; promise: Promise<void> }

  const awaitAnswer = () => {
    if (pending == null) {
      let done = () => {}
      const promise = new Promise<void>((resolve) => (done = resolve))
      pending = { done, promise }
    }
  }

  const answer = (result: LonLatBounds | null) => {
    readResult = result
    pending?.done()
    pending = undefined
  }

  const addressLayer = (text = String(row?.url.value() ?? '')): MapLayer | null => {
    const parsed = layerUrl.safeParse(text)
    return parsed.success ? { attributions: null, minZoom: null, name: '', opacity: null, ...parsed.data } : null
  }

  function startRead() {
    reading?.abort()
    clearTimeout(timer)
    readResult = undefined
    awaitAnswer()
    const target = addressLayer()

    if (target == null) {
      answer(null)
      return
    }

    const controller = new AbortController()
    reading = controller
    void readCoverage(target, fetch, controller.signal).then((result) => {
      if (!controller.signal.aborted) answer(result)
    })
  }

  /** Given the field's own value: this runs before the form's bubbling `capture` stores it. */
  function onAddressInput(event: Event) {
    row?.bounds.set('')
    reading?.abort()
    clearTimeout(timer)
    // An address that does not parse asks no service, so it shows no reading state either.
    if (addressLayer((event.currentTarget as HTMLTextAreaElement).value) == null) {
      answer(null)
      return
    }
    readResult = undefined
    // Pending from the first keystroke, so a quick Save waits for this address's answer.
    awaitAnswer()
    timer = setTimeout(startRead, DEBOUNCE_MS)
  }

  // Leaving mid-debounce must not still ask the service.
  $effect(() => () => {
    clearTimeout(timer)
    reading?.abort()
  })

  /** Other rows the form would refuse. The store files their issues at form level with no path,
   *  so they are checked here, where the layer can still be named. */
  const hiddenInvalid = $derived(
    seeded.filter((layer, index) => index !== shown && !mapLayerSchema.safeParse(toLayerForm(layer)).success),
  )

  const hasAddress = $derived(addressLayer() != null)

  const duplicate = $derived.by(() => {
    const own = addressLayer()
    if (own == null) return false
    const key = mapLayerKey(own)
    return seeded.some((layer, index) => index !== shown && mapLayerKey(layer) === key)
  })

  let waiting = $state(false)

  // fallow-ignore-next-line complexity -- page logic, verified by driving (13.3); pages have no component tests by agreement
  const beforeSubmit = async () => {
    if (removing) return true
    if (shown == null || hiddenInvalid.length > 0) return false
    if (duplicate) {
      store.setIssue(`mapLayers.${shown}.url`, formError('region_mapLayerDuplicate'))
      return false
    }
    waiting = true
    try {
      await pending?.promise
    } finally {
      waiting = false
    }
    // Never `null` over a coverage the admin typed.
    if (readResult != null) row?.bounds.set(readResult.join(','))
    return true
  }

  /** The rows as they were before a remove, to put back if that save does not go through. */
  let beforeRemove: undefined | z.input<typeof regionMapLayersSchema>['mapLayers']

  const remove = () => {
    if (shown == null || shown < 0) return
    const index = shown
    beforeRemove = $state.snapshot(fields.mapLayers.value()) ?? []
    removing = true
    // The rows only, never `fields.set`, which would also clear a refusal's message.
    fields.mapLayers.set(beforeRemove.filter((_, at) => at !== index))
    anchor?.closest('form')?.requestSubmit()
  }

  const restore = () => {
    if (!removing || beforeRemove == null) return
    fields.mapLayers.set(beforeRemove)
    removing = false
  }

  // At every zoom: framed on a whole state it sits far below a typical "show from zoom".
  let previewLayer = $state<MapLayer>()
  $effect(() => {
    // A deep snapshot, so the effect tracks every field and not only the row object.
    const value = $state.snapshot(row?.value())
    const coverage = readResult
    const update = () => {
      const parsed = mapLayerSchema.safeParse(value)
      if (!parsed.success) return
      previewLayer = { ...parsed.data, ...(coverage == null ? {} : { bounds: coverage }), minZoom: null }
    }
    // The first value at once, so the preview does not open framed on something else.
    if (untrack(() => previewLayer) == null) update()
    const handle = setTimeout(update, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  })

  const blocks = blockMapList()
  const regionBlocks = $derived(
    blocks.data.flatMap((block) =>
      block.regionFk === screen.regionId && block.geolocation != null
        ? [[block.geolocation.lat, block.geolocation.long] as [number, number]]
        : [],
    ),
  )

  const title = $derived(segment == null ? m.region_mapLayerAdd() : (seeded[shown ?? -1]?.name ?? m.region_mapLayers()))
</script>

<svelte:head>
  <title>{title} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<MapLayersGate backTo={listHref} notFound={shown != null && shown < 0} ready={shown != null}>
  <Form
    {store}
    cancelTo={listHref}
    fill
    onBeforeSubmit={beforeSubmit}
    onUnsaved={restore}
    submit={updateRegionMapLayers}
    submitDisabled={waiting || hiddenInvalid.length > 0}
    submitLabel={m.common_save()}
    {title}
  >
    <div
      {@attach (node) => void (anchor = node)}
      class="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-10"
    >
      <EditKeys id={fields.id} known={fields.known} />

      <div class="md:order-2">
        <div class="md:sticky md:top-4">
          <LayerPreview blocks={regionBlocks} layer={previewLayer} />
        </div>
      </div>

      {#if row != null}
        <div class="flex min-w-0 flex-col gap-5 md:order-1">
          <LayerFields
            bind:capOpen
            {hasAddress}
            {hiddenInvalid}
            {onAddressInput}
            read={readResult}
            regionId={screen.regionId}
            {row}
          />

          {#if segment != null}
            <button
              class="btn preset-tonal-error w-full sm:w-auto sm:self-start"
              disabled={waiting}
              onclick={() => (confirming = true)}
              type="button"
            >
              <Icon name="trash" size={16} />
              {m.region_mapLayerRemove()}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </Form>

  <!-- Mounted only while asked: Dialog portals its content on mount (TagRow guards the same way). -->
  {#if confirming}
    <Dialog
      destructive
      onOpenChange={() => (confirming = false)}
      onsave={remove}
      open
      saveText={m.common_remove()}
      title={m.region_mapLayerRemove()}
    >
      {#snippet content()}
        {m.region_mapLayerRemoveConfirm({ name: seeded[shown ?? -1]?.name ?? '' })}
      {/snippet}
    </Dialog>
  {/if}
</MapLayersGate>
