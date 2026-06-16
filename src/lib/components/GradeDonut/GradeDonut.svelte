<script lang="ts">
  import { computeDonutSegments, DONUT_CENTER, DONUT_RADIUS, DONUT_STROKE_WIDTH } from '$lib/entities/grade/donut'

  interface Props {
    /** Route counts keyed by grade id (`gradeFk`). */
    countByGrade: Map<number, number>
    /** Number shown in the donut's center — total routes in the area. */
    total: number
    /** Diameter in pixels. */
    size?: number
  }

  const { countByGrade, total, size = 56 }: Props = $props()

  const radius = DONUT_RADIUS
  const center = DONUT_CENTER
  const strokeWidth = DONUT_STROKE_WIDTH

  // The centered count scales with the donut, but longer numbers also need to
  // shrink so they don't spill past the hole: ≤3 digits keep the comfortable
  // base size, 4+ digits scale down by digit count to stay inside the ring.
  const fontSize = $derived(Math.round(size * Math.min(0.3, 1 / String(total).length)))

  // One arc per difficulty-band color (easy → hard), sized by how many routes
  // fall in that band, followed by a grey arc for ungraded routes.
  const segments = $derived(computeDonutSegments(countByGrade, total))
</script>

<div class="relative grid flex-none place-items-center" style:width="{size}px" style:height="{size}px">
  <svg class="size-full" viewBox="0 0 {center * 2} {center * 2}" role="presentation">
    <circle
      class="text-surface-300-700"
      cx={center}
      cy={center}
      fill="none"
      r={radius}
      stroke="currentColor"
      stroke-width={strokeWidth}
    />

    {#each segments as segment, index (index)}
      <circle
        cx={center}
        cy={center}
        fill="none"
        r={radius}
        stroke={segment.color}
        stroke-dasharray="{segment.length} {100 - segment.length}"
        stroke-dashoffset={segment.dashOffset}
        stroke-width={strokeWidth}
      />
    {/each}
  </svg>

  <span class="absolute font-bold tabular-nums" style:font-size="{fontSize}px">{total}</span>
</div>
