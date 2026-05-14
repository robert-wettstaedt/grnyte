<script lang="ts">
  import Dialog from '$lib/components/Dialog'
  import FormFieldError from '$lib/components/FormFieldError'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import { getGradeColor } from '$lib/grades'
  import { getI18n } from '$lib/i18n'
  import type { RemoteFormField } from '@sveltejs/kit'

  interface Props {
    field: RemoteFormField<string>
  }

  let { field }: Props = $props()

  const { t } = getI18n()

  const grade = $derived.by(() => {
    const value = Number(field.value())
    return Number.isNaN(value) ? null : value
  })

  let userGrade = $derived.by(() => {
    if (grade == null) {
      return undefined
    }

    return pageState.grades.at(grade)?.[pageState.gradingScale]
  })

  let position = $derived.by(() => {
    const maxGradeId = pageState.grades.at(-1)?.id
    if (grade == null || maxGradeId == null) return 0
    return (grade / maxGradeId) * 100
  })

  // Calculate alignment based on each label's individual proximity to edges
  let labelsAlignment = $derived.by(() => {
    // Check each label's proximity to edges independently
    const nearStart = position < 15
    const nearEnd = position > 85

    // Determine alignment for min label
    const minAlignment = nearStart
      ? { transform: 'translate-x-[calc(-0.75rem+1px)]', triangleAlign: 'left-2' }
      : nearEnd
        ? { transform: '-translate-x-[calc(100%-0.75rem+1px)]', triangleAlign: 'right-2' }
        : { transform: '-translate-x-1/2', triangleAlign: 'left-1/2 -translate-x-1/2' }

    return {
      transform: minAlignment.transform,
      triangleAlign: minAlignment.triangleAlign,
    }
  })

  let modalOpen = $state(false)

  let inputElement = $state<HTMLInputElement>()
  let rangeElement = $state<HTMLDivElement>()

  function onAddGrade() {
    const midGrade = pageState.grades.at(Math.floor(pageState.grades.length / 2))?.id
    field.set(midGrade?.toString())
  }

  function updateRange() {
    if (!inputElement || !rangeElement || grade == null) {
      field.set(undefined)
      return
    }

    field.set(inputElement.value)
    const percent = (grade / parseInt(inputElement.max)) * 100

    rangeElement.style.width = percent + '%'
  }

  $effect(() => {
    updateRange()
  })
</script>

<label class="label mt-4">
  <span>
    {t('common.grade')}

    <Dialog open={modalOpen} onOpenChange={(event) => (modalOpen = event.open)} title={t('grade.opinions')}>
      {#snippet trigger()}<i class="sl-2 fa-regular fa-circle-question"></i>{/snippet}

      {#snippet content()}
        <p>
          {t('grade.opinionDescription')}
        </p>

        <p class="mt-4">{t('grade.averageDescription')}</p>
      {/snippet}
    </Dialog>
  </span>

  <input type="hidden" {...field.as('text')} />

  <div class="flex items-end justify-between gap-2">
    {#if grade == null}
      <div class="border-surface-500 my-2 rounded-md border-2 px-4 py-2 text-sm">
        {t('common.noGradeYet')}

        <button
          aria-label={t('common.addGrade')}
          title={t('common.addGrade')}
          class="btn preset-filled-surface-500 btn-sm ms-1 h-6 w-6"
          onclick={onAddGrade}
          type="button"
        >
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
    {:else}
      <div class="relative w-full max-w-md pb-4">
        <div class="relative mx-2.5 h-8">
          <label
            for="minGrade"
            class="pointer-events-none absolute transform touch-none rounded px-2 py-1 text-xs font-semibold whitespace-nowrap text-white transition-all {labelsAlignment.transform}"
            style="left: {position}%; background-color: {getGradeColor(grade)}"
          >
            {userGrade}

            <div
              class="absolute top-full h-0 w-0 border-t-4 border-r-4 border-l-4 border-transparent {labelsAlignment.triangleAlign}"
              style="border-top-color: {getGradeColor(grade)}"
            ></div>
          </label>
        </div>

        <div class="absolute mt-2 h-1 w-full rounded bg-gray-200">
          <div bind:this={rangeElement} class="bg-primary-500 absolute h-full rounded"></div>
        </div>

        <div class="relative mt-2">
          <input
            aria-errormessage={field.issues() == null ? undefined : 'grade-error'}
            bind:this={inputElement}
            class="[&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:border-primary-500 [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:border-primary-500 pointer-events-none absolute h-1 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
            id="minGrade"
            max={pageState.grades.at(-1)?.id}
            min={pageState.grades.at(0)?.id}
            oninput={updateRange}
            onchange={(event) => field.set(event.currentTarget.value)}
            name="minGrade"
            type="range"
            value={grade}
          />
        </div>
      </div>

      <button
        aria-label={t('common.clear')}
        title={t('common.clear')}
        class="btn preset-filled-surface-500 h-9 w-9"
        onclick={() => field.set(undefined)}
        type="button"
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    {/if}
  </div>

  <FormFieldError id="grade-error" issues={field.issues()} />
</label>
