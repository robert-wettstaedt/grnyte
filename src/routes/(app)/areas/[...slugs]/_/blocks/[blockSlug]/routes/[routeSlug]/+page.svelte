<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import { ActivityFeedLoader as ActivityFeed } from '$lib/components/ActivityFeed'
  import AppBar from '$lib/components/AppBar'
  import FileList from '$lib/components/FileList'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { ReferencesLoader } from '$lib/components/References'
  import RouteGradeMap from '$lib/components/RouteGradeMap'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import { selectedRouteStore, TopoViewerLoader as TopoViewer } from '$lib/components/TopoViewer'
  import { getRouteContext } from '$lib/contexts/route'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'
  import FirstAscentInfo from './FirstAscentInfo.svelte'
  import RouteActions from './RouteActions.svelte'

  const { block, route } = getRouteContext()

  let blockPath = $derived(`/areas/${page.params.slugs}/_/blocks/${page.params.blockSlug}`)
  let grade = $derived(page.data.grades.find((grade) => grade.id === route.gradeFk))

  type TabValue = 'info' | 'topo' | 'activity' | 'map'
  let tabValue: TabValue | undefined = $state(undefined)
  let tabFromUrl = $derived(page.url.searchParams.get('tab') as TabValue | undefined)
  afterNavigate(() => {
    tabValue = tabFromUrl ?? 'info'
  })
  onMount(() => {
    tabValue = tabFromUrl ?? 'info'
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onValueChange'] = (event) => {
    const newUrl = new URL(page.url)
    newUrl.searchParams.set('tab', event.value)
    goto(newUrl.toString(), { replaceState: true })
  }

  onMount(() => {
    return selectedRouteStore.subscribe((value) => {
      if (value == null && route != null) {
        selectedRouteStore.set(route.id)
      }
    })
  })
</script>

<svelte:head>
  <title>
    {route.rating == null ? '' : `${Array(route.rating).fill('★').join('')} `}
    {route.name}
    {grade == null ? '' : ` (${grade[page.data.gradingScale]})`}
    - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<AppBar hasActions>
  {#snippet lead()}
    <RouteName classes="flex-wrap" {route} />
  {/snippet}

  {#snippet actions()}
    <RouteActions {blockPath} />
  {/snippet}

  {#snippet headline()}
    {#if block.geolocationFk == null}
      <aside class="card preset-tonal-warning mb-4 flex items-center gap-2 p-2 whitespace-pre-line md:p-4">
        <i class="fa-solid fa-exclamation-triangle text-warning-800-200"></i>

        <p>
          The geolocation of this block is missing. Do you know where it is?

          <a class="anchor" href={`${blockPath}/edit-location`}>Add location</a>
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
        <Tabs.Control value="info">Info</Tabs.Control>

        {#if block.topos.length > 0}
          <Tabs.Control value="topo">Topo</Tabs.Control>
        {/if}

        <Tabs.Control value="activity">Activity</Tabs.Control>

        <Tabs.Control value="map">Map</Tabs.Control>
      {/snippet}

      {#snippet content()}
        {#if block.topos.length > 0}
          <Tabs.Panel value="topo">
            <TopoViewer blockId={block.id} initialRouteId={route.id ?? undefined}>
              {#snippet actions()}
                {#if checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
                  <a aria-label="Edit topo" class="btn-icon preset-filled" href={`${blockPath}/topos/draw`}>
                    <i class="fa-solid fa-pen"></i>
                  </a>
                {/if}
              {/snippet}
            </TopoViewer>
          </Tabs.Panel>
        {/if}

        <Tabs.Panel value="activity">
          <section class="p-2">
            <div class="mb-4 flex justify-center">
              <a class="btn preset-filled-primary-500" href={`${page.url.pathname}/ascents/add`}>
                <i class="fa-solid fa-check"></i>
                Log ascent
              </a>
            </div>

            <ActivityFeed entity={route.id == null ? undefined : { id: String(route.id), type: 'route' }} />
          </section>
        </Tabs.Panel>

        <Tabs.Panel value="map">
          <div use:fitHeightAction>
            {#await import('$lib/components/BlocksMap/ZeroLoader.svelte') then BlocksMap}
              {#key block.id}
                <BlocksMap.default selectedBlock={block} />
              {/key}
            {/await}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="info">
          <dl>
            <div class="flex p-2">
              <span class="flex-auto">
                <dt>FA</dt>
                <dd class="flex items-center justify-between">
                  <FirstAscentInfo />
                </dd>
              </span>
            </div>

            {#if route.description != null && route.description.length > 0}
              <div class="flex p-2">
                <span class="flex-auto">
                  <dt>Description</dt>
                  <dd>
                    <MarkdownRenderer markdown={route.description} />
                  </dd>
                </span>
              </div>
            {/if}

            {#if route.tags.length > 0}
              <div class="flex p-2">
                <span class="flex-auto">
                  <dt>Tags</dt>
                  <dd class="mt-1 flex gap-1">
                    {#each route.tags as tag}
                      <span class="chip preset-filled-surface-900-100">
                        <i class="fa-solid fa-tag"></i>
                        {tag.tagFk}
                      </span>
                    {/each}
                  </dd>
                </span>
              </div>
            {/if}

            <RouteGradeMap {route} />
            <ReferencesLoader id={route.id!} type="routes" />
            <FileList entityId={route.id!} entityType="route" regionFk={route.regionFk} />
          </dl>
        </Tabs.Panel>
      {/snippet}
    </Tabs>
  {/snippet}
</AppBar>
