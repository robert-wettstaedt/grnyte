<script lang="ts">
  import { replaceState } from '$app/navigation'
  import { page } from '$app/state'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import GenericList from '$lib/components/GenericList'
  import Image from '$lib/components/Image'
  import { pageState } from '$lib/components/Layout/page.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import RouteListItem from '$lib/components/RouteListItem'
  import { TopoViewerLoader } from '$lib/components/TopoViewer'
  import { queries } from '$lib/db/zero'
  import { getBlockName } from '$lib/helper.svelte'
  import { getI18n } from '$lib/i18n'
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte'
  import { updateBlockOrder } from './BlocksList.remote'

  interface Props {
    areaFk: number | null | undefined
    basePath?: string
    onLoad?: () => void
    regionFk: number | null | undefined
    sortable?: boolean
  }
  const { areaFk, basePath, onLoad, regionFk, sortable = true }: Props = $props()

  const { t } = getI18n()

  const blocksResult = $derived(page.data.z.q(queries.listBlocks({ areaId: areaFk ?? null })))

  // https://github.com/sveltejs/kit/issues/12999
  // svelte-ignore state_referenced_locally
  let blocks = $state(blocksResult.data)
  $effect(() => {
    blocks = blocksResult.data
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
        if (a.name.length > 0 && b.name.length > 0) {
          return a.name.localeCompare(b.name)
        }

        return a.order - b.order
      })
    }
  })

  const onChangeCustomSortOrder = async (items: typeof sortedBlocks) => {
    blocks = items

    if (areaFk != null && items != null && items.length > 0) {
      await updateBlockOrder({ areaId: areaFk, blockIds: items.map((i) => i.id).filter((d) => d != null) })
    }
  }
</script>

<div class="flex items-center justify-between">
  {#if !sortable}
    <div>{t('blocks.title')}</div>
  {/if}

  <SegmentedControl
    name="blocks-view-mode"
    onValueChange={(event) => {
      blocksViewMode = event.value as 'list' | 'grid'
      replaceState('', { blocksViewMode })
    }}
    value={blocksViewMode}
  >
    <SegmentedControl.Control class="p-0">
      <SegmentedControl.Indicator />
      <SegmentedControl.Item value="list">
        <SegmentedControl.ItemText class="flex min-h-6 items-center">
          <i class="fa-solid fa-list text-xs"></i>
        </SegmentedControl.ItemText>
        <SegmentedControl.ItemHiddenInput />
      </SegmentedControl.Item>

      <SegmentedControl.Item value="grid">
        <SegmentedControl.ItemText class="flex min-h-6 items-center">
          <i class="fa-solid fa-table-cells-large text-xs"></i>
        </SegmentedControl.ItemText>
        <SegmentedControl.ItemHiddenInput />
      </SegmentedControl.Item>
    </SegmentedControl.Control>
  </SegmentedControl>

  {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], regionFk) && sortable}
    <button
      class={['btn', orderMode ? 'preset-filled-primary-500' : 'preset-outlined-surface-200-800']}
      disabled={sortOrder !== 'custom' || updateBlockOrder.pending > 0}
      onclick={() => (orderMode = !orderMode)}
    >
      {#if updateBlockOrder.pending > 0}
        <LoadingIndicator />
      {:else}
        <i class="fa-solid fa-sort"></i>
      {/if}

      {t('blocks.reorderBlocks')}
    </button>
  {/if}
</div>

<section class="py-2 md:py-4">
  {#if blocksResult.data.length === 0 && blocksResult.details.type !== 'complete'}
    <nav class="list-nav">
      <ul class="overflow-auto">
        {#each Array(10) as _}
          <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
        {/each}
      </ul>
    </nav>
  {:else if sortedBlocks.length === 0}
    {t('blocks.noBlocksYet')}
  {:else}
    {#if sortable}
      <label class="label my-4">
        <span class="label-text">
          <i class="fa-solid fa-arrow-down-a-z"></i>
          {t('blocks.sortOrder')}
        </span>
        <select bind:value={sortOrder} class="select" disabled={orderMode} onchange={() => (orderMode = false)}>
          <option value="custom">{t('blocks.customOrder')}</option>
          <option value="alphabetical">{t('blocks.alphabeticalOrder')}</option>
        </select>
      </label>
    {/if}

    {#if blocksViewMode === 'list' || orderMode}
      <GenericList
        class="-mx-2 md:-mx-4"
        listClasses={orderMode ? undefined : 'border-b border-surface-100-900 last:border-none py-2'}
        items={(sortedBlocks ?? []).map((item) => ({
          ...item,
          id: item.id!,
          pathname: basePath == null ? `${page.url.pathname}/_/blocks/${item.slug}` : `${basePath}/blocks/${item.id}`,
        }))}
        onConsiderSort={orderMode ? (items) => (blocks = items) : undefined}
        onFinishSort={orderMode ? onChangeCustomSortOrder : undefined}
        wrap={!orderMode}
      >
        {#snippet left(item)}
          {#if item?.geolocationFk == null}
            <i class="fa-solid fa-exclamation-triangle text-warning-500"></i>
          {/if}

          {getBlockName(item)}
        {/snippet}

        {#snippet children(item)}
          {#if !orderMode}
            <TopoViewerLoader blockId={item.id}>
              {#snippet children(_, routes)}
                {#if routes.length === 0}
                  <div class="flex items-center gap-2 px-2 py-3 md:px-4">
                    <Image
                      path={item.topos?.[0]?.file?.path == null ? null : `/nextcloud${item.topos[0].file.path}/preview`}
                      size={64}
                    />

                    <div class="w-[calc(100%-64px)]">{t('routes.noRoutesYet')}</div>
                  </div>
                {:else}
                  <GenericList
                    class="w-full"
                    items={routes.map((route) => ({
                      ...route,
                      id: route.id!,
                      name: route.name,
                      pathname:
                        basePath == null
                          ? `${page.url.pathname}/_/blocks/${item.slug}/routes/${route.slug.length === 0 ? route.id : route.slug}`
                          : `${basePath}/routes/${route.id}`,
                    }))}
                  >
                    {#snippet left(route)}
                      <RouteListItem route={{ ...route, block: item }} />
                    {/snippet}
                  </GenericList>
                {/if}
              {/snippet}
            </TopoViewerLoader>
          {/if}
        {/snippet}
      </GenericList>
    {:else}
      <ul class="-mx-2 md:-mx-4">
        {#each sortedBlocks ?? [] as block}
          <li class="border-surface-100-900 border-b pt-2 pb-5 last:border-none">
            <div
              class="hover:preset-tonal-primary border-surface-100-900 flex flex-wrap items-center justify-between rounded whitespace-nowrap"
            >
              <a
                href={basePath == null
                  ? `${page.url.pathname}/_/blocks/${block.slug}`
                  : `${basePath}/blocks/${block.id}`}
                class="anchor w-full grow overflow-hidden px-2 py-3 text-ellipsis hover:text-white hover:no-underline md:w-auto md:px-4"
              >
                {#if block.geolocationFk == null}
                  <i class="fa-solid fa-exclamation-triangle text-warning-800-200"></i>
                {/if}

                {getBlockName(block)}
              </a>
            </div>

            <div class="mt-2 flex flex-wrap gap-2">
              {#each block.topos as topo}
                <div class="flex flex-1 items-center justify-center md:flex-none md:justify-start">
                  <Image path={topo?.file?.path == null ? null : `/nextcloud${topo.file.path}/preview`} size={320} />
                </div>
              {/each}

              {#if block.topos.length === 0}
                <div class="px-2">{t('topo.noTopoYet')}</div>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
