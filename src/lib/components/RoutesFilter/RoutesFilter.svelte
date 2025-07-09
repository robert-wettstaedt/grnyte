<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import GradeRangeSlider from '$lib/components/GradeRangeSlider'
</script>

<form class="flex flex-col items-center gap-4 px-6">
  <GradeRangeSlider
    minGrade={page.url.searchParams.get('minGrade') == null ? undefined : Number(page.url.searchParams.get('minGrade'))}
    maxGrade={page.url.searchParams.get('maxGrade') == null ? undefined : Number(page.url.searchParams.get('maxGrade'))}
    onchange={(values) => {
      const url = new URL(page.url)

      if (values.minGrade === page.data.grades.at(0)?.id) {
        url.searchParams.delete('minGrade')
      } else {
        url.searchParams.set('minGrade', String(values.minGrade))
      }

      if (values.maxGrade === page.data.grades.at(-1)?.id) {
        url.searchParams.delete('maxGrade')
      } else {
        url.searchParams.set('maxGrade', String(values.maxGrade))
      }

      goto(url)
    }}
  />

  <div class="flex w-full max-w-md gap-4">
    <label class="label">
      <span class="label-text">Sort by</span>
      <select
        class="select"
        name="sort"
        onchange={(event) => {
          const url = new URL(page.url)
          url.searchParams.set('sort', (event.target as HTMLSelectElement).value)
          goto(url)
        }}
        value={page.url.searchParams.get('sort') ?? 'rating'}
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
        onchange={(event) => {
          const url = new URL(page.url)
          url.searchParams.set('sortOrder', (event.target as HTMLSelectElement).value)
          goto(url)
        }}
        value={page.url.searchParams.get('sortOrder') ?? 'desc'}
      >
        <option value="desc">Descending ⬇</option>
        <option value="asc">Ascending ⬆️</option>
      </select>
    </label>
  </div>
</form>
