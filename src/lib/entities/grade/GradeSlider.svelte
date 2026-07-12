<script lang="ts">
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import { getGradeBand, gradeVar, GRADE_COLORS } from '$lib/entities/grade/color'
  import type { Grade } from '$lib/entities/grade/dto'
  import { gradeLabel } from '$lib/entities/grade/label'
  import type { GradingScale } from '$lib/entities/user/dto'
  import ClearButton from '$lib/forms/ClearButton.svelte'
  import { m } from '$lib/paraglide/messages'
  import { Slider } from '@skeletonlabs/skeleton-svelte'

  // Single-grade picker: the one-thumb sibling of the filter's GradeRange. Unset shows a
  // faded heat-gradient track with a ghost mid thumb, the first tap/drag picks a grade.
  interface Props {
    /** Grades ordered low → high; the slider works in this array's index space. */
    grades: Grade[]
    gradingScale: GradingScale
    /** When set, the picked grade id submits through a hidden input with this name. */
    name?: string
    /** Selected grade id (`gradeFk`), or `undefined` for no suggestion. */
    value?: number | undefined
  }

  let { grades, gradingScale, name, value = $bindable() }: Props = $props()

  const index = $derived(value == null ? -1 : grades.findIndex((grade) => grade.id === value))
  const band = $derived(getGradeBand(value))
  const heat = `linear-gradient(90deg, ${GRADE_COLORS.join(', ')})`

  // Every 3rd grade gets a tick label, all 22 would collide on a phone.
  const ticks = $derived(grades.map((grade, i) => ({ grade, i })).filter(({ i }) => i % 3 === 0))
</script>

{#if name != null}
  <input {name} type="hidden" value={value ?? ''} />
{/if}

<div class="flex flex-col gap-3">
  <div class="flex items-center gap-3">
    {#if value == null}
      <span
        class="border-surface-400-600 text-surface-600-400 inline-flex h-6.25 flex-none items-center justify-center rounded-lg border-[1.5px] border-dashed px-2.25 font-mono text-[12.5px]/none font-bold"
      >
        ?
      </span>
      <span class="text-surface-600-400 flex-1 text-xs font-semibold">{m.routes_form_gradeUnset()}</span>
    {:else}
      <RouteGrade grade={gradeLabel(grades, gradingScale, value)} {band} />
      <span class="flex-1"></span>
      <ClearButton onclick={() => (value = undefined)} />
    {/if}
  </div>

  <div class="px-2">
    <Slider
      aria-label={[m.routes_form_gradeLabel()]}
      max={Math.max(0, grades.length - 1)}
      min={0}
      onValueChange={(details) => (value = grades[details.value[0]]?.id)}
      step={1}
      thumbAlignment="center"
      value={[index < 0 ? Math.floor((grades.length - 1) / 2) : index]}
    >
      <Slider.Control class="relative flex items-center py-2">
        <Slider.Track
          class={['relative h-1.5 w-full rounded-full', value != null && 'bg-surface-300-700']}
          style={value == null ? `background: ${heat}; opacity: 0.35;` : ''}
        >
          {#if value != null}
            <Slider.Range class="h-full rounded-full" style="background: {gradeVar(band)}" />
          {/if}
        </Slider.Track>

        <Slider.Thumb
          class={[
            'border-surface-50-950 size-5 rounded-full border-2 shadow focus-visible:outline-2',
            value == null && 'border-surface-400-600 border-dashed bg-transparent shadow-none',
          ]}
          index={0}
          style={value == null ? '' : `background: ${gradeVar(band)}`}
        />
      </Slider.Control>
    </Slider>

    <div aria-hidden="true" class="relative mt-1 h-4">
      {#each ticks as { grade, i } (grade.id)}
        <span
          class="text-surface-600-400 absolute -translate-x-1/2 font-mono text-[10px] font-semibold whitespace-nowrap"
          style="left: {grades.length > 1 ? (i / (grades.length - 1)) * 100 : 0}%"
        >
          {gradeLabel(grades, gradingScale, grade.id)}
        </span>
      {/each}
    </div>
  </div>
</div>
