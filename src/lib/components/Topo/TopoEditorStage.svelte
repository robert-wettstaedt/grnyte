<script lang="ts">
  import type { GradeBand } from '$lib/entities/grade/color'
  import type { TopoPoint } from '$lib/entities/topo/dto'
  import type { PlacementIntent, TopoEditor } from '$lib/entities/topo/editor.svelte'
  import { buildLine } from '$lib/entities/topo/path'
  import { m } from '$lib/paraglide/messages'
  import type { ClassValue } from 'svelte/elements'
  import { TopoImageBox } from './imageBox.svelte'
  import { panzoom } from './panzoom'
  import TopoImage from './TopoImage.svelte'
  import TopoLens, { LENS_SIZE, LENS_ZOOM, type Lens } from './TopoLens.svelte'
  import TopoLine from './TopoLine.svelte'

  interface RenderLine {
    band: GradeBand | undefined
    number?: number
    points: TopoPoint[]
    routeFk: number
    selected: boolean
    topType: 'top' | 'topout'
  }

  interface Props {
    alt: string
    class?: ClassValue
    /** The drawing controller: the stage calls its place/drag/delete ops. */
    editor: TopoEditor
    height?: number
    imagePath: string
    /** Every line on this photo; `selected` gets editable handles. */
    lines: RenderLine[]
    /** Show the magnifier lens on point placement/drag (finger occludes the target otherwise). */
    /** Live zoom factor (1 = fit) and whether the view is at rest (fit and centred),
     *  so the page can show a reset-zoom chip whenever the view is off-default. */
    onZoom?: (scale: number, atRest: boolean) => void
    /** Bump to animate the stage back to fit (the reset-zoom chip). */
    resetZoom?: number
    width?: number
  }

  let { alt, class: className, editor, height, imagePath, lines, onZoom, resetZoom, width }: Props = $props()

  let containerEl = $state<HTMLDivElement>()
  let svgEl = $state<SVGSVGElement>()

  const box = new TopoImageBox(() => ({ height, width }))

  // Committed-style geometry (curve + bracket + end marker) for every line.
  const rendered = $derived(
    lines.map((line) => {
      const { anchor, bracket, d, starts, top } = buildLine(line.points, true, box.width, box.height)
      return { ...line, anchor, bracket, d, starts, top }
    }),
  )
  const selected = $derived(rendered.find((line) => line.selected))

  // Rings where points of different lines coincide (snap made them shared).
  const sharedRings = $derived.by(() => {
    const seen: Record<string, { count: number; x: number; y: number }> = {}
    for (const line of lines) {
      for (const point of line.points) {
        const key = `${point.x.toFixed(4)},${point.y.toFixed(4)}`
        const entry = (seen[key] ??= { count: 0, x: point.x * box.width, y: point.y * box.height })
        entry.count += 1
      }
    }
    return Object.values(seen).filter((entry) => entry.count > 1)
  })

  // Ghost `+` midpoints along the selected line, each inserting a middle after `afterId`.
  // Hidden while armed, or the press inserts a middle instead of the armed point type.
  const inserts = $derived.by(() => {
    if (selected == null || editor.pointType != null) return []
    const points = selected.points
    const spots: { afterId: string; nx: number; ny: number; x: number; y: number }[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      // Only between consecutive trunk points (skip the jump to a second start hold).
      if (a.type === 'top' || b.type === 'start') continue
      const nx = (a.x + b.x) / 2
      const ny = (a.y + b.y) / 2
      spots.push({ afterId: a.id, nx, ny, x: nx * box.width, y: ny * box.height })
    }
    return spots
  })

  /** Client coords → normalized 0-1 in image space, accounting for the panzoom transform. */
  function toNorm(clientX: number, clientY: number): undefined | { x: number; y: number } {
    const ctm = svgEl?.getScreenCTM()
    if (ctm == null || box.width === 0 || box.height === 0) return undefined
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: Math.min(1, Math.max(0, p.x / box.width)), y: Math.min(1, Math.max(0, p.y / box.height)) }
  }

  // --- magnifier lens ------------------------------------------------------

  let lens = $state<Lens>()

  /** Centred on `focus` (the snapped position), so the crosshair marks where the point lands. */
  function computeLens(clientX: number, clientY: number, focus: { x: number; y: number }): Lens | undefined {
    const img = containerEl?.querySelector('img')
    const ctm = svgEl?.getScreenCTM()
    if (img == null || ctm == null || box.width === 0 || box.height === 0) return undefined
    // The points' own transform: the img element box includes the contain bands and stretched it.
    const bgW = ctm.a * box.width * LENS_ZOOM
    const bgH = ctm.d * box.height * LENS_ZOOM
    return {
      bgH,
      bgW,
      bgX: LENS_SIZE / 2 - focus.x * bgW,
      bgY: LENS_SIZE / 2 - focus.y * bgH,
      clientX,
      clientY,
      src: img.currentSrc || img.src,
    }
  }

  function showLens(clientX: number, clientY: number, focus: undefined | { x: number; y: number }) {
    lens = focus == null ? undefined : computeLens(clientX, clientY, focus)
  }

  // --- gestures ------------------------------------------------------------

  const TAP_SLOP = 4
  const stopPan = (event: Event) => event.stopPropagation()

  // Tolerances in CSS px: normalized units shrink with the photo, the line's grab band does not.
  const SNAP_PX = { mouse: 14, touch: 24 }
  const GRAB_STROKE = { mouse: 12, touch: 24 }
  const SNAP_RING_PX = 28

  // Per gesture, not a media query: a touchscreen laptop is both.
  let lastPointerType = $state('')
  const grabStroke = $derived(lastPointerType === 'mouse' ? GRAB_STROKE.mouse : GRAB_STROKE.touch)

  // Screen px per viewBox unit. Once per gesture is enough only because `blockPan` freezes the zoom.
  let pxPerUnit = $state(1)

  function scale(): number {
    const ctm = svgEl?.getScreenCTM()
    return ctm == null || ctm.a === 0 ? 1 : ctm.a
  }

  /** A screen-px radius as normalized tolerance per axis: a circle on screen, not an ellipse. */
  function snapToleranceFor(pointerType: string, k: number): { x: number; y: number } {
    const px = pointerType === 'mouse' ? SNAP_PX.mouse : SNAP_PX.touch
    if (box.width === 0 || box.height === 0) return { x: 0, y: 0 }
    return { x: px / (k * box.width), y: px / (k * box.height) }
  }

  function beginGesture(event: PointerEvent) {
    const k = scale()
    lastPointerType = event.pointerType
    pxPerUnit = k
    editor.snapTolerance = snapToleranceFor(event.pointerType, k)
  }

  // Placement (armed): press-drag-release. The raw finger position is what commits; the editor
  // resolves it once, at release, so the preview cannot resolve it differently.
  let placeAt = $state<{ x: number; y: number }>()

  let placeIntent = $state<PlacementIntent>()

  let snapTarget = $state<TopoPoint>()

  // No provisional dot when release will select an existing point: drawing a point that will not
  // exist is a lie. The ring already marks which point it is.
  const placing = $derived(placeIntent?.kind === 'place' ? { x: placeIntent.x, y: placeIntent.y } : undefined)

  /** Preview a placement through the editor, which owns what a release at this position means. */
  function preview(clientX: number, clientY: number): boolean {
    const norm = toNorm(clientX, clientY)
    if (norm == null) return false
    const intent = editor.placementIntentAt(norm.x, norm.y)
    placeAt = norm
    placeIntent = intent
    snapTarget = intent?.kind === 'select' ? intent.point : intent?.snapped
    // The lens centres on what the release does: the point being selected, or where a point lands.
    showLens(clientX, clientY, intent?.kind === 'select' ? intent.point : intent)
    return true
  }

  type Drag =
    | { kind: 'line'; lastX: number; lastY: number; moved: boolean; routeFk: number; startX: number; startY: number }
    | { kind: 'place' }
    | { kind: 'point'; moved: boolean; pointId: string; startX: number; startY: number }
  let drag = $state<Drag>()

  // Selecting a line renders the insert-point `+` markers under the finger this same frame, so the
  // press's trailing click would otherwise land on a marker (touch: inserts) or the svg background
  // (mouse: deselects). Swallow that one click so insert/deselect needs a fresh, deliberate tap.
  let swallowNextClick = false
  function onSwallowClick(event: MouseEvent) {
    if (!swallowNextClick) return
    swallowNextClick = false
    event.stopPropagation()
  }

  function onSurfacePointerDown(event: PointerEvent) {
    if (editor.pointType == null || editor.selectedRouteFk == null) return
    // In arm mode a press starts placement, never a pan.
    event.stopPropagation()
    beginGesture(event)
    if (!preview(event.clientX, event.clientY)) return
    drag = { kind: 'place' }
    svgEl?.setPointerCapture?.(event.pointerId)
  }

  function onPointHandleDown(event: PointerEvent, pointId: string) {
    // Armed: yield to placement, or the grab ring leaves a dead zone that silently disarms.
    if (editor.pointType != null) return
    event.stopPropagation()
    beginGesture(event)
    editor.beginStroke()
    drag = { kind: 'point', moved: false, pointId, startX: event.clientX, startY: event.clientY }
    showLens(
      event.clientX,
      event.clientY,
      selected?.points.find((point) => point.id === pointId),
    )
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  function onLineDown(event: PointerEvent, routeFk: number) {
    // Armed: yield to placement. On a phone this band is wider than the snap catchment.
    if (editor.pointType != null) return
    event.stopPropagation()
    beginGesture(event)
    if (routeFk !== editor.selectedRouteFk) {
      editor.selectRoute(routeFk)
      swallowNextClick = true
      return
    }
    editor.beginStroke()
    drag = {
      kind: 'line',
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      routeFk,
      startX: event.clientX,
      startY: event.clientY,
    }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event: PointerEvent) {
    if (drag == null) return
    if (drag.kind === 'place') {
      preview(event.clientX, event.clientY)
    } else if (drag.kind === 'point') {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > TAP_SLOP) drag.moved = true
      const norm = toNorm(event.clientX, event.clientY)
      if (norm != null) {
        snapTarget = editor.dragPoint(drag.pointId, norm.x, norm.y)
        showLens(event.clientX, event.clientY, snapTarget ?? norm)
      }
    } else {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > TAP_SLOP) drag.moved = true
      const from = toNorm(drag.lastX, drag.lastY)
      const to = toNorm(event.clientX, event.clientY)
      if (from != null && to != null) editor.dragLine(drag.routeFk, to.x - from.x, to.y - from.y)
      drag.lastX = event.clientX
      drag.lastY = event.clientY
    }
  }

  function onPointerUp() {
    if (drag == null) return
    if (drag.kind === 'place' && placeAt != null) {
      // Keyed on what `place` DID, never on the preview: it resolves again at commit, and a line
      // syncing in between flips the answer. Selecting disarms, so a missed swallow lets this
      // gesture's own trailing click reach `onSurfaceClick` and deselect the whole line.
      if (editor.place(placeAt.x, placeAt.y) === 'select') swallowNextClick = true
    } else if (drag.kind === 'point' && !drag.moved) {
      // A tap on a handle (no drag) selects it; delete lives in the card.
      editor.selectPoint(drag.pointId)
    }
    // Drop any pre-gesture snapshot the gesture never committed (a no-op line/handle tap), so
    // it doesn't push an empty undo step or wipe the redo stack.
    editor.endStroke()
    endGesture()
  }

  // Without this a cancelled touch leaves the lens stuck and drops a phantom point on the next release.
  function onPointerCancel() {
    if (drag == null) return
    editor.endStroke()
    endGesture()
  }

  function endGesture() {
    drag = undefined
    placeAt = undefined
    placeIntent = undefined
    snapTarget = undefined
    lens = undefined
  }

  // Background tap (unarmed): deselect the line.
  function onSurfaceClick() {
    if (editor.pointType == null) editor.selectRoute(undefined)
  }

  const handleFill = (type: TopoPoint['type']) =>
    type === 'start'
      ? 'var(--color-primary-500)'
      : type === 'top'
        ? 'var(--color-success-500)'
        : 'var(--color-surface-50)'
