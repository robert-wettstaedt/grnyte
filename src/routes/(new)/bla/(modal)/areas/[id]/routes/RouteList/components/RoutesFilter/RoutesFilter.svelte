<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import { getI18n } from '$lib/i18n'
  import GradeRangeSlider from '../GradeRangeSlider'

  const { t } = getI18n()
</script>

<form class="flex flex-col items-center gap-4">
  <div class="w-full px-2">
    <GradeRangeSlider
      minGrade={page.url.searchParams.get('minGrade') == null
        ? undefined
        : Number(page.url.searchParams.get('minGrade'))}
      maxGrade={page.url.searchParams.get('maxGrade') == null
        ? undefined
        : Number(page.url.searchParams.get('maxGrade'))}
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
  </div>

  <div class="flex w-full max-w-md gap-4">
    <fieldset class="relative mx-auto mt-10 w-full max-w-md pb-4">
      <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
        {t('common.sortBy')}
      </legend>

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
    </fieldset>

    <fieldset class="relative mx-auto mt-10 w-full max-w-md pb-4">
      <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
        {t('common.sortOrder')}
      </legend>

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
    </fieldset>
  </div>
</form>
