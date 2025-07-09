<script lang="ts">
  import { page } from '$app/state'
  import AreaStats from '$lib/components/AreaStats'
  import GenericList from '$lib/components/GenericList'
  import { Query } from 'zero-svelte'

  interface Props {
    onLoad?: () => void
    parentFk?: number | null
  }
  const { onLoad, parentFk }: Props = $props()

  const { current: areas, details } = $derived(
    new Query(page.data.z.current.query.areas.where('parentFk', 'IS', parentFk ?? null).orderBy('name', 'asc')),
  )

  $effect(() => {
    if (details.type === 'complete') {
      onLoad?.()
    }
  })
</script>

{#if areas.length === 0 && details.type !== 'complete'}
  <nav class="list-nav">
    <ul class="overflow-auto">
      {#each Array(10) as _}
        <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
      {/each}
    </ul>
  </nav>
{:else}
  <GenericList
    items={areas.map((item) => ({
      ...item,
      id: item.id!,
      pathname: `${page.url.pathname}/${item.slug}-${item.id}`,
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
        <AreaStats
          areaId={item.id}
          axes={false}
          spec={{
            width: 100,
          }}
          opts={{
            height: 38,
          }}
        >
          {#snippet children(routes)}
            <div class="flex items-center justify-end text-sm opacity-70">
              {routes.length}

              {#if routes.length === 1}
                route
              {:else}
                routes
              {/if}
            </div>
          {/snippet}
        </AreaStats>
      </div>
    {/snippet}
  </GenericList>
{/if}
