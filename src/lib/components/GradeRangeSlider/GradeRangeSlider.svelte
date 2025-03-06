<script lang="ts">
  import { page } from '$app/state'
  import { onMount } from 'svelte'

  interface Values {
    minGrade: number
    maxGrade: number
  }

  interface Props extends Partial<Values> {
    onchange?: (values: Values) => void
  }

  let {
    minGrade = $bindable(page.data.grades.at(0)?.id),
    maxGrade = $bindable(page.data.grades.at(-1)?.id),
    onchange,
  }: Props = $props()

  let minUserGrade = $derived(page.data.grades[minGrade][page.data.gradingScale])
  let maxUserGrade = $derived(page.data.grades[maxGrade][page.data.gradingScale])
  let minInput = $state<HTMLInputElement>()
  let maxInput = $state<HTMLInputElement>()
  let rangeElement = $state<HTMLDivElement>()

  function updateRange() {
    if (!minInput || !maxInput || !rangeElement) return

    minGrade = parseInt(minInput.value)
    maxGrade = parseInt(maxInput.value)

    if (minGrade > maxGrade) {
      const temp = minGrade
      minInput.value = maxGrade.toString()
      maxInput.value = temp.toString()

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
    onchange?.({ minGrade, maxGrade })
  }

  $effect(() => {
    updateRange()
  })
</script>

<div class="relative w-full max-w-md pb-4">
  <div class="label-text">
    <span id="min-value">Grade: {minUserGrade}</span>
    <span class="mx-2">-</span>
    <span id="max-value">{maxUserGrade}</span>
  </div>

  <div class="absolute mt-2 h-1 w-full rounded bg-gray-200">
    <div bind:this={rangeElement} class="bg-primary-500 absolute h-full rounded"></div>
  </div>

  <div class="relative mt-2">
    <input
      bind:this={minInput}
      class="[&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:border-primary-500 [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:border-primary-500 pointer-events-none absolute h-1 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
      max={page.data.grades.at(-1)?.id}
      min={page.data.grades.at(0)?.id}
      name="minGrade"
      onchange={onChange}
      oninput={updateRange}
      type="range"
      value={minGrade}
    />

    <input
      bind:this={maxInput}
      class="[&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:border-primary-500 [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:border-primary-500 pointer-events-none absolute h-1 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full"
      max={page.data.grades.at(-1)?.id}
      min={page.data.grades.at(0)?.id}
      name="maxGrade"
      onchange={onChange}
      oninput={updateRange}
      type="range"
      value={maxGrade}
    />
  </div>
</div>
