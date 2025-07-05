<script lang="ts">
  import { page } from '$app/state'
  import { getStatsOfAreas } from '$lib/blocks.svelte'
  import GenericList from '$lib/components/GenericList'
  import GradeHistogram from '$lib/components/GradeHistogram'
  import { Query } from 'zero-svelte'

  interface Props {
    onLoad?: () => void
    parentFk?: number | null
  }
  const { onLoad, parentFk }: Props = $props()

  const areas = $derived(
    new Query(page.data.z.current.query.areas.where('parentFk', 'IS', parentFk ?? null).orderBy('name', 'asc')),
  )

  const stats = $derived(getStatsOfAreas(areas.current.map((item) => item.id).filter((id) => id != null)))

  $effect(() => {
    if (areas.details.type === 'complete') {
      onLoad?.()
    }
  })
</script>

{#if areas.current.length === 0 && areas.details.type !== 'complete'}
  <nav class="list-nav">
    <ul class="overflow-auto">
      {#each Array(10) as _}
        <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
      {/each}
    </ul>
  </nav>
{:else}
  <GenericList
    items={areas.current.map((item) => ({
      ...item,
      id: item.id!,
      pathname: `${page.url.pathname}/${item.slug}`,
    }))}
    listClasses="border-b-[1px] border-surface-700 last:border-none py-2"
    wrap={false}
  >
    {#snippet left(item)}
      {item.name}

      {#if parentFk == null && page.data.userRegions.length > 1}
        <div class="text-surface-400 text-xs">
          {page.data.userRegions.find((region) => region.regionFk === item.regionFk)?.name ?? ''}
        </div>
      {/if}
    {/snippet}

    {#snippet right(item)}
      <div class="flex flex-col">
        <GradeHistogram
          axes={false}
          data={stats[item.id]?.grades ?? []}
          spec={{
            width: 100,
          }}
          opts={{
            height: 38,
          }}
        />

        <div class="flex items-center justify-end text-sm opacity-70">
          {stats[item.id]?.numOfRoutes ?? 0}

          {#if stats[item.id]?.numOfRoutes === 1}
            route
          {:else}
            routes
          {/if}
        </div>
      </div>
    {/snippet}
  </GenericList>
{/if}
