<script lang="ts">
  import { beforeNavigate, goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import RouteRow from '$lib/components/EntityRow/RouteRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import Topo from '$lib/components/Topo/Topo.svelte'
  import TopoEditorStage from '$lib/components/Topo/TopoEditorStage.svelte'
  import { userAscentStatus } from '$lib/entities/ascent/resources.svelte'
  import { estimateBlockLocationFromPhoto } from '$lib/entities/block/blocks.remote'
  import { blockDetail, blockRouteList } from '$lib/entities/block/resources.svelte'
  import { imageRejectionMessage } from '$lib/entities/file/rejection'
  import { imageRejection } from '$lib/entities/file/upload'
  import { ImageUpload } from '$lib/entities/file/upload-manager.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import { canDeleteRoute } from '$lib/entities/route/permissions'
  import { deleteRoute, restoreRoute } from '$lib/entities/route/routes.remote'
  import { TopoEditor } from '$lib/entities/topo/editor.svelte'
  import { selectTopoForRoute } from '$lib/entities/topo/mapper'
  import { anchorX } from '$lib/entities/topo/order'
  import { canEditPoints, normalizePoints } from '$lib/entities/topo/path'
  import { canEditTopo } from '$lib/entities/topo/permissions'
  import { blockTopoList } from '$lib/entities/topo/resources.svelte'
  import {
    createTopo,
    deleteTopo,
    reorderTopos,
    replaceTopoImage,
    saveTopoLines,
  } from '$lib/entities/topo/topos.remote'
  import { m } from '$lib/paraglide/messages.js'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { back } from '$lib/state/navigation.svelte'
  import { notifyError, notifyUndo, toaster } from '$lib/state/toast'
  import { fly } from 'svelte/transition'
  import { topoEditorKeydown } from './keydown'
  import TopoAddRouteModal from './TopoAddRouteModal.svelte'
  import TopoEditorHud from './TopoEditorHud.svelte'
  import TopoPhotoStrip from './TopoPhotoStrip.svelte'
  import TopoRouteCard from './TopoRouteCard.svelte'

  const global = getGlobalState()

  const blockId = $derived(Number(page.params.id))

  const block = blockDetail(() => blockId)
  const topos = blockTopoList(() => blockId)
  const routes = blockRouteList(() => blockId)
  const ascentStatus = userAscentStatus(() => global.user?.id)

  const blockHref = $derived(resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(blockId) }))

  // The batched dirty session. Committed lines come straight off the topo view, mapped to the
  // editor's EditLine shape; the controller clones them into a local working doc on first edit.
  // Legacy pixel-space paths (pre-normalization rows the migration skipped) are normalized by
  // the image dimensions here so editing them doesn't clamp the coords into 0-1 and mangle them.
  const editor = new TopoEditor((topoId) => {
    const view = topos.data.find((v) => v.id === topoId)
    return (view?.lines ?? []).map((line) => ({
      points: normalizePoints(line.points, view?.imageWidth, view?.imageHeight),
      routeFk: line.routeId,
      topType: line.topType,
    }))
  })

  // Region-EDIT gates the whole editor.
  $effect(() => {
    if (block.data != null && !canEditTopo(global.userRegions, block.data)) {
      goto(blockHref)
    }
  })

  // Initial selection, applied once topos load. A ?topo=<id> deep-link (from the topo detail
  // page) opens on that photo; ?route=<id> (from a route detail page) opens on the photo the
  // route is drawn on with its line selected, or on the first photo with a fresh line armed
  // when it isn't drawn anywhere yet. No param falls back to the first photo. Latched so it
  // runs once, then the user drives selection.
  let selectionApplied = false
  $effect(() => {
    if (selectionApplied || topos.data.length === 0) return
    selectionApplied = true

    const routeParam = page.url.searchParams.get('route')
    if (routeParam != null) {
      const hit = selectTopoForRoute(topos.data, Number(routeParam))
      editor.topoId = hit?.view.id ?? topos.data[0].id
      if (hit == null) {
        // Not drawn anywhere: start a fresh line, armed to place the first point.
        editor.addLine(Number(routeParam))
        editor.pointType = 'start'
      } else {
        editor.selectRoute(Number(routeParam))
      }
      return
    }

    const topoParam = page.url.searchParams.get('topo')
    const wanted = topoParam == null ? undefined : topos.data.find((topo) => topo.id === Number(topoParam))
    editor.topoId = wanted?.id ?? topos.data[0].id
  })

  const currentTopo = $derived(topos.data.find((view) => view.id === editor.topoId) ?? topos.data[0])
  const routeById = $derived(new Map(routes.data.map((route) => [route.id, route])))

  // A topo with legacy pixel-space lines that can't be normalized (missing/mismatched image dims)
  // is shown read-only: editing would mix pixel and 0-1 coords and Save would overwrite the stored
  // path with garbage. New/empty topos and normal 0-1 topos stay fully editable.
  const currentTopoEditable = $derived(
    currentTopo == null ||
      currentTopo.lines.every((line) => canEditPoints(line.points, currentTopo.imageWidth, currentTopo.imageHeight)),
  )

  // Lines for the read-only viewer branch, numbered left-to-right like the editor and the viewer.
  const readOnlyLines = $derived.by(() => {
    if (currentTopo == null) return []
    const ordered = [...currentTopo.lines].sort((a, b) => anchorX(a) - anchorX(b))
    const numberById = new Map(ordered.map((line, index) => [line.id, index + 1]))
    return currentTopo.lines.map((line) => ({
      band: getGradeBand(line.gradeFk),
      id: line.id,
      number: numberById.get(line.id),
      points: line.points,
      topType: line.topType,
    }))
  })

  // Live left-to-right numbering off the working doc, so numbers update as points move.
  const drawnOrder = $derived(
    editor.currentLines.filter((line) => line.points.length > 0).sort((a, b) => anchorX(a) - anchorX(b)),
  )
  const routeNumber = $derived(new Map(drawnOrder.map((line, index) => [line.routeFk, index + 1])))

  const stageLines = $derived(
    editor.currentLines
      .filter((line) => line.points.length > 0 || line.routeFk === editor.selectedRouteFk)
      .map((line) => ({
        band: getGradeBand(routeById.get(line.routeFk)?.gradeFk),
        number: routeNumber.get(line.routeFk),
        points: line.points,
        routeFk: line.routeFk,
        selected: line.routeFk === editor.selectedRouteFk,
        topType: line.topType,
      })),
  )

  const topoRoutes = $derived(
    drawnOrder.flatMap((line) => {
      const route = routeById.get(line.routeFk)
      return route == null ? [] : [route]
    }),
  )

  const selectedRoute = $derived(editor.selectedRouteFk == null ? undefined : routeById.get(editor.selectedRouteFk))

  // 1-based position of the shown photo in the strip — for the routes sheet subtitle and
  // the per-photo actions title.
  const currentTopoIndex = $derived(topos.data.findIndex((topo) => topo.id === currentTopo?.id))

  // Block routes not yet on this photo — the add-route picker's candidates. Empty lines don't
  // count as drawn: a route picked and then abandoned without placing points must stay pickable,
  // or it would be stranded (in no list, not dirty, unreachable).
  const drawnFks = $derived(
    new Set(editor.currentLines.filter((line) => line.points.length > 0).map((line) => line.routeFk)),
  )
  const candidates = $derived(routes.data.filter((route) => !drawnFks.has(route.id)))
  // Gate on the selected route itself, not just its region: canDeleteRoute also grants an EDITor
  // the routes they created, and that branch needs the row's `createdBy`.
  const canDeleteSelectedRoute = $derived(
    selectedRoute != null && canDeleteRoute(global.userRegions, global.user?.id, selectedRoute),
  )

  let routesOpen = $state(false)
  let linesHidden = $state(false)
  let zoom = $state(1)
  let viewAtRest = $state(true)
  let zoomResetSignal = $state(0)
  let isFullscreen = $state(false)
  let saving = $state(false)
  let photoBusy = $state(false)
  let fileInput = $state<HTMLInputElement>()
  let replaceTargetId = $state<number>()

  function toggleFullscreen() {
    if (document.fullscreenElement == null) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.()
    }
  }

  function addRouteLine(routeId: number) {
    editor.addLine(routeId)
    editor.pointType = 'start'
    routesOpen = false
  }

  async function deleteSelectedRoute() {
    if (selectedRoute == null) return
    const id = selectedRoute.id
    try {
      // Not runCommand/withUndo: deleteRoute's envelope redirects to the block page (right
      // for the route screen, wrong here) — stay in the editor, keep the undo snackbar.
      const result = await deleteRoute({ id })
      // Purge the route from every local doc and history only after the delete commits, so
      // neither Save nor undo can resurrect a line pointing at the deleted route — and a
      // failed delete leaves the drawn line intact instead of silently dropping it.
      editor.removeRouteEverywhere(id)
      if (result?.data != null) {
        const snapshot = result.data
        notifyUndo({ message: m.routes_deleted(), onUndo: () => restoreRoute(snapshot) })
      }
    } catch {
      notifyError()
    }
  }

  // Photos are immediate writes, not part of the dirty session.

  function pickPhoto(replaceId?: number) {
    replaceTargetId = replaceId
    // Replace swaps one photo, so only Add allows a multi-select (set imperatively: the click
    // opens the OS picker in the same tick, before a reactive attribute would flush).
    if (fileInput != null) fileInput.multiple = replaceId == null
    fileInput?.click()
  }

  async function onFilePicked(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const files = [...(input.files ?? [])]
    input.value = ''
    if (files.length === 0 || block.data == null) return

    // Same gate the drop zone applies. Without it an 80MB file or a PDF uploads its whole
    // body before the staging bucket refuses it, and comes back as a bare `upload_failed`.
    const accepted: File[] = []
    for (const file of files) {
      const rejection = imageRejection(file)
      if (rejection == null) {
        accepted.push(file)
      } else {
        toaster.create({ duration: 5000, title: `${file.name}: ${imageRejectionMessage(rejection)}`, type: 'error' })
      }
    }
    if (accepted.length === 0) return

    photoBusy = true
    try {
      for (const file of accepted) {
        // Per-file: one failed upload must not silently drop the rest of the batch.
        const upload = new ImageUpload(file)
        try {
          upload.start()
          const row = await upload.finalize({ id: block.data.id, type: 'block' })
          if (replaceTargetId != null) {
            await replaceTopoImage({ fileId: row.id, topoId: replaceTargetId })
          } else {
            const result = await createTopo({ blockId: block.data.id, fileId: row.id })
            if (result?.data != null) editor.topoId = result.data.id
          }
        } catch {
          notifyError()
        } finally {
          // These uploads are headless: no tile ever renders the preview, and nothing
          // registers them in pendingUploads, so nothing else would ever revoke the blob
          // the ImageUpload constructor creates. Without this every picked photo pins its
          // full bytes in memory for the rest of the session.
          URL.revokeObjectURL(upload.previewUrl)
        }
      }
      // Backfill an estimated pin from the photo's GPS when the block has none yet. Best-effort:
      // the topo upload is the real action, so a missing or unreadable EXIF must stay silent.
      if (block.data.geolocation == null) {
        await estimateLocationFromPhotos(accepted)
      }
    } finally {
      photoBusy = false
      replaceTargetId = undefined
    }
  }

  async function estimateLocationFromPhotos(files: File[]) {
    if (block.data == null) return

    // Loaded here, not at module scope: EXIF is only ever read once someone actually picks a
    // photo, so keeping the parser off the page chunk costs the picker one round trip and saves
    // every other visit to this editor the whole download.
    //
    // `lite` rather than the default entry, which drags in the tif/png file parsers, the
    // IPTC/XMP/ICC/JFIF/IHDR segment parsers and every tag dictionary for one GPS read. `lite`
    // keeps the jpg *and* heic/avif file parsers, which the picker below accepts (`.heic,.heif`).
    // Never `mini`: it drops those, so an iPhone photo would silently read as having no GPS.
    //
    // exifr's package.json has no `exports` map, so this deep dist path is an internal file the
    // package makes no promise about, and only the version range holds it still. Pin exifr to an
    // exact version in package.json ("exifr": "7.1.3") so a patch bump cannot move or rename it.
    // @ts-expect-error -- no declarations ship for the deep path; `gps` is the root build's own.
    const exifr = (await import('exifr/dist/lite.esm.mjs')) as Pick<typeof import('exifr'), 'gps'>

    for (const file of files) {
      let gps: Awaited<ReturnType<typeof exifr.gps>>
      try {
        gps = await exifr.gps(file)
      } catch {
        continue
      }
      if (gps?.latitude == null || gps?.longitude == null) continue
      try {
        await estimateBlockLocationFromPhoto({
          id: block.data.id,
          lat: gps.latitude,
          long: gps.longitude,
        })
      } catch {
        // ignore: the pin is a bonus, the photo already uploaded
      }
      return
    }
  }

  async function deleteCurrentTopo() {
    if (currentTopo == null || !confirm(m.topo_deletePhotoConfirm())) return
    const id = currentTopo.id
    const remaining = topos.data.find((topo) => topo.id !== id)
    try {
      await deleteTopo({ id })
      // Drop the deleted topo's local doc too, or its dirty leftovers would make Save 404.
      editor.forget(id)
      editor.topoId = remaining?.id
    } catch {
      notifyError()
    }
  }

  async function persistReorder(orderedIds: number[]) {
    if (block.data == null) return
    try {
      await reorderTopos({ blockId: block.data.id, orderedIds })
    } catch {
      notifyError()
    }
  }

  function editRoute(routeFk: number) {
    editor.selectRoute(routeFk)
    routesOpen = false
  }

  // Topos saved but not yet echoed back by Zero. Their local docs are kept until the
  // committed lines catch up (isDirty flips false), then dropped — discarding right after
  // the command would flash the stale pre-save lines for the replication-lag window.
  let pendingSync = $state<number[]>([])

  async function save() {
    saving = true
    // Save each dirty topo independently: one failed photo must not skip the rest, and the
    // ones that did save should still clear their pill.
    let failed = 0
    for (const id of editor.dirtyTopoIds) {
      try {
        await saveTopoLines({ lines: editor.savedLinesFor(id), topoId: id })
        // Stamp the saved baseline so the pill/guard clear now, not after the Zero echo.
        editor.markSaved(id)
        pendingSync = [...pendingSync, id]
      } catch {
        failed++
      }
    }
    saving = false
    if (failed > 0) notifyError()
  }

  $effect(() => {
    // Drop an id once the committed lines catch up (forget its doc), or once the editor no
    // longer tracks it at all (discardAll/forget already dropped the doc) — otherwise a
    // Discard right after Save would strand the id here for the page's lifetime.
    const done = pendingSync.filter((id) => !editor.hasDoc(id) || editor.syncedWithCommitted(id))
    if (done.length > 0) {
      for (const id of done) editor.forget(id)
      pendingSync = pendingSync.filter((id) => !done.includes(id))
    }
  })

  function leave() {
    back(blockHref)
  }

  // Guards every way out (back button, browser back, breadcrumbs), not just `leave`.
  beforeNavigate((navigation) => {
    if (editor.dirty && !confirm(m.topo_leaveConfirm())) {
      navigation.cancel()
    }
  })

  const onKeydown = topoEditorKeydown({
    editor,
    onSave: () => {
      if (editor.dirty && !saving) save()
    },
    onToggleFullscreen: toggleFullscreen,
    topos: () => topos.data,
  })
