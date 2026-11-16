<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'

  // Normally never rendered: the auth session catches this return first. It never reads the query,
  // so the handoff code appears nowhere in the page.
</script>

<svelte:head>
  <title>{m.appReturn_title()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4 py-8 text-center">
  <h1 class="h3">{m.appReturn_title()}</h1>
  <p>{m.appReturn_goBack()}</p>
  <p class="text-surface-600-400">{m.appReturn_startAgain()}</p>
  <a href={resolve('/')} class="text-primary-500 mt-2 font-bold">{m.appReturn_toWeb()}</a>
</div>
