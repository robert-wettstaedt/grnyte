<script lang="ts">
  import NavRail from '$lib/components/AppNav/NavRail.svelte'
  import TabBar from '$lib/components/AppNav/TabBar.svelte'

  const { children } = $props()
</script>

<!-- The app shell: primary destinations (map, feed, profile) framed by the nav
     rail (desktop) and tab bar (mobile).

     The rail is `fixed`, so it takes no space: `md:pl-20` (its width) keeps flow
     content out from under it. Feed and profile centre a column in what is left;
     the map and its overlays are absolute/fixed, positioned against the padding
     box, so they stay full-bleed under the glass rail as before. -->
<main class="relative min-w-0 flex-1 overflow-y-auto md:pl-20">
  {@render children()}
</main>

<NavRail />
<TabBar />
