<script lang="ts">
  import { getGradeColor } from '$lib/entities/grade/color'
  import type { Grade } from '$lib/entities/grade/dto'
  import type { GradingScale } from '$lib/entities/user/dto'
  import { m } from '$lib/paraglide/messages'
  import { Slider } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    /** Grades ordered low → high; the slider works in this array's index space. */
    grades: Grade[]
    gradingScale: GradingScale
    /** Route counts keyed by grade id (`gradeFk`), used for the histogram. */
    routeCountByGrade: Map<number, number>
    /** Selected `[minIndex, maxIndex]` into `grades`. */
    value: number[]
  }

  let { grades, gradingScale, routeCountByGrade, value = $bindable() }: Props = $props()

  const gradeLabel = (index: number): string => {
    const grade = grades[index]
    return grade?.[gradingScale] ?? '—'
  }

  const maxCount = $derived(grades.reduce((max, grade) => Math.max(max, routeCountByGrade.get(grade.id) ?? 0), 0))

  // Zero-count grades collapse to nothing; otherwise scale to the tallest bar
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
      {gradeLabel(value[0])} – {gradeLabel(value[1])}
    </span>
  </div>

  <div class="px-2">
    {#if maxCount > 0}
      <!-- Histogram: one bar per grade, aligned to the slider thumb positions. -->
      <div class="flex h-12 items-end justify-between" aria-hidden="true">
        {#each grades as grade, index (grade.id)}
          {@const selected = index >= value[0] && index <= value[1]}
          <div
            class={['w-1 rounded-t-xs transition-opacity', !selected && 'opacity-30']}
            style="height: {barHeight(routeCountByGrade.get(grade.id) ?? 0)}%; background-color: {getGradeColor(grade)}"
          ></div>
        {/each}
      </div>
    {/if}

    <Slider
      aria-label={[`${m.filter_grade()} min`, `${m.filter_grade()} max`]}
      disabled={maxCount === 0}
      max={Math.max(0, grades.length - 1)}
      min={0}
      onValueChange={(details) => (value = details.value)}
      step={1}
      thumbAlignment="center"
      {value}
    >
      <Slider.Control class="relative flex items-center py-2">
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
