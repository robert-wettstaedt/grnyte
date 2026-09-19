<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'
</script>

<svelte:head>
  <title>{m.sync_externalResources()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<section class="mx-auto max-w-screen-sm space-y-2 p-4">
  <h1 class="text-xl font-bold">{m.sync_externalResources()}</h1>
  <p class="text-surface-600-400">{m.common_comingSoon()}</p>
</section>
