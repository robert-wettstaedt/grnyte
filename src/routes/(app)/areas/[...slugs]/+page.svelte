<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { DELETE_PERMISSION, EDIT_PERMISSION, EXPORT_PERMISSION } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import FileViewer from '$lib/components/FileViewer'
  import GenericList from '$lib/components/GenericList'
  import GradeHistogram from '$lib/components/GradeHistogram'
  import Image from '$lib/components/Image'
  import References from '$lib/components/References'
  import RouteName from '$lib/components/RouteName'
  import RoutesFilter from '$lib/components/RoutesFilter'
  import type { Block } from '$lib/db/schema'
  import type { EnrichedBlock } from '$lib/db/utils'
  import { convertException } from '$lib/errors'
  import { Pagination, ProgressRing, Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  let { data } = $props()

  // https://github.com/sveltejs/kit/issues/12999
  let blocks = $state(data.area.blocks)
  $effect(() => {
    blocks = data.area.blocks
  })

  let files = $state(data.area.files)
  $effect(() => {
    files = data.area.files
  })

  let basePath = $derived(`/areas/${page.params.slugs}`)

  let loadingDownload = $state(false)
  let downloadError: string | null = $state(null)
  let orderMode = $state(false)
  let sortOrder: 'custom' | 'alphabetical' = $state('custom')

  let tabValue: string | undefined = $state(undefined)
  afterNavigate(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : data.area.type === 'sector' ? '#info' : '#areas'
  })
  onMount(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : data.area.type === 'sector' ? '#info' : '#areas'
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onFocusChange'] = (event) => {
    goto(page.url.pathname + event.focusedValue, { replaceState: true })
  }

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

  const onDownloadGpx = async () => {
    loadingDownload = true
    downloadError = null

    try {
      const res = await fetch(`${basePath}/gpx`)

      if (!res.ok || res.status >= 400) {
        throw new Error(res.statusText)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = `${data.area.name}.gpx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (exception) {
      downloadError = convertException(exception)
    }

    loadingDownload = false
  }

  const updateBlocksFromServer = async (res: Response) => {
    if (res.ok) {
      const { blocks: updatedBlocks } = (await res.json()) as { blocks: Block[] }
      blocks = updatedBlocks
        .map((block) => {
          const originalBlock = blocks.find((b) => b.id === block.id)

          if (originalBlock == null) {
            return null
          }

          return { ...originalBlock, ...block }
        })
        .filter(Boolean) as typeof blocks
    }
  }

  const onChangeCustomSortOrder = async (items: typeof data.area.blocks) => {
    blocks = items

    const searchParams = new URLSearchParams()
    items.forEach((item) => searchParams.append('id', String(item.id)))
    const res = await fetch(`/api/areas/${data.area.id}/blocks/order?${searchParams.toString()}`, { method: 'PUT' })
    await updateBlocksFromServer(res)
  }

  const hasActions = $derived(
    data.userPermissions?.includes(EDIT_PERMISSION) || data.userPermissions?.includes(EXPORT_PERMISSION),
  )
</script>

<svelte:head>
  <title>{data.area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if downloadError}
  <aside class="card preset-tonal-warning my-8 p-2 md:p-4 whitespace-pre-line">
    <p>{downloadError}</p>
  </aside>
{/if}

<AppBar {hasActions}>
  {#snippet lead()}
    {data.area.name}
  {/snippet}

  {#snippet actions()}
    {#if data.userPermissions?.includes(EXPORT_PERMISSION) && data.area.type === 'sector'}
      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/export`}>
        <i class="fa-solid fa-file-export"></i>Export PDF
      </a>

      <button class="btn btn-sm preset-outlined-primary-500" disabled={loadingDownload} onclick={onDownloadGpx}>
        {#if loadingDownload}
          <span>
            <ProgressRing size="size-4" value={null} />
          </span>
        {:else}
          <i class="fa-solid fa-map-location-dot"></i>
        {/if}

        Export GPX
      </button>
    {/if}

    {#if data.userPermissions?.includes(EDIT_PERMISSION)}
      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/sync-external-resources`}>
        <i class="fa-solid fa-sync"></i>Sync external resources
      </a>

      {#if data.area.type !== 'area'}
        <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/edit-parking-location`}>
          <i class="fa-solid fa-parking"></i>Add parking location
        </a>
      {/if}

      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/edit`}>
        <i class="fa-solid fa-pen"></i>Edit area
      </a>
    {/if}
  {/snippet}

  {#snippet headline()}
    <Tabs
      fluid
      listClasses="overflow-x-auto overflow-y-hidden pb-[1px] md:w-[500px]"
      listGap="0"
      onFocusChange={onChangeTab}
      value={tabValue}
    >
      {#snippet list()}
        {#if data.area.type === 'sector'}
          <Tabs.Control value="#info">Info</Tabs.Control>
        {/if}

        {#if data.area.type === 'sector'}
          <Tabs.Control value="#blocks">Blocks</Tabs.Control>
        {:else}
          <Tabs.Control value="#areas">Areas</Tabs.Control>
        {/if}

        <Tabs.Control value="#map">Map</Tabs.Control>

        <Tabs.Control value="#routes">Routes</Tabs.Control>
      {/snippet}

      {#snippet content()}
        {#if data.area.type === 'sector'}
          <Tabs.Panel value="#info">
            <dl>
              {#if data.area.description != null && data.area.description.length > 0}
                <div class="flex p-2">
                  <span class="flex-auto">
                    <dt>Description</dt>
                    <dd>
                      <div class="rendered-markdown mt-4">
                        {@html data.area.description}
                      </div>
                    </dd>
                  </span>
                </div>
              {/if}

              {#await data.references then references}
                {#if references.routes.length > 0}
                  <div class="flex p-2">
                    <span class="flex-auto">
                      <dt>Mentioned in</dt>

                      <dd class="flex gap-1 mt-1">
                        <References {references} />
                      </dd>
                    </span>
                  </div>
                {/if}
              {/await}

              <div class="flex p-2">
                <span class="flex-auto">
                  <dt>Grades</dt>

                  <dd class="flex gap-1 mt-1">
                    <GradeHistogram
                      data={data.area.grades}
                      spec={{
                        width: 'container' as any,
                      }}
                    />
                  </dd>
                </span>
              </div>

              {#if files.length > 0}
                <div class="flex p-2">
                  <span class="flex-auto">
                    <dt>Files</dt>
                    <dd class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                      {#each files as file}
                        {#if file.stat != null}
                          <FileViewer
                            {file}
                            readOnly={!data.userPermissions?.includes(DELETE_PERMISSION)}
                            stat={file.stat}
                            onDelete={() => (files = files.filter((_file) => file.id !== _file.id))}
                          />
                        {:else if file.error != null}
                          <aside class="alert variant-filled-error">
                            <div class="alert-message">
                              <h3 class="h3">Error</h3>
                              <p>{file.error}</p>
                            </div>
                          </aside>
                        {/if}
                      {/each}
                    </dd>
                  </span>
                </div>
              {/if}
            </dl>
          </Tabs.Panel>
        {/if}

        <Tabs.Panel value="#map">
          <div use:fitHeightAction>
            {#await import('$lib/components/BlocksMap') then BlocksMap}
              {#key data.area.id}
                <BlocksMap.default
                  blocks={data.blocks}
                  parkingLocations={data.area.parkingLocations}
                  selectedArea={data.area}
                />
              {/key}
            {/await}
          </div>
        </Tabs.Panel>

        {#if data.area.type === 'sector'}
          <Tabs.Panel value="#blocks">
            {#if data.userPermissions?.includes(EDIT_PERMISSION)}
              <div class="flex justify-between">
                <a class="btn preset-filled-primary-500" href={`${basePath}/_/blocks/add`}>Add block</a>

                <button
                  class="btn {orderMode ? 'preset-filled-primary-500' : 'preset-outlined-primary-500'}"
                  disabled={sortOrder !== 'custom'}
                  onclick={() => (orderMode = !orderMode)}
                >
                  <i class="fa-solid fa-sort"></i>

                  Reorder blocks
                </button>
              </div>
            {/if}

            <section class="py-2 md:py-4">
              {#if blocks.length === 0}
                No blocks yet
              {:else}
                <label class="label my-4">
                  <span class="label-text">
                    <i class="fa-solid fa-arrow-down-a-z"></i>
                    Sort order
                  </span>
                  <select
                    bind:value={sortOrder}
                    class="select"
                    disabled={orderMode}
                    onchange={() => (orderMode = false)}
                  >
                    <option value="custom">Custom order</option>
                    <option value="alphabetical">Alphabetical order</option>
                  </select>
                </label>

                <GenericList
                  classes="-mx-4"
                  listClasses={orderMode ? undefined : 'mt-4 bg-surface-200-800'}
                  items={sortedBlocks.map((item) => ({ ...item, pathname: `${basePath}/_/blocks/${item.slug}` }))}
                  onConsiderSort={orderMode ? (items) => (blocks = items) : undefined}
                  onFinishSort={orderMode ? onChangeCustomSortOrder : undefined}
                  wrap={!orderMode}
                >
                  {#snippet left(item)}
                    {#if item.geolocationFk == null}
                      <i class="fa-solid fa-exclamation-triangle text-warning-800-200"></i>
                    {/if}

                    {item.name}
                  {/snippet}

                  {#snippet children(item)}
                    {#if !orderMode}
                      {#if item.routes.length === 0}
                        <div class="flex items-center gap-2 px-2 md:px-4 py-3">
                          {#if item.topos?.[0]?.file?.path != null}
                            <Image path="/nextcloud{item.topos?.[0]?.file?.path}/preview" size={64} />
                          {/if}

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
                              <Image path="/nextcloud{route.topo?.file?.path}/preview" size={64} />

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
              {/if}
            </section>
          </Tabs.Panel>
        {/if}

        {#if data.area.type !== 'sector'}
          <Tabs.Panel value="#areas">
            <section class="py-2 md:py-4">
              {#if data.userPermissions?.includes(EDIT_PERMISSION) && data.canAddArea}
                <div class="flex justify-center mb-4">
                  <a class="btn preset-filled-primary-500" href={`${basePath}/add`}>Add area</a>
                </div>
              {/if}

              {#if data.area.areas.length === 0}
                No areas yet
              {:else}
                <GenericList
                  items={data.area.areas.map((item) => ({ ...item, pathname: `${basePath}/${item.slug}-${item.id}` }))}
                  listClasses="border-b-[1px] border-surface-700 last:border-none py-2"
                  wrap={false}
                >
                  {#snippet left(item)}
                    {item.name}
                  {/snippet}

                  {#snippet right(item)}
                    <div class="flex flex-col">
                      <GradeHistogram
                        axes={false}
                        data={item.grades}
                        spec={{
                          width: 100,
                        }}
                        opts={{
                          height: 38,
                        }}
                      />

                      <div class="flex items-center justify-end text-sm opacity-70">
                        {item.numOfRoutes}

                        {#if item.numOfRoutes === 1}
                          route
                        {:else}
                          routes
                        {/if}
                      </div>
                    </div>
                  {/snippet}
                </GenericList>
              {/if}
            </section>
          </Tabs.Panel>
        {/if}

        <Tabs.Panel value="#routes">
          <div class="mt-8">
            <RoutesFilter />
          </div>

          <div class="mt-8 preset-filled-surface-100-900">
            <GenericList items={data.routes.routes}>
              {#snippet left(item)}
                <div class="flex gap-2">
                  <Image path="/blocks/{item.block.id}/preview-image" size={64} />

                  <div class="flex flex-col gap-1">
                    <p class="text-xs opacity-50 overflow-hidden text-ellipsis whitespace-nowrap text-white">
                      {item.block.area.name} / {item.block.name}
                    </p>

                    <RouteName route={item} />
                  </div>
                </div>
              {/snippet}
            </GenericList>
          </div>

          <div class="my-8 flex justify-center">
            <Pagination
              buttonClasses="btn-sm md:btn-md px-3"
              count={data.routes.pagination.total}
              data={[]}
              page={data.routes.pagination.page}
              pageSize={data.routes.pagination.pageSize}
              siblingCount={0}
              onPageChange={(detail) => {
                const url = new URL(page.url)
                url.searchParams.set('page', String(detail.page))
                goto(url)
              }}
            />
          </div>
        </Tabs.Panel>
      {/snippet}
    </Tabs>
  {/snippet}
</AppBar>
