<script lang="ts">
  import { page } from '$app/state'
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
</script>

<Navigation.TriggerAnchor href="/" selected={page.url.pathname === '/'}>
  <i class="fa-solid fa-house"></i>

  <Navigation.TriggerText>Home</Navigation.TriggerText>
</Navigation.TriggerAnchor>

<Navigation.TriggerAnchor href="/areas" selected={page.url.pathname.startsWith('/areas')}>
  <i class="fa-solid fa-layer-group"></i>

  <Navigation.TriggerText>Browse</Navigation.TriggerText>
</Navigation.TriggerAnchor>

<Navigation.TriggerAnchor href="/feed" selected={page.url.pathname.startsWith('/feed')}>
  <i class="fa-solid fa-square-poll-horizontal"></i>

  <Navigation.TriggerText>Feed</Navigation.TriggerText>
</Navigation.TriggerAnchor>

<Navigation.TriggerAnchor href="/search" selected={page.url.pathname.startsWith('/search')}>
  <i class="fa-solid fa-search"></i>

  <Navigation.TriggerText>Search</Navigation.TriggerText>
</Navigation.TriggerAnchor>

<Navigation.TriggerAnchor href="/settings" selected={page.url.pathname.startsWith('/settings')}>
  <i class="fa-solid fa-gear"></i>

  <Navigation.TriggerText>Settings</Navigation.TriggerText>
</Navigation.TriggerAnchor>
