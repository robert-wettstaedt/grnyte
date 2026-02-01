<script lang="ts" module>
  export interface ActivityFeedProps extends Pick<ItemProps, 'withBreadcrumbs'> {
    activities: ActivityGroup[][]
  }

  export const PAGE_SIZE = 30
</script>

<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { hasReachedEnd } from '$lib/pagination.svelte'
  import type { ActivityGroup } from '.'
  import Group from './components/Group'
  import type { ItemProps } from './components/Item'
  import { getI18n } from '$lib/i18n'

  const { activities }: ActivityFeedProps = $props()

  let filterValue = $state<string[]>([])

  const activitiesLength = $derived(activities.flatMap((page) => page.flatMap((group) => group.items)).length)

  afterNavigate(() => {
    filterValue = Array.from(page.url.searchParams.entries()).map(([key, value]) => `${key}=${value}`)
  })

  const { t } = getI18n()
</script>

<label class="label flex flex-col gap-2">
  <span class="label-text font-medium">{t('activityFeed.filterLabel')}</span>
  <select
    class="select select-bordered w-full sm:w-60"
    multiple
    onchange={(event) => {
      const selectedOptions = (event.target as HTMLSelectElement).selectedOptions
      const selectedValues = Array.from(selectedOptions).map((option) => option.value)

      const url = new URL(page.url)
      url.searchParams.delete('pageSize')
      url.searchParams.delete('type')
      url.searchParams.delete('user')
      selectedValues.forEach((selectedValue) => {
        const [key, value] = selectedValue.split('=')
        url.searchParams.append(key, value)
      })
      goto(url, { noScroll: true, replaceState: true })
    }}
    size="2"
    value={filterValue}
  >
    <option value="type=ascents">{t('activityFeed.showAscentsOnly')}</option>
    <option value="user=me">{t('activityFeed.showMyActivityOnly')}</option>
  </select>
</label>

{#if activities.length === 0}
  <p class="text-center opacity-75">{t('activityFeed.noRecentActivity')}</p>
{:else}
  {#each activities as page}
    <div class="mt-8 space-y-8">
      {#each page as group}
        <Group {group} />
      {/each}
    </div>
  {/each}
{/if}

<div class="my-16 flex justify-center">
  <button
    class="btn preset-outlined-primary-500"
    disabled={hasReachedEnd(activitiesLength, PAGE_SIZE)}
    onclick={() => {
      const url = new URL(page.url)
      url.searchParams.set('pageSize', String(activitiesLength + PAGE_SIZE))
      goto(url, { noScroll: true, replaceState: true })
    }}
  >
    {t('activityFeed.loadMoreActivities')}
  </button>
</div>
