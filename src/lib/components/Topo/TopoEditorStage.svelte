<script lang="ts">
  import Image from '$lib/components/Image/Image.svelte'
  import type { GradeBand } from '$lib/entities/grade/color'
  import type { TopoPoint } from '$lib/entities/topo/dto'
  import type { TopoEditor } from '$lib/entities/topo/editor.svelte'
  import { buildLine } from '$lib/entities/topo/path'
  import { m } from '$lib/paraglide/messages'
  import type { ClassValue } from 'svelte/elements'
  import { panzoom } from './panzoom'
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
    /** The drawing controller — the stage calls its place/drag/delete ops. */
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

  let naturalWidth = $state(0)
  let naturalHeight = $state(0)
  const boxWidth = $derived(width || naturalWidth || 0)
  const boxHeight = $derived(height || naturalHeight || 0)
  const ready = $derived(boxWidth > 0 && boxHeight > 0)
  const unit = $derived(Math.min(boxWidth, boxHeight) * 0.016)

  // Committed-style geometry (curve + bracket + end marker) for every line.
  const rendered = $derived(
    lines.map((line) => {
      const { bracket, d, starts, top } = buildLine(line.points, true, boxWidth, boxHeight)
      return { ...line, bracket, d, starts, top }
    }),
  )
  const selected = $derived(rendered.find((line) => line.selected))

  // Rings where points of different lines coincide (snap made them shared).
  const sharedRings = $derived.by(() => {
    const seen: Record<string, { count: number; x: number; y: number }> = {}
    for (const line of lines) {
      for (const point of line.points) {
        const key = `${point.x.toFixed(4)},${point.y.toFixed(4)}`
        const entry = (seen[key] ??= { count: 0, x: point.x * boxWidth, y: point.y * boxHeight })
        entry.count += 1
      }
    }
    return Object.values(seen).filter((entry) => entry.count > 1)
  })

  // Ghost `+` midpoints along the selected line, each inserting a middle after `afterId`.
  const inserts = $derived.by(() => {
    if (selected == null) return []
    const points = selected.points
    const spots: { afterId: string; nx: number; ny: number; x: number; y: number }[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      // Only between consecutive trunk points (skip the jump to a second start hold).
      if (a.type === 'top' || b.type === 'start') continue
      const nx = (a.x + b.x) / 2
      const ny = (a.y + b.y) / 2
      spots.push({ afterId: a.id, nx, ny, x: nx * boxWidth, y: ny * boxHeight })
    }
    return spots
  })

  /** Client coords → normalized 0-1 in image space, accounting for the panzoom transform. */
  function toNorm(clientX: number, clientY: number): undefined | { x: number; y: number } {
    const ctm = svgEl?.getScreenCTM()
    if (ctm == null || boxWidth === 0 || boxHeight === 0) return undefined
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: Math.min(1, Math.max(0, p.x / boxWidth)), y: Math.min(1, Math.max(0, p.y / boxHeight)) }
  }

  // --- magnifier lens ------------------------------------------------------

  let lens = $state<Lens>()

  /** Build the lens view centered on the point under (clientX, clientY), magnifying the
   *  live on-screen image (its rect already carries the panzoom transform). */
  function computeLens(clientX: number, clientY: number): Lens | undefined {
    const img = containerEl?.querySelector('img')
    const norm = toNorm(clientX, clientY)
    if (img == null || norm == null) return undefined
    const rect = img.getBoundingClientRect()
    const bgW = rect.width * LENS_ZOOM
    const bgH = rect.height * LENS_ZOOM
    return {
      bgH,
      bgW,
      bgX: LENS_SIZE / 2 - norm.x * bgW,
      bgY: LENS_SIZE / 2 - norm.y * bgH,
      clientX,
      clientY,
      src: img.currentSrc || img.src,
    }
  }

  function showLens(clientX: number, clientY: number) {
    lens = computeLens(clientX, clientY)
  }

  // --- gestures ------------------------------------------------------------

  const TAP_SLOP = 4
  const stopPan = (event: Event) => event.stopPropagation()

  // Placement (armed): press-drag-release, so touch can fine-tune under the lens
  // before committing. Provisional point in normalized space until release.
  let placing = $state<{ x: number; y: number }>()

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
    const norm = toNorm(event.clientX, event.clientY)
    if (norm == null) return
    placing = norm
    drag = { kind: 'place' }
    showLens(event.clientX, event.clientY)
    svgEl?.setPointerCapture?.(event.pointerId)
  }

  function onPointHandleDown(event: PointerEvent, pointId: string) {
    event.stopPropagation()
    editor.beginStroke()
    drag = { kind: 'point', moved: false, pointId, startX: event.clientX, startY: event.clientY }
    showLens(event.clientX, event.clientY)
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  function onLineDown(event: PointerEvent, routeFk: number) {
    event.stopPropagation()
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
      const norm = toNorm(event.clientX, event.clientY)
      if (norm != null) placing = norm
      showLens(event.clientX, event.clientY)
    } else if (drag.kind === 'point') {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > TAP_SLOP) drag.moved = true
      const norm = toNorm(event.clientX, event.clientY)
      if (norm != null) editor.dragPoint(drag.pointId, norm.x, norm.y)
      showLens(event.clientX, event.clientY)
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
    if (drag.kind === 'place' && placing != null) {
      editor.place(placing.x, placing.y)
    } else if (drag.kind === 'point' && !drag.moved) {
      // A tap on a handle (no drag) selects it; delete lives in the card.
      editor.selectPoint(drag.pointId)
    }
    // Drop any pre-gesture snapshot the gesture never committed (a no-op line/handle tap), so
    // it doesn't push an empty undo step or wipe the redo stack.
    editor.endStroke()
    drag = undefined
    placing = undefined
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

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div
  bind:this={containerEl}
  class={['bg-surface-800 relative overflow-hidden', className]}
  style:aspect-ratio={ready ? `${boxWidth} / ${boxHeight}` : undefined}
  use:panzoom={{
    aspect: ready ? boxWidth / boxHeight : undefined,
    blockPan: editor.pointType != null || drag != null,
    enabled: true,
    minScale: 0.5,
    onZoom,
    overscroll: true,
    resetSignal: resetZoom,
  }}
>
  <div class="absolute inset-0">
    {#key imagePath}
      <Image
        path={imagePath}
        {alt}
        loading="eager"
        class="pointer-events-none h-full w-full touch-none bg-transparent! select-none"
        fit="contain"
        previewWidth={1024}
        bind:naturalWidth
        bind:naturalHeight
      />
    {/key}

    {#if ready}
      <svg
        bind:this={svgEl}
        class="absolute inset-0 h-full w-full"
        viewBox="0 0 {boxWidth} {boxHeight}"
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

            <TopoLine {line} {unit} {boxHeight} />
          </g>
        {/each}

        {#each sharedRings as ring, index (index)}
          <circle
            cx={ring.x}
            cy={ring.y}
            r={unit * 1.7}
            fill="none"
            stroke="var(--color-primary-500)"
            stroke-width="3"
            stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke"
          />
        {/each}

        {#each inserts as spot (spot.afterId)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <g
            data-no-pan
            style="cursor: copy"
            role="button"
            tabindex="-1"
            aria-label={m.topo_insertPoint()}
            onpointerdown={(event) => event.stopPropagation()}
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
              r={unit * 1.1}
              fill="var(--color-surface-950)"
              opacity="0.6"
              stroke="var(--color-surface-50)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
            <path
              d={`M${spot.x - unit * 0.7},${spot.y} L${spot.x + unit * 0.7},${spot.y}`}
              stroke="var(--color-surface-50)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
            <path
              d={`M${spot.x},${spot.y - unit * 0.7} L${spot.x},${spot.y + unit * 0.7}`}
              stroke="var(--color-surface-50)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </g>
        {/each}

        <!-- Provisional placement point (press-drag-release under the lens). -->
        {#if placing != null}
          <circle
            cx={placing.x * boxWidth}
            cy={placing.y * boxHeight}
            r={unit * 1.6}
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
                cx={point.x * boxWidth}
                cy={point.y * boxHeight}
                r={unit * 2.4}
                fill="none"
                stroke="var(--color-primary-500)"
                stroke-width="3"
                vector-effect="non-scaling-stroke"
              />
            {/if}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <circle
              data-no-pan
              cx={point.x * boxWidth}
              cy={point.y * boxHeight}
              r={unit * 1.6}
              fill={handleFill(point.type)}
              stroke="oklch(0 0 0 / 0.6)"
              stroke-width="3"
              vector-effect="non-scaling-stroke"
              style="cursor: grab; touch-action: none"
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
      </svg>
    {/if}
  </div>
</div>

{#if lens != null}
  <TopoLens {lens} />
{/if}
