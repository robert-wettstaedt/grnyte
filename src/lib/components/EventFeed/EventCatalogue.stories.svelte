<!--
  The card wall: every action the app can perform, one story per domain.

  It exists to answer one question by eye instead of by clicking: does the feed say what a reader
  expects for each thing the app does. Most of these states cannot be reached by driving the app at
  all (a revoked invitation, a deleted area's counts, a five-photo submit, somebody else's session
  running past midnight), which is why this is the review surface rather than the running app.

  Each case runs through the real `groupEvents` and `eventCard`, so what is on screen is what the
  feed renders, reaction bar included, and a case that folds into two cards shows two.

  Read a domain top to bottom, compare each card against the action above it and the claim under
  it, and note the ids that are wrong. Those ids are the work list. `cases/coverage.test.ts` reads
  every write site in the app and fails when one has no case here, so the wall cannot fall behind
  the code; `cases/render.test.ts` snapshots the sentences, so a change in what a card says is a
  reviewable diff rather than something to spot by eye twice.
-->
<script module lang="ts">
  import { eventCard } from '$lib/entities/event/card'
  import { EVENT_CASES } from '$lib/entities/event/cases/index'
  import type { CaseDomain, EventCase } from '$lib/entities/event/cases/types'
  import { ME } from '$lib/entities/event/cases/world'
  import { groupEvents } from '$lib/entities/event/grouping'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import EventCard from './EventCard.svelte'

  const { Story } = defineMeta({
    parameters: { backgrounds: { value: 'root' }, layout: 'padded' },
    title: 'Components/EventFeed/Catalogue',
  })

  const byDomain = (domain: CaseDomain) => EVENT_CASES.filter((entry) => entry.domain === domain)

  /** The cards one case renders. More than one means grouping split it, which is often the point
   *  of the case; none means the action writes nothing at all. */
  const cards = (entry: EventCase) =>
    groupEvents(entry.events).map((group) => eventCard(group, entry.reader ?? ME, entry.topos))
</script>

{#snippet wall(cases: EventCase[])}
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
            {#if entry.reader != null && entry.reader !== ME}
              <span class="preset-tonal-surface rounded px-1.5 py-0.5 text-xs">read by somebody else</span>
            {/if}
          </div>

          <p class="text-surface-600-400 font-mono text-xs">{entry.action}</p>
          <p class="text-surface-500 text-xs italic">{entry.expected}</p>
          {#if entry.writer != null}
            <p class="text-surface-600-400 font-mono text-[0.65rem]">writes at {entry.writer}</p>
          {/if}
        </header>

        {#each views as view (view.id)}
          <EventCard initiallyExpanded {view} />
        {:else}
          <p class="border-surface-700 text-surface-500 rounded border border-dashed px-3 py-4 text-xs">
            This action writes no event, so the feed stays silent.
          </p>
        {/each}
      </section>
    {/each}
  </div>
{/snippet}

{#snippet template(args: { cases: EventCase[] })}
  {@render wall(args.cases)}
{/snippet}

<Story name="Area" args={{ cases: byDomain('area') }} {template} />

<Story name="Block" args={{ cases: byDomain('block') }} {template} />

<Story name="Route" args={{ cases: byDomain('route') }} {template} />

<Story name="Ascent" args={{ cases: byDomain('ascent') }} {template} />

<Story name="File" args={{ cases: byDomain('file') }} {template} />

<Story name="Topo" args={{ cases: byDomain('topo') }} {template} />

<Story name="Region" args={{ cases: byDomain('region') }} {template} />

<!-- The cards that only exist when several events land together: sessions, bursts, the upload
     merged into the create it belongs to. Nothing here is reachable by performing one action. -->
<Story name="Grouping" args={{ cases: byDomain('grouping') }} {template} />

<!-- Reactions and comments, which are part of every card now: chips, your own event, a thread. -->
<Story name="Reactions and comments" args={{ cases: byDomain('social') }} {template} />

<!-- The actions that write nothing, on their own: the ones most likely to be a real bug, since a
     reader performed an action and the feed said nothing. -->
<Story name="Silent actions" args={{ cases: EVENT_CASES.filter((entry) => entry.events.length === 0) }} {template} />
