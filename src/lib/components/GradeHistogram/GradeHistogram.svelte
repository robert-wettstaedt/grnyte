<script lang="ts">
  import { getGradeColor } from '$lib/entities/grade/color'
  import type { Grade } from '$lib/entities/grade/dto'
  import type { GradingScale } from '$lib/entities/user/dto'
  import { m } from '$lib/paraglide/messages.js'

  interface Props {
    /** Route counts keyed by grade id (`gradeFk`). */
    countByGrade: Map<number, number>
    /** All grades, ordered low → high. */
    grades: Grade[]
    gradingScale: GradingScale
    onselect?: (bar: null | { count: number; id: number; label: string }) => void
    /** Show the count above each non-empty bar (for small-n charts like grade votes). */
    showCounts?: boolean
    /** Routes with no grade, surfaced as a trailing count below the chart. */
    ungraded?: number
  }

  const { countByGrade, grades, gradingScale, onselect, showCounts = false, ungraded = 0 }: Props = $props()

  interface Bar {
    color: string
    count: number
    id: number
    /** Compact axis label. */
    label: string
  }

  // Grade strings carry the scale as a redundant prefix (e.g. `FB 6A+`); drop it
  // so the axis reads as only `6A+`. The V scale (`V5`) has no prefix to strip.
  const stripScale = (value: string): string =>
    value.startsWith(`${gradingScale} `) ? value.slice(gradingScale.length + 1) : value

  // Grades that have routes, low → high. Drives both the histogram's
  // visible span and the sparse-data chip fallback.
  const occupiedGrades = $derived(grades.filter((grade) => (countByGrade.get(grade.id) ?? 0) > 0))

  // Restrict the chart to the span of grades that occur: empty tails
  // at either end of the full scale would otherwise flatten the visible
  // distribution. Internal gaps are kept so the shape stays honest. Ungraded
  // routes are held out of the chart and counted separately below.
  const bars = $derived.by(() => {
    const result: Bar[] = []

    if (occupiedGrades.length > 0) {
      const firstId = occupiedGrades[0].id
      const lastId = occupiedGrades[occupiedGrades.length - 1].id
      for (const grade of grades) {
        if (grade.id >= firstId && grade.id <= lastId) {
          result.push({
            color: getGradeColor(grade),
            count: countByGrade.get(grade.id) ?? 0,
            id: grade.id,
            label: stripScale(grade[gradingScale] ?? '—'),
          })
        }
      }
    }

    return result
  })

  interface Chip {
    color: string
    count: number
    id: number
    label: string
  }

  // One entry per grade that has routes. Shown when there are too few distinct
  // grades for a bar chart to read as anything but a couple of oversized blocks.
  const chips = $derived.by(() =>
    occupiedGrades.map<Chip>((grade) => ({
      color: getGradeColor(grade),
      count: countByGrade.get(grade.id) ?? 0,
      id: grade.id,
      label: stripScale(grade[gradingScale] ?? '—'),
    })),
  )

  // A bar chart needs a handful of columns to read as a distribution; below this
  // the bars balloon into full-width blocks, so fall back to compact grade chips.
  const minDistinctGrades = 4
  const useHistogram = $derived(chips.length >= minDistinctGrades)

  const maxCount = $derived(bars.reduce((max, bar) => Math.max(max, bar.count), 0))

  // Labelling every column smears the axis once the bars get narrow, so thin it
  // to a handful of evenly spaced reference grades. Picked by position (rather
  // than a modulo step) so the first and last grade always anchor the axis and
  // no two labels ever land in adjacent columns.
  const maxLabels = 8
  const labelIndices = $derived.by(() => {
    const count = bars.length
    const shown = Math.min(count, maxLabels)
    const indices: number[] = []
    for (let i = 0; i < shown; i += 1) {
      indices.push(shown <= 1 ? 0 : Math.round((i * (count - 1)) / (shown - 1)))
    }
    return indices
  })
  const showLabel = (index: number): boolean => labelIndices.includes(index)

  // Scale each bar against the tallest, with a small floor so rare graded bars
  // stay visible rather than collapsing to a hairline. Empty grades inside the
  // range stay at zero so the gap reads as a gap.
  const barHeight = (count: number): number => {
    if (maxCount === 0 || count === 0) {
      return 0
    }
    return Math.max(8, (count / maxCount) * 100)
  }

  let selectedId = $state<null | number>(null)

  // Click/tap toggles a *persistent* selection (survives the pointer leaving), so
  // a caller can reveal content below the chart and the user can still reach it.
  // Clicking the active bar/chip, or any empty one, clears the selection.
  const toggle = (item: Bar | Chip): void => {
    const next = item.count > 0 && selectedId !== item.id ? item : null
    selectedId = next?.id ?? null
    onselect?.(next != null ? { count: next.count, id: next.id, label: next.label } : null)
  }
