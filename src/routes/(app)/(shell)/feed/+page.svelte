<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { m } from '$lib/paraglide/messages.js'
</script>

<svelte:head>
  <title>{m.feed_title()} – {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="container mx-auto max-w-3xl space-y-6 px-4 py-8 pb-24 md:pb-8">
  <h1 class="h1">{m.feed_title()}</h1>
  <p class="text-surface-600-400">{m.common_comingSoon()}</p>
</div>
