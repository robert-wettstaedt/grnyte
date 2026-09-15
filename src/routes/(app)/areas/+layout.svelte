<script lang="ts">
  const { children } = $props()
</script>

<!-- Editor routes (add/edit/export/…) are focused, full-screen tasks: the same
     main scroll area as the app shell, but without the nav rail or tab bar. -->
<main class="relative min-w-0 flex-1 overflow-y-auto">
  {@render children()}
</main>
