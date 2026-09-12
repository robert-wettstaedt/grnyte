<script module lang="ts">
  import { browser } from '$app/environment'
  import { DESKTOP_QUERY, preloadBranch } from '$lib/components/Modal/branch'

  const loadDesktop = () => import('./Modal.desktop.svelte')
  const loadMobile = () => import('./Modal.mobile.svelte')

  // Eager because on a detail route this sheet IS the page body (`open` starts true in the map
  // layout), so the fetch has to run alongside hydration rather than after it.
  preloadBranch(loadDesktop, loadMobile)
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
