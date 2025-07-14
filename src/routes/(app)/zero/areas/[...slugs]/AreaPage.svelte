<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { fitHeightAction } from '$lib/actions/fit-height.svelte'
  import { checkRegionPermission, REGION_PERMISSION_EDIT } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import AreaList from '$lib/components/AreaList'
  import BlocksList from '$lib/components/BlocksList'
  import RouteList from '$lib/components/RouteList'
  import type { Schema } from '$lib/db/zero'
  import type { PullRow } from '@rocicorp/zero'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'
  import AreaActions from './AreaActions.svelte'
  import AreaInfo from './AreaInfo.svelte'

  interface Props {
    area: PullRow<'areas', Schema>
  }

  const { area }: Props = $props()

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
  <title>{area.name} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

{#if downloadError}
  <aside class="card preset-tonal-warning my-8 p-2 whitespace-pre-line md:p-4">
    <p>{downloadError}</p>
  </aside>
{/if}

<AppBar {hasActions}>
  {#snippet lead()}
    {area.name}
  {/snippet}

  {#snippet actions()}
    <AreaActions {area} />
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
            <AreaInfo {area} />
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
