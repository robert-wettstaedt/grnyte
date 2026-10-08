<!-- A horizontal strip of tiles (photos, media) before the tiles. -->
<script lang="ts">
  import type { ClassValue } from 'svelte/elements'

  interface Props {
    /** The strip's height, which is the space it keeps (`h-60`). */
    class?: ClassValue
    count?: number
    /** Each tile's shape against that height. */
    tileClass?: ClassValue
  }

  const { class: className = 'h-40', count = 3, tileClass = 'aspect-[3/4]' }: Props = $props()
</script>

<div class={['skeleton-hold flex gap-2 overflow-hidden', className]} aria-busy="true">
  {#each { length: count }, index (index)}
    <div class={['bg-surface-200-800 h-full flex-none animate-pulse rounded-xl', tileClass]}></div>
  {/each}
</div>
