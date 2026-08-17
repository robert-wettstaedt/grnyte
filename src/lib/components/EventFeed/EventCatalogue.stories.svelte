<!--
  The card wall: every case in `$lib/entities/event/cases`, one story per domain.

  It exists to answer one question by eye instead of by clicking: does the feed say what a
  reader expects for each action the app can perform. Each case runs through the real
  `groupCatalogueRows` and `cardView`, so what is on screen is what the app renders, and a
  case that folds into two cards shows two.

  Read a domain's story top to bottom, compare each card against the action above it, and
  note the ids that are wrong. Those ids are then the work list, and the same `CASES` array is
  the snapshot fixture in `cases.test.ts`, so a card that changes here changes there too.
-->
<script module lang="ts">
  import { groupCatalogueRows } from '$lib/entities/event/cardGroup'
  import { CASES, ME, world, type Case, type CaseDomain } from '$lib/entities/event/cases'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import EventCard from './EventCard.svelte'
  import { view } from './fixtures'

  const { Story } = defineMeta({
    parameters: { backgrounds: { value: 'root' }, layout: 'padded' },
    title: 'Components/EventFeed/Catalogue',
  })

  const byDomain = (domain: CaseDomain) => CASES.filter((entry) => entry.domain === domain)

  /** The cards one case renders. More than one means grouping split it, which is often the
   *  point of the case; none means the action writes no activity row at all. */
  const cards = (entry: Case) =>
    groupCatalogueRows(entry.rows).map((group) => view(group, entry.entities ?? world, ME, entry.topos))
</script>

{#snippet wall(cases: Case[])}
  <div class="mx-auto flex max-w-[560px] flex-col gap-10">
    {#each cases as entry (entry.id)}
      {@const views = cards(entry)}

      <section id={entry.id} class="flex flex-col gap-2">
        <header class="flex flex-col gap-1">
          <div class="flex items-baseline gap-2">
            <span class="text-primary-400 font-mono text-sm font-semibold">{entry.id}</span>
            {#if views.length !== 1}
              <span class="preset-tonal-warning rounded px-1.5 py-0.5 text-xs">
                {views.length === 0 ? 'no card' : `${views.length} cards`}
              </span>
            {/if}
          </div>

          <p class="text-surface-600-400 font-mono text-xs">{entry.action}</p>
          <p class="text-surface-500 text-xs italic">{entry.expected}</p>
        </header>

        {#each views as cardView (cardView.id)}
          <EventCard initiallyExpanded view={cardView} />
        {:else}
          <p class="border-surface-700 text-surface-500 rounded border border-dashed px-3 py-4 text-xs">
            This action writes no activity row, so the feed stays silent.
          </p>
        {/each}
      </section>
    {/each}
  </div>
{/snippet}

{#snippet template(args: { cases: Case[] })}
  {@render wall(args.cases)}
{/snippet}

<Story name="Area" args={{ cases: byDomain('area') }} {template} />

<Story name="Block" args={{ cases: byDomain('block') }} {template} />

<Story name="Route" args={{ cases: byDomain('route') }} {template} />

<Story name="Ascent" args={{ cases: byDomain('ascent') }} {template} />

<Story name="File" args={{ cases: byDomain('file') }} {template} />

<Story name="Topo" args={{ cases: byDomain('topo') }} {template} />

<Story name="Region" args={{ cases: byDomain('region') }} {template} />

<Story name="User" args={{ cases: byDomain('user') }} {template} />

<!-- The cases that write nothing, on their own: the ones most likely to be a real bug, since
     a reader performed an action and the feed said nothing. -->
<Story name="Silent actions" args={{ cases: CASES.filter((entry) => entry.rows.length === 0) }} {template} />
