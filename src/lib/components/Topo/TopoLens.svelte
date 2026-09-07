<script module lang="ts">
  export const LENS_SIZE = 132
  export const LENS_ZOOM = 2.4

  /** A magnifier view centred on the point under the pointer. */
  export interface Lens {
    bgH: number
    bgW: number
    bgX: number
    bgY: number
    clientX: number
    clientY: number
    src: string
  }
</script>

<script lang="ts">
  const GAP = 28

  let { lens }: { lens: Lens } = $props()

  // Above the finger, flipped below near the top edge where `top` points sit.
  const top = $derived(lens.clientY - LENS_SIZE - GAP < 8 ? lens.clientY + GAP : lens.clientY - LENS_SIZE - GAP)
  // `clientWidth`, not `innerWidth`: the latter counts a classic scrollbar.
  const left = $derived(
    Math.min(Math.max(8, lens.clientX - LENS_SIZE / 2), document.documentElement.clientWidth - LENS_SIZE - 8),
  )
</script>

<div
  class="border-surface-50-950 pointer-events-none fixed z-50 overflow-hidden rounded-full border-2 shadow-2xl"
  style:width="{LENS_SIZE}px"
  style:height="{LENS_SIZE}px"
  style:left="{left}px"
  style:top="{top}px"
>
  <div
    class="h-full w-full bg-no-repeat"
    style:background-image="url({lens.src})"
    style:background-size="{lens.bgW}px {lens.bgH}px"
    style:background-position="{lens.bgX}px {lens.bgY}px"
  ></div>
  <!-- Crosshair at the lens centre = exactly where the point lands. -->
  <div class="pointer-events-none absolute inset-1/2 h-3 w-3 -translate-1/2 rounded-full border-2 border-red-500"></div>
</div>
