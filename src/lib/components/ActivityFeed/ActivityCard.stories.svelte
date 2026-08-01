<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import ActivityCard from './ActivityCard.svelte'
  import { activity, entityMap, groups, ME, photo, sampleWeek } from './fixtures'

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
  const newArea = pick((group) => group.activities[0].entityType === 'area')
  const gradeChange = pick((group) => group.activities[0].columnName === 'gradeFk' && group.kind === 'single')
  const photoRemoved = pick((group) => group.activities[0].columnName === 'file')
  const deletedRoute = pick((group) => group.activities[0].entityId === '599')
  const roleGrant = pick((group) => group.activities[0].entityType === 'user')
  const unsynced = pick((group) => group.activities[0].entityId === '9099')

  const base = { currentUserFk: ME, entities } satisfies Partial<ComponentProps<typeof ActivityCard>>
</script>

{#snippet template(args: ComponentProps<typeof ActivityCard>)}
  <div style="width: 420px; max-width: 100%;">
    <ActivityCard {...args} />
  </div>
{/snippet}

<!-- A tick with the ascent's photos and notes: the fullest single card there is. -->
<Story name="Flash with photos" args={{ ...base, group: flash }} {template} />

<!-- Four ticks logged in one sitting fold into one session card. -->
<Story name="Session" args={{ ...base, group: session }} {template} />

<!-- Twelve edits across six routes of one block, capped at four rows. Expand for the diff. -->
<Story name="Edit burst" args={{ ...base, group: burst }} {template} />

<Story name="Topo redraw" args={{ ...base, group: topo }} {template} />

<Story name="New area" args={{ ...base, group: newArea }} {template} />

<!-- Your own row: solid avatar and the "You …" variant of the same message. -->
<Story name="Yours (grade change)" args={{ ...base, group: gradeChange }} {template} />

<Story name="Photo removed" args={{ ...base, group: photoRemoved }} {template} />

<!-- Hydration finished without the route: a tombstone, named from the delete row itself. -->
<Story name="Deleted entity" args={{ ...base, group: deletedRoute }} {template} />

<Story name="Role change" args={{ ...base, group: roleGrant }} {template} />

<!-- The entity has not synced yet: a skeleton row and a placeholder in the headline. -->
<Story name="Not yet synced" args={{ ...base, group: unsynced }} {template} />

<!-- Nobody signed in (the share/logged-out case): every card speaks in the third person. -->
<Story name="Someone else" args={{ entities, group: gradeChange }} {template} />

<!-- The actor's user row has not synced either: a pulsing avatar rather than "?". -->
<Story
  name="Unknown actor"
  args={{
    ...base,
    entities: entityMap([
      [
        { id: '9001', type: 'ascent' },
        { ascentType: 'send', files: [photo('f9')], href: '#', name: 'Rampe', row: 'none' },
      ],
    ]),
    group: groups([
      activity(4, { entityId: '9001', entityType: 'ascent', newValue: 'send', type: 'created', userFk: 99 }),
    ])[0],
  }}
  {template}
/>
