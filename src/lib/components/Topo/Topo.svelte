<script lang="ts">
  import Image from '$lib/components/Image/Image.svelte'
  import { gradeVar, type GradeBand } from '$lib/entities/grade/color'
  import type { TopoPoint } from '$lib/entities/topo/dto'
  import { buildLine } from '$lib/entities/topo/path'
  import type { ClassValue } from 'svelte/elements'
  import { panzoom } from './panzoom'
  import TopoLine from './TopoLine.svelte'

  interface LineInput {
    /** Grade heat band, or `undefined` for an ungraded route (neutral line). */
    band: GradeBand | undefined
    id: number
    /** Guidebook-style number badged at the base of the line. */
    number?: number
    points: TopoPoint[]
    /** How the route finishes — drives the end marker. */
    topType?: 'top' | 'topout'
  }

  interface Props {
    alt: string
    class?: ClassValue
    /** Smooth Catmull-Rom curves (default) vs straight segments between points. */
    curved?: boolean
    /** Stored pixel height; see `width`. */
    height?: number
    /** Emphasise this line and dim the rest (they stay visible). Bindable so tap-focus syncs. */
    highlightId?: number
    /** `files.path` of the topo image. */
    imagePath: string
    /** Let the user tap a line to focus it (toggles `highlightId`). */
    interactive?: boolean
    /** Route lines to draw, each coloured by its grade band. */
    lines: LineInput[]
    /** Stored pixel width of the topo image (`files.width`) — gives the box its
     *  aspect ratio and the overlay its coordinate space before the photo loads. */
    width?: number
    /** Let the user pinch / wheel zoom and drag to pan, to inspect holds. */
    zoomable?: boolean
  }

  let {
    alt,
    class: className,
    curved = true,
    height,
    highlightId = $bindable(),
    imagePath,
    interactive = false,
    lines,
    width,
    zoomable = false,
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
      const { bracket, d, starts, top } = buildLine(line.points, curved, boxWidth, boxHeight)
      return { band: line.band, bracket, d, id: line.id, number: line.number, starts, top, topType: line.topType }
    }),
  )

  // Draw the highlighted line last so it sits above the dimmed ones.
  const ordered = $derived([...rendered].sort((a, b) => Number(a.id === highlightId) - Number(b.id === highlightId)))

  // Start holds: dedupe across all lines and draw once. A shared hold records every
  // line through it (for highlight dimming) and takes the band of the last line —
  // i.e. the top-most line at that point — so the marker matches the line above it.
  const holds = $derived.by(() => {
    const seen: Record<string, { band: GradeBand | undefined; ids: number[]; key: string; x: number; y: number }> = {}
    for (const line of rendered) {
      for (const start of line.starts) {
        const key = `${Math.round(start.x)},${Math.round(start.y)}`
        const entry = (seen[key] ??= { band: undefined, ids: [], key, x: start.x, y: start.y })
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
    role: 'button' as const,
    style: 'cursor: pointer',
    tabindex: 0,
  })
</script>

<div
  class={['bg-surface-950 relative overflow-hidden rounded-xl', className]}
  style:aspect-ratio={ready ? `${boxWidth} / ${boxHeight}` : undefined}
  use:panzoom={{ aspect: ready ? boxWidth / boxHeight : undefined, enabled: zoomable }}
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
        class="pointer-events-none h-full w-full touch-none bg-transparent! select-none"
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

            <!-- Bracket + line + end marker + guidebook number, dimming with the group above. The
                 number badge is tap-to-toggle when interactive (it sits below the line's hit-path). -->
            <TopoLine
              {line}
              {unit}
              {boxHeight}
              badgeAttrs={interactive
                ? {
                    class: 'select-none',
                    ...press(() => toggle(line.id)),
                    'aria-label': 'Toggle route line',
                    'aria-pressed': line.id === highlightId,
                  }
                : { class: 'select-none pointer-events-none' }}
            />
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
