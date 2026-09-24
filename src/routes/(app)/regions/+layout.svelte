<script lang="ts">
  import { createScrollSurface } from '$lib/state/scroll'

  const { children } = $props()

  const scroll = createScrollSurface()

  // Kit restores this on back. Nothing here scrolls the window, so its own handling never fires.
  export const snapshot = scroll.snapshot
</script>

<!-- Every region screen is a focused, full-screen task: the same main scroll area as the app
     shell, without the nav rail or tab bar. Each carries its own back button. -->
<main class="relative min-w-0 flex-1 overflow-y-auto" {@attach scroll.attach}>
  {@render children()}
</main>
