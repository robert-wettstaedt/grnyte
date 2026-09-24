<script module lang="ts">
  import { browser } from '$app/environment'
  import { DESKTOP_QUERY, preloadBranch } from './branch'

  const loadDesktop = () => import('./Modal.desktop.svelte')
  const loadMobile = () => import('./Modal.mobile.svelte')

  // Eager because the popover renders its own trigger (Zag owns that button's props), and a
  // control that waits for a render-time fetch visibly pops in on an ordinary page load.
  preloadBranch(loadDesktop, loadMobile)
</script>

<script lang="ts">
  import { beforeNavigate } from '$app/navigation'
  import { MediaQuery } from 'svelte/reactivity'
  import { getModalDepth, setModalDepth } from './depth'
  import { type Props } from './types'

  let { open = $bindable(), panel = false, trigger, ...props }: Props = $props()

  const desktop = new MediaQuery(DESKTOP_QUERY)

  // Close before the page unmounts: a nested dialog deactivating while the one it sits in is
  // already gone throws out of focus-trap's unpause, which aborts the teardown and leaves the
  // whole app `aria-hidden`. Pathname only, so the query mirroring the feed and the search bar
  // do in an effect leaves an open sheet alone.
  beforeNavigate((navigation) => {
    if (navigation.to?.url.pathname !== navigation.from?.url.pathname) {
      open = false
    }
  })

  // Where this sheet stacks, and one level up for whatever its body renders. Read from the sheet
  // this one was opened from rather than passed in: the same component opens at several depths
  // (a reaction chip on a feed card, in the activity log, in a comment thread under that log)
  // and cannot know which one it is in.
  const depth = getModalDepth()
  setModalDepth(depth + 1)
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
      <Mobile bind:open {depth} {...props} />
    {/await}
  {/if}
{/if}
