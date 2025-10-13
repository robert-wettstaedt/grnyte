<script lang="ts">
  import { replaceState } from '$app/navigation'
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import GenericList from '$lib/components/GenericList'
  import Image from '$lib/components/Image'
  import { pageState } from '$lib/components/Layout'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import { TopoViewerLoader } from '$lib/components/TopoViewer'
  import { Segment } from '@skeletonlabs/skeleton-svelte'
  import { Query } from 'zero-svelte'

  interface Props {
    areaFk: number | null | undefined
    onLoad?: () => void
    regionFk: number | null | undefined
  }
  const { areaFk, onLoad, regionFk }: Props = $props()

  const query = $derived(
    page.data.z.current.query.blocks
      .where('areaFk', 'IS', areaFk ?? null)
      .orderBy('order', 'asc')
      .orderBy('name', 'asc')
      .related('topos', (q) => q.orderBy('id', 'asc').related('file')),
  )
  // svelte-ignore state_referenced_locally
  const blocksResult = new Query(query)
  $effect(() => blocksResult.updateQuery(query))

  // https://github.com/sveltejs/kit/issues/12999
  // svelte-ignore state_referenced_locally
  let blocks = $state(blocksResult.current)
  $effect(() => {
    blocks = blocksResult.current
  })

  $effect(() => {
    if (blocksResult.details.type === 'complete') {
      onLoad?.()
    }
  })

  let blocksViewMode: 'list' | 'grid' = $state(page.state.blocksViewMode ?? 'list')
  let orderMode = $state(false)
  let sortOrder: 'custom' | 'alphabetical' = $state('custom')

  let sortedBlocks = $derived.by(() => {
    if (sortOrder === 'custom') {
      return blocks
    } else {
      return blocks.toSorted((a, b) => {
        const aNum = Number(a.name.match(/\d+/)?.at(0))
        const bNum = Number(b.name.match(/\d+/)?.at(0))

        if (Number.isNaN(aNum) || Number.isNaN(bNum)) {
          return a.name.localeCompare(b.name)
        }

        return aNum - bNum
      })
    }
  })

  const onChangeCustomSortOrder = async (items: typeof sortedBlocks) => {
    blocks = items

    const searchParams = new URLSearchParams()
    items?.forEach((item) => searchParams.append('id', String(item.id)))
    await fetch(`/api/areas/${areaFk}/blocks/order?${searchParams.toString()}`, {
      method: 'PUT',
    })
  }
</script>

{#if blocksResult.current.length === 0 && blocksResult.details.type !== 'complete'}
  <nav class="list-nav">
    <ul class="overflow-auto">
      {#each Array(10) as _}
        <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
      {/each}
    </ul>
  </nav>
{:else}
  <div class="flex justify-between">
    <Segment
      name="blocks-view-mode"
      onValueChange={(event) => {
        blocksViewMode = event.value as 'list' | 'grid'
        replaceState('blocks', { blocksViewMode })
      }}
      value={blocksViewMode}
    >
      <Segment.Item value="list">
        <i class="fa-solid fa-list"></i>
      </Segment.Item>
      <Segment.Item value="grid">
        <i class="fa-solid fa-table-cells-large"></i>
      </Segment.Item>
    </Segment>

    {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], regionFk)}
      <button
        class="btn {orderMode ? 'preset-filled-primary-500' : 'preset-outlined-primary-500'}"
        disabled={sortOrder !== 'custom'}
        onclick={() => (orderMode = !orderMode)}
      >
        <i class="fa-solid fa-sort"></i>

        Reorder blocks
      </button>
    {/if}
  </div>

  <section class="py-2 md:py-4">
    {#if sortedBlocks.length === 0}
      No blocks yet
    {:else}
      <label class="label my-4">
        <span class="label-text">
          <i class="fa-solid fa-arrow-down-a-z"></i>
          Sort order
        </span>
        <select bind:value={sortOrder} class="select" disabled={orderMode} onchange={() => (orderMode = false)}>
          <option value="custom">Custom order</option>
          <option value="alphabetical">Alphabetical order</option>
        </select>
      </label>

      {#if blocksViewMode === 'list' || orderMode}
        <GenericList
          classes="-mx-4"
          listClasses={orderMode ? undefined : 'mt-4 bg-surface-200-800'}
          items={(sortedBlocks ?? []).map((item) => ({
            ...item,
            id: item.id!,
            pathname: `${page.url.pathname}/_/blocks/${item.slug}`,
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
              <TopoViewerLoader blockId={item.id}>
                {#snippet children(_, routes)}
                  {#if routes.length === 0}
                    <div class="flex items-center gap-2 px-2 py-3 md:px-4">
                      <Image
                        path={item.topos?.[0]?.file?.path == null
                          ? null
                          : `/nextcloud${item.topos[0].file.path}/preview`}
                        size={64}
                      />

                      <div class="w-[calc(100%-64px)]">No routes yet</div>
                    </div>
                  {:else}
                    <GenericList
                      classes="w-full"
                      items={routes.map((route) => ({
                        ...route,
                        id: route.id!,
                        name: route.name,
                        pathname: `${page.url.pathname}/_/blocks/${item.slug}/routes/${route.slug.length === 0 ? route.id : route.slug}`,
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

                            <MarkdownRenderer
                              className="short"
                              encloseReferences="strong"
                              markdown={route.description ?? ''}
                            />
                          </div>
                        </div>
                      {/snippet}
                    </GenericList>
                  {/if}
                {/snippet}
              </TopoViewerLoader>
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
                  href={`${page.url.pathname}/_/blocks/${block.slug}`}
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
    {/if}
  </section>
{/if}
