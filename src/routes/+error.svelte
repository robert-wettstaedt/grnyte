<script lang="ts">
  import { page } from '$app/stores'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import AppBar from '$lib/components/AppBar'
</script>

<svelte:head>
  <title>Error - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<AppBar>
  {#snippet lead()}
    Error
  {/snippet}
</AppBar>

<div class="container mx-auto p-4">
  <aside class="card preset-tonal-error my-8 p-2 md:p-4 whitespace-pre-line">
    <h2 class="h2 mb-4">Something went wrong</h2>
    <p>{$page.status}: {$page.error?.message}</p>
  </aside>

  <div class="flex justify-center mt-4">
    <a href="/" class="btn preset-filled-primary-500">Go to Home</a>
  </div>
</div>
