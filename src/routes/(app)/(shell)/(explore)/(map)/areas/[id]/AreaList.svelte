<script lang="ts">
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { m } from '$lib/paraglide/messages.js'
  import AreaListItem from './AreaListItem.svelte'

  interface Props {
    areas: AreaDetail[]
  }

  const { areas }: Props = $props()
</script>

{#if areas.length > 0}
  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">{m.areas_title()}</h2>

      <span class="text-surface-500 text-[11px] font-semibold tabular-nums">
        {m.areas_count({ count: areas.length })}
      </span>
    </div>

    <nav class="flex flex-col gap-2">
      {#each areas as area (area.id)}
        <AreaListItem {area} />
      {/each}
    </nav>
  </section>
{/if}
