<script lang="ts">
  import Image from '$lib/components/Image/Image.svelte'
  import { gradeFgVar, gradeVar, type GradeBand } from '$lib/entities/grade/color'
  import type { TopoPoint } from '$lib/entities/topo/dto'
  import { buildLine } from '$lib/entities/topo/path'
  import type { ClassValue } from 'svelte/elements'
  import { panzoom } from './panzoom'

  interface LineInput {
    id: number
    points: TopoPoint[]
    /** Grade heat band, or `undefined` for an ungraded route (neutral line). */
    band: GradeBand | undefined
    /** How the route finishes — drives the end marker. */
    topType?: 'top' | 'topout'
    /** Guidebook-style number badged at the base of the line. */
    number?: number
  }

  interface Props {
    /** `files.path` of the topo image. */
    imagePath: string
    /** Stored pixel width of the topo image (`files.width`) — gives the box its
     *  aspect ratio and the overlay its coordinate space before the photo loads. */
    width?: number
    /** Stored pixel height; see `width`. */
    height?: number
    alt: string
    /** Route lines to draw, each coloured by its grade band. */
    lines: LineInput[]
    /** Emphasise this line and dim the rest (they stay visible). Bindable so tap-focus syncs. */
    highlightId?: number
    /** Let the user tap a line to focus it (toggles `highlightId`). */
    interactive?: boolean
    /** Let the user pinch / wheel zoom and drag to pan, to inspect holds. */
    zoomable?: boolean
    /** Smooth Catmull-Rom curves (default) vs straight segments between points. */
    curved?: boolean
    class?: ClassValue
  }

  let {
    imagePath,
    width,
    height,
    alt,
    lines,
    highlightId = $bindable(),
    interactive = false,
    zoomable = false,
    curved = true,
    class: className,
  }: Props = $props()

  // The stored dims are the authoritative viewBox: they are the ORIGINAL's pixel
  // space, which legacy pixel paths (any the migration couldn't convert) were
  // drawn against — the loaded image is a smaller derivative, so its natural size
  // is the wrong space for them. 0–1 fraction paths are scale-invariant and the
  // aspect ratio is identical either way, so stored-dims-first is also free for
  // the normal case, and box + overlay render before the image arrives. Natural
  // size (bound to the loaded image) is only the fallback for files without
  // backfilled dims — there the overlay waits for the load, as before. The Image
  // is keyed on `imagePath` so a topo switch remounts it and resets these to 0.
  let naturalWidth = $state(0)
  let naturalHeight = $state(0)

  const boxWidth = $derived(width || naturalWidth || 0)
  const boxHeight = $derived(height || naturalHeight || 0)

  const ready = $derived(boxWidth > 0 && boxHeight > 0)

  // Marker size as a fraction of the image, so dots/arrows stay sized relative to
  // the rock at any zoom.
  const unit = $derived(Math.min(boxWidth, boxHeight) * 0.016)

  const rendered = $derived(
    lines.map((line) => {
      const { d, bracket, starts, top } = buildLine(line.points, curved, boxWidth, boxHeight)
      return { id: line.id, band: line.band, topType: line.topType, number: line.number, d, bracket, starts, top }
    }),
  )

  // Draw the highlighted line last so it sits above the dimmed ones.
  const ordered = $derived([...rendered].sort((a, b) => Number(a.id === highlightId) - Number(b.id === highlightId)))

  // Start holds: dedupe across all lines and draw once. A shared hold records every
  // line through it (for highlight dimming) and takes the band of the last line —
  // i.e. the top-most line at that point — so the marker matches the line above it.
  const holds = $derived.by(() => {
    const seen: Record<string, { key: string; x: number; y: number; ids: number[]; band: GradeBand | undefined }> = {}
    for (const line of rendered) {
      for (const start of line.starts) {
        const key = `${Math.round(start.x)},${Math.round(start.y)}`
        const entry = (seen[key] ??= { key, x: start.x, y: start.y, ids: [], band: undefined })
        entry.ids.push(line.id)
        entry.band = line.band
      }
    }
    return Object.values(seen)
  })

  function toggle(id: number) {
    highlightId = highlightId === id ? undefined : id
  }

  // A shared hold steps through its lines on each tap, then clears after the
  // last — for a single-line hold that reduces to a plain toggle.
  function cycleHold(ids: number[]) {
    const index = highlightId == null ? -1 : ids.indexOf(highlightId)
    highlightId = ids[index + 1]
  }

  // Button behaviour for an SVG overlay element: tap or Enter/Space runs the action.
  const press = (action: () => void) => ({
    role: 'button' as const,
    tabindex: 0,
    style: 'cursor: pointer',
    onclick: (event: MouseEvent) => {
      event.stopPropagation()
      action()
    },
    onkeydown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        action()
      }
    },
  })

  // End marker geometry: an up-arrow for a mantle over the top, a cap bar for a finish hold.
  function topMarkerD(point: { x: number; y: number }, topType: LineInput['topType']): string {
    const { x, y } = point
    if (topType === 'topout') {
      return `M${x - unit * 1.3},${y + unit * 0.5} L${x},${y - unit} L${x + unit * 1.3},${y + unit * 0.5}`
    }
    return `M${x - unit * 1.4},${y} L${x + unit * 1.4},${y}`
  }
