<script lang="ts">
  const { children } = $props()
</script>

<!-- Editor routes (edit/…) are focused, full-screen tasks: the same main scroll
     area as the app shell, but without the nav rail or tab bar. Mirrors routes/. -->
<main class="relative min-w-0 flex-1 overflow-y-auto">
  {@render children()}
</main>
