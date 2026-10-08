<!-- A bar chart before its numbers: bars rising from a baseline over a label row, the size of
     `GradeHistogram` and `BarChart`. -->
<script lang="ts">
  import type { ClassValue } from 'svelte/elements'

  interface Props {
    bars?: number
    class?: ClassValue
  }

  const { bars = 8, class: className }: Props = $props()

  // Fixed, so a reload does not reshuffle it; a bell shape reads as a grade spread.
  const HEIGHTS = [20, 45, 70, 90, 75, 50, 30, 15]
</script>

<div class={['skeleton-hold flex flex-col gap-1.5', className]} aria-busy="true">
  <div class="flex h-26 items-end gap-1">
    {#each { length: bars }, index (index)}
      <div
        class="bg-surface-200-800 w-full animate-pulse rounded-t-sm"
        style:height="{HEIGHTS[index % HEIGHTS.length]}%"
      ></div>
    {/each}
  </div>
  <div class="bg-surface-200-800 h-3.5 animate-pulse rounded"></div>
</div>
