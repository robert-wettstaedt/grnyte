<!-- A line of text before the text: holds its line inline, so the layout around it reads as it will
     once the words land. Size it with `class` (`h-3 w-40` for an `text-xs` line). -->
<script lang="ts">
  import type { ClassValue } from 'svelte/elements'

  const { class: className = 'h-3 w-40' }: { class?: ClassValue } = $props()
</script>

<span class="skeleton-hold inline-flex h-lh max-w-full items-center align-top" aria-busy="true">
  <span class={['bg-surface-200-800 inline-block max-w-full animate-pulse rounded', className]}></span>
</span>
