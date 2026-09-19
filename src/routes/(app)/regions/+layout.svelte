<script lang="ts">
  const { children } = $props()
</script>

<!-- Every region screen is a focused, full-screen task: the same main scroll area as the app
     shell, without the nav rail or tab bar. Each carries its own back button. -->
<main class="relative min-w-0 flex-1 overflow-y-auto">
  {@render children()}
</main>
