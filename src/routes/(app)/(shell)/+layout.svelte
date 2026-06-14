<script lang="ts">
  import NavRail from '$lib/components/AppNav/NavRail.svelte'
  import TabBar from '$lib/components/AppNav/TabBar.svelte'

  const { children } = $props()
</script>

<!-- The app shell: primary destinations (map, feed, profile) framed by the nav
     rail (desktop) and tab bar (mobile). -->
<main class="relative min-w-0 flex-1 overflow-y-auto">
  {@render children()}
</main>

<NavRail />
<TabBar />
