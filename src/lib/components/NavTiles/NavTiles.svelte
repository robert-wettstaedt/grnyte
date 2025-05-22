<script lang="ts">
  import { page } from '$app/state'
  import {
    APP_PERMISSION_REGIONS_ADMIN,
    APP_PERMISSION_TAGS_ADMIN,
    APP_PERMISSION_USERS_ADMIN,
    checkAppPermission,
  } from '$lib/auth'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
</script>

<Navigation.Tile href="/" label="Home" selected={page.url.pathname === '/'}>
  <i class="fa-solid fa-house"></i>
</Navigation.Tile>

<Navigation.Tile href="/areas" label="Browse" selected={page.url.pathname.startsWith('/areas')}>
  <i class="fa-solid fa-layer-group"></i>
</Navigation.Tile>

<Navigation.Tile href="/feed" label="Feed" selected={page.url.pathname.startsWith('/feed')}>
  <i class="fa-solid fa-square-poll-horizontal"></i>
</Navigation.Tile>

<Navigation.Tile href="/search" label="Search" selected={page.url.pathname.startsWith('/search')}>
  <i class="fa-solid fa-search"></i>
</Navigation.Tile>

{#if checkAppPermission( page.data.userPermissions, [APP_PERMISSION_TAGS_ADMIN, APP_PERMISSION_REGIONS_ADMIN, APP_PERMISSION_USERS_ADMIN], )}
  <Navigation.Tile href="/config" label="Manage" selected={page.url.pathname.startsWith('/config')}>
    <i class="fa-solid fa-wrench"></i>
  </Navigation.Tile>
{/if}

<Navigation.Tile href="/settings" label="Settings" selected={page.url.pathname.startsWith('/settings')}>
  <i class="fa-solid fa-gear"></i>
</Navigation.Tile>
