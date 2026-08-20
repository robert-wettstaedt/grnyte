<!--
  One feed card: whatever `groupEvents` folded into a group, whether that is a single
  edit or a session of four ascents.

  What the card *says* is decided by `cardView()` and arrives as a view; this file is
  the markup for it. The two things that cannot live in a pure function stay here: the
  relative clock, and the grade labels that need `globalState`.
-->
<script lang="ts">
  import { resolve } from '$app/paths'
  import Avatar from '$lib/components/Avatar/Avatar.svelte'
  import HydratedRow from '$lib/components/EntityRow/HydratedRow.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import MediaThumbnail from '$lib/components/Media/MediaThumbnail.svelte'
  import Message from '$lib/components/Message/Message.svelte'
  import Reactions from '$lib/components/Reactions/Reactions.svelte'
  import AscentTypeBadge from '$lib/entities/ascent/AscentType.svelte'
  import ConditionsPill from '$lib/entities/ascent/ConditionsPill.svelte'
  import type { EventCardView } from '$lib/entities/event/card'
  import type { CardAscent } from '$lib/entities/event/cardView'
  import { eventEntityKey } from '$lib/entities/event/entity'
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
  import { tick, untrack } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import { slide } from 'svelte/transition'
  import EventChanges from './EventChanges.svelte'

  interface Props {
    /**
     * The thread is already on the page, so the bar keeps its emoji and drops the comment button.
     * Set by the event's own page, where the button would open a sheet over the conversation it
     * is standing in front of.
     */
    commentsInline?: boolean
    /** Whether the changes start open. The feed leaves them closed; the catalogue story opens
     *  every card at once, since the change lines are half of what it exists to show. */
    initiallyExpanded?: boolean
    /** Told when the changes open or close, so the page can sync what only they render. */
    onToggle?: (expanded: boolean) => void
    view: EventCardView
  }

  const { commentsInline = false, initiallyExpanded = false, onToggle, view }: Props = $props()

  const global = getGlobalState()

  // The climb date joins the sub line rather than the headline or the clock: the clock says
  // when it was logged, which is what sorts the feed, and both facts are true at once. Absolute
  // rather than relative, because it only ever appears when it disagrees with the clock beside
  // it, and "3 days ago · 4 days ago" is a puzzle. UTC: the stored value is a calendar date.
  const climbedOn = $derived(
    view.climbedAt == null ? undefined : m.event_summaryClimbedOn({ date: formatDate(view.climbedAt, getLocale()) }),
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

  // Whether this card was drawn quietly, and so owes the reader a way back to the full one. Only
  // the tier decides it: a card the feed never compacted has nothing to open.
  const collapsible = $derived(view.tier === 'compact')
  let opened = $state(false)
  const compact = $derived(collapsible && !opened)

  // Opening swaps one element for another, so the height change is the animation: the row slides
  // shut while the card slides open, which is what says the card grew out of the line that was
  // pressed rather than arriving from somewhere else. Shared with the changes disclosure, since
  // both are the same gesture. Somebody who asked for less motion gets the cut.
  const still = new MediaQuery('(prefers-reduced-motion: reduce)')
  const duration = $derived(still.current ? 0 : 150)

  // One disclosure whose trigger MOVES: opening tears down the row that was pressed and builds the
  // card, closing does the reverse. Without handing focus over, the element the keyboard was on
  // stops existing and focus falls to `<body>`, which drops a keyboard reader out of the feed with
  // nothing announced. `tick` because the replacement does not exist until the DOM has caught up.
  let row = $state<HTMLButtonElement>()
  let collapse = $state<HTMLButtonElement>()

  async function toggle(next: boolean) {
    opened = next
    await tick()
    ;(next ? collapse : row)?.focus()
  }
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

<!-- What the climber said about the route, which is not what the route says about itself: the
     row above already carries the community grade and rating, so the two numbers that are an
     opinion are labelled as one. The conditions sit outside that label, because a temperature
     is a reading rather than a take on the climb.
     Rendered under the row it belongs to. An edit card says the same things as change lines;
     a create has no change list to hold them. -->
{#snippet ascentStrip(ascent: CardAscent)}
  {@const rating = ascent.rating != null && ascent.rating > 0 ? ascent.rating : undefined}
  <!-- The conditions are their own group, at a wider gap than the one inside the label's: sharing
       a single gap with the grade and the stars read as one labelled run, so a reader could take
       the temperature for part of the opinion. -->
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
    <!-- Each half only when it was actually logged. An ascent logged with conditions alone said
         nothing about grade or stars: an empty grade chip and a row of three empty stars would
         put words in their mouth, and the label would claim an opinion nobody gave. -->
    {#if ascent.gradeFk != null || rating != null}
      <span class="flex items-center gap-2">
        <span class="text-surface-600-400 text-xs font-semibold">{m.event_ascentOpinion()}</span>

        {#if ascent.gradeFk != null}
          <RouteGrade
            band={getGradeBand(ascent.gradeFk)}
            grade={gradeLabel(global.grades, global.gradingScale, ascent.gradeFk)}
          />
        {/if}
        {#if rating != null}
          <RouteRating {rating} />
        {/if}
      </span>
    {/if}

    <ConditionsPill humidity={ascent.humidity} temperature={ascent.temperature} />
  </div>
{/snippet}

{#snippet noteQuote(note: string)}
  <blockquote class="border-surface-300-700 text-surface-600-400 border-s-2 ps-2.5 text-sm">
    <Markdown markdown={note} />
  </blockquote>
{/snippet}

<!-- Nothing is coming for this slot (see `entityUnnamed`), so it says so instead of pulsing.
     Same placeholder the route rows use for a route saved without a name. -->
{#snippet entityName()}
  {#if view.entityUnnamed}
    <span class="text-surface-600-400 italic">{m.common_unnamed()}</span>
  {:else}
    {@render strong(view.entityName)}
  {/if}
{/snippet}

<!-- A field edit, drawn as one line instead of a card. No avatar, no chrome, no media: the card
     shell is what a rename costs a reader, not the words in it, so the shell is what goes.

     The sentence is the same one the full card speaks, wrapped rather than truncated. A single
     line with an ellipsis is where a long username plus a verb leaves nothing legible at all on a
     phone, which is the whole point of drawing the row.

     It is a button because the compact tier carries no reaction bar (there is no room for one, and
     a row this size owes exactly one tap target). Opening the row is how a reader reaches it,
     which keeps reactions un-gated by kind. -->
{#if compact}
  <!-- The slide rides a wrapper rather than the button: `min-h-11` is the row's tap target, and a
       min-height refuses the heights a slide animates through, so the row would sit at 44px for
       the whole transition and then blink out. -->
  <div transition:slide={{ duration }}>
    <button
      bind:this={row}
      type="button"
      class="hover:bg-surface-100-900 text-surface-600-400 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start"
      aria-expanded={false}
      onclick={() => toggle(true)}
    >
      <Icon name="edit" size={14} class="shrink-0 opacity-70" />

      <span class="line-clamp-2 min-w-0 flex-1 text-xs/snug">
        <Message
          key={view.headline.key}
          params={view.headline.params}
          parts={{ actor: actorName, climber: climberName, name: entityName }}
        />
        {#if summary}
          <span class="text-surface-500">· {summary}</span>
        {/if}
      </span>

      <time class="shrink-0 text-xs whitespace-nowrap" datetime={new Date(view.createdAt).toISOString()}>
        {formatUploadedAt(view.createdAt, now(), getLocale())}
      </time>
    </button>
  </div>
{:else}
  <article
    class="bg-surface-100-900 space-y-2.5 rounded-2xl border p-3 {view.tier === 'hero'
      ? 'border-primary-500/45'
      : 'border-surface-200-800'}"
    transition:slide={{ duration }}
  >
    <!-- One banner, never a list, and the claim is spelled out rather than left to a medal nobody
         has learned yet. A card that becomes a trophy wall makes the rare claim illegible, which
         is why `accoladeOf` picks exactly one and ranks effort above grade.
         Full-bleed to the card's own radius: it is the first thing read, not a chip inside the
         header competing with the clock. -->
    {#if view.accolade != null}
      <!-- A flat tint rather than a gradient, and the paired `700-300` ink rather than a fixed
           light one. Both are the house idiom (see ReactionChip, NavRail, MenuRow): a gradient
           would have been the only one in the app, and a fixed `primary-100` foreground reads as
           near-invisible once the light theme puts a light ground behind it. -->
      <p
        class="bg-primary-500/15 text-primary-700-300 -mx-3 -mt-3 flex items-center gap-1.5 rounded-t-2xl px-3 py-1.5 text-xs font-semibold"
      >
        <Icon name="award" size={13} />
        {#if view.accolade.accolade.kind === 'project'}
          {m.event_accoladeProject({
            days: view.accolade.accolade.days,
            name: view.accolade.name,
            sessions: view.accolade.accolade.sessions,
          })}
        {:else if view.accolade.accolade.kind === 'ceiling'}
          {m.event_accoladeCeiling({ name: view.accolade.name })}
        {:else}
          {m.event_accoladeCommunity()}
        {/if}
      </p>
    {/if}

    <!-- A summary makes the middle column as tall as the avatar; without one it is a single
       line, which top-aligned would sit above the avatar's and the clock's centre. -->
    <header class="flex gap-2.5 {summary ? 'items-start' : 'items-center'}">
      <!-- `solid` already means "a registered user rather than a typed-in name" (see Avatar) and
         every actor here is registered, so it cannot also mark your own row. Your rows say
         "Me" in place of the initials, the same way the first-ascensionist picker does. -->
      <!-- The face is a link to the person, on your own rows too: it is the one part of a card that
         is about WHO rather than what, and a reader who wants somebody's logbook aims at their
         face. The headline stays plain text, so the sentence keeps reading as a sentence. -->
      <a class="flex-none" href={resolve('/(app)/users/[id]', { id: String(view.actorFk) })}>
        {#if view.mine}
          <Avatar size={34} solid>{m.common_me()}</Avatar>
        {:else}
          <Avatar name={view.actorName} size={34} solid loading={view.actorName.length === 0} />
        {/if}
      </a>

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

        <!-- The way back to the quiet row. Without it the disclosure is one-way: the control the
           reader pressed has been replaced by the thing it opened, so there is nothing left to
           press and nothing for focus to return to.

           The tap target is grown by a pseudo-element rather than by padding, because this sits in
           a header row whose height is set by the avatar: real padding would push the headline and
           the clock apart to make room. A chevron this size is 22px of button, which is under the
           24px floor and half of the 44px the compact row itself owes; the two are the same
           disclosure seen from either side, so they cannot want different sized targets. -->
        {#if collapsible}
          <button
            bind:this={collapse}
            type="button"
            class="text-surface-600-400 hover:text-surface-950-50 relative -me-1 flex items-center p-1 before:absolute before:-inset-3"
            aria-expanded={true}
            aria-label={m.common_showLess()}
            onclick={() => toggle(false)}
          >
            <Icon name="chevron-down" size={14} />
          </button>
        {/if}
      </div>
    </header>

    {#if view.files.length > 0}
      <!-- Thumbnails only: the one viewer for the whole list is mounted by EventFeed,
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
        {#each view.rows as row (eventEntityKey(row.ref))}
          <HydratedRow {row} />

          <!-- The climber's own numbers and words, under the ascent they are about. A session
             holds five of each, and one strip for the card could only ever show the first. -->
          {#if row.ascent != null}
            {@render ascentStrip(row.ascent)}
          {/if}

          {#if row.note != null}
            {@render noteQuote(row.note)}
          {/if}

          <!-- Under the row it belongs to, because that is what the bar is about: a session card is
             five ascents and five events, so a reader congratulates the one send they mean rather
             than the afternoon. Indented to the row's own padding and pushed to the trailing edge,
             where the add button sits under the thumb. -->
          {#if row.bar != null}
            <div class="flex px-1">
              <Reactions bar={row.bar} showComments={!commentsInline} />
            </div>
          {/if}
        {/each}

        {#if view.overflowCount > 0}
          <p class="text-surface-600-400 px-1 text-xs">{m.event_moreEntities({ count: view.overflowCount })}</p>
        {/if}
      </div>
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
          <!-- Same pseudo-element target as the collapse chevron above, and for the same reason: a
             line of 12px text is 20px of button, and real padding would push the reactions on the
             other end of this row out of line. Vertical only, since the label already gives it
             width. -->
          <button
            type="button"
            class="text-surface-600-400 hover:text-surface-950-50 relative flex shrink-0 items-center gap-1 py-0.5 text-xs font-semibold before:absolute before:inset-x-0 before:-inset-y-3"
            aria-expanded={expanded}
            onclick={() => onToggle?.((expanded = !expanded))}
          >
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
            {expanded ? m.event_hideChanges() : m.event_showChanges()}
          </button>
        {/if}

        <div class="flex min-w-0 flex-1 flex-col items-end gap-1">
          {#each bars as bar (bar.eventId)}
            <Reactions {bar} showComments={!commentsInline} />
          {/each}
        </div>
      </footer>
    {/if}

    <!-- Below the bar and under the toggle that opened it, which is why the toggle holds the leading
       edge: changes appearing under a row of reactions read as belonging to the reactions. -->
    {#if view.changes.length > 0 && expanded}
      <div transition:slide={{ duration }}>
        <EventChanges changes={view.changes} />
      </div>
    {/if}
  </article>
{/if}
