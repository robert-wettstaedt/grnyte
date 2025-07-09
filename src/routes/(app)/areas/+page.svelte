<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import AreaList from '$lib/components/AreaList'
  import RouteList from '$lib/components/RouteList'
  import { Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  type TabValue = 'areas' | 'routes'
  let tabValue: TabValue | undefined = $state(undefined)
  let loadedTabs = $state(false)
  let tabFromUrl = $derived(page.url.searchParams.get('tab') as TabValue | undefined)
  afterNavigate(() => {
    tabValue = tabFromUrl ?? 'areas'
  })
  onMount(() => {
    tabValue = tabFromUrl ?? 'areas'
  })
  const onChangeTab: Parameters<typeof Tabs>[1]['onValueChange'] = (event) => {
    const newUrl = new URL(page.url)
    newUrl.searchParams.set('tab', event.value)
    goto(newUrl.toString(), { replaceState: true })
  }

  let hasActions = $derived(
    page.data.userRegions.some((region) =>
      checkRegionPermission(page.data.userRegions, [REGION_PERMISSION_ADMIN], region.regionFk),
    ),
  )
</script>

<svelte:head>
  <title>Areas - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar {hasActions}>
  {#snippet lead()}{/snippet}

  {#snippet actions()}
    <a class="btn btn-sm preset-outlined-primary-500" href="{page.url.pathname}/add">
      <i class="fa-solid fa-plus w-4"></i>Add area
    </a>
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
        <Tabs.Control value="areas">Areas</Tabs.Control>
        <Tabs.Control value="routes">Routes</Tabs.Control>
      {/snippet}

      {#snippet content()}
        <Tabs.Panel value="areas">
          {#if tabValue === 'areas' || loadedTabs}
            <AreaList onLoad={() => setTimeout(() => (loadedTabs = true), 100)} />
          {/if}
        </Tabs.Panel>

        <Tabs.Panel value="routes">
          {#if tabValue === 'routes' || loadedTabs}
            <RouteList onLoad={() => setTimeout(() => (loadedTabs = true), 100)} />
          {/if}
        </Tabs.Panel>
      {/snippet}
    </Tabs>
  {/snippet}
</AppBar>
