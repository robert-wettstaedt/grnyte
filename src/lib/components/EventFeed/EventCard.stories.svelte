<script module lang="ts">
  import type { EventCardView } from '$lib/entities/event/card'
  import { groupEvents } from '$lib/entities/event/grouping'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import EventCard from './EventCard.svelte'
  import {
    ascentEntity,
    eventAgo,
    eventViews,
    feedView,
    sampleWeekView as mine,
    photo,
    sampleWeekGroups,
  } from './fixtures'

  const { Story } = defineMeta({
    component: EventCard,
    parameters: { backgrounds: { value: 'root' }, layout: 'centered', width: 420 },
    tags: ['autodocs'],
    title: 'Components/EventFeed/EventCard',
  })

  // Each story below picks the group it wants out of the sample week, so the fixtures stay one
  // consistent data set. `mine()` renders one as the card the signed-in climber would see.
  const pick = (predicate: (group: (typeof sampleWeekGroups)[number]) => boolean) => sampleWeekGroups.find(predicate)!

  const flash = pick((group) => group.events[0].objectId === 9001)
  const session = pick((group) => group.kind === 'session')
  const burst = pick((group) => group.kind === 'burst')
  const topo = pick((group) => group.events[0].objectType === 'block')
  const uploads = pick((group) => group.kind === 'upload')
  const videoSource = pick((group) => group.events[0].changes[0]?.columnName === 'source')
  const newArea = pick((group) => group.events[0].objectType === 'area')
  const gradeChange = pick((group) => group.kind === 'single' && group.events[0].changes[0]?.columnName === 'gradeFk')
  const photoRemoved = pick((group) => group.events[0].verb === 'remove')
  const deletedRoute = pick((group) => group.events[0].verb === 'delete')
  const roleGrant = pick((group) => group.events[0].objectType === 'user')
  const unresolved = pick((group) => group.events[0].entity == null && group.events[0].verb === 'add')

  /**
   * One group built from scratch, for the tier cases the sample week has no shape for.
   *
   * The week is a consistent data set and stays that way; these are one-off arrangements that
   * exist to exercise a rule rather than to describe a realistic afternoon.
   */
  const built = (...events: Parameters<typeof eventAgo>[1][]) =>
    feedView(groupEvents(events.map((partial, index) => eventAgo(index * 3, partial)))[0])

  /**
   * Every field of {@link EventCardView} and the part of the card it comes out as. A
   * `Record` rather than a list, so a field added to the view is a type error here: the
   * anatomy cannot quietly go out of date.
   */
  const FIELDS: Record<keyof EventCardView, string> = {
    accolade:
      'The one claim the card makes, as a banner across the top, and the route it names. At most one per card however many sends it holds.',
    actorFk: "Where the avatar links to: the actor's own profile, on your own rows too.",
    actorName: 'The avatar initials and the bold {actor} in the headline. Pulses while the user row syncs.',
    bars: 'The reaction bars no row spoke for, rendered in the footer beside the changes toggle.',
    changes: 'The rows behind the "Show changes" toggle, one per changed column.',
    climbedAt: 'A "Climbed on ..." part in the sub line, when the climb date is not the log date.',
    climberName: "The bold {climber}. Only the messages about somebody else's ascent have that slot.",
    createdAt: 'The relative clock, top right. The view carries the timestamp, the component formats it.',
    entityName: "The bold {name} in the headline. A grouped card borrows its shared parent's name.",
    entityUnnamed: 'Swaps that bold slot for the `common_unnamed` placeholder once no name resolved.',
    files: 'The scrollable thumbnail strip under the header.',
    headline: 'The message key the sentence renders from, plus its person/owner params.',
    id: 'The {#each} key in the feed, so a card keeps its expand state. Never rendered.',
    mine: 'Swaps the avatar for "Me" and picks the "You ..." wording of the same message.',
    overflowCount: 'The "and N more" line under the rows.',
    pin: 'The OSM thumbnail above the rows, on the card that placed a block.',
    rows: 'The entity rows, capped at four. Each is an entity or a tombstone, and carries its own Opinion strip, quoted note and reaction bar.',
    status: "The ascent type badge left of the clock, on a card that speaks one ascent's own sentence.",
    summary: 'The sub line under the headline, joined with " · ". Grouped cards only.',
    tier: 'How much room the card gets. `compact` draws a field edit as one tappable line instead of a card, and only a mixed-density surface ever asks for it.',
  }

  /** A field's value, short enough for a table cell. */
  const show = (value: unknown): string => {
    if (value == null) {
      return 'not set'
    }

    if (Array.isArray(value)) {
      return `${value.length} item${value.length === 1 ? '' : 's'}`
    }

    const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
    return text.length > 64 ? `${text.slice(0, 64)}…` : text
  }
