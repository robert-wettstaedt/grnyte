<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity'
  import { fade } from 'svelte/transition'

  // One KPI: a label and the number under it. Belongs inside a `<dl>` grid, which is why it
  // renders dt/dd rather than a heading. Same type scale as ProfileHeader's stat strip.
  interface Props {
    /** Fade in on mount, for a tile whose label swaps with the data. */
    animate?: boolean
    /** Sentence case, no trailing colon. */
    label: string
    /** Already formatted: the tile never decides a locale or a unit. */
    value: string
  }

  const { animate = false, label, value }: Props = $props()

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current || !animate ? 0 : 150)
</script>

<!-- The transition lives here rather than on a wrapper at the call site: a `dl` group allows one
     div around its dt/dd, and a second one stops the tile stretching to the grid row. -->
<div
  class="border-surface-200-800 bg-surface-50-950 flex h-full flex-col gap-1 rounded-xl border p-4"
  in:fade={{ duration }}
>
  <dt class="text-surface-500 text-xs font-semibold tracking-wide uppercase">{label}</dt>
  <!-- `mt-auto`: grid rows stretch tiles to the tallest, so a label that wraps would otherwise drop
       its own value a line below its neighbours'. Proportional figures, no column of digits here. -->
  <dd class="mt-auto text-2xl font-bold">{value}</dd>
</div>
