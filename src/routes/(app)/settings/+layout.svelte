<script lang="ts">
  import { createScrollSurface } from '$lib/state/scroll'

  const { children } = $props()

  const scroll = createScrollSurface()

  // Kit restores this on back. Nothing here scrolls the window, so its own handling never fires.
  export const snapshot = scroll.snapshot
</script>

<!-- Same main scroll area as the /areas editors: the settings screens are full-screen tasks
     without the nav rail or tab bar, and the form pages under here render `Form` as the route's
     direct child, so the scroll container has to come from the layout. -->
<main class="relative min-w-0 flex-1 overflow-y-auto" {@attach scroll.attach}>
  {@render children()}
</main>
