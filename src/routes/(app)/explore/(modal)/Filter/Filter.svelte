<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { firstAscensionistList } from '$lib/entities/firstAscensionist/resources.svelte'
  import type { RouteListItem } from '$lib/entities/route/dto'
  import type { AscentStatus } from '$lib/entities/route/resources.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { SvelteMap, SvelteURL } from 'svelte/reactivity'
  import AscentStatusSelect from './fields/AscentStatusSelect.svelte'
  import FavoritesSelect from './fields/FavoritesSelect.svelte'
  import FilterSection from './fields/FilterSection.svelte'
  import FirstAscensionistSelect from './fields/FirstAscensionistSelect.svelte'
  import GradeRange from './fields/GradeRange.svelte'
  import MediaSelect, { type MediaFilter } from './fields/MediaSelect.svelte'
  import RatingSelect from './fields/RatingSelect.svelte'
  import TagSelect from './fields/TagSelect.svelte'
  import { FILTER_PARAM_KEYS, isAscentStatus, isFilterActive } from './filter'

  interface Props {
    loading: boolean
    routes: RouteListItem[]
  }

  const { loading, routes }: Props = $props()

  const app = getGlobalState()

  // Whether any filter is applied lives here rather than the layout — it's pure
  // filter knowledge, derived from the same params the controls read.
  const active = $derived(isFilterActive(page.url.searchParams))

  // Reads from the preloaded `firstAscensionists` table, so this is local data.
  const firstAscensionists = firstAscensionistList()

  let open = $state(false)

  // The slider works in grade-array index space; the URL stores grade ids
  // (`gradeFk`). These convert between the two.
  const lastIndex = $derived(Math.max(0, app.grades.length - 1))

  const indexOfGrade = (gradeFk: number | undefined, fallback: number): number => {
    if (gradeFk == null) {
      return fallback
    }
    const index = app.grades.findIndex((grade) => grade.id === gradeFk)
    return index === -1 ? fallback : index
  }

  let value = $state<number[]>([0, 0])
  let minRating = $state(0)
  let ascentStatus = $state<AscentStatus | ''>('')
  let selectedTags = $state<string[]>([])
  let mediaFilters = $state<MediaFilter[]>([])
  let favoritesOnly = $state(false)
  let selectedFirstAscensionists = $state<number[]>([])

  const routeCountByGrade = $derived.by(() => {
    const counts = new SvelteMap<number, number>()
    for (const route of routes) {
      if (route.gradeFk != null) {
        counts.set(route.gradeFk, (counts.get(route.gradeFk) ?? 0) + 1)
      }
    }
    return counts
  })

  // Short, value-aware summaries shown in each collapsed section's header so the
  // applied filters stay readable at a glance without expanding every section.
  const ratingSummary = $derived(minRating > 0 ? `${minRating}+` : m.common_any())

  const ascentSummary = $derived.by(() => {
    switch (ascentStatus) {
      case 'todo':
        return m.filter_ascentTodo()
      case 'project':
        return m.filter_ascentProject()
      case 'done':
        return m.filter_ascentDone()
      default:
        return m.common_any()
    }
  })

  const favoritesSummary = $derived(favoritesOnly ? m.filter_favoritesOnly() : m.common_any())

  const firstAscensionistSummary = $derived(
    selectedFirstAscensionists.length > 0
      ? m.filter_selectedCount({ count: selectedFirstAscensionists.length })
      : m.common_any(),
  )

  const tagsSummary = $derived(
    selectedTags.length > 0 ? m.filter_selectedCount({ count: selectedTags.length }) : m.common_any(),
  )

  const mediaSummary = $derived.by(() => {
    if (mediaFilters.length === 0) {
      return m.common_any()
    }
    if (mediaFilters.length === 1) {
      return mediaFilters[0] === 'hasTopo' ? m.filter_hasTopo() : m.filter_hasBeta()
    }
    return m.filter_selectedCount({ count: mediaFilters.length })
  })

  // Seed the controls from the applied filter, then open. Re-runs on every open
  // so they always reflect the URL's current values.
  const toggleOpen = () => {
    if (!open) {
      const minParam = page.url.searchParams.get('minGrade')
      const maxParam = page.url.searchParams.get('maxGrade')
      value = [
        indexOfGrade(minParam == null ? undefined : Number(minParam), 0),
        indexOfGrade(maxParam == null ? undefined : Number(maxParam), lastIndex),
      ]

      const ratingParam = page.url.searchParams.get('minRating')
      minRating = ratingParam == null ? 0 : Number(ratingParam)

      const ascentParam = page.url.searchParams.get('ascentStatus')
      ascentStatus = isAscentStatus(ascentParam) ? ascentParam : ''

      const tagsParam = page.url.searchParams.get('tags')
      selectedTags = tagsParam ? tagsParam.split(',') : []

      const media: MediaFilter[] = []
      if (page.url.searchParams.get('hasTopo') === '1') media.push('hasTopo')
      if (page.url.searchParams.get('hasBeta') === '1') media.push('hasBeta')
      mediaFilters = media

      favoritesOnly = page.url.searchParams.get('favorites') === '1'

      const faParam = page.url.searchParams.get('firstAscensionists')
      selectedFirstAscensionists = faParam ? faParam.split(',').map(Number) : []
    }
    open = !open
  }

  const applyFilter = async () => {
    const url = new SvelteURL(page.url)
    const [minIndex, maxIndex] = value

    if (minIndex <= 0) {
      url.searchParams.delete('minGrade')
    } else {
      url.searchParams.set('minGrade', String(app.grades[minIndex].id))
    }

    if (maxIndex >= lastIndex) {
      url.searchParams.delete('maxGrade')
    } else {
      url.searchParams.set('maxGrade', String(app.grades[maxIndex].id))
    }

    if (minRating <= 0) {
      url.searchParams.delete('minRating')
    } else {
      url.searchParams.set('minRating', String(minRating))
    }

    if (ascentStatus === '') {
      url.searchParams.delete('ascentStatus')
    } else {
      url.searchParams.set('ascentStatus', ascentStatus)
    }

    if (selectedTags.length === 0) {
      url.searchParams.delete('tags')
    } else {
      url.searchParams.set('tags', selectedTags.join(','))
    }

    if (mediaFilters.includes('hasTopo')) {
      url.searchParams.set('hasTopo', '1')
    } else {
      url.searchParams.delete('hasTopo')
    }

    if (mediaFilters.includes('hasBeta')) {
      url.searchParams.set('hasBeta', '1')
    } else {
      url.searchParams.delete('hasBeta')
    }

    if (favoritesOnly) {
      url.searchParams.set('favorites', '1')
    } else {
      url.searchParams.delete('favorites')
    }

    if (selectedFirstAscensionists.length === 0) {
      url.searchParams.delete('firstAscensionists')
    } else {
      url.searchParams.set('firstAscensionists', selectedFirstAscensionists.join(','))
    }

    // eslint-disable-next-line svelte/no-navigation-without-resolve
    await goto(url)
    open = false
  }

  const resetFilter = async () => {
    const url = new SvelteURL(page.url)
    for (const key of FILTER_PARAM_KEYS) {
      url.searchParams.delete(key)
    }

    // eslint-disable-next-line svelte/no-navigation-without-resolve
    await goto(url)
    open = false
  }
