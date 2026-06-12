<script lang="ts">
  import { browser } from '$app/environment'
  import { MediaQuery } from 'svelte/reactivity'
  import Desktop from './Modal.desktop.svelte'
  import Mobile from './Modal.mobile.svelte'
  import { type Props } from './types'

  let { open = $bindable(), ...props }: Props = $props()

  const desktop = new MediaQuery('(min-width: 48rem)')
</script>

{#if desktop.current}
  <Desktop bind:open {...props} />
{:else if browser}
  <Mobile bind:open {...props} />
{/if}
