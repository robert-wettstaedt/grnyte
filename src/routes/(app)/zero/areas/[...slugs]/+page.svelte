<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN, REGION_PERMISSION_EDIT } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import AreaList from '$lib/components/AreaList'
  import AreaStats from '$lib/components/AreaStats'
  import BlocksList from '$lib/components/BlocksList'
  import Error from '$lib/components/Error'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import References, { ReferencesLoader } from '$lib/components/References'
  import RouteList from '$lib/components/RouteList'
  import { convertAreaSlug } from '$lib/helper'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'
  import { Query } from 'zero-svelte'

  let { areaSlug, canAddArea, parentSlug } = $derived(convertAreaSlug(page.params))

  const { current: area, details } = $derived.by(() => {
    let query = page.data.z.current.query.areas
      .where('slug', areaSlug)
      .related('author')
      .related('parent')
      .related('files')
      .related('parkingLocations')
      .one()

    if (parentSlug == null) {
      query = query.where('parentFk', 'IS', null)
    } else {
      query = query.whereExists('parent', (q) => q.where('slug', parentSlug))
    }

    return new Query(query)
  })

  let basePath = $derived(`/areas/${page.params.slugs}`)

  let downloadError: string | null = $state(null)

  type TabValue = 'areas' | 'blocks' | 'info' | 'map' | 'routes'
  let tabValue: TabValue | undefined = $state(undefined)
  let loadedTabs = $state(false)
  let tabFromUrl = $derived(page.url.searchParams.get('tab') as TabValue | undefined)
  afterNavigate(() => {
    tabValue = tabFromUrl ?? (area?.type === 'sector' ? 'info' : 'areas')
  })
  onMount(() => {
    tabValue = tabFromUrl ?? (area?.type === 'sector' ? 'info' : 'areas')
  })
  $effect(() => {
    tabValue = tabFromUrl ?? (area?.type === 'sector' ? 'info' : 'areas')
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onValueChange'] = (event) => {
    const newUrl = new URL(page.url)
    newUrl.searchParams.set('tab', event.value)
    goto(newUrl.toString(), { replaceState: true })
  }

  const hasActions = $derived(checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_EDIT], area?.regionFk))
</script>

<svelte:head>
  <title>{area?.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if downloadError}
  <aside class="card preset-tonal-warning my-8 p-2 whitespace-pre-line md:p-4">
    <p>{downloadError}</p>
  </aside>
{/if}

{#if area == null}
  {#if details.type === 'complete'}
    <Error error={{ message: 'Not found' }} status={404} />
  {:else}
    <nav class="list-nav">
      <ul class="overflow-auto">
        {#each Array(10) as _}
          <li class="placeholder my-2 h-20 w-full animate-pulse"></li>
        {/each}
      </ul>
    </nav>
  {/if}
{:else}
  <AppBar {hasActions}>
    {#snippet lead()}
      {area.name}
    {/snippet}

    {#snippet actions()}
      {#if checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_EDIT], area.regionFk)}
        <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/edit`}>
          <i class="fa-solid fa-pen w-4"></i>Edit area details
        </a>

        {#if area.type !== 'sector' && canAddArea}
          <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/add`}>
            <i class="fa-solid fa-plus w-4"></i>Add area
          </a>
        {/if}

        {#if area.type === 'sector'}
          <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/_/blocks/add`}>
            <i class="fa-solid fa-plus w-4"></i>Add block
          </a>
        {/if}

        {#if area.type !== 'area'}
          <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/edit-parking-location`}>
            <i class="fa-solid fa-parking w-4"></i>Add parking location
          </a>
        {/if}
      {/if}

      {#if checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_ADMIN], area.regionFk)}
        {#if area.type === 'sector'}
          <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/export`}>
            <i class="fa-solid fa-file-export w-4"></i>Export PDF
          </a>
        {/if}

        <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/sync-external-resources`}>
          <i class="fa-solid fa-sync w-4"></i>Sync external resources
        </a>
      {/if}
    {/snippet}

    {#snippet headline()}
      <Tabs
        fluid
        listClasses="overflow-x-auto overflow-y-hidden pb-[1px] md:w-[500px]"
        listGap="0"
        onValueChange={onChangeTab}
        value={tabValue}
      >
        {#snippet list()}
          {#if area.type === 'sector'}
            <Tabs.Control value="info">Info</Tabs.Control>
          {/if}

          {#if area.type === 'sector'}
            <Tabs.Control value="blocks">Blocks</Tabs.Control>
          {:else}
            <Tabs.Control value="areas">Areas</Tabs.Control>
          {/if}

          <Tabs.Control value="map">Map</Tabs.Control>

          <Tabs.Control value="routes">Routes</Tabs.Control>
        {/snippet}

        {#snippet content()}
          {#if area.type === 'sector'}
            <Tabs.Panel value="info">
              <dl>
                {#if area.description != null && area.description.length > 0}
                  <div class="flex p-2">
                    <span class="flex-auto">
                      <dt>Description</dt>
                      <dd>
                        <MarkdownRenderer className="mt-4" markdown={area.description} />
                      </dd>
                    </span>
                  </div>
                {/if}

                <ReferencesLoader id={area.id!} type="areas">
                  {#snippet children(references)}
                    <div class="flex p-2">
                      <span class="flex-auto">
                        <dt>Mentioned in</dt>

                        <dd class="mt-1 flex gap-1">
                          <References {references} />
                        </dd>
                      </span>
                    </div>
                  {/snippet}
                </ReferencesLoader>

                <div class="flex p-2">
                  <span class="flex-auto">
                    <dt>Grades</dt>

                    <dd class="mt-1 flex gap-1">
                      <AreaStats
                        areaId={area.id!}
                        spec={{
                          width: 'container' as any,
                        }}
                      />
                    </dd>
                  </span>
                </div>
              </dl>
            </Tabs.Panel>
          {/if}

          <Tabs.Panel value="map">
            <div use:fitHeightAction>
              {#await import('$lib/components/BlocksMap/ZeroLoader.svelte') then BlocksMap}
                {#key area.id}
                  <BlocksMap.default selectedArea={area} />
                {/key}
              {/await}
            </div>
          </Tabs.Panel>

          {#if area.type === 'sector'}
            <Tabs.Panel value="blocks">
              <BlocksList
                areaFk={area.id}
                onLoad={() => setTimeout(() => (loadedTabs = true), 100)}
                regionFk={area.regionFk}
              />
            </Tabs.Panel>
          {/if}

          {#if area.type !== 'sector'}
            <Tabs.Panel value="areas">
              {#if tabValue === 'areas' || loadedTabs}
                <AreaList onLoad={() => setTimeout(() => (loadedTabs = true), 100)} parentFk={area.id} />
              {/if}
            </Tabs.Panel>
          {/if}

          <Tabs.Panel value="routes">
            {#if tabValue === 'routes' || loadedTabs}
              <RouteList areaFk={area.id} onLoad={() => setTimeout(() => (loadedTabs = true), 100)} />
            {/if}
          </Tabs.Panel>
        {/snippet}
      </Tabs>
    {/snippet}
  </AppBar>
{/if}
