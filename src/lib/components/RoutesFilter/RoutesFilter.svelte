<script lang="ts">
  import { page } from '$app/stores'
  import GradeRangeSlider from '$lib/components/GradeRangeSlider'

  let form: HTMLFormElement | null = $state(null)
</script>

<form bind:this={form} class="flex flex-col gap-4 items-center px-6">
  <GradeRangeSlider
    minGrade={$page.url.searchParams.get('minGrade') == null
      ? undefined
      : Number($page.url.searchParams.get('minGrade'))}
    maxGrade={$page.url.searchParams.get('maxGrade') == null
      ? undefined
      : Number($page.url.searchParams.get('maxGrade'))}
    onchange={form?.submit.bind(form)}
  />

  <div class="flex max-w-md w-full gap-4">
    <label class="label">
      <span class="label-text">Sort by</span>
      <select
        class="select"
        name="sort"
        onchange={form?.submit.bind(form)}
        value={$page.url.searchParams.get('sort') ?? 'rating'}
      >
        <option value="rating">Rating</option>
        <option value="grade">Grade</option>
        <option value="firstAscentYear">Year of FA</option>
      </select>
    </label>

    <label class="label">
      <span class="label-text">Sort order</span>
      <select
        class="select"
        name="sortOrder"
        onchange={form?.submit.bind(form)}
        value={$page.url.searchParams.get('sortOrder') ?? 'desc'}
      >
        <option value="desc">Descending ⬇</option>
        <option value="asc">Ascending ⬆️</option>
      </select>
    </label>
  </div>
</form>