</script>

<svelte:window onpointercancel={onPointerCancel} onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div
  bind:this={containerEl}
  class={['bg-surface-800 relative overflow-hidden', className]}
  style:aspect-ratio={box.aspectRatio}
  use:panzoom={{
    aspect: box.aspect,
    blockPan: editor.pointType != null || drag != null,
    enabled: true,
    minScale: 0.5,
    onZoom,
    overscroll: true,
    resetSignal: resetZoom,
  }}
>
  <div class="absolute inset-0">
    <TopoImage {alt} {box} path={imagePath} />

    {#if box.ready}
      <svg
        bind:this={svgEl}
        class="absolute inset-0 h-full w-full"
        viewBox={box.viewBox}
        fill="none"
        role="presentation"
        onpointerdowncapture={() => (swallowNextClick = false)}
        onpointerdown={onSurfacePointerDown}
        onmousedown={(event) => editor.pointType != null && stopPan(event)}
        ontouchstart={(event) => editor.pointType != null && stopPan(event)}
        onclickcapture={onSwallowClick}
        onclick={onSurfaceClick}
      >
        {#each rendered as line (line.routeFk)}
          <g opacity={selected != null && !line.selected ? 0.4 : 1}>
            <!-- Fat invisible hit-line: tap to select, drag (when selected) to move. Pointer-only
                 by nature (moving a line means dragging it on the photo), so no keyboard handler. -->
            {#if line.d}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <path
                class="svg-press"
                data-no-pan
                d={line.d}
                stroke="transparent"
                stroke-width="24"
                vector-effect="non-scaling-stroke"
                style="pointer-events: stroke; cursor: pointer"
                role="button"
                tabindex="-1"
                aria-label={m.topo_selectLine()}
                onpointerdown={(event) => onLineDown(event, line.routeFk)}
                onmousedown={stopPan}
                ontouchstart={stopPan}
                onclick={(event) => event.stopPropagation()}
              />
            {/if}

            <TopoLine {line} unit={box.unit} boxHeight={box.height} />
          </g>
        {/each}

        {#each sharedRings as ring, index (index)}
          <circle
            cx={ring.x}
            cy={ring.y}
            r={box.unit * 1.7}
            fill="none"
            stroke="var(--color-primary-500)"
            stroke-width="3"
            stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke"
          />
        {/each}

        <!-- Snap ring: screen-px sized to read from under a thumb, dark halo for an arbitrary rock
             backdrop. No transition, it tracks the finger per frame. -->
        {#if snapTarget != null}
          {@const cx = snapTarget.x * box.width}
          {@const cy = snapTarget.y * box.height}
          {@const r = SNAP_RING_PX / pxPerUnit}
          <circle
            class="pointer-events-none"
            {cx}
            {cy}
            {r}
            fill="none"
            stroke="oklch(0 0 0 / 0.55)"
            stroke-width="7"
            vector-effect="non-scaling-stroke"
          />
          <circle
            class="pointer-events-none"
            {cx}
            {cy}
            {r}
            fill="none"
            stroke="var(--color-primary-500)"
            stroke-width="3"
            vector-effect="non-scaling-stroke"
          />
        {/if}

        <!-- Provisional placement point (press-drag-release under the lens). -->
        {#if placing != null}
          <circle
            cx={placing.x * box.width}
            cy={placing.y * box.height}
            r={box.unit * 1.6}
            fill="var(--color-primary-500)"
            opacity="0.7"
            stroke="oklch(0 0 0 / 0.6)"
            stroke-width="3"
            vector-effect="non-scaling-stroke"
          />
        {/if}

        {#if selected != null}
          {#each selected.points as point (point.id)}
            {#if point.id === editor.selectedPointId}
              <circle
                class="pointer-events-none"
                cx={point.x * box.width}
                cy={point.y * box.height}
                r={box.unit * 2.4}
                fill="none"
                stroke="var(--color-primary-500)"
                stroke-width="3"
                vector-effect="non-scaling-stroke"
              />
            {/if}
            <circle
              class="pointer-events-none"
              cx={point.x * box.width}
              cy={point.y * box.height}
              r={box.unit * 1.6}
              fill={handleFill(point.type)}
              stroke="oklch(0 0 0 / 0.6)"
              stroke-width="3"
              vector-effect="non-scaling-stroke"
            />
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- Invisible grab area: ~44px on screen at any zoom, painted above the lines so a
                 near miss drags the point, not the route. -->
            <circle
              class="svg-press"
              data-no-pan
              cx={point.x * box.width}
              cy={point.y * box.height}
              r={box.unit * 1.6}
              fill="transparent"
              stroke="transparent"
              stroke-width={grabStroke}
              vector-effect="non-scaling-stroke"
              style="cursor: grab; touch-action: none; pointer-events: all"
              role="button"
              tabindex="-1"
              aria-label={m.topo_movePoint()}
              onpointerdown={(event) => onPointHandleDown(event, point.id)}
              onmousedown={stopPan}
              ontouchstart={stopPan}
              onclick={(event) => event.stopPropagation()}
            />
          {/each}
        {/if}

        <!-- After the handles: their grab rings are ~44px, so painting these first left the `+`
             unreachable on any segment shorter than that. -->
        {#each inserts as spot (spot.afterId)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <g
            class="svg-press"
            data-no-pan
            style="cursor: copy"
            role="button"
            tabindex="-1"
            aria-label={m.topo_insertPoint()}
            onpointerdown={(event) => {
              event.stopPropagation()
              beginGesture(event)
            }}
            onmousedown={stopPan}
            ontouchstart={stopPan}
            onclick={(event) => {
              event.stopPropagation()
              editor.insertMiddleAfter(spot.afterId, spot.nx, spot.ny)
            }}
          >
            <circle
              cx={spot.x}
              cy={spot.y}
              r={box.unit * 1.1}
              fill="var(--color-surface-950)"
              opacity="0.6"
              stroke="var(--color-surface-50)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
            <path
              d={`M${spot.x - box.unit * 0.7},${spot.y} L${spot.x + box.unit * 0.7},${spot.y}`}
              stroke="var(--color-surface-50)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
            <path
              d={`M${spot.x},${spot.y - box.unit * 0.7} L${spot.x},${spot.y + box.unit * 0.7}`}
              stroke="var(--color-surface-50)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </g>
        {/each}
      </svg>
    {/if}
  </div>
</div>

{#if lens != null}
  <TopoLens {lens} />
{/if}
