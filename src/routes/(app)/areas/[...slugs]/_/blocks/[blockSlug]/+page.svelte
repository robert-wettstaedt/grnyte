<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import { pageState } from '$lib/components/Layout'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { RouteNameLoader as RouteName } from '$lib/components/RouteName'
  import TopoViewer, { selectedRouteStore, TopoViewerLoader } from '$lib/components/TopoViewer'
  import { getBlockContext } from '$lib/contexts/block'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onDestroy, onMount } from 'svelte'
  import BlockActions from './BlockActions.svelte'
  import { getI18n } from '$lib/i18n'

  const { block } = getBlockContext()
  const { t } = getI18n()

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
    checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block?.regionFk) ||
      (block != null && block.topos.length > 0),
  )

  onDestroy(() => {
    selectedRouteStore.set(null)
  })
</script>

<svelte:head>
  <title>{block?.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar {hasActions}>
  {#snippet headline()}
    {block.name}
  {/snippet}

  {#snippet actions(args)}
    <BlockActions {args} />
  {/snippet}

  {#snippet content()}
    {#if block.geolocationFk == null}
      <aside class="card preset-tonal-warning mb-4 flex items-center gap-2 p-2 whitespace-pre-line md:p-4">
        <i class="fa-solid fa-exclamation-triangle text-warning-800-200"></i>

        <p>
          {t('blocks.geolocationMissing')}

          <a class="anchor" href={`${page.url.pathname}/edit-location`}>{t('map.addLocation')}</a>
        </p>
      </aside>
    {/if}

    <Tabs onValueChange={onChangeTab} value={tabValue}>
      <Tabs.List class="gap-0 overflow-x-auto overflow-y-hidden pb-px md:w-125">
        <Tabs.Trigger class="flex-1" value="topo">{t('topo.title')}</Tabs.Trigger>
        <Tabs.Trigger class="flex-1" value="map">{t('map.title')}</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>

      <Tabs.Content value="topo">
        <TopoViewerLoader blockId={block.id}>
          {#snippet children(topos, routes)}
            <div class="flex flex-wrap gap-2 md:flex-nowrap">
              {#if topos.length > 0}
                <section class="relative w-full md:w-2/4" use:fitHeightAction>
                  <TopoViewer {topos} selectionBehavior="scroll">
                    {#snippet actions()}
                      {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk)}
                        <a
                          aria-label={t('topo.editTopo')}
                          title={t('topo.editTopo')}
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

              <section class={`mt-4 w-full md:mt-0 ${topos.length === 0 ? '' : 'md:w-2/4'}`}>
                {#if routes.length === 0}
                  {t('routes.noRoutesYet')}
                {:else}
                  <nav class="list-nav">
                    <ul>
                      {#each routes as route}
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

                            <MarkdownRenderer
                              className="short"
                              encloseReferences="strong"
                              markdown={route.description ?? ''}
                            />
                          </a>

                          {#if navigator.maxTouchPoints > 0}
                            <button
                              aria-label={t('routes.viewRoute')}
                              title={t('routes.viewRoute')}
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
          {/snippet}
        </TopoViewerLoader>
      </Tabs.Content>

      <Tabs.Content value="map">
        <div use:fitHeightAction>
          {#await import('$lib/components/BlocksMap/ZeroLoader.svelte') then BlocksMap}
            {#key block.id}
              <BlocksMap.default selectedBlock={block} />
            {/key}
          {/await}
        </div>
      </Tabs.Content>
    </Tabs>
  {/snippet}
</AppBar>
