<script lang="ts">
  import { page } from '$app/state'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { nextDestination } from '$lib/auth'
  import { m } from '$lib/paraglide/messages'
  import { onMount } from 'svelte'

  // An in-page move on grnyte's own origin, which no installed native app catches (design decision 12).
  const target = $derived(nextDestination(page.url.searchParams.get('next')))

  // `replace`, so Back does not return here.
  onMount(() => location.replace(target))
</script>

<svelte:head>
  <title>{m.auth_continueTitle()} - {PUBLIC_APPLICATION_NAME}</title>
</svelte:head>

<div class="mt-6.5 mb-4.5 flex flex-col items-center gap-4 text-center min-[860px]:mt-0">
  <h1 class="text-[23px] leading-tight font-bold tracking-tight text-balance">{m.auth_continueTitle()}</h1>
  <!-- eslint-disable svelte/no-navigation-without-resolve -- `nextDestination` answers a checked same-origin path -->
  <a href={target} class="text-primary-500 font-bold">{m.auth_continueLink()}</a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</div>