</script>

{#snippet anatomy(args: ComponentProps<typeof EventCard>)}
  <div class="flex flex-wrap items-start gap-6">
    <div style="width: 420px; max-width: 100%;">
      <EventCard {...args} />
    </div>

    <table class="min-w-80 flex-1 text-left text-xs">
      <thead class="text-surface-950-50">
        <tr>
          <th class="py-1 pe-3 font-semibold">Field</th>
          <th class="py-1 pe-3 font-semibold">On this card</th>
          <th class="py-1 font-semibold">Where it lands</th>
        </tr>
      </thead>
      <tbody>
        {#each Object.entries(FIELDS) as [field, hint] (field)}
          <tr class="border-surface-200-800 border-t align-top">
            <td class="text-surface-950-50 py-1.5 pe-3 font-mono">{field}</td>
            <td class="text-surface-600-400 py-1.5 pe-3 font-mono">
              {show(args.view[field as keyof EventCardView])}
            </td>
            <td class="text-surface-600-400 py-1.5">{hint}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

<!-- What each field of `EventCardView` turns into, read off a real card. One single and
     one grouped card, because each fills what the other leaves unset: the status, note and
     photos here, the summary, overflow count and changes there. -->
<Story
  name="Anatomy (single)"
  args={{ view: mine(flash) }}
  parameters={{ layout: 'padded', width: null }}
  template={anatomy}
/>

<Story
  name="Anatomy (grouped)"
  args={{ view: mine(burst) }}
  parameters={{ layout: 'padded', width: null }}
  template={anatomy}
/>

<!-- An ascent with the ascent's photos and notes, reacted to and talked under: the fullest
     single card there is, and the bar carrying both halves at once. -->
<Story name="Flash with photos" args={{ view: mine(flash) }} />

<!-- Four ascents logged in one sitting fold into one session card, and the 💪 sits under the one
     ascent it was sent to rather than under the afternoon. -->
<Story name="Session" args={{ view: mine(session) }} />

<!-- Twelve edits across six routes of one block, capped at four rows. Expand for the diff. -->
<Story name="Edit burst" args={{ view: mine(burst) }} />

<!-- Five photos from one submit as one card, not five: the events agree on the block. -->
<Story name="Photo upload" args={{ view: mine(uploads) }} />

<!-- A reposted clip's credit corrected. Points at the file like an upload does, so the card
     draws the clip and names the route, but stays its own card instead of joining one.
     Expand for the old and new host. -->
<Story name="Video source" args={{ view: mine(videoSource) }} />

<Story name="Topo redraw" args={{ view: mine(topo) }} />

<Story name="New area" args={{ view: mine(newArea) }} />

<!-- Your own row: solid avatar, the "You …" variant of the same message, and a read-only bar
     that lists its chips and offers nothing to add. -->
<Story name="Yours (grade change)" args={{ view: mine(gradeChange) }} />

<Story name="Photo removed" args={{ view: mine(photoRemoved) }} />

<!-- A delete whose route resolves to nothing: a tombstone row, and no name stored on the delete
     to label it with. -->
<Story name="Deleted entity" args={{ view: mine(deletedRoute) }} />

<Story name="Role change" args={{ view: mine(roleGrant) }} />

<!-- An entity arrives with its event, so this is the card whose object resolves to nothing at
     all. An orphaned upload: the placeholder in the headline, no thumbnail, and the bar falling
     to the footer for want of a row. -->
<Story name="Not yet synced" args={{ view: mine(unresolved) }} />

<!-- Nobody signed in (the share/logged-out case): every card speaks in the third person, and
     every bar is read-only, since there is nobody to react as. -->
<Story name="Someone else" args={{ view: mine(gradeChange, undefined) }} />

<!-- The actor's user row has not synced: a pulsing avatar rather than "?". -->
<Story
  name="Unknown actor"
  args={{
    view: eventViews([
      eventAgo(4, {
        actorFk: 99,
        entity: ascentEntity('Rampe', 12, 99, 'redpoint', { files: [photo('f9')] }),
        objectId: 9199,
        objectType: 'ascent',
        parent: { id: 502, type: 'route' },
        verb: 'create',
      }),
    ])[0],
  }}
/>

<!-- ─────────────────────────────────────────────────────────────────────────────────────────────
     TIERS. Only a mixed-density surface ever draws a compact row, so every story ABOVE this line
     asks for uniform density on purpose: they show one card's anatomy, and a one-liner has none.
     Everything below is what a reader gets in the feed itself.

     The tier rules are mostly REFUSALS, so most of these stories are cases where a card could
     have gone compact and does not. Each refusal is a decision somebody has to be able to see.
     ───────────────────────────────────────────────────────────────────────────────────────── -->

<!-- A field edit, compacted: no avatar, no card chrome, no media, two lines at most. The whole row
     is one tap target, at least 44px tall, and the only one it has.

     Press it (or tab to it and hit enter) to open the full card, then use the chevron at the top
     right to close it again. Focus follows in both directions: opening moves it to that chevron,
     closing returns it to this row. Without that handoff the element the keyboard was on stops
     existing and focus falls to <body>. -->
<Story name="Tier: compact edit" args={{ view: feedView(burst) }} />

<!-- The same burst at the density an entity's own log and the Updates tab use, so the two can be
     held side by side. Same events, same sentence, different room: that is what keeps this
     density rather than content. -->
<Story name="Tier: same edit, uniform" args={{ view: mine(burst) }} />

<!-- Wrapping, not truncating. A long username plus a verb fills the line on a phone, and an
     ellipsis there leaves nothing legible at all, which would defeat drawing the row. Narrow the
     viewport until this wraps to its second line, then check it still says who did what. -->
<Story
  name="Tier: compact, long name"
  args={{
    view: built({
      actorFk: 3,
      changes: [
        { columnName: 'description', newValue: 'x', objectId: undefined, objectType: undefined, oldValue: 'y' },
      ],
      objectId: 502,
      objectType: 'route',
      verb: 'update',
    }),
  }}
  parameters={{ width: 320 }}
/>

<!-- REFUSED: a deletion. Keeping edits in the feed at all is an accountability argument, and it
     collapses the moment a maintainer removing somebody else's work is drawn as quietly as a typo
     fix. This is the one fold that could actually cost something. -->
<Story name="Refuses compact: deletion" args={{ view: feedView(deletedRoute) }} />

<!-- REFUSED: a role change. It arrives as an `update` on a user object, which looks like
     a field edit and is a permission grant. -->
<Story name="Refuses compact: role change" args={{ view: feedView(roleGrant) }} />

<!-- REFUSED: an ascent correction. Excluded by OBJECT rather than by verb: a climber fixing the
     grade they logged is about a climb, and the card says so. -->
<Story
  name="Refuses compact: ascent edit"
  args={{
    view: built({
      actorFk: 3,
      changes: [{ columnName: 'gradeFk', newValue: '12', objectId: undefined, objectType: undefined, oldValue: '11' }],
      entity: ascentEntity('Kante direkt', 11, 3, 'redpoint'),
      objectId: 9101,
      objectType: 'ascent',
      parent: { id: 500, type: 'route' },
      verb: 'update',
    }),
  }}
/>

<!-- REFUSED: one event in the group is not a field edit. A card is one thing a reader acts on, so a
     card that also added a route is a card about adding a route. The rule is `every`, not `some`,
     and this is the case that distinguishes them. -->
<Story
  name="Refuses compact: mixed group"
  args={{
    view: built(
      { actorFk: 3, objectId: 512, objectType: 'route', parent: { id: 400, type: 'block' }, verb: 'create' },
      {
        actorFk: 3,
        changes: [{ columnName: 'name', newValue: 'B', objectId: undefined, objectType: undefined, oldValue: 'A' }],
        objectId: 513,
        objectType: 'route',
        parent: { id: 400, type: 'block' },
        verb: 'update',
      },
    ),
  }}
/>

<!-- REFUSED: somebody has already spoken for it. The compact row carries no reaction bar, so
     compacting a rename that people reacted to would hide a chip a reader can no longer see or
     take back. The invariant at the top of `card.ts` outranks the tier. -->
<Story
  name="Refuses compact: already reacted to"
  args={{
    view: built({
      actorFk: 3,
      changes: [{ columnName: 'name', newValue: 'B', objectId: undefined, objectType: undefined, oldValue: 'A' }],
      objectId: 502,
      objectType: 'route',
      reactions: [
        { emoji: '🔥', userFk: 1, userName: 'ada' },
        { emoji: '💪', userFk: 4, userName: 'mara' },
      ],
      verb: 'update',
    }),
  }}
/>

<!-- REFUSED: a thread under it, with no reaction. Same rule, the other half: a compact row admits
     nothing about a conversation that exists. -->
<Story
  name="Refuses compact: has a thread"
  args={{
    view: built({
      actorFk: 3,
      changes: [{ columnName: 'name', newValue: 'B', objectId: undefined, objectType: undefined, oldValue: 'A' }],
      commentCount: 6,
      objectId: 502,
      objectType: 'route',
      verb: 'update',
    }),
  }}
/>

<!-- ── BANNERS. At most one per card, chosen by the system, never customisable, and always spelled
     out in words: an icon alone fails for a screen reader and for anybody who has not learned the
     vocabulary. Effort outranks grade; the climb outranks the applause.

     Every `name` below is a route the card actually shows. `accoladeOf` reads it off the very
     event the claim came from (`routeDisplayName(event.entity?.name)`), so a fixture naming
     anything else renders a banner the app cannot produce, and on a session card it breaks the
     one thing the banner is for: saying which of the rows it means. ── -->

<!-- A project sent. The claim names sessions and span, both facts the climber logged, and it is
     blind to grade on purpose: somebody returning after years away sends well below what they
     once did, and the climb still cost them everything. -->
<Story
  name="Banner: project sent"
  args={{
    view: {
      ...mine(session),
      accolade: { accolade: { days: 124, kind: 'project', sessions: 23 }, name: 'Verschneidung' },
      tier: 'hero',
    },
  }}
/>

<!-- The fallback claim, for the climbers who do not log attempts. Windowed to twelve months so an
     8B from a decade ago cannot veto it, and split into TWO pools rather than four: a flash
     competes only with flashes, while a redpoint and a repeat compete with each other. -->
<Story
  name="Banner: ceiling"
  args={{ view: { ...mine(flash), accolade: { accolade: { kind: 'ceiling' }, name: 'Rampe' }, tier: 'hero' } }}
/>

<!-- A repeat can wear it too, which is only defensible because of the pooling. On its own a repeat
     pool is trivially won: somebody who repeats one 7B a year is their own hardest repeater, and
     the banner fired on a climb that broke no new ground. Pooled with redpoints, this card means
     the climber beat every worked send of their year, which is worth a banner. -->
<Story
  name="Banner: ceiling on a repeat"
  args={{
    view: {
      ...built({
        actorFk: 3,
        entity: ascentEntity('Verschneidung', 12, 5, 'repeat'),
        objectId: 9102,
        objectType: 'ascent',
        verb: 'create',
      }),
      accolade: { accolade: { kind: 'ceiling' }, name: 'Verschneidung' },
      tier: 'hero',
    },
  }}
/>

<!-- What the community can earn a card that claimed nothing itself. It fills the banner slot only
     when nothing about the climb has, because the applause is already visible in the bar below and
     the accolade is the rarer thing. -->
<Story
  name="Banner: community turned up"
  args={{ view: { ...mine(flash), accolade: { accolade: { kind: 'community' }, name: 'Rampe' }, tier: 'hero' } }}
/>

<!-- A session holding two claims still shows ONE. The notable ascent is not lifted out into a card
     of its own: it already has its own row and its own reaction bar in here, so the banner names
     which row it means and the afternoon stays one afternoon. -->
<Story
  name="Banner: one per card, not a trophy wall"
  args={{
    view: {
      ...mine(session),
      accolade: { accolade: { days: 41, kind: 'project', sessions: 6 }, name: 'Kante' },
      tier: 'hero',
    },
  }}
/>

<!-- A popular RENAME takes no banner and stays quiet. Reactions are not gated by kind (a reader
     may applaud whatever they like) but the banner is a claim about the event, and calling a
     rename a community favourite is a claim nobody meant. Compare with
     "Refuses compact: already reacted to" above: that card goes standard because its chips need
     somewhere to live, and it still earns no banner. -->
<Story
  name="Banner: refused on a field edit"
  args={{
    view: built({
      actorFk: 3,
      changes: [{ columnName: 'name', newValue: 'B', objectId: undefined, objectType: undefined, oldValue: 'A' }],
      objectId: 502,
      objectType: 'route',
      promoted: true,
      verb: 'update',
    }),
  }}
/>