</script>

{#if useHistogram}
  <!-- Count labels overhang the tallest bar, so give them headroom. -->
  <div role="group" aria-label={m.areas_grades()} class:pt-4={showCounts}>
    <!-- Each grade is a full-height column button rising from a shared baseline,
         scaled against the busiest grade in the range; clicking one toggles a
         persistent selection the caller can react to. Full-height keeps the tap
         target usable even for short bars. -->
    <div class="flex h-26 items-end gap-1">
      {#each bars as bar (bar.id)}
        <button
          type="button"
          class="flex h-full flex-1 cursor-pointer items-end"
          aria-pressed={selectedId === bar.id}
          aria-label="{bar.label}: {m.routes_routesCount({ count: bar.count })}"
          onclick={() => toggle(bar)}
        >
          <span
            class="relative w-full rounded-t-sm transition-[height,opacity]"
            class:opacity-40={selectedId != null && selectedId !== bar.id}
            style="height: {barHeight(bar.count)}%; background-color: {bar.color}"
          >
            {#if showCounts && bar.count > 0}
              <span
                class="text-surface-600-400 absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap tabular-nums"
              >
                {bar.count}
              </span>
            {/if}
          </span>
        </button>
      {/each}
    </div>

    <!-- Mirrors the bar grid so each label centres over its column. Labels are
         absolutely placed and allowed to overflow into the empty thinned slots
         beside them, so they read in full instead of being clipped to a column. -->
    <div class="mt-1.5 flex gap-1">
      {#each bars as bar, index (bar.id)}
        <div class="relative h-3.5 min-w-0 flex-1">
          {#if showLabel(index)}
            <span
              class="text-surface-600-400 absolute left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap tabular-nums"
            >
              {bar.label}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{:else if chips.length > 0}
  <!-- Too few grades for a meaningful chart: list each grade as a compact chip
       (color swatch · grade · count) instead of an oversized bar. -->
  <div class="flex flex-wrap gap-2">
    {#each chips as chip (chip.id)}
      <button
        type="button"
        class="border-surface-300-700 bg-surface-200-800 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 transition-opacity"
        class:opacity-40={selectedId != null && selectedId !== chip.id}
        class:border-primary-500={selectedId === chip.id}
        aria-pressed={selectedId === chip.id}
        aria-label="{chip.label}: {m.routes_routesCount({ count: chip.count })}"
        title={m.routes_routesCount({ count: chip.count })}
        onclick={() => toggle(chip)}
      >
        <span class="size-2.5 flex-none rounded-full" style="background-color: {chip.color}"></span>
        <span class="text-sm font-semibold">{chip.label}</span>
        <span class="text-surface-600-400 text-xs tabular-nums">{chip.count}</span>
      </button>
    {/each}
  </div>
{/if}

<!-- Ungraded count, surfaced here rather than as a chart bar so it never
     distorts the grade distribution. -->
{#if ungraded > 0}
  <div class="mt-2 flex justify-end">
    <span class="text-surface-500 text-[11px] font-semibold tabular-nums">
      {m.areas_ungradedCount({ count: ungraded })}
    </span>
  </div>
{/if}