</script>

<!-- A cased grade-coloured stroke (dark halo + colour), shared by line, bracket and end marker. -->
{#snippet stroke(d: string, band: GradeBand | undefined)}
  <path
    class="pointer-events-none"
    {d}
    stroke="oklch(0 0 0 / 0.55)"
    stroke-width="6"
    stroke-linecap="round"
    stroke-linejoin="round"
    vector-effect="non-scaling-stroke"
  />
  <path
    class="pointer-events-none"
    {d}
    stroke={gradeVar(band)}
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
    vector-effect="non-scaling-stroke"
  />
{/snippet}

<div
  class={['bg-surface-950 relative overflow-hidden rounded-xl', className]}
  style:aspect-ratio={ready ? `${boxWidth} / ${boxHeight}` : undefined}
  use:panzoom={{ enabled: zoomable, aspect: ready ? boxWidth / boxHeight : undefined }}
>
  <div class="absolute inset-0">
    {#key imagePath}
      <!-- The viewer works fine off the 1024 derivative; the multi-MB original stays on the server.
           Eager: the topo IS the content wherever it renders, and the default lazy load never fires
           if the box is measured while a bottom sheet still sizes it to zero height. -->
      <Image
        path={imagePath}
        {alt}
        loading="eager"
        class="pointer-events-none h-full w-full touch-none select-none"
        fit="contain"
        previewWidth={1024}
        bind:naturalWidth
        bind:naturalHeight
      />
    {/key}

    {#if ready}
      <svg
        class={['absolute inset-0 h-full w-full', !interactive && 'pointer-events-none']}
        viewBox="0 0 {boxWidth} {boxHeight}"
        fill="none"
      >
        {#each ordered as line (line.id)}
          {@const dimmed = highlightId != null && line.id !== highlightId}
          <g opacity={dimmed ? 0.33 : 1}>
            {#if interactive}
              <path
                d={line.d}
                stroke="transparent"
                stroke-width="24"
                vector-effect="non-scaling-stroke"
                {...press(() => toggle(line.id))}
                style="pointer-events: stroke; cursor: pointer"
                aria-pressed={line.id === highlightId}
                aria-label="Toggle route line"
              />
            {/if}

            <!-- Bracket grouping the start holds, then the line, then the end marker. -->
            {#if line.bracket}
              {@render stroke(line.bracket, line.band)}
            {/if}
            {@render stroke(line.d, line.band)}
            {#if line.top}
              {@render stroke(topMarkerD(line.top, line.topType), line.band)}
            {/if}

            <!-- Guidebook number: grade-coloured disc below the start holds, dimming with its line. -->
            {#if line.number != null && line.starts.length > 0}
              {@const x = line.starts.reduce((sum, point) => sum + point.x, 0) / line.starts.length}
              {@const y = Math.min(Math.max(...line.starts.map((point) => point.y)) + unit * 3, boxHeight - unit * 1.6)}
              <g
                class={['select-none', !interactive && 'pointer-events-none']}
                {...interactive ? press(() => toggle(line.id)) : {}}
                aria-pressed={interactive ? line.id === highlightId : undefined}
                aria-label={interactive ? 'Toggle route line' : undefined}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={unit * 1.5}
                  fill={gradeVar(line.band)}
                  stroke="oklch(0 0 0 / 0.55)"
                  stroke-width="3"
                  vector-effect="non-scaling-stroke"
                />
                <text
                  {x}
                  {y}
                  fill={gradeFgVar(line.band)}
                  font-size={unit * 2}
                  font-weight="700"
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {line.number}
                </text>
              </g>
            {/if}
          </g>
        {/each}

        <!-- Start holds: drawn once on top. Dimmed with their lines when one is highlighted. -->
        {#each holds as hold (hold.key)}
          {@const dimmed = highlightId != null && !hold.ids.includes(highlightId)}
          <g
            class={[!interactive && 'pointer-events-none']}
            opacity={dimmed ? 0.25 : 1}
            {...interactive ? press(() => cycleHold(hold.ids)) : {}}
            aria-pressed={interactive ? !dimmed && highlightId != null : undefined}
            aria-label={interactive ? 'Toggle route line' : undefined}
          >
            <circle
              cx={hold.x}
              cy={hold.y}
              r={unit}
              fill="oklch(0 0 0 / 0.35)"
              stroke="oklch(0 0 0 / 0.6)"
              stroke-width="6"
              vector-effect="non-scaling-stroke"
            />
            <circle
              cx={hold.x}
              cy={hold.y}
              r={unit}
              fill="none"
              stroke={gradeVar(hold.band)}
              stroke-width="3"
              vector-effect="non-scaling-stroke"
            />
          </g>
        {/each}
      </svg>
    {/if}
  </div>
</div>
