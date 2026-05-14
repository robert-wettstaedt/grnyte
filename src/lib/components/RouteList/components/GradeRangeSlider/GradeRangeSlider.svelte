<script lang="ts">
  import { pageState } from '$lib/components/Layout'
  import { getGradeColor } from '$lib/grades'

  interface Values {
    minGrade: number
    maxGrade: number
  }

  interface Props extends Partial<Values> {
    onchange?: (values: Values) => void
  }

  let { minGrade = $bindable(), maxGrade = $bindable(), onchange }: Props = $props()

  let minUserGrade = $derived.by(() => {
    if (minGrade == null) {
      return undefined
    }

    return pageState.grades.at(minGrade)?.[pageState.gradingScale]
  })

  let maxUserGrade = $derived.by(() => {
    if (maxGrade == null) {
      return undefined
    }

    return pageState.grades.at(maxGrade)?.[pageState.gradingScale]
  })

  let minPosition = $derived.by(() => {
    const maxGradeId = pageState.grades.at(-1)?.id
    if (minGrade == null || maxGradeId == null) return 0
    return (minGrade / maxGradeId) * 100
  })

  let maxPosition = $derived.by(() => {
    const maxGradeId = pageState.grades.at(-1)?.id
    if (maxGrade == null || maxGradeId == null) return 0
    return (maxGrade / maxGradeId) * 100
  })

  // Calculate alignment based on each label's individual proximity to edges
  let labelsAlignment = $derived.by(() => {
    const minPos = minPosition
    const maxPos = maxPosition

    // Check each label's proximity to edges independently
    const minNearStart = minPos < 15
    const maxNearEnd = maxPos > 85

    // Determine alignment for min label
    const minAlignment = minNearStart
      ? { transform: '-translate-x-1/2', triangleAlign: 'left-1/2 -translate-x-1/2' }
      : { transform: '-translate-x-[calc(100%-0.75rem+1px)]', triangleAlign: 'right-2' }

    // Determine alignment for max label
    const maxAlignment = maxNearEnd
      ? { transform: '-translate-x-1/2', triangleAlign: 'left-1/2 -translate-x-1/2' }
      : { transform: 'translate-x-[calc(-0.75rem+1px)]', triangleAlign: 'left-2' }

    return {
      minTransform: minAlignment.transform,
      maxTransform: maxAlignment.transform,
      minTriangleAlign: minAlignment.triangleAlign,
      maxTriangleAlign: maxAlignment.triangleAlign,
    }
  })

  let minInput = $state<HTMLInputElement>()
  let maxInput = $state<HTMLInputElement>()
  let rangeElement = $state<HTMLDivElement>()

  function updateRange() {
    if (!minInput || !maxInput || !rangeElement) return

    const min = pageState.grades.at(0)?.id
    const max = pageState.grades.at(-1)?.id

    minGrade = minGrade == null && min != null ? min : parseInt(minInput.value)
    maxGrade = maxGrade == null && max != null ? max : parseInt(maxInput.value)

    if (minGrade > maxGrade) {
      const temp = minGrade
      minGrade = maxGrade
      maxGrade = temp

      return
    }

    const percent1 = (minGrade / parseInt(minInput.max)) * 100
    const percent2 = (maxGrade / parseInt(maxInput.max)) * 100

    rangeElement.style.left = percent1 + '%'
    rangeElement.style.width = percent2 - percent1 + '%'
  }

  function onChange() {
    if (minGrade != null && maxGrade != null) {
      onchange?.({ minGrade, maxGrade })
    }
  }

  $effect(() => {
    updateRange()
  })
</script>

<div class="relative w-full max-w-md pb-4">
  <div class="relative mx-2.5 h-8">
    {#if minUserGrade != null && minGrade != null}
      <label
        for="minGrade"
        class="pointer-events-none absolute transform touch-none rounded px-2 py-1 text-xs font-semibold whitespace-nowrap text-white transition-all {labelsAlignment.minTransform}"
        style="left: {minPosition}%; background-color: {getGradeColor(minGrade)}"
      >
        {minUserGrade}

        <div
          class="absolute top-full h-0 w-0 border-t-4 border-r-4 border-l-4 border-transparent {labelsAlignment.minTriangleAlign}"
          style="border-top-color: {getGradeColor(minGrade)}"
        ></div>
      </label>
    {/if}

    {#if maxUserGrade != null && maxGrade != null}
      <label
        for="maxGrade"
        class="pointer-events-none absolute transform touch-none rounded px-2 py-1 text-xs font-semibold whitespace-nowrap text-white transition-all {labelsAlignment.maxTransform}"
        style="left: {maxPosition}%; background-color: {getGradeColor(maxGrade)}"
      >
        {maxUserGrade}

        <div
          class=" absolute top-full h-0 w-0 border-t-4 border-r-4 border-l-4 border-transparent {labelsAlignment.maxTriangleAlign}"
          style="border-top-color: {getGradeColor(maxGrade)}"
        ></div>
      </label>
    {/if}
  </div>

  <div class="absolute mt-2 h-1 w-full rounded bg-gray-200">
    <div bind:this={rangeElement} class="bg-primary-500 absolute h-full rounded"></div>
  </div>

  <div class="relative mt-2">
    <input
      bind:this={minInput}
      class="[&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:border-primary-500 [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:border-primary-500 pointer-events-none absolute h-1 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
      id="minGrade"
      max={pageState.grades.at(-1)?.id}
      min={pageState.grades.at(0)?.id}
      name="minGrade"
      onchange={onChange}
      oninput={updateRange}
      type="range"
      value={minGrade}
    />

    <input
      bind:this={maxInput}
      class="[&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:border-primary-500 [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:border-primary-500 pointer-events-none absolute h-1 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
      id="maxGrade"
      max={pageState.grades.at(-1)?.id}
      min={pageState.grades.at(0)?.id}
      name="maxGrade"
      onchange={onChange}
      oninput={updateRange}
      type="range"
      value={maxGrade}
    />
  </div>
</div>
