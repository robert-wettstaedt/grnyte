<!--
  One feed card: whatever `groupActivities` folded into a group, whether that is a single
  edit or a session of four ascents.

  What the card *says* is decided by `activityCard()` and arrives as a view; this file is
  the markup for it. The two things that cannot live in a pure function stay here: the
  relative clock, and the grade labels that need `globalState`.
-->
<script lang="ts">
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import HydratedRow from '$lib/components/EntityRow/HydratedRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import MediaThumbnail from '$lib/components/Media/MediaThumbnail.svelte'
  import Message from '$lib/components/Message/Message.svelte'
  import Reactions from '$lib/components/Reactions/Reactions.svelte'
  import { activityEntityKey } from '$lib/entities/activity/entity'
  import AscentTypeBadge from '$lib/entities/ascent/AscentType.svelte'
  import ConditionsPill from '$lib/entities/ascent/ConditionsPill.svelte'
  import type { EventCardView } from '$lib/entities/event/card'
  import { getGradeBand } from '$lib/entities/grade/color'
  import { gradeLabel } from '$lib/entities/grade/label'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRating from '$lib/entities/route/RouteRating.svelte'
  import { resolveMessage } from '$lib/i18n/message'
  import { formatDate, formatUploadedAt } from '$lib/i18n/relativeTime'
  import StaticMap from '$lib/map/StaticMap.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import { now } from '$lib/state/now.svelte'
  import { untrack } from 'svelte'
  import { slide } from 'svelte/transition'
  import ActivityChanges from './ActivityChanges.svelte'

  interface Props {
    /** Whether the changes start open. The feed leaves them closed; the catalogue story opens
     *  every card at once, since the change lines are half of what it exists to show. */
    initiallyExpanded?: boolean
    /** Told when the changes open or close, so the page can sync what only they render. */
    onToggle?: (expanded: boolean) => void
    view: EventCardView
  }

  const { initiallyExpanded = false, onToggle, view }: Props = $props()

  const global = getGlobalState()

  // The climb date joins the sub line rather than the headline or the clock: the clock says
  // when it was logged, which is what sorts the feed, and both facts are true at once. Absolute
  // rather than relative, because it only ever appears when it disagrees with the clock beside
  // it, and "3 days ago · 4 days ago" is a puzzle. UTC: the stored value is a calendar date.
  const climbedOn = $derived(
    view.climbedAt == null ? undefined : m.activity_summaryClimbedOn({ date: formatDate(view.climbedAt, getLocale()) }),
  )

  const summary = $derived(
    [
      ...(view.summary ?? []).map((part) => (part.key == null ? part.text : resolveMessage(part.key, part.params))),
      ...(climbedOn == null ? [] : [climbedOn]),
    ].join(' · '),
  )

  // Absent on a story's card, which has no events behind it to react to.
  const bars = $derived(view.bars ?? [])

  // The prop seeds the toggle and then stops mattering, which is what `untrack` states.
  let expanded = $state(untrack(() => initiallyExpanded))
</script>

