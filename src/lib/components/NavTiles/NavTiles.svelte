<script lang="ts">
  import { page } from '$app/state'
  import { DELETE_PERMISSION, EDIT_PERMISSION } from '$lib/auth'
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

{#if userPermissions?.includes(EDIT_PERMISSION) && userPermissions?.includes(DELETE_PERMISSION)}
  <Navigation.Tile href="/tags" label="Tags" selected={page.url.pathname.startsWith('/tags')}>
    <i class="fa-solid fa-tags"></i>
  </Navigation.Tile>
{/if}

<Navigation.Tile href="/settings" label="Settings" selected={page.url.pathname.startsWith('/settings')}>
  <i class="fa-solid fa-gear"></i>
</Navigation.Tile>
