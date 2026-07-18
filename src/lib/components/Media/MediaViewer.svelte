<!--
  Fullscreen media viewer: a story/lightbox deck. The current media sits between its
  two siblings on a horizontal track; a single-finger drag moves the track live so the
  neighbour peeks in (release past a threshold pages, else it snaps back). A vertical
  drag translates + shrinks the current media and fades the backdrop toward the page
  behind (release past a threshold dismisses). Desktop gets side arrows + j/l keys.

  Gestures are read in the CAPTURE phase on the deck, so they fire before d3-zoom's
  bubble-phase handler on the media node; they only act on a single finger at fit scale
  (where d3's pan is a no-op), leaving pinch-zoom and zoomed panning entirely to d3.
-->
<script lang="ts">
  import ConfirmDialog from '$lib/components/Dialog/Dialog.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import { isNavKeyExempt } from '$lib/components/SiblingNav/siblingNav'
  import type { MediaFile } from '$lib/entities/file/dto'
  import { deleteFile } from '$lib/entities/file/files.remote'
  import { canDeleteFile, canEditFile } from '$lib/entities/file/permissions'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { toaster } from '$lib/state/toast'
  import { bunnyThumbnail } from '$lib/videos/bunny'
  import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte'
  import { onDestroy } from 'svelte'
  import type { Attachment } from 'svelte/attachments'
  import { MediaQuery } from 'svelte/reactivity'
  import MediaStage from './MediaStage.svelte'
  import ShareSheet from './ShareSheet.svelte'

  interface Props {
    file: MediaFile
    onClose: () => void
    /** Sync the open sibling's id to the host (`?media=`), for deep-linking. */
    onNavigate: (id: string) => void
    /** Text shared alongside the page URL (e.g. the route name). */
    shareText?: string
    /** Ordered siblings the deck pages through (includes `file`). */
    siblings: MediaFile[]
  }

  const { file, onClose, onNavigate, shareText = '', siblings }: Props = $props()

  const global = getGlobalState()

  // Which sibling is centred. Owned locally so the carousel is instant; the `?media=`
  // sync (onNavigate) trails it, and an external change to `file` (back/deep-link) folds
  // back in here. The effect reads `file.id`/`siblings` only (not currentIndex) so a
  // local page never gets reverted before onNavigate catches up.
  const findSiblingIndex = (id: string) => siblings.findIndex((sibling) => sibling.id === id)
  // Closure so the initial prop reads are one-time (the effect below owns updates).
  let currentIndex = $state((() => Math.max(0, findSiblingIndex(file.id)))())
  // The open file id we last reset stage state for. A background change to `siblings`
  // (a sibling syncing, an in-viewer visibility toggle) re-runs this effect with the
  // SAME open file, so only reset zoom/fallback when the open file actually changed;
  // otherwise a zoomed image would snap back and a fallen-back video would lose the
  // nav arrows it needs (the iframe swallows swipes).
  let syncedFileId = (() => file.id)()
  $effect(() => {
    const i = findSiblingIndex(file.id)
    if (i < 0) return
    currentIndex = i
    if (file.id !== syncedFileId) {
      syncedFileId = file.id
      stageZoom = 1
      stageFallback = false
    }
  })

  const n = $derived(siblings.length)
  const canPage = $derived(n > 1)
  const currentFile = $derived(siblings[currentIndex] ?? file)
  const prevFile = $derived(siblings[(currentIndex - 1 + n) % n])
  const nextFile = $derived(siblings[(currentIndex + 1) % n])

  // Mirrors the files RLS, including the own-ascent grant a plain READ member has
  // on their own beta media (region EDIT/DELETE alone would hide their controls).
  const canEdit = $derived(canEditFile(global.userRegions, global.user?.id, currentFile))
  const canDelete = $derived(canDeleteFile(global.userRegions, global.user?.id, currentFile))

  // The viewer dialog's own open state, controlled so a delete can close it through its
  // machine (restoring aria-hidden) instead of a bare host unmount.
  let open = $state(true)
  // Open state of the delete confirmation, controlled so keyboard paging can be paused
  // while it is up (see onKeydown) and so it tears down through its own machine.
  let confirmOpen = $state(false)

  // Deleting removes the row and its storage for good (confirmed in the dialog). Close the
  // confirm, then close the VIEWER through its own `open` (so its machine restores the
  // aria-hidden it put on the page) before the host unmounts it. The confirm is non-modal
  // (see the dialog below) precisely so it adds no second aria-hidden layer to unwind here.
  // Close rather than page: the removed file syncs out of `siblings`, which the deck's local
  // currentIndex can't safely track, and the grid behind reflects it.
  const onDelete = async () => {
    try {
      await deleteFile({ id: currentFile.id })
    } catch {
      toaster.create({ title: m.error_generic_title(), type: 'error' })
      return
    }
    toaster.create({ title: m.media_deleted(), type: 'info' })
    confirmOpen = false
    open = false
    onClose()
  }

  // ----- drag state -----
  let width = $state(0)
  let height = $state(0)
  let dragX = $state(0)
  let dragY = $state(0)
  let axis = $state<'h' | 'v' | null>(null)
  let animating = $state(false)
  // Live zoom of the current media (from panzoom). Above 1 the deck yields all gestures
  // to d3 so a zoomed-in pan is never hijacked.
  let stageZoom = $state(1)
  // The current video fell back to the iframe (which swallows swipes), so surface the arrows.
  let stageFallback = $state(false)

  // Drag feedback: the media shrinks and the backdrop fades toward the page as it lifts.
  const backdropOpacity = $derived(axis === 'v' && height > 0 ? Math.max(0.25, 1 - Math.abs(dragY) / height) : 1)
  const dismissScale = $derived(axis === 'v' && height > 0 ? Math.max(0.82, 1 - (Math.abs(dragY) / height) * 0.25) : 1)
  const chromeOpacity = $derived(axis === 'v' ? backdropOpacity : 1)

  const DURATION = 250 // ms; keep in step with the transition below
  // A page/dismiss schedules its finishing step here. Cleared on unmount so a
  // close mid-animation can't fire commit -> onNavigate -> goto and re-open the
  // viewer after it was dismissed.
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  const settle = (fn: () => void) => {
    clearTimeout(settleTimer)
    settleTimer = setTimeout(fn, DURATION + 20)
  }
  onDestroy(() => clearTimeout(settleTimer))

  function commit(dir: -1 | 1) {
    currentIndex = (currentIndex + dir + n) % n
    stageZoom = 1
    onNavigate(siblings[currentIndex].id)
  }

  function snapBack() {
    animating = true
    dragX = 0
    dragY = 0
    settle(() => {
      animating = false
      axis = null
    })
  }

  function release() {
    if (axis === 'h' && canPage && width > 0 && Math.abs(dragX) > width * 0.22) {
      const dir: -1 | 1 = dragX < 0 ? 1 : -1
      animating = true
      dragX = dir === 1 ? -width : width
      settle(() => {
        animating = false // recentre with no transition: the peeked neighbour is already
        commit(dir) //          on screen, so swapping it to centre reads as no movement.
        dragX = 0
        axis = null
      })
    } else if (axis === 'v' && height > 0 && Math.abs(dragY) > height * 0.16) {
      animating = true
      dragY = dragY < 0 ? -height : height
      settle(onClose)
    } else {
      snapBack()
    }
  }

  // Arrows / keys page with the same slide as a completed swipe.
  function page(dir: -1 | 1) {
    if (!canPage || animating) return
    if (width > 0) {
      axis = 'h'
      animating = true
      dragX = dir === 1 ? -width : width
      settle(() => {
        animating = false
        commit(dir)
        dragX = 0
        axis = null
      })
    } else {
      commit(dir)
    }
  }
  const goPrev = () => page(-1)
  const goNext = () => page(1)

  const canHover = new MediaQuery('(hover: hover)')

  // While the share sheet is open, j/l must not page the deck underneath it: the
  // sheet would silently retarget its link and visibility switch to another file.
  let shareOpen = $state(false)

  const onKeydown = (event: KeyboardEvent) => {
    if (shareOpen || confirmOpen || !canPage || isNavKeyExempt(event)) return
    const key = event.key.toLowerCase()
    if (key === 'j') {
      event.preventDefault()
      goPrev()
    } else if (key === 'l') {
      event.preventDefault()
      goNext()
    }
  }

  // Capture-phase touch reader on the deck. Single finger at fit only; d3-zoom (deeper,
  // bubble phase) still runs but can't move a fit-scale image, so it's a harmless
  // passenger. Passive: we never preventDefault (d3 already suppresses scroll).
  const deckGestures: Attachment<HTMLElement> = (node) => {
    let startX = 0
    let startY = 0
    let active = false

    const cancel = () => {
      active = false
      if (dragX !== 0 || dragY !== 0) snapBack()
      else axis = null
    }
    const start = (event: TouchEvent) => {
      if (animating || stageZoom > 1 || event.touches.length !== 1) return
      // A touch on a control (the seek slider above all) is interaction, not a swipe:
      // reading it as one slides the stage away mid-scrub and can page/dismiss.
      if (event.target instanceof Element && event.target.closest('input, button, a') != null) return
      active = true
      axis = null
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
    }
    const move = (event: TouchEvent) => {
      if (!active) return
      if (stageZoom > 1 || event.touches.length !== 1) return cancel()
      const dx = event.touches[0].clientX - startX
      const dy = event.touches[0].clientY - startY
      if (axis === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      if (axis === 'h') {
        if (canPage) dragX = Math.max(-width, Math.min(width, dx))
      } else {
        dragY = dy
      }
    }
    const end = () => {
      if (!active) return
      active = false
      if (axis === null) return // a tap: let the media's own click handler have it
      release()
    }

    const opts = { capture: true, passive: true } as const
    node.addEventListener('touchstart', start, opts)
    node.addEventListener('touchmove', move, opts)
    node.addEventListener('touchend', end, opts)
    node.addEventListener('touchcancel', cancel, opts)
    return () => {
      node.removeEventListener('touchstart', start, opts)
      node.removeEventListener('touchmove', move, opts)
      node.removeEventListener('touchend', end, opts)
      node.removeEventListener('touchcancel', cancel, opts)
    }
  }

  const previewSrc = (f: MediaFile) =>
    f.bunnyStreamFk != null ? bunnyThumbnail(f.bunnyStreamFk) : `/image/${f.path.replace(/^\/+/, '')}?w=512`

  const btn = 'btn preset-glass-neutral btn-lg h-12 w-12 shrink-0 px-0'
  const arrow = `${btn} absolute top-1/2 z-20 -translate-y-1/2`
  const slide = 'absolute inset-0 flex items-center justify-center'
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet preview(f: MediaFile)}
  <img src={previewSrc(f)} alt="" class="pointer-events-none max-h-full max-w-full object-contain select-none" />
{/snippet}

<!-- closeOnInteractOutside is off: the fullscreen viewer dismisses via the close button,
     Escape or a vertical drag, never an outside tap. Left on, a tap on the portaled Share
     sheet (a body-level sibling, so "outside" to zag) would close the whole viewer. -->
<Dialog
  {open}
  onOpenChange={(event) => {
    open = event.open
    if (!event.open) onClose()
  }}
  closeOnInteractOutside={false}
>
  <Portal>
    <Dialog.Positioner class="fixed inset-0 z-50">
      <Dialog.Content class="relative h-full w-full overflow-hidden text-white">
        <div class="absolute inset-0" bind:clientWidth={width} bind:clientHeight={height} {@attach deckGestures}>
          <!-- Backdrop: fades toward the page behind as the media lifts on a vertical drag. -->
          <div
            class="absolute inset-0 bg-black"
            style:opacity={backdropOpacity}
            style:transition={animating ? `opacity ${DURATION}ms` : undefined}
          ></div>

          <!-- Horizontal track: prev | current | next, moved live by a horizontal drag. -->
          <div
            class="absolute inset-0"
            style:transform="translateX({dragX}px)"
            style:transition={animating ? `transform ${DURATION}ms` : undefined}
          >
            {#if canPage}
              <div class={slide} style:transform="translateX(-100%)">{@render preview(prevFile)}</div>
            {/if}

            <div class={slide}>
              <div
                class="h-full w-full"
                style:transform="translateY({dragY}px) scale({dismissScale})"
                style:transition={animating ? `transform ${DURATION}ms` : undefined}
              >
                {#key currentFile.id}
                  <MediaStage
                    file={currentFile}
                    onZoomChange={(k) => (stageZoom = k)}
                    onFallback={(active) => (stageFallback = active)}
                  />
                {/key}
              </div>
            </div>

            {#if canPage}
              <div class={slide} style:transform="translateX(100%)">{@render preview(nextFile)}</div>
            {/if}
          </div>
        </div>

        <!-- Top toolbar, fades out with the media on a dismiss drag. -->
        <header
          class="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 bg-linear-to-b from-black/60 to-transparent p-3 pb-10"
          style:opacity={chromeOpacity}
        >
          <Dialog.CloseTrigger class={btn} aria-label={m.common_close()}>
            <Icon name="close" size={20} />
          </Dialog.CloseTrigger>

          <div class="flex items-center gap-2">
            <ShareSheet file={currentFile} {canEdit} {shareText} bind:open={shareOpen} />

            {#if canDelete}
              <!-- Non-modal: the viewer is already a modal blocking the page, so a second
                   modal layer here only adds an aria-hidden stack that strands on teardown. -->
              <ConfirmDialog
                open={confirmOpen}
                onOpenChange={(event) => (confirmOpen = event.open)}
                modal={false}
                title={m.media_delete()}
                saveText={m.common_delete()}
                onsave={onDelete}
              >
                {#snippet trigger(props)}
                  <button {...props} type="button" class={[props.class, btn]} aria-label={m.common_delete()}>
                    <Icon name="trash" size={20} />
                  </button>
                {/snippet}
                {#snippet content()}
                  {m.media_deleteConfirm()}
                {/snippet}
              </ConfirmDialog>
            {/if}
          </div>
        </header>

        <!-- Arrows on hover, and always over the iframe fallback (swipe can't reach it). -->
        {#if (canHover.current || stageFallback) && canPage}
          <button type="button" class="{arrow} left-3" aria-label={m.media_previous()} onclick={goPrev}>
            <Icon name="chevron-left" size={20} />
          </button>
          <button type="button" class="{arrow} right-3" aria-label={m.media_next()} onclick={goNext}>
            <Icon name="chevron-right" size={20} />
          </button>
        {/if}
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog>
