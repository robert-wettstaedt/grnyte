<script lang="ts">
  import { motion } from '$lib/state/motion.svelte'
  import type { Snippet } from 'svelte'
  import { scale } from 'svelte/transition'
  import type { Selection } from './selection.svelte'

  // One list row, which in select mode becomes a checkbox with the row beside it, inert so a tap
  // ticks it instead of following its link.
  interface Props {
    children: Snippet
    id: number
    /** The row's name, for the checkbox. */
    label: string
    selection?: Selection
  }

  const { children, id, label, selection }: Props = $props()
</script>

{#if selection?.active}
  <label class="flex cursor-pointer items-center gap-3">
    <input
      aria-label={label}
      checked={selection.has(id)}
      class="checkbox shrink-0"
      onchange={() => selection.toggle(id)}
      type="checkbox"
      in:scale={{ duration: motion() }}
    />
    <div class="pointer-events-none min-w-0 flex-1" inert>
      {@render children()}
    </div>
  </label>
{:else}
  {@render children()}
{/if}
