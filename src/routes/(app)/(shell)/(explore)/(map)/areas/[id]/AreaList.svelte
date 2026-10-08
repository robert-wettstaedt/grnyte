<script lang="ts">
  import QueryError from '$lib/components/QueryState/QueryError.svelte'
  import SkeletonRows from '$lib/components/Skeleton/SkeletonRows.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { m } from '$lib/paraglide/messages.js'
  import { isOnline } from '$lib/state/online.svelte'
  import AreaListItem from './AreaListItem.svelte'

  interface Props {
    areas: AreaDetail[]
    /** The query failed, so nothing more is coming. */
    failed?: boolean
    /** The whole list is here, so its count is true. */
    settled: boolean
  }

  const { areas, failed = false, settled }: Props = $props()
</script>

<!-- Always a section: the list, a held row while it loads, or the empty line. Offline and never
     confirmed it stays out, as before, rather than pulse with nothing coming. -->
{#if areas.length > 0 || settled || failed || isOnline()}
  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">{m.areas_title()}</h2>

      {#if settled}
        <span class="text-surface-500 text-[11px] font-semibold tabular-nums">
          {m.areas_count({ count: areas.length })}
        </span>
      {/if}
    </div>

    {#if areas.length > 0}
      <nav class="flex flex-col gap-2">
        {#each areas as area (area.id)}
          <AreaListItem {area} />
        {/each}
      </nav>
    {:else if settled}
      <!-- The held row's height, so "none" does not pull the page up. -->
      <p class="text-surface-600-400 flex h-16 items-center text-sm">{m.areas_noAreas()}</p>
    {:else if failed}
      <QueryError compact />
    {:else}
      <SkeletonRows count={1} lead="thumb" />
    {/if}
  </section>
{/if}
