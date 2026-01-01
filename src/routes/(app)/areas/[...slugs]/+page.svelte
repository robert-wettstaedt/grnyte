<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import AreaList from '$lib/components/AreaList'
  import BlocksList from '$lib/components/BlocksList'
  import { pageState } from '$lib/components/Layout'
  import RouteList from '$lib/components/RouteList'
  import { getAreaContext } from '$lib/contexts/area'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'
  import AreaActions from './AreaActions.svelte'
  import AreaInfo from './AreaInfo.svelte'

  const { area } = getAreaContext()

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

  const hasActions = $derived(checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], area?.regionFk))
</script>

<svelte:head>
  <title>{area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if downloadError}
  <aside class="card preset-tonal-warning my-8 p-2 whitespace-pre-line md:p-4">
    <p>{downloadError}</p>
  </aside>
{/if}

<AppBar {hasActions}>
  {#snippet headline()}
    {area.name}
  {/snippet}

  {#snippet actions()}
    <AreaActions />
  {/snippet}

  {#snippet content()}
    <Tabs onValueChange={onChangeTab} value={tabValue}>
      <Tabs.List class="gap-0 overflow-x-auto overflow-y-hidden pb-px md:w-[500px]">
        {#if area.type === 'sector'}
          <Tabs.Trigger class="flex-1" value="info">Info</Tabs.Trigger>
        {/if}

        {#if area.type === 'sector'}
          <Tabs.Trigger class="flex-1" value="blocks">Blocks</Tabs.Trigger>
        {:else}
          <Tabs.Trigger class="flex-1" value="areas">Areas</Tabs.Trigger>
        {/if}

        <Tabs.Trigger class="flex-1" value="map">Map</Tabs.Trigger>

        <Tabs.Trigger class="flex-1" value="routes">Routes</Tabs.Trigger>

        <Tabs.Indicator />
      </Tabs.List>

      {#if area.type === 'sector'}
        <Tabs.Content value="info">
          <AreaInfo />
        </Tabs.Content>
      {/if}

      <Tabs.Content value="map">
        <div use:fitHeightAction>
          {#await import('$lib/components/BlocksMap/ZeroLoader.svelte') then BlocksMap}
            {#key area.id}
              <BlocksMap.default selectedArea={area} />
            {/key}
          {/await}
        </div>
      </Tabs.Content>

      {#if area.type === 'sector'}
        <Tabs.Content value="blocks">
          <BlocksList
            areaFk={area.id}
            onLoad={() => setTimeout(() => (loadedTabs = true), 100)}
            regionFk={area.regionFk}
          />
        </Tabs.Content>
      {/if}

      {#if area.type !== 'sector'}
        <Tabs.Content value="areas">
          {#if tabValue === 'areas' || loadedTabs}
            <AreaList onLoad={() => setTimeout(() => (loadedTabs = true), 100)} parentFk={area.id} />
          {/if}
        </Tabs.Content>
      {/if}

      <Tabs.Content value="routes">
        {#if tabValue === 'routes' || loadedTabs}
          <RouteList areaFk={area.id} onLoad={() => setTimeout(() => (loadedTabs = true), 100)} />
        {/if}
      </Tabs.Content>
    </Tabs>
  {/snippet}
</AppBar>
