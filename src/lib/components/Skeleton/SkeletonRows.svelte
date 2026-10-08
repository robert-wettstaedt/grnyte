<!--
  Stand-in rows for a list that is loading. Every skeleton here holds invisible for its first 250 ms
  (`skeleton-hold`), so a fast load shows none, while already taking the space it will hand over.
-->
<script lang="ts">
  import type { ClassValue } from 'svelte/elements'

  interface Props {
    class?: ClassValue
    count?: number
    /** What leads each row: a person's avatar, an entity's thumbnail, or nothing. */
    lead?: 'avatar' | 'none' | 'thumb'
    /** A name alone, or a name over a detail line. */
    lines?: 1 | 2
  }

  const { class: className, count = 3, lead = 'none', lines = 2 }: Props = $props()
</script>

<div class={['skeleton-hold flex flex-col gap-2', className]} aria-busy="true">
  {#each { length: count }, index (index)}
    <div class="flex items-center gap-3 py-2">
      {#if lead === 'avatar'}
        <div class="bg-surface-200-800 size-10 flex-none animate-pulse rounded-full"></div>
      {:else if lead === 'thumb'}
        <div class="bg-surface-200-800 size-12 flex-none animate-pulse rounded-xl"></div>
      {/if}
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="bg-surface-200-800 h-3.5 w-2/3 animate-pulse rounded"></div>
        {#if lines === 2}
          <div class="bg-surface-200-800 h-3 w-1/3 animate-pulse rounded"></div>
        {/if}
      </div>
    </div>
  {/each}
</div>
