<script module lang="ts">
  import { browser } from '$app/environment'

  const DESKTOP_QUERY = '(min-width: 48rem)'

  const loadDesktop = () => import('./Modal.desktop.svelte')
  const loadMobile = () => import('./Modal.mobile.svelte')

  // Fetch only the branch this viewport can show, so a desktop that can never render a
  // sheet stops carrying svelte-bottom-sheet. Statically importing both put the sheet and the
  // dialog in one chunk, which every visitor paid for whatever screen they were on.
  //
  // Started here, on module evaluation, instead of being left to the `{#await}` below: on a detail
  // route this sheet IS the page body (`open` starts true in the map layout), so the fetch has to
  // run alongside hydration rather than after it. The service worker precaches the chunk, so only
  // a first visit pays for it at all.
  if (browser) {
    void ((window.matchMedia?.(DESKTOP_QUERY).matches ?? false) ? loadDesktop() : loadMobile())
  }
</script>

<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity'
  import { sheetNavKeydown } from './keyboardNav'
  import { type ModalProps } from './types'

  let { open = $bindable(), ...props }: ModalProps = $props()

  const desktop = new MediaQuery(DESKTOP_QUERY)
</script>

<svelte:window onkeydown={sheetNavKeydown()} />

{#if browser}
  {#if desktop.current}
    {#await loadDesktop() then { default: Desktop }}
      <Desktop bind:open {...props} />
    {/await}
  {:else}
    {#await loadMobile() then { default: Mobile }}
      <Mobile bind:open {...props} />
    {/await}
  {/if}
{/if}
