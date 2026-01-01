<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_ADMIN } from '$lib/auth'
  import AppBar from '$lib/components/AppBar'
  import AreaList from '$lib/components/AreaList'
  import FavoritesList from '$lib/components/FavoritesList'
  import { pageState } from '$lib/components/Layout'
  import RouteList from '$lib/components/RouteList'
  import { Menu, Tabs } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'

  type TabValue = 'areas' | 'routes' | 'favorites'
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
    pageState.userRegions.some((region) =>
      checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_ADMIN], region.regionFk),
    ),
  )
</script>

<svelte:head>
  <title>Areas - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar {hasActions}>
  {#snippet actions({ buttonProps, iconProps })}
    <Menu.Item value="Add area">
      <a {...buttonProps} href="{page.url.pathname}/add">
        <i {...iconProps} class="fa-solid fa-pen {iconProps.class}"></i>
        Add area
      </a>
    </Menu.Item>
  {/snippet}

  {#snippet content()}
    <Tabs onValueChange={onChangeTab} value={tabValue}>
      <Tabs.List class="gap-0 overflow-x-auto overflow-y-hidden pb-px md:w-[500px]">
        <Tabs.Trigger class="flex-1" value="areas">Areas</Tabs.Trigger>
        <Tabs.Trigger class="flex-1" value="routes">Routes</Tabs.Trigger>
        <Tabs.Trigger class="flex-1" value="favorites">My Favorites</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>

      <Tabs.Content value="areas">
        {#if tabValue === 'areas' || loadedTabs}
          <AreaList onLoad={() => setTimeout(() => (loadedTabs = true), 100)} />
        {/if}
      </Tabs.Content>

      <Tabs.Content value="routes">
        {#if tabValue === 'routes' || loadedTabs}
          <RouteList onLoad={() => setTimeout(() => (loadedTabs = true), 100)} />
        {/if}
      </Tabs.Content>

      <Tabs.Content value="favorites">
        {#if tabValue === 'favorites' || loadedTabs}
          <FavoritesList onLoad={() => setTimeout(() => (loadedTabs = true), 100)} authUserId={page.data.authUserId!} />
        {/if}
      </Tabs.Content>
    </Tabs>
  {/snippet}
</AppBar>
