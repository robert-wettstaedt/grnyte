<script lang="ts">
  import type { Snippet } from 'svelte'

  // Full-bleed sticky bar (bleeds past the container's px-4) so the section label,
  // and any control, stay visible while scrolling its list.
  interface Props {
    /** Optional control shown at the trailing edge (filter, sort, action). */
    action?: Snippet
    title: string
  }

  const { action, title }: Props = $props()
</script>

<div
  class="bg-surface-50-950/90 sticky top-0 z-20 -mx-4 flex items-center justify-between gap-2 px-4 py-2 backdrop-blur"
>
  <h2 class="text-surface-600-400 text-sm font-bold tracking-wide uppercase">{title}</h2>
  {#if action}{@render action()}{/if}
</div>
