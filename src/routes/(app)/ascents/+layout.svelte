<script lang="ts">
  import { createScrollSurface } from '$lib/state/scroll'

  const { children } = $props()

  const scroll = createScrollSurface()

  // Kit restores this on back. Nothing here scrolls the window, so its own handling never fires.
  export const snapshot = scroll.snapshot
</script>

<!-- Editor routes (edit/…) are focused, full-screen tasks: the same main scroll
     area as the app shell, but without the nav rail or tab bar. Mirrors routes/. -->
<main class="relative min-w-0 flex-1 overflow-y-auto" {@attach scroll.attach}>
  {@render children()}
</main>
