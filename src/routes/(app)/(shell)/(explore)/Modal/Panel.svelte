<script module lang="ts">
  import { browser } from '$app/environment'

  const DESKTOP_QUERY = '(min-width: 48rem)'

  const loadDesktop = () => import('./Panel.desktop.svelte')
  const loadMobile = () => import('./Modal.mobile.svelte')

  // Same split as Modal.svelte, and it has to be done here too: this file shares
  // Modal.mobile.svelte, so a static import here alone would keep svelte-bottom-sheet in the
  // desktop bundle no matter what its sibling does. Started on module evaluation because a viewer
  // route mounts this already open, so the chunk has to be in flight during hydration.
  if (browser) {
    void ((window.matchMedia?.(DESKTOP_QUERY).matches ?? false) ? loadDesktop() : loadMobile())
  }
</script>

<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity'
  import { sheetNavKeydown } from './keyboardNav'
  import { type ModalProps } from './types'

  let { onclose, open = $bindable(), ...props }: ModalProps = $props()

  const desktop = new MediaQuery(DESKTOP_QUERY)
</script>

<!-- Unlike the Modal's Dialog there's no built-in Escape handling here, so Escape
     mirrors the back button. -->
<svelte:window onkeydown={sheetNavKeydown({ onback: () => onclose?.() })} />

<!-- Modal's sibling for dedicated viewer routes (e.g. the topo viewer): same
     one-import contract and sheetState-driven header, but the destination reads
     as a pane, not a dialog. Desktop is a fixed right inspector and both form
     factors lead with a back button instead of a close X. -->
{#if browser}
  {#if desktop.current}
    {#await loadDesktop() then { default: Desktop }}
      <Desktop bind:open {onclose} {...props} />
    {/await}
  {:else}
    <!-- No collapse-on-outside-tap: the stage behind a viewer is interactive
         (pan/zoom, line taps), so the sheet stays wherever the user dragged it. -->
    {#await loadMobile() then { default: Mobile }}
      <Mobile bind:open {onclose} {...props} back collapseOnOutsideClick={false} />
    {/await}
  {/if}
{/if}
