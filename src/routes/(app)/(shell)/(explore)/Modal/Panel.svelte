<script lang="ts">
  import { browser } from '$app/environment'
  import { MediaQuery } from 'svelte/reactivity'
  import { sheetNavKeydown } from './keyboardNav'
  import Mobile from './Modal.mobile.svelte'
  import Desktop from './Panel.desktop.svelte'
  import { type ModalProps } from './types'

  let { onclose, open = $bindable(), ...props }: ModalProps = $props()

  const desktop = new MediaQuery('(min-width: 48rem)')
</script>

<!-- Unlike the Modal's Dialog there's no built-in Escape handling here, so Escape
     mirrors the back button. -->
<svelte:window onkeydown={sheetNavKeydown({ onback: () => onclose?.() })} />

<!-- Modal's sibling for dedicated viewer routes (e.g. the topo viewer): same
     one-import contract and sheetState-driven header, but the destination reads
     as a pane, not a dialog — desktop is a fixed right inspector and both form
     factors lead with a back button instead of a close X. -->
{#if desktop.current}
  <Desktop bind:open {onclose} {...props} />
{:else if browser}
  <!-- No collapse-on-outside-tap: the stage behind a viewer is interactive
       (pan/zoom, line taps) — the sheet stays wherever the user dragged it. -->
  <Mobile bind:open {onclose} {...props} back collapseOnOutsideClick={false} />
{/if}
