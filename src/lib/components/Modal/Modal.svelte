<script module lang="ts">
  import { browser } from '$app/environment'

  const DESKTOP_QUERY = '(min-width: 48rem)'

  const loadDesktop = () => import('./Modal.desktop.svelte')
  const loadMobile = () => import('./Modal.mobile.svelte')

  // Fetch only the branch this viewport can show. The desktop popover positions itself
  // with floating-ui and the mobile sheet ships svelte-bottom-sheet, and neither form factor has
  // any use for the other's: statically importing both put them in one chunk, which every visitor
  // paid for whatever screen they were on.
  //
  // Started here, on module evaluation, instead of being left to the `{#await}` below. The popover
  // renders its own trigger: `Popover.Trigger` hands the snippet Zag's id, aria and click props, so
  // that button (unlike the sheet's, hoisted below) cannot leave Modal.desktop.svelte, and a
  // control that waits for a render-time fetch visibly pops in on an ordinary page load. Kicking
  // the fetch off as the page's own JavaScript runs lands it alongside hydration rather than after
  // it, and the service worker precaches the chunk for every visit after the first.
  if (browser) {
    void ((window.matchMedia?.(DESKTOP_QUERY).matches ?? false) ? loadDesktop() : loadMobile())
  }
</script>

<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity'
  import { type Props } from './types'

  let { open = $bindable(), panel = false, trigger, ...props }: Props = $props()

  const desktop = new MediaQuery(DESKTOP_QUERY)
</script>

{#if browser}
  <!-- The trigger renders here rather than inside the branch, so the control the user taps exists
       the moment the page hydrates and never waits on a chunk. The popover is the one shape that
       cannot be hoisted (Zag owns its button's props, see the module block above); it renders its
       own trigger and is what the eager preload up there is for. -->
  {#if panel || !desktop.current}
    {@render trigger?.({})}
  {/if}

  {#if desktop.current}
    {#await loadDesktop() then { default: Desktop }}
      <Desktop bind:open {panel} {trigger} {...props} />
    {/await}
  {:else}
    {#await loadMobile() then { default: Mobile }}
      <Mobile bind:open {...props} />
    {/await}
  {/if}
{/if}
