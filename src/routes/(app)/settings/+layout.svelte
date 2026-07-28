<script lang="ts">
  const { children } = $props()
</script>

<!-- Same main scroll area as the /areas editors: the settings screens are full-screen tasks
     without the nav rail or tab bar, and the form pages under here render `Form` as the route's
     direct child, so the scroll container has to come from the layout. -->
<main class="relative min-w-0 flex-1 overflow-y-auto">
  {@render children()}
</main>
