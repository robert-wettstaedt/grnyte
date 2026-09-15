<script lang="ts">
  const { children } = $props()
</script>

<!-- Onboarding/creation is a focused, full-screen task: the same main scroll area as
     the app shell, but without the nav rail or tab bar. Mirrors areas/ and ascents/. -->
<main class="relative min-w-0 flex-1 overflow-y-auto">
  {@render children()}
</main>
