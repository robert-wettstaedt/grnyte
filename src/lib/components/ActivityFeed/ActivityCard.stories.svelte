<script module lang="ts">
  import type { ActivityCardView } from '$lib/entities/activity/card'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import ActivityCard from './ActivityCard.svelte'
  import { activity, entityMap, groups, ME, photo, sampleWeek, view } from './fixtures'

  const { Story } = defineMeta({
    component: ActivityCard,
    parameters: { backgrounds: { value: 'root' }, layout: 'centered' },
    tags: ['autodocs'],
    title: 'Components/ActivityFeed/ActivityCard',
  })

  // The whole sample week, folded by the real grouping rules. Each story below picks the
  // group it wants out of it, so the fixtures stay one consistent data set.
  const week = groups(sampleWeek.activities)
  const { entities } = sampleWeek
  const pick = (predicate: (group: (typeof week)[number]) => boolean) => week.find(predicate)!

  const flash = pick((group) => group.activities[0].entityId === '9001')
  const session = pick((group) => group.kind === 'session' && group.activities.length > 1)
  const burst = pick((group) => group.kind === 'burst')
  const topo = pick((group) => group.activities[0].columnName === 'topo')
  const uploads = pick((group) => group.kind === 'upload')
  const videoSource = pick((group) => group.activities[0].columnName === 'source')
  const newArea = pick((group) => group.activities[0].entityType === 'area')
  const gradeChange = pick((group) => group.activities[0].columnName === 'gradeFk' && group.kind === 'single')
  const photoRemoved = pick((group) => group.activities[0].columnName === 'file')
  const deletedRoute = pick((group) => group.activities[0].entityId === '599')
  const roleGrant = pick((group) => group.activities[0].entityType === 'user')
  const unsynced = pick((group) => group.activities[0].entityId === '9099')

  /** The card view for a group of the sample week, seen as the signed-in climber. */
  const mine = (group: (typeof week)[number]) => view(group, entities, ME, sampleWeek.topos)

  /**
   * Every field of {@link ActivityCardView} and the part of the card it comes out as. A
   * `Record` rather than a list, so a field added to the view is a type error here: the
   * anatomy cannot quietly go out of date.
   */
  const FIELDS: Record<keyof ActivityCardView, string> = {
    actorName: 'The avatar initials and the bold {actor} in the headline. Pulses while the user row syncs.',
    changes: 'The rows behind the "Show changes" toggle, one per changed column.',
    climberName: "The bold {climber}. Only the messages about somebody else's ascent have that slot.",
    createdAt: 'The relative clock, top right. The view carries the timestamp, the component formats it.',
    entityName: "The bold {name} in the headline. A grouped card borrows its shared parent's name.",
    entityUnnamed: 'Swaps that bold slot for the "<no name>" placeholder once no name is coming.',
    files: 'The scrollable thumbnail strip under the header.',
    headline: 'The message key the sentence renders from, plus its person/owner params.',
    id: 'The {#each} key in the feed, so a card keeps its expand state. Never rendered.',
    mine: 'Swaps the avatar for "Me" and picks the "You ..." wording of the same message.',
    note: 'The quoted block under the rows.',
    overflowCount: 'The "and N more" line under the rows.',
    rows: 'The entity rows, capped at four. Each is an entity, a skeleton or a tombstone.',
    status: 'The ascent type badge left of the clock.',
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

{#snippet template(args: ComponentProps<typeof ActivityCard>)}
  <div style="width: 420px; max-width: 100%;">
    <ActivityCard {...args} />
  </div>
{/snippet}

{#snippet anatomy(args: ComponentProps<typeof ActivityCard>)}
  <div class="flex flex-wrap items-start gap-6">
    <div style="width: 420px; max-width: 100%;">
      <ActivityCard {...args} />
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
              {show(args.view[field as keyof ActivityCardView])}
            </td>
            <td class="text-surface-600-400 py-1.5">{hint}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

<!-- What each field of `ActivityCardView` turns into, read off a real card. One single and
     one grouped card, because each fills what the other leaves unset: the status, note and
     photos here, the summary, overflow count and changes there. -->
<Story name="Anatomy (single)" args={{ view: mine(flash) }} parameters={{ layout: 'padded' }} template={anatomy} />

<Story name="Anatomy (grouped)" args={{ view: mine(burst) }} parameters={{ layout: 'padded' }} template={anatomy} />

<!-- An ascent with the ascent's photos and notes: the fullest single card there is. -->
<Story name="Flash with photos" args={{ view: mine(flash) }} {template} />

<!-- Four ascents logged in one sitting fold into one session card. -->
<Story name="Session" args={{ view: mine(session) }} {template} />

<!-- Twelve edits across six routes of one block, capped at four rows. Expand for the diff. -->
<Story name="Edit burst" args={{ view: mine(burst) }} {template} />

<!-- Five photos from one submit as one card, not five: the rows agree on the block. -->
<Story name="Photo upload" args={{ view: mine(uploads) }} {template} />

<!-- A reposted clip's credit corrected. Points at the file like an upload does, so the card
     draws the clip and names the route, but stays its own card instead of joining one.
     Expand for the old and new host. -->
<Story name="Video source" args={{ view: mine(videoSource) }} {template} />

<Story name="Topo redraw" args={{ view: mine(topo) }} {template} />

<Story name="New area" args={{ view: mine(newArea) }} {template} />

<!-- Your own row: solid avatar and the "You …" variant of the same message. -->
<Story name="Yours (grade change)" args={{ view: mine(gradeChange) }} {template} />

<Story name="Photo removed" args={{ view: mine(photoRemoved) }} {template} />

<!-- Hydration finished without the route: a tombstone, named from the delete row itself. -->
<Story name="Deleted entity" args={{ view: mine(deletedRoute) }} {template} />

<Story name="Role change" args={{ view: mine(roleGrant) }} {template} />

<!-- The entity has not synced yet: a skeleton row and a placeholder in the headline. -->
<Story name="Not yet synced" args={{ view: mine(unsynced) }} {template} />

<!-- Nobody signed in (the share/logged-out case): every card speaks in the third person. -->
<Story name="Someone else" args={{ view: view(gradeChange, entities) }} {template} />

<!-- The actor's user row has not synced either: a pulsing avatar rather than "?". -->
<Story
  name="Unknown actor"
  args={{
    view: view(
      groups([
        activity(4, { entityId: '9001', entityType: 'ascent', newValue: 'redpoint', type: 'created', userFk: 99 }),
      ])[0],
      entityMap([
        [
          { id: '9001', type: 'ascent' },
          { ascentType: 'redpoint', files: [photo('f9')], href: '#', name: 'Rampe', row: 'none' },
        ],
      ]),
      ME,
    ),
  }}
  {template}
/>
