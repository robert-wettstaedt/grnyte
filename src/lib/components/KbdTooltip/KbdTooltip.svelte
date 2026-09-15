<!-- Hover tooltip pairing a label with a keybind hint (kbd badge). On touch (no hover) the hint is
     dead chrome, so the tooltip is skipped and the trigger gets a native `title` instead. Wraps any
     trigger element (button/link) via the trigger snippet. -->
<script lang="ts">
  import { Tooltip } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'

  interface Props {
    /** Keybind hint for the kbd badge, e.g. 'J' or '⌘S'. Omit for a plain label tooltip. */
    key?: string
    label: string
    /** The trigger element. Always spread `attributes` onto it and set an explicit aria-label. Do NOT
        add your own `title`: it would preempt the Skeleton tooltip on hover. This owns the title, so
        `attributes` carries the tooltip wiring on hover, or a `title` fallback on touch. */
    trigger: Snippet<[Record<string, unknown>]>
  }

  const { key, label, trigger }: Props = $props()

  // Only hover-capable devices (which, by implication, have a keyboard) get the tooltip; on touch the
  // keybind hint is meaningless, so the trigger renders bare.
  const canHover = new MediaQuery('(hover: hover)')
</script>

{#if canHover.current}
  <Tooltip openDelay={300}>
    <Tooltip.Trigger>
      {#snippet element(attributes)}
        {@render trigger(attributes as unknown as Record<string, unknown>)}
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Positioner>
      <Tooltip.Content
        class="card preset-filled-surface-950-50 z-50 flex items-center gap-1.5 px-2 py-1 text-xs shadow-lg"
      >
        {label}
        {#if key}
          <kbd class="kbd text-surface-950-50!">{key}</kbd>
        {/if}
      </Tooltip.Content>
    </Tooltip.Positioner>
  </Tooltip>
{:else}
  {@render trigger({ title: label })}
{/if}
