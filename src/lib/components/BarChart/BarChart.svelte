<script lang="ts">
  interface Bar {
    /** Compact axis label, e.g. a month initial. */
    label: string
    /** Full description for assistive tech and the native tooltip, e.g. "September 2026: 4". */
    title: string
    value: number
  }

  interface Props {
    bars: Bar[]
    /** Accessible name for the chart as a whole. */
    label: string
    /** Fires with the picked bar and its position, or null when the selection clears. */
    onselect?: (bar: (Bar & { index: number }) | null) => void
  }

  const { bars, label, onselect }: Props = $props()

  const max = $derived(bars.reduce((highest, bar) => Math.max(highest, bar.value), 0))

  // Zero stays zero so an empty slot reads as empty; the floor keeps a rare
  // non-zero bar from collapsing to a hairline beside a tall one.
  const heightOf = (value: number): number => (max <= 0 || value <= 0 ? 0 : Math.max(6, (value / max) * 100))

  let selected = $state<null | number>(null)

  // Same contract as GradeHistogram: a tap toggles a persistent selection, and tapping the active
  // bar or any empty one clears it. Selecting nothing must not read as selecting zero.
  const toggle = (bar: Bar, index: number): void => {
    const next = bar.value > 0 && selected !== index ? index : null
    selected = next
    onselect?.(next == null ? null : { ...bar, index })
  }

  // A chart nobody can pick from stays plain markup: a button with no handler is a tab stop that
  // does nothing, and the bars are decorative once their values are read out elsewhere.
  const pickable = $derived(onselect != null)
</script>

{#snippet fill(bar: Bar, index: number)}
  <span
    class="min-h-0.5 w-full rounded-t-sm transition-[height]"
    class:bg-primary-500={bar.value > 0 && selected !== index}
    class:bg-primary-300={bar.value > 0 && selected === index}
    class:bg-surface-400-600={bar.value <= 0}
    style="height: {heightOf(bar.value)}%"
  ></span>
{/snippet}

<!-- A permanent baseline rule plus a minimum bar height: an all-zero chart reads
     as flat rather than as a chart that failed to render. -->
<div role="group" aria-label={label}>
  <div class="border-surface-400-600 flex h-26 items-end gap-1 border-b">
    {#each bars as bar, index (index)}
      {#if pickable}
        <button
          type="button"
          class="flex h-full min-w-0 flex-1 cursor-pointer items-end"
          aria-label={bar.title}
          aria-pressed={selected === index}
          title={bar.title}
          onclick={() => toggle(bar, index)}
        >
          {@render fill(bar, index)}
        </button>
      {:else}
        <div role="img" aria-label={bar.title} title={bar.title} class="flex h-full min-w-0 flex-1 items-end">
          {@render fill(bar, index)}
        </div>
      {/if}
    {/each}
  </div>

  <!-- Mirrors the bar grid so each label centres over its own column. -->
  <div class="mt-1.5 flex gap-1">
    {#each bars as bar, index (index)}
      <div class="relative h-3.5 min-w-0 flex-1">
        <span
          class="absolute left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap tabular-nums"
          class:text-surface-600-400={selected !== index}
          class:text-primary-500={selected === index}
          class:font-semibold={selected === index}
        >
          {bar.label}
        </span>
      </div>
    {/each}
  </div>
</div>
