<!--
  The pill floating over the screen. Filled when it does something (merge new rows), a plain surface
  with a spinner when it only reports. One box for both, which resizes and crossfades between them.
-->
<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import LoadingIndicator from '$lib/components/LoadingIndicator/LoadingIndicator.svelte'
  import { motion } from '$lib/state/motion.svelte'
  import type { PillOffer } from '$lib/state/pill.svelte'
  import type { ClassValue } from 'svelte/elements'
  import { fade, fly } from 'svelte/transition'

  interface Props {
    /** Where it floats; it takes no space, so it overlays what is under it. */
    class?: ClassValue
    content: PillOffer
    style?: string
  }

  const { class: placement, content, style }: Props = $props()

  // The current face's width, kept until the incoming face is measured, so the box always resizes
  // from where it was. Found in the DOM by kind: a face fading back in has its own effects paused.
  let box = $state<HTMLElement>()
  let width = $state(0)
  // The kind alone, so a new content object of the same kind does not rebuild the observer.
  const kind = $derived(content.kind)
  $effect(() => {
    const node = box?.querySelector<HTMLElement>(`[data-face="${kind}"]`)
    if (node == null) {
      return
    }
    // Fractional, so a label is never clipped by a rounded pixel.
    const read = () => (width = node.getBoundingClientRect().width)
    read()
    const observer = new ResizeObserver(read)
    observer.observe(node)
    return () => observer.disconnect()
  })
</script>

<div
  class={['pointer-events-none flex items-start justify-center', placement]}
  {style}
  transition:fly={{ duration: motion(), y: -8 }}
>
  <!-- The width follows the content measured inside (plus the border), so it resizes, not snaps. -->
  <div
    class={[
      'grid overflow-hidden rounded-full border text-sm whitespace-nowrap shadow-lg',
      'transition-[width,background-color,border-color]',
      content.kind === 'action'
        ? 'preset-filled-primary-500 pointer-events-auto border-transparent'
        : 'bg-surface-100-900 border-surface-200-800',
    ]}
    style:width={width > 0 ? `calc(${width}px + 2px)` : undefined}
    style:transition-duration="{motion()}ms"
    bind:this={box}
  >
    {#each [content] as face (face.kind)}
      <!-- One face per kind, stacked in one grid cell: a new kind fades over the old in place, a new
           label updates in place. -->
      <div class="col-start-1 row-start-1 w-max" data-face={face.kind} transition:fade={{ duration: motion() }}>
        {#if face.kind === 'action'}
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 font-semibold transition-[filter] hover:brightness-110"
            onclick={face.onclick}
          >
            <Icon name={face.icon} size={14} />
            {face.label}
          </button>
        {:else}
          <p class="flex items-center gap-2 px-3 py-1.5">
            <LoadingIndicator class="w-fit shrink-0" size={4} />
            {face.label}
          </p>
        {/if}
      </div>
    {/each}
  </div>
</div>
