<script lang="ts">
  import { page } from '$app/state'
  import { REGION_ADMIN_PERMISSION, TAG_ADMIN_PERMISSION, USER_ADMIN_PERMISSION } from '$lib/auth'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    userPermissions: App.Locals['userPermissions'] | undefined
  }

  let { userPermissions }: Props = $props()
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

{#if [TAG_ADMIN_PERMISSION, REGION_ADMIN_PERMISSION, USER_ADMIN_PERMISSION].some( (permission) => userPermissions?.includes(permission as App.Permission), )}
  <Navigation.Tile href="/config" label="Manage" selected={page.url.pathname.startsWith('/config')}>
    <i class="fa-solid fa-wrench"></i>
  </Navigation.Tile>
{/if}

<Navigation.Tile href="/settings" label="Settings" selected={page.url.pathname.startsWith('/settings')}>
  <i class="fa-solid fa-gear"></i>
</Navigation.Tile>