</script>

<svelte:head>
  <title>{m.topo_editTopos()} – {block.data?.name ?? m.common_block()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />
<svelte:document onfullscreenchange={() => (isFullscreen = document.fullscreenElement != null)} />

<div class={['bg-surface-950 absolute inset-0 top-0', routesOpen && 'md:right-94 lg:right-105']}>
  {#if currentTopo == null}
    <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p class="text-surface-600-400 max-w-xs text-sm">{m.topo_emptyState()}</p>
      <button class="btn preset-filled-primary-500" disabled={photoBusy} onclick={() => pickPhoto()}>
        {#if photoBusy}
          <LoadingIndicator />
        {:else}
          <Icon name="image" size={18} />
        {/if}
        {m.topo_addPhoto()}
      </button>
    </div>
  {:else if currentTopoEditable}
    <TopoEditorStage
      class="h-full w-full"
      imagePath={currentTopo.imagePath}
      width={currentTopo.imageWidth}
      height={currentTopo.imageHeight}
      alt={m.topo_alt()}
      lines={linesHidden ? [] : stageLines}
      onZoom={(value, atRest) => {
        zoom = value
        viewAtRest = atRest
      }}
      resetZoom={zoomResetSignal}
      {editor}
    />
  {:else}
    <!-- Legacy pixel-space topo: read-only (the editor would mangle its coordinates). -->
    <div class="absolute inset-0 flex items-center justify-center p-4">
      <Topo
        class="max-h-full w-auto"
        imagePath={currentTopo.imagePath}
        width={currentTopo.imageWidth}
        height={currentTopo.imageHeight}
        alt={m.topo_alt()}
        lines={linesHidden ? [] : readOnlyLines}
      />
    </div>
    <div class="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-3">
      <p class="preset-filled-surface-50-950 rounded-full px-3 py-1.5 text-center text-xs shadow-lg">
        {m.topo_legacyReadOnly()}
      </p>
    </div>
  {/if}
</div>

<TopoEditorHud
  {editor}
  bind:linesHidden
  {isFullscreen}
  {zoom}
  {viewAtRest}
  {saving}
  onLeave={leave}
  onToggleFullscreen={toggleFullscreen}
  onResetZoom={() => zoomResetSignal++}
  onSave={save}
/>

{#if currentTopo != null && currentTopoEditable && selectedRoute != null}
  <TopoRouteCard
    {editor}
    route={selectedRoute}
    canDelete={canDeleteSelectedRoute}
    onDeleteRoute={deleteSelectedRoute}
  />
{:else}
  <div
    class="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-stretch gap-2 p-3"
    transition:fly={{ duration: 220, y: 24 }}
  >
    {#if currentTopo != null && currentTopoEditable && selectedRoute == null}
      <div class="pointer-events-auto flex justify-start">
        <Modal
          backdrop
          bind:open={routesOpen}
          panel
          panelClass="fixed inset-y-0 right-0 z-40"
          contentClass="h-full w-94 rounded-none border-y-0 border-r-0 lg:w-105"
          title={m.topo_routesOnPhoto()}
          subtitle={m.topo_position({ position: currentTopoIndex + 1, total: topos.data.length })}
          snapPoints={[0.7]}
        >
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              class="preset-filled-surface-50-950 flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold shadow-lg"
              onclick={() => (routesOpen = true)}
            >
              <Icon name="list" size={18} />
              {m.topo_routes()}
              <span class="tabular-nums opacity-60">{topoRoutes.length}</span>
            </button>
          {/snippet}

          {#if topoRoutes.length === 0}
            <p class="text-surface-600-400 py-6 text-center text-sm">{m.topo_noRoutesDrawn()}</p>
          {:else}
            <nav class="flex flex-col gap-1.5">
              {#each topoRoutes as route (route.id)}
                <RouteRow
                  {route}
                  active={route.id === editor.selectedRouteFk}
                  grade={gradeLabel(global.grades, global.gradingScale, route.gradeFk)}
                  number={routeNumber.get(route.id)}
                  status={ascentStatus.get(route.id)}
                  detailsHref={resolve('/(app)/routes/[id]', { id: String(route.id) })}
                  onclick={() => editRoute(route.id)}
                />
              {/each}
            </nav>
          {/if}

          {#snippet footer()}
            {#if block.data != null}
              <TopoAddRouteModal block={block.data} {candidates} onAdd={addRouteLine} />
            {/if}
          {/snippet}
        </Modal>
      </div>
    {/if}

    <TopoPhotoStrip
      topos={topos.data}
      currentTopoId={currentTopo?.id}
      {photoBusy}
      onSelect={(topoId) => (editor.topoId = topoId)}
      onAddPhoto={() => pickPhoto()}
      onReplacePhoto={(topoId) => pickPhoto(topoId)}
      onDeletePhoto={deleteCurrentTopo}
      onReorder={persistReorder}
    />

    <!-- Matches MediaDropZone: desktop platforms often register no MIME type for HEIC, so
         image/* alone hides iPhone photos from the picker on those. -->
    <input bind:this={fileInput} type="file" accept="image/*,.heic,.heif" class="hidden" onchange={onFilePicked} />
  </div>
{/if}
