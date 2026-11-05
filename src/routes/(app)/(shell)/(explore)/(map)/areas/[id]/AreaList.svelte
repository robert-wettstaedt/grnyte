<script lang="ts">
  import Selectable from '$lib/components/GuidebookPicker/Selectable.svelte'
  import type { Selection } from '$lib/components/GuidebookPicker/selection.svelte'
  import QueryError from '$lib/components/QueryState/QueryError.svelte'
  import SkeletonRows from '$lib/components/Skeleton/SkeletonRows.svelte'
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { m } from '$lib/paraglide/messages.js'
  import { isOnline } from '$lib/state/online.svelte'
  import type { Snippet } from 'svelte'
  import AreaListItem from './AreaListItem.svelte'

  interface Props {
    /** Trailing in the heading row, after the count. */
    action?: Snippet
    areas: AreaDetail[]
    /** The rows on hand may be counted (see `summaryOf`). */
    counted: boolean
    /** The query failed, so nothing more is coming. */
    failed?: boolean
    /** Select mode, where a row ticks instead of opening. */
    selection?: Selection
    /** The whole list is here, so a "none" is true. */
    settled: boolean
  }

  const { action, areas, counted, failed = false, selection, settled }: Props = $props()
</script>

<!-- Always a section: the list, a held row while it loads, or the empty line. Offline and never
     confirmed it stays out, as before, rather than pulse with nothing coming. -->
{#if areas.length > 0 || settled || failed || isOnline()}
  <section class="space-y-2">
    <div class="flex items-center justify-between">
      <h2 class="text-surface-600-400 text-sm font-bold tracking-wider uppercase">{m.areas_title()}</h2>

      <span class="flex items-center gap-3">
        {#if counted}
          <span class="text-surface-500 text-[11px] font-semibold tabular-nums">
            {m.areas_count({ count: areas.length })}
          </span>
        {/if}
        {@render action?.()}
      </span>
    </div>

    {#if areas.length > 0}
      <nav class="flex flex-col gap-2">
        {#each areas as area (area.id)}
          <Selectable id={area.id} label={area.name} {selection}>
            <AreaListItem {area} />
          </Selectable>
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
