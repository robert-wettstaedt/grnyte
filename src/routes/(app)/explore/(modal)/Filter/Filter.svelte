<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import Modal from '$lib/components/Modal/Modal.svelte'
  import { m } from '$lib/paraglide/messages'
  import type { AscentStatus } from '$lib/entities/route/resources.svelte'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { SvelteURL } from 'svelte/reactivity'
  import AscentStatusSelect from './AscentStatusSelect.svelte'
  import GradeRange from './GradeRange.svelte'
  import RatingSelect from './RatingSelect.svelte'

  interface Props {
    active: boolean
    loading: boolean
    numRoutes: number
    /** Route counts keyed by grade id (`gradeFk`), for the grade histogram. */
    routeCountByGrade: Map<number, number>
  }

  const { active, loading, numRoutes, routeCountByGrade }: Props = $props()

  const app = getGlobalState()

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

  const isAscentStatus = (value: string | null): value is AscentStatus =>
    value === 'done' || value === 'todo' || value === 'project'

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

    // eslint-disable-next-line svelte/no-navigation-without-resolve
    await goto(url)
    open = false
  }

  const resetFilter = async () => {
    const url = new SvelteURL(page.url)
    url.searchParams.delete('minGrade')
    url.searchParams.delete('maxGrade')
    url.searchParams.delete('minRating')
    url.searchParams.delete('ascentStatus')

    // eslint-disable-next-line svelte/no-navigation-without-resolve
    await goto(url)
    open = false
  }
</script>

<Modal bind:open title={m.common_filter()} subtitle={m.routes_routesCount({ count: numRoutes })}>
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

  <div class="mt-4 flex flex-col gap-8 md:mt-0">
    {#if app.grades.length > 0}
      <GradeRange grades={app.grades} gradingScale={app.gradingScale} {routeCountByGrade} bind:value />
    {/if}

    <RatingSelect bind:value={minRating} />

    <AscentStatusSelect bind:value={ascentStatus} />

    <div class="flex items-center justify-end gap-2 pt-2">
      <button class="btn btn-sm preset-tonal" onclick={resetFilter}>
        {m.common_reset()}
      </button>

      <button class="btn btn-sm preset-filled-primary-500" onclick={applyFilter}>
        {m.common_apply()}
      </button>
    </div>
  </div>
</Modal>
