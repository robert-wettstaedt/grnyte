<script module lang="ts">
  import type { EventCardView } from '$lib/entities/event/card'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import EventCard from './EventCard.svelte'
  import { ascentEntity, eventAgo, eventViews, sampleWeekView as mine, photo, sampleWeekGroups } from './fixtures'

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
   * Every field of {@link EventCardView} and the part of the card it comes out as. A
   * `Record` rather than a list, so a field added to the view is a type error here: the
   * anatomy cannot quietly go out of date.
   */
  const FIELDS: Record<keyof EventCardView, string> = {
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

<!-- Nothing syncs late any more: an entity arrives with its event, so the old skeleton card is
     now the card whose object resolves to nothing at all. An orphaned upload: the placeholder in
     the headline, no thumbnail, and the bar falling to the footer for want of a row. -->
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
