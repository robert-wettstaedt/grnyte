<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout'
  import { getI18n } from '$lib/i18n'
  import GradeRangeSlider from '../GradeRangeSlider'
  const { t } = getI18n()
</script>

<form class="flex flex-col items-center gap-4 px-2 md:px-4">
  <GradeRangeSlider
    minGrade={page.url.searchParams.get('minGrade') == null ? undefined : Number(page.url.searchParams.get('minGrade'))}
    maxGrade={page.url.searchParams.get('maxGrade') == null ? undefined : Number(page.url.searchParams.get('maxGrade'))}
    onchange={(values) => {
      const url = new URL(page.url)

      if (values.minGrade === pageState.grades.at(0)?.id) {
        url.searchParams.delete('minGrade')
      } else {
        url.searchParams.set('minGrade', String(values.minGrade))
      }

      if (values.maxGrade === pageState.grades.at(-1)?.id) {
        url.searchParams.delete('maxGrade')
      } else {
        url.searchParams.set('maxGrade', String(values.maxGrade))
      }

      goto(url)
    }}
  />

  <div class="flex w-full max-w-md gap-4">
    <label class="label">
      <span class="label-text">{t('common.sortBy')}</span>
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
        <option value="rating">{t('common.rating')}</option>
        <option value="grade">{t('common.grade')}</option>
        <option value="firstAscentYear">{t('routes.yearOfFA')}</option>
      </select>
    </label>

    <label class="label">
      <span class="label-text">{t('common.sortOrder')}</span>
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
        <option value="desc">{t('common.descending')}</option>
        <option value="asc">{t('common.ascending')}</option>
      </select>
    </label>
  </div>
</form>
