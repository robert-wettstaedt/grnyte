<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { EDIT_PERMISSION } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import RouteName from '$lib/components/RouteName'
  import TopoViewer, { selectedRouteStore } from '$lib/components/TopoViewer'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  let { data } = $props()
  let basePath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)

  let highlightedRoutes: number[] = $state([])

  let tabValue: string | undefined = $state(undefined)
  afterNavigate(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : '#topo'
  })
  onMount(() => {
    tabValue = page.url.hash.length > 0 ? page.url.hash : '#topo'
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onValueChange'] = (event) => {
    const newUrl = new URL(page.url)
    newUrl.hash = event.value
    goto(newUrl.toString(), { replaceState: true })
  }

  const hasActions = $derived(data.userPermissions?.includes(EDIT_PERMISSION) || data.block.topos.length > 0)
</script>

<svelte:head>
  <title>{data.block.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar {hasActions}>
  {#snippet lead()}
    {data.block.name}
  {/snippet}

  {#snippet actions()}
    {#if data.block.topos.length > 0}
      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/export`}>
        <i class="fa-solid fa-file-export"></i>Export block preview
      </a>
    {/if}

    {#if data.userPermissions?.includes(EDIT_PERMISSION)}
      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/routes/add`}>
        <i class="fa-solid fa-plus"></i> Add route
      </a>

      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/topos/add`}>
        <i class="fa-solid fa-file-arrow-up"></i> Upload topo image
      </a>

      {#if data.block.topos.length > 0}
        <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/topos/draw`}>
          <i class="fa-solid fa-file-pen"></i> Edit topo
        </a>
      {/if}

      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/edit-location`}>
        <i class="fa-solid fa-location-dot"></i>Edit geolocation
      </a>

      <a class="btn btn-sm preset-outlined-primary-500" href={`${basePath}/edit`}>
        <i class="fa-solid fa-pen"></i>Edit block details
      </a>
    {/if}
  {/snippet}

  {#snippet headline()}
    {#if data.block.geolocationFk == null}
      <aside class="card preset-tonal-warning mb-4 flex items-center gap-2 p-2 whitespace-pre-line md:p-4">
        <i class="fa-solid fa-exclamation-triangle text-warning-800-200"></i>

        <p>
          The geolocation of this block is missing. Do you know where it is?

          <a class="anchor" href={`${basePath}/edit-location`}>Add location</a>
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
        <Tabs.Control value="#topo">Topo</Tabs.Control>

        <Tabs.Control value="#map">Map</Tabs.Control>
      {/snippet}

      {#snippet content()}
        <Tabs.Panel value="#topo">
          <div class="flex flex-wrap gap-2 md:flex-nowrap">
            {#if data.topos.length > 0}
              <section class="relative w-full md:w-2/4" use:fitHeightAction>
                <TopoViewer topos={data.topos}>
                  {#snippet actions()}
                    {#if data.userPermissions?.includes(EDIT_PERMISSION)}
                      <a aria-label="Edit topo" class="btn-icon preset-filled" href={`${basePath}/topos/draw`}>
                        <i class="fa-solid fa-pen"></i>
                      </a>
                    {/if}
                  {/snippet}
                </TopoViewer>
              </section>
            {/if}

            <section class={`mt-4 w-full md:mt-0 ${data.topos.length === 0 ? '' : 'md:w-2/4'}`}>
              {#if data.block.routes.length === 0}
                No routes yet
              {:else}
                <nav class="list-nav">
                  <ul>
                    {#each data.block.routes as route}
                      <li
                        class={`p-2 whitespace-nowrap ${
                          [$selectedRouteStore, ...highlightedRoutes].includes(route.id)
                            ? 'preset-filled-primary-100-900'
                            : ''
                        }`}
                      >
                        <a
                          class={[$selectedRouteStore, ...highlightedRoutes].includes(route.id)
                            ? 'text-white'
                            : 'text-primary-500'}
                          href={`${basePath}/routes/${route.slug.length === 0 ? route.id : route.slug}`}
                          onclick={() => selectedRouteStore.set(route.id)}
                          onkeydown={(event) => event.key === 'Enter' && selectedRouteStore.set(route.id)}
                        >
                          <RouteName {route} />
                        </a>
                      </li>
                    {/each}
                  </ul>
                </nav>
              {/if}
            </section>
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="#map">
          <div use:fitHeightAction>
            {#await import('$lib/components/BlocksMap') then BlocksMap}
              {#key data.block.id}
                <BlocksMap.default blocks={data.blocks} selectedBlock={data.block} />
              {/key}
            {/await}
          </div>
        </Tabs.Panel>
      {/snippet}
    </Tabs>
  {/snippet}
</AppBar>
