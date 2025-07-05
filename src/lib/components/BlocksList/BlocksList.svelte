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

  const blocks = $derived(
    new Query(
      page.data.z.current.query.blocks
        .where('areaFk', 'IS', parentFk ?? null)
        .orderBy('order', 'asc')
        .orderBy('name', 'asc')
        .related('routes', (q) => {
          const userId = page.data.user?.id
          let query = q.orderBy('gradeFk', 'asc')
          if (userId != null) {
            query = query.related('ascents', (q) => q.where('createdBy', '=', userId))
          }
          return query
        })
        .related('topos', (q) => q.orderBy('id', 'asc').related('file').related('routes')),
    ),
  )

  $effect(() => {
    if (blocks.details.type === 'complete') {
      onLoad?.()
    }
  })
</script>

{#if blocks.current.length === 0 && blocks.details.type !== 'complete'}
  <nav class="list-nav">
    <ul class="overflow-auto">
      {#each Array(10) as _}
        <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
      {/each}
    </ul>
  </nav>
{:else if blocksViewMode === 'list' || orderMode}
  <GenericList
    classes="-mx-4"
    listClasses={orderMode ? undefined : 'mt-4 bg-surface-200-800'}
    items={(sortedBlocks ?? []).map((item) => ({
      ...item,
      pathname: `${basePath}/_/blocks/${item.slug}`,
    }))}
    onConsiderSort={orderMode ? (items) => (blocks = items) : undefined}
    onFinishSort={orderMode ? onChangeCustomSortOrder : undefined}
    wrap={!orderMode}
  >
    {#snippet left(item)}
      {#if item?.geolocationFk == null}
        <i class="fa-solid fa-exclamation-triangle text-warning-800-200"></i>
      {/if}

      {item.name}
    {/snippet}

    {#snippet children(item)}
      {#if !orderMode}
        {#if item?.routes.length === 0}
          <div class="flex items-center gap-2 px-2 py-3 md:px-4">
            <Image
              path={item.topos?.[0]?.file?.path == null ? null : `/nextcloud${item.topos[0].file.path}/preview`}
              size={64}
            />

            <div class="w-[calc(100%-64px)]">No routes yet</div>
          </div>
        {:else}
          <GenericList
            classes="w-full"
            items={item.routes.map((route) => ({
              ...route,
              id: route.id,
              name: route.name,
              pathname: `${basePath}/_/blocks/${item.slug}/routes/${route.slug.length === 0 ? route.id : route.slug}`,
            }))}
          >
            {#snippet left(route)}
              <div class="flex items-center gap-2">
                <Image
                  path={route.topo?.file?.path == null ? null : `/nextcloud/${route.topo.file.path}/preview`}
                  size={64}
                />

                <div class="w-[calc(100%-64px)]">
                  <RouteName {route} />
                </div>
              </div>
            {/snippet}
          </GenericList>
        {/if}
      {/if}
    {/snippet}
  </GenericList>
{:else}
  <ul class="-mx-4">
    {#each sortedBlocks ?? [] as block}
      <li class="bg-surface-200-800 mt-4 pb-4">
        <div
          class="hover:preset-tonal-primary border-surface-800 flex flex-wrap items-center justify-between rounded whitespace-nowrap"
        >
          <a
            href={`${basePath}/_/blocks/${block.slug}`}
            class="anchor w-full grow overflow-hidden px-2 py-3 text-ellipsis hover:text-white md:w-auto md:px-4"
          >
            {#if block.geolocationFk == null}
              <i class="fa-solid fa-exclamation-triangle text-warning-800-200"></i>
            {/if}

            {block.name}
          </a>
        </div>

        <div class="mt-2 flex flex-wrap gap-2">
          {#each block.topos as topo}
            <div class="flex flex-1 items-center justify-center md:flex-none md:justify-start">
              <Image path={topo?.file?.path == null ? null : `/nextcloud${topo.file.path}/preview`} size={320} />
            </div>
          {/each}

          {#if block.topos.length === 0}
            <div class="px-2">No topo yet</div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}
