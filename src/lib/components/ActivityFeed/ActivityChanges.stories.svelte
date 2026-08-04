<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import ActivityChanges from './ActivityChanges.svelte'
  import { activity, changes, topoLines, topoMetadata, topos } from './fixtures'

  const { Story } = defineMeta({
    component: ActivityChanges,
    parameters: { backgrounds: { value: 'card' }, layout: 'centered' },
    tags: ['autodocs'],
    title: 'Components/ActivityFeed/ActivityChanges',
  })

  const LOREM = 'Stand start on the obvious flake, then a long move to the sloper. Topping out is easier from the left.'

  // One row per renderer in the field registry, so a change to fields.ts shows up here.
  const everyRenderer = [
    activity(1, { columnName: 'gradeFk', newValue: '15', oldValue: '11', userFk: 1 }),
    activity(2, { columnName: 'rating', newValue: '3', oldValue: '1', userFk: 1 }),
    activity(3, { columnName: 'tags', newValue: 'SD,highball', oldValue: 'SD,traverse', userFk: 1 }),
    activity(4, {
      columnName: 'firstAscensionists',
      newValue: 'Ada Rossi,Jonas Weber',
      oldValue: 'Ada Rossi',
      userFk: 1,
    }),
    activity(5, { columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante', userFk: 1 }),
    activity(6, { columnName: 'description', newValue: LOREM, oldValue: 'Stand start.', userFk: 1 }),
    activity(7, { columnName: 'firstAscentYear', newValue: '1998', userFk: 1 }),
    activity(8, { columnName: 'location', entityType: 'block', userFk: 1 }),
    activity(9, { columnName: 'topo', entityType: 'block', userFk: 1 }),
    activity(10, { columnName: 'file', type: 'deleted', userFk: 1 }),
    activity(11, { columnName: 'role', entityType: 'user', newValue: 'maintainer', oldValue: 'user', userFk: 1 }),
    activity(12, {
      columnName: 'source',
      entityType: 'file',
      newValue: 'https://vimeo.com/912345',
      oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      userFk: 1,
    }),
  ]

  const KANTE = { name: 'Kante direkt', routeFk: 501 }
  const RAMPE = { name: 'Rampe', routeFk: 502 }

  // The five topo edits, which wrote one indistinguishable "Topo redrawn" row between them
  // until they started naming themselves in `metadata`.
  const topoEdits = [
    activity(1, {
      columnName: 'topo',
      entityType: 'block',
      metadata: topoMetadata('lines', 700),
      newValue: topoLines([KANTE, RAMPE]),
      oldValue: topoLines([KANTE, { name: 'Altweg', routeFk: 503 }]),
      userFk: 1,
    }),
    activity(2, {
      columnName: 'topo',
      entityType: 'block',
      metadata: topoMetadata('lines', 700),
      newValue: topoLines([KANTE], true),
      oldValue: topoLines([KANTE]),
      userFk: 1,
    }),
    activity(3, { columnName: 'topo', entityType: 'block', metadata: topoMetadata('photoAdded', 700), userFk: 1 }),
    activity(4, {
      columnName: 'topo',
      entityType: 'block',
      metadata: topoMetadata('photoRemoved', 701),
      type: 'deleted',
      userFk: 1,
    }),
    activity(5, { columnName: 'topo', entityType: 'block', metadata: topoMetadata('reordered'), userFk: 1 }),
    // A row from before any of that: no metadata, so it degrades to the vaguer sentence.
    activity(6, { columnName: 'topo', entityType: 'block', userFk: 1 }),
  ]

  // What an ascent edit looks like: conditions and the ascent type, not crag data.
  const ascentEdit = [
    activity(1, { columnName: 'type', entityType: 'ascent', newValue: 'redpoint', oldValue: 'attempt', userFk: 1 }),
    activity(2, { columnName: 'temperature', entityType: 'ascent', newValue: '4', oldValue: '11', userFk: 1 }),
    activity(3, { columnName: 'humidity', entityType: 'ascent', newValue: '45', userFk: 1 }),
    activity(4, { columnName: 'notes', entityType: 'ascent', newValue: LOREM, userFk: 1 }),
  ]
</script>

{#snippet template(args: ComponentProps<typeof ActivityChanges>)}
  <div style="width: 420px; max-width: 100%;">
    <ActivityChanges {...args} />
  </div>
{/snippet}

<!-- Every renderer the field registry knows, in one list. -->
<Story name="Every renderer" args={{ changes: changes(everyRenderer) }} {template} />

<Story name="Ascent edit" args={{ changes: changes(ascentEdit) }} {template} />

<!-- Each topo edit saying what it did, and the photo it did it to. The removed photo has
     no image left to draw, and the reorder is about the strip rather than one photo. -->
<Story name="Topo edits" args={{ changes: changes(topoEdits, topos()) }} {template} />

<!-- A column with no old value falls back to the "Not set" chip rather than a blank, and so
     does a value that was cleared: a source dropped back to "own footage". -->
<Story
  name="Missing values"
  args={{
    changes: changes([
      activity(1, { columnName: 'gradeFk', newValue: '9', userFk: 1 }),
      activity(2, {
        columnName: 'source',
        entityType: 'file',
        oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        userFk: 1,
      }),
    ]),
  }}
  {template}
/>

<!-- Rows whose column has no registry entry render nothing at all. -->
<Story
  name="Nothing renderable"
  args={{ changes: changes([activity(1, { entityType: 'area', type: 'created', userFk: 1 })]) }}
  {template}
/>
