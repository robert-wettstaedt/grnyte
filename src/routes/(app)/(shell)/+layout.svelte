<script lang="ts">
  import NavRail from '$lib/components/AppNav/NavRail.svelte'
  import TabBar from '$lib/components/AppNav/TabBar.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { getGlobalState } from '$lib/state/global.svelte'

  const { children } = $props()

  const global = getGlobalState()
</script>

<!-- The app shell: primary destinations (map, feed, profile) framed by the nav
     rail (desktop) and tab bar (mobile).

     The rail is `fixed`, so it takes no space: `md:pl-20` (its width) keeps flow
     content out from under it. Feed and profile centre a column in what is left;
     the map and its overlays are absolute/fixed, positioned against the padding
     box, so they stay full-bleed under the glass rail. -->
<main class="relative min-w-0 flex-1 overflow-y-auto md:pl-20">
  <!-- The wait is owned here rather than by `(app)`, which shows a full-screen indicator for the
       chromeless routes instead. Nothing above this line needs synced data - the rail and the tab
       bar read only `unreadNotifications`, which starts at zero and moves - so the frame can paint
       while the store is still warming and only the content waits. Worth roughly 1.4 seconds of
       "visibly loading" instead of a bare spinner on a 5000-route region; it does not make anything
       arrive sooner. -->
  {#if global.isLoading}
    <LoadingIndicator class="flex h-full w-full items-center justify-center" size={20} />
  {:else}
    {@render children()}
  {/if}
</main>

<NavRail />
<TabBar />
