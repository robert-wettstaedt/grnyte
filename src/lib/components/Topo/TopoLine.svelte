<svelte:options namespace="svg" />

<script lang="ts">
  import { gradeFgVar, gradeVar, type GradeBand } from '$lib/entities/grade/color'
  import { topMarkerD } from '$lib/entities/topo/path'
  import type { SVGAttributes } from 'svelte/elements'

  /** The drawn geometry of one route line (from `buildLine`) plus its grade/number. */
  interface Line {
    band: GradeBand | undefined
    bracket: string
    d: string
    /** A line as it used to be, drawn dashed under the current one. */
    ghost?: boolean
    number?: number
    starts: { x: number; y: number }[]
    top: undefined | { x: number; y: number }
    topType: 'top' | 'topout' | undefined
  }

  interface Props {
    /** Spread onto the number-badge group — the viewer makes it tap-to-toggle. */
    badgeAttrs?: SVGAttributes<SVGGElement>
    /** Image box height, to clamp the number badge inside the frame. */
    boxHeight: number
    line: Line
    /** Marker size as a fraction of the image (see `Topo.svelte`). */
    unit: number
  }

  let { badgeAttrs, boxHeight, line, unit }: Props = $props()
</script>

<!-- A cased grade-coloured stroke (dark halo + colour), shared by line, bracket and end marker.
     A ghost keeps the halo (it has to stay legible over pale rock) and dashes the colour. -->
{#snippet stroke(d: string, band: GradeBand | undefined)}
  <path
    class="pointer-events-none"
    {d}
    stroke="oklch(0 0 0 / 0.55)"
    stroke-width="6"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-dasharray={line.ghost ? '9 7' : undefined}
    vector-effect="non-scaling-stroke"
  />
  <path
    class="pointer-events-none"
    {d}
    stroke={gradeVar(band)}
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-dasharray={line.ghost ? '9 7' : undefined}
    vector-effect="non-scaling-stroke"
  />
{/snippet}

<!-- Bracket grouping the start holds, then the line, then the end marker. -->
{#if line.bracket}
  {@render stroke(line.bracket, line.band)}
{/if}
{@render stroke(line.d, line.band)}
{#if line.top}
  {@render stroke(topMarkerD(line.top, line.topType, unit), line.band)}
{/if}

<!-- Guidebook number: grade-coloured disc below the start holds. -->
{#if line.number != null && line.starts.length > 0}
  {@const cx = line.starts.reduce((sum, point) => sum + point.x, 0) / line.starts.length}
  {@const cy = Math.min(Math.max(...line.starts.map((point) => point.y)) + unit * 3, boxHeight - unit * 1.6)}
  <g {...badgeAttrs}>
    <circle
      {cx}
      {cy}
      r={unit * 1.5}
      fill={gradeVar(line.band)}
      stroke="oklch(0 0 0 / 0.55)"
      stroke-width="3"
      vector-effect="non-scaling-stroke"
    />
    <text
      x={cx}
      y={cy}
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