</script>

<Modal
  bind:open
  title={m.common_filter()}
  snapPoints={[0.75, 0.6]}
  subtitle={m.routes_routesCount({ count: routes.length })}
>
  {#snippet trigger(props)}
    <button
      {...props}
      class={[props.class, 'btn btn-sm relative', open ? 'preset-filled-primary-500' : 'preset-filled-surface-100-900']}
      onclick={toggleOpen}
    >
      {#if active}
        <span class="absolute top-0 right-0 z-10 h-2 w-2 rounded-full bg-red-500"></span>
      {/if}

      {#if loading}
        <LoadingIndicator class="flex justify-center" size={4} />
      {:else}
        <Icon name="filter" size={14} />
      {/if}
    </button>
  {/snippet}

  <div class="mt-4 pb-16 md:mt-0">
    {#if app.grades.length > 0}
      <!-- Grade is the primary filter, so it stays pinned open above the accordion. -->
      <div class="border-surface-200-800 border-b pb-4">
        <GradeRange grades={app.grades} gradingScale={app.gradingScale} {routeCountByGrade} bind:value />
      </div>
    {/if}

    <FilterSection label={m.filter_rating()} summary={ratingSummary} active={minRating > 0}>
      <RatingSelect bind:value={minRating} />
    </FilterSection>

    <FilterSection label={m.filter_ascent()} summary={ascentSummary} active={ascentStatus !== ''}>
      <AscentStatusSelect bind:value={ascentStatus} />
    </FilterSection>

    <FilterSection label={m.filter_favorites()} summary={favoritesSummary} active={favoritesOnly}>
      <FavoritesSelect bind:value={favoritesOnly} />
    </FilterSection>

    {#if firstAscensionists.data.length > 0}
      <FilterSection
        label={m.filter_firstAscensionists()}
        summary={firstAscensionistSummary}
        active={selectedFirstAscensionists.length > 0}
      >
        <FirstAscensionistSelect
          firstAscensionists={firstAscensionists.data}
          currentUserId={app.user?.id}
          bind:value={selectedFirstAscensionists}
        />
      </FilterSection>
    {/if}

    {#if app.tags.length > 0}
      <FilterSection label={m.filter_tags()} summary={tagsSummary} active={selectedTags.length > 0}>
        <TagSelect tags={app.tags} bind:value={selectedTags} />
      </FilterSection>
    {/if}

    <FilterSection label={m.filter_media()} summary={mediaSummary} active={mediaFilters.length > 0}>
      <MediaSelect bind:value={mediaFilters} />
    </FilterSection>
  </div>

  <div
    class="bg-surface-50-950 md:bg-surface-100-900 border-surface-100-900 md:border-surface-200-800 fixed right-0 bottom-0 left-0 z-10 flex items-center justify-end gap-2 border-t-2 p-4"
  >
    <button class="btn btn-sm preset-tonal" onclick={resetFilter}>
      {m.common_reset()}
    </button>

    <button class="btn btn-sm preset-filled-primary-500" onclick={applyFilter}>
      {m.common_apply()}
    </button>
  </div>
</Modal>