{#snippet strong(value: string | undefined)}
  {#if value == null || value.length === 0}
    <span class="bg-surface-200-800 inline-block h-3 w-20 animate-pulse rounded align-middle"></span>
  {:else}
    <strong class="font-semibold">{value}</strong>
  {/if}
{/snippet}

<!-- Only the `person=*` variants carry {actor}; the "You …" ones spell the pronoun out. -->
{#snippet actorName()}{@render strong(view.actorName)}{/snippet}

{#snippet climberName()}{@render strong(view.climberName)}{/snippet}

<!-- Nothing is coming for this slot (see `entityUnnamed`), so it says so instead of pulsing.
     Same placeholder the route rows use for a route saved without a name. -->
{#snippet entityName()}
  {#if view.entityUnnamed}
    <span class="text-surface-600-400 italic">{m.common_unnamed()}</span>
  {:else}
    {@render strong(view.entityName)}
  {/if}
{/snippet}

<article class="bg-surface-100-900 border-surface-200-800 space-y-2.5 rounded-2xl border p-3">
  <!-- A summary makes the middle column as tall as the avatar; without one it is a single
       line, which top-aligned would sit above the avatar's and the clock's centre. -->
  <header class="flex gap-2.5 {summary ? 'items-start' : 'items-center'}">
    <!-- `solid` already means "a registered user rather than a typed-in name" (see Avatar) and
         every actor here is registered, so it cannot also mark your own row. Your rows say
         "Me" in place of the initials, the same way the first-ascensionist picker does. -->
    {#if view.mine}
      <Avatar size={34} solid>{m.common_me()}</Avatar>
    {:else}
      <Avatar name={view.actorName} size={34} solid loading={view.actorName.length === 0} />
    {/if}

    <div class="min-w-0 flex-1">
      <p class="text-surface-950-50 text-sm/snug">
        <Message
          key={view.headline.key}
          params={view.headline.params}
          parts={{ actor: actorName, climber: climberName, name: entityName }}
        />
      </p>

      {#if summary}
        <p class="text-surface-600-400 mt-0.5 text-xs">{summary}</p>
      {/if}
    </div>

    <div class="flex flex-none items-center gap-1.5">
      {#if view.status}
        <AscentTypeBadge status={view.status} />
      {/if}
      <time class="text-surface-600-400 text-xs whitespace-nowrap" datetime={new Date(view.createdAt).toISOString()}>
        {formatUploadedAt(view.createdAt, now(), getLocale())}
      </time>
    </div>
  </header>

  {#if view.files.length > 0}
    <!-- Thumbnails only: the one viewer for the whole list is mounted by ActivityFeed,
         since a lightbox per card would open several at once on the same `?media` param. -->
    <div class="flex snap-x snap-mandatory gap-2 overflow-x-auto">
      {#each view.files as file (file.id)}
        <MediaThumbnail {file} class="h-40 snap-start" />
      {/each}
    </div>
  {/if}

  <!-- Where a new block landed. A create row carries no coordinates, so this is the block's pin
       as the reader would find it today; a later move draws its own before-and-after change
       line, which is the card that says the pin moved.
       ponytail: today's pin, not the pin as placed. Upgrade = write the coordinates into the row. -->
  {#if view.pin != null}
    <StaticMap
      height={120}
      points={[{ estimated: view.pin.estimated, lat: view.pin.lat, long: view.pin.long }]}
      width={200}
    />
  {/if}

  {#if view.rows.length > 0}
    <div class="space-y-1">
      {#each view.rows as row (activityEntityKey(row.ref))}
        <HydratedRow {row} />

        <!-- Under the row it belongs to, because that is what the bar is about: a session card is
             five ascents and five events, so a reader congratulates the one send they mean rather
             than the afternoon. Indented to the row's own padding and pushed to the trailing edge,
             where the add button sits under the thumb. -->
        {#if row.bar != null}
          <div class="flex px-1">
            <Reactions eventId={row.bar.eventId} reactions={row.bar.chips} readonly={row.bar.readonly} />
          </div>
        {/if}
      {/each}

      {#if view.overflowCount > 0}
        <p class="text-surface-600-400 px-1 text-xs">{m.activity_moreEntities({ count: view.overflowCount })}</p>
      {/if}
    </div>
  {/if}

  <!-- What the climber said about the route, which is not what the route says about itself: the
       row above already carries the community grade and rating, so this strip is labelled. The
       edit cards say the same things as change lines; a create has no change list to hold them. -->
  {#if view.ascent != null}
    <div class="flex flex-wrap items-center gap-2 px-1">
      <span class="text-surface-600-400 text-xs font-semibold">{m.activity_thisAscent()}</span>

      <!-- Each half only when it was actually logged. The strip shows what the climber said,
           and an ascent logged with conditions alone said nothing about grade or stars: an
           empty grade chip and a row of three empty stars would put words in their mouth. -->
      {#if view.ascent.gradeFk != null}
        <RouteGrade
          band={getGradeBand(view.ascent.gradeFk)}
          grade={gradeLabel(global.grades, global.gradingScale, view.ascent.gradeFk)}
        />
      {/if}
      {#if view.ascent.rating != null && view.ascent.rating > 0}
        <RouteRating rating={view.ascent.rating} />
      {/if}

      <ConditionsPill humidity={view.ascent.humidity} temperature={view.ascent.temperature} />
    </div>
  {/if}

  {#if view.note}
    <blockquote class="border-surface-300-700 text-surface-600-400 border-s-2 ps-2.5 text-sm">
      <Markdown markdown={view.note} />
    </blockquote>
  {/if}

  <!-- One action bar rather than two stacked rows of muted text. The changes toggle leads, because
       what it opens lands directly beneath it; the reactions hold the trailing edge, where the add
       button is under the thumb and where it stays put whether or not a card has changes at all.
       The rule separates the bar from the card's content, and gives the add button an edge to sit
       on rather than floating under a dimmed line of text.

       `view.bars` is what no row spoke for: a one-event card (where this reads as card level, which
       is the common case), and anything whose row was dropped or collapsed but which already
       carries reactions, so a chip can never end up somewhere nobody can see it. -->
  {#if view.changes.length > 0 || bars.length > 0}
    <footer class="border-surface-200-800 flex items-start gap-x-3 border-t pt-2.5">
      {#if view.changes.length > 0}
        <button
          type="button"
          class="text-surface-600-400 hover:text-surface-950-50 flex shrink-0 items-center gap-1 py-0.5 text-xs font-semibold"
          aria-expanded={expanded}
          onclick={() => onToggle?.((expanded = !expanded))}
        >
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
          {expanded ? m.activity_hideChanges() : m.activity_showChanges()}
        </button>
      {/if}

      <div class="flex min-w-0 flex-1 flex-col items-end gap-1">
        {#each bars as bar (bar.eventId)}
          <Reactions eventId={bar.eventId} reactions={bar.chips} readonly={bar.readonly} />
        {/each}
      </div>
    </footer>
  {/if}

  <!-- Below the bar and under the toggle that opened it, which is why the toggle holds the leading
       edge: changes appearing under a row of reactions read as belonging to the reactions. -->
  {#if view.changes.length > 0 && expanded}
    <div transition:slide={{ duration: 150 }}>
      <ActivityChanges changes={view.changes} />
    </div>
  {/if}
</article>
