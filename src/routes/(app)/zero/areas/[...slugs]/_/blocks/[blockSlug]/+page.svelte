<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import Error from '$lib/components/Error'
  import { convertAreaSlug } from '$lib/helper'
  import { onMount } from 'svelte'
  import { Query } from 'zero-svelte'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import TopoViewer, { selectedRouteStore } from '$lib/components/TopoViewer'
  import RouteName from '$lib/components/RouteName'
  import { enrichTopo, sortRoutesByTopo } from '$lib/topo'

  let { areaId } = $derived(convertAreaSlug())

  const { current, details } = $derived(
    new Query(
      page.data.z.current.query.blocks
        .where('slug', page.params.blockSlug)
        .where('areaFk', areaId)
        .related('topos', (q) => q.related('routes', (q) => q.related('route')).related('file'))
        .related('routes', (q) => q.related('ascents', (q) => q.where('createdBy', '=', page.data.user?.id!)))
        .one(),
    ),
  )

  const block = $derived.by(() => {
    if (current == null) {
      return undefined
    }

    const topos = current.topos.map((topo) => enrichTopo({ ...topo, routes: [...topo.routes] }))
    const routes = sortRoutesByTopo([...current.routes], topos)

    return { ...current, routes: routes.map((route) => ({ ...route, ascents: [...route.ascents] })), topos }
  })

  type TabValue = 'topo' | 'map'
  let tabValue: TabValue | undefined = $state(undefined)
  let tabFromUrl = $derived(page.url.searchParams.get('tab') as TabValue | undefined)
  afterNavigate(() => {
    tabValue = tabFromUrl ?? 'topo'
  })
  onMount(() => {
    tabValue = tabFromUrl ?? 'topo'
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onValueChange'] = (event) => {
    const newUrl = new URL(page.url)
    newUrl.searchParams.set('tab', event.value)
    goto(newUrl.toString(), { replaceState: true })
  }

  const hasActions = $derived(
    checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_EDIT], block?.regionFk) ||
      (block != null && block.topos.length > 0),
  )
</script>

<svelte:head>
  <title>{block?.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if block == null}
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
      {block.name}
    {/snippet}

    {#snippet actions()}
      {#if checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
        <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/edit`}>
          <i class="fa-solid fa-pen w-4"></i>Edit block details
        </a>

        <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/routes/add`}>
          <i class="fa-solid fa-plus w-4"></i>Add route
        </a>

        <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/topos/add`}>
          <i class="fa-solid fa-file-arrow-up w-4"></i>Upload topo image
        </a>

        {#if block.topos.length > 0}
          <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/topos/draw`}>
            <i class="fa-solid fa-file-pen w-4"></i>Edit topo
          </a>
        {/if}

        <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/edit-location`}>
          <i class="fa-solid fa-location-dot w-4"></i>Edit geolocation
        </a>
      {/if}

      {#if block.topos.length > 0}
        <a class="btn btn-sm preset-outlined-primary-500" href={`${page.url.pathname}/export`}>
          <i class="fa-solid fa-file-export w-4"></i>Export block preview
        </a>
      {/if}
    {/snippet}

    {#snippet headline()}
      {#if block.geolocationFk == null}
        <aside class="card preset-tonal-warning mb-4 flex items-center gap-2 p-2 whitespace-pre-line md:p-4">
          <i class="fa-solid fa-exclamation-triangle text-warning-800-200"></i>

          <p>
            The geolocation of this block is missing. Do you know where it is?

            <a class="anchor" href={`${page.url.pathname}/edit-location`}>Add location</a>
          </p>
        </aside>
      {/if}

      <Tabs
        fluid
        listClasses="overflow-x-auto overflow-y-hidden pb-[1px] md:w-[500px]"
        listGap="0"
        onValueChange={onChangeTab}
        value={tabValue}
      >
        {#snippet list()}
          <Tabs.Control value="topo">Topo</Tabs.Control>

          <Tabs.Control value="map">Map</Tabs.Control>
        {/snippet}

        {#snippet content()}
          <Tabs.Panel value="topo">
            <div class="flex flex-wrap gap-2 md:flex-nowrap">
              {#if block.topos.length > 0}
                <section class="relative w-full md:w-2/4" use:fitHeightAction>
                  <TopoViewer selectionBehavior="scroll" topos={block.topos}>
                    {#snippet actions()}
                      {#if checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
                        <a
                          aria-label="Edit topo"
                          class="btn-icon preset-filled"
                          href={`${page.url.pathname}/topos/draw`}
                        >
                          <i class="fa-solid fa-pen"></i>
                        </a>
                      {/if}
                    {/snippet}
                  </TopoViewer>
                </section>
              {/if}

              <section class={`mt-4 w-full md:mt-0 ${block.topos.length === 0 ? '' : 'md:w-2/4'}`}>
                {#if block.routes.length === 0}
                  No routes yet
                {:else}
                  <nav class="list-nav">
                    <ul>
                      {#each block.routes as route}
                        <li
                          class="relative p-2 whitespace-nowrap {$selectedRouteStore === route.id
                            ? 'preset-filled-primary-100-900'
                            : ''}"
                        >
                          <a
                            class="block {$selectedRouteStore === route.id
                              ? 'text-white'
                              : 'text-primary-500'} {navigator.maxTouchPoints > 0 ? 'pr-10' : ''}"
                            href={`${page.url.pathname}/routes/${route.slug.length === 0 ? route.id : route.slug}`}
                            onblur={() => selectedRouteStore.set(null)}
                            onclick={() => selectedRouteStore.set(route.id)}
                            onfocus={() => selectedRouteStore.set(route.id)}
                            onkeydown={(event) => event.key === 'Enter' && selectedRouteStore.set(route.id)}
                            onmouseout={() => selectedRouteStore.set(null)}
                            onmouseover={() => selectedRouteStore.set(route.id)}
                          >
                            <RouteName {route} />
                          </a>

                          {#if navigator.maxTouchPoints > 0}
                            <button
                              aria-label="View route"
                              class="btn-icon preset-tonal absolute top-1/2 right-2 -translate-y-1/2"
                              onclick={() => selectedRouteStore.set(route.id)}
                            >
                              <i class="fa-solid fa-eye"></i>
                            </button>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  </nav>
                {/if}
              </section>
            </div>
          </Tabs.Panel>

          <Tabs.Panel value="map">
            <div use:fitHeightAction>
              {#await import('$lib/components/BlocksMap/ZeroLoader.svelte') then BlocksMap}
                {#key block.id}
                  <BlocksMap.default selectedBlock={block} />
                {/key}
              {/await}
            </div>
          </Tabs.Panel>{/snippet}
      </Tabs>
    {/snippet}
  </AppBar>
{/if}
