<script lang="ts">
  import { browser } from '$app/environment'
  import Desktop from './Modal.desktop.svelte'
  import Mobile from './Modal.mobile.svelte'
  import { type ModalProps } from './types'

  let { open = $bindable(), ...props }: ModalProps = $props()

  const MD_BREAKPOINT_PX = 768
  let innerWidth = $state(browser ? window.innerWidth : MD_BREAKPOINT_PX)
  const isDesktop = $derived(innerWidth >= MD_BREAKPOINT_PX)
</script>

<svelte:window bind:innerWidth />

{#if isDesktop}
  <Desktop bind:open {...props} />
{:else}
  <Mobile bind:open {...props} />
{/if}
