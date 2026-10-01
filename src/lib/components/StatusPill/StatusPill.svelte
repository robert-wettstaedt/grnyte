<!--
  The pill floating over a list or the map. Filled when it does something (merge new rows), a plain
  surface with a spinner when it only reports, so a reader can tell a button from a status.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { motion } from '$lib/state/motion.svelte'
  import type { Snippet } from 'svelte'
  import type { ClassValue } from 'svelte/elements'
  import { fly } from 'svelte/transition'

  interface Props {
    children: Snippet
    /**
     * Where it floats. Defaults to pinned at the top of a scrolling list with no height of its own,
     * so it overlays the list instead of pushing it down when it comes and goes.
     */
    class?: ClassValue
    icon?: IconName
    /** Given, the pill is a button showing `icon`; omitted, a live status with a spinner. */
    onclick?: () => void
  }

  const { children, class: placement = 'sticky top-2 z-20 h-0', icon, onclick }: Props = $props()

  // One box for both, so a status turning into the action (the feed swaps them) keeps its size.
  const shape = 'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap shadow-lg'
</script>

<div
  class={['pointer-events-none flex items-start justify-center', placement]}
  transition:fly={{ duration: motion(), y: -8 }}
>
  {#if onclick}
    <button
      type="button"
      class={[
        shape,
        'preset-filled-primary-500 pointer-events-auto border-transparent font-semibold transition-[filter] hover:brightness-110',
      ]}
      {onclick}
    >
      {#if icon}
        <Icon name={icon} size={14} />
      {/if}
      {@render children()}
    </button>
  {:else}
    <p class={[shape, 'bg-surface-100-900 border-surface-200-800']} role="status">
      <LoadingIndicator class="w-fit shrink-0" size={4} />
      {@render children()}
    </p>
  {/if}
</div>
