<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { m } from '$lib/paraglide/messages.js'
</script>

<svelte:head>
  <title>{m.common_route()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<!-- Mock: route detail page — layout and content land here later. -->
<div class="space-y-2 p-4">
  <h1 class="text-lg font-bold">{m.common_route()} #{page.params.id}</h1>
  <p class="text-surface-500 text-sm">{m.common_comingSoon()}</p>
</div>
