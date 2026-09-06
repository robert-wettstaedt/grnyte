<script lang="ts">
  import { getGradeColor } from '$lib/entities/grade/color'
  import type { Grade } from '$lib/entities/grade/dto'
  import { rungSpans, scaleRungs } from '$lib/entities/grade/label'
  import type { GradingScale } from '$lib/entities/user/dto'
  import { m } from '$lib/paraglide/messages'
  import { Slider } from '@skeletonlabs/skeleton-svelte'

  // The slider steps in rungs, not grades, so a V climber never sees "V3, V3" or a bound the label
  // lies about. `value` stays `[minIndex, maxIndex]` into `grades`; Filter.svelte puts those in the URL.
  interface Props {
    /** Grades ordered low → high; `value` is in this array's index space. */
    grades: Grade[]
    gradingScale: GradingScale
    /** Route counts keyed by grade id (`gradeFk`), used for the histogram. */
    routeCountByGrade: Map<number, number>
    /** Selected `[minIndex, maxIndex]` into `grades`. */
    value: number[]
  }

  let { grades, gradingScale, routeCountByGrade, value = $bindable() }: Props = $props()

  const rungs = $derived(scaleRungs(grades, gradingScale))
  const spans = $derived(rungSpans(grades, rungs))

  /** Which rung a stored grade index falls in. Clamped, so a bound off the end still lands. */
  const rungOf = (index: number): number => {
    const found = spans.findIndex((span) => index >= span.first && index <= span.last)
    return found < 0 ? Math.min(Math.max(index, 0), spans.length - 1) : found
  }

  // Read-only, so opening the panel and pressing Apply writes back the ids it read.
  const rungValue = $derived([rungOf(value[0]), rungOf(value[1])])

  const rangeLabel = (rung: number): string => rungs[rung]?.label ?? '—'

  /** One bar per rung, summing the grades it covers. */
  const rungCounts = $derived(
    spans.map((span) =>
      grades.slice(span.first, span.last + 1).reduce((sum, grade) => sum + (routeCountByGrade.get(grade.id) ?? 0), 0),
    ),
  )
  const maxCount = $derived(rungCounts.reduce((max, count) => Math.max(max, count), 0))

  // Zero-count rungs collapse to nothing; otherwise scale to the tallest bar
  // with a small floor so rare grades stay visible.
  const barHeight = (count: number): number => {
    if (maxCount === 0 || count === 0) {
      return 0
    }
    return Math.max(10, (count / maxCount) * 100)
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-baseline justify-between">
    <span class="text-surface-600-400 text-xs font-bold tracking-wide uppercase">{m.filter_grade()}</span>
    <span class="text-surface-600-400 text-sm tabular-nums">
      {rangeLabel(rungValue[0])} – {rangeLabel(rungValue[1])}
    </span>
  </div>

  <div class="px-2">
    {#if maxCount > 0}
      <!-- Histogram: one bar per rung, so the bars stay aligned to the thumb stops. -->
      <div class="flex h-12 items-end justify-between" aria-hidden="true">
        <!-- Keyed on the id: two non-adjacent gaps share the empty glyph as a label, which would
             throw `each_key_duplicate`. -->
        {#each rungs as rung, index (rung.id)}
          {@const selected = index >= rungValue[0] && index <= rungValue[1]}
          <div
            class={['w-1 rounded-t-xs transition-opacity', !selected && 'opacity-30']}
            style="height: {barHeight(rungCounts[index])}%; background-color: {getGradeColor(rung.id)}"
          ></div>
        {/each}
      </div>
    {/if}

    <Slider
      aria-label={[`${m.filter_grade()} min`, `${m.filter_grade()} max`]}
      disabled={maxCount === 0}
      getAriaValueText={(details) => rangeLabel(details.value)}
      max={Math.max(0, rungs.length - 1)}
      min={0}
      onValueChange={(details) =>
        (value = [spans[details.value[0]]?.first ?? 0, spans[details.value[1]]?.last ?? grades.length - 1])}
      step={1}
      thumbAlignment="center"
      value={rungValue}
    >
      <!-- py-4, not py-2: the control is the drag target and needs 24px (WCAG 2.5.8). -->
      <Slider.Control class="relative flex items-center py-4">
        <Slider.Track class="bg-surface-300-700 relative h-1.5 w-full rounded-full">
          <Slider.Range class="bg-primary-500 h-full rounded-full" />
        </Slider.Track>

        <Slider.Thumb
          class="bg-primary-500 border-surface-50-950 size-4 rounded-full border-2 shadow focus-visible:outline-2"
          index={0}
        />
        <Slider.Thumb
          class="bg-primary-500 border-surface-50-950 size-4 rounded-full border-2 shadow focus-visible:outline-2"
          index={1}
        />
      </Slider.Control>
    </Slider>
  </div>
</div>
