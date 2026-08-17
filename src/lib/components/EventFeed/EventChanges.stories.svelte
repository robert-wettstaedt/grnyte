<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import EventChanges from './EventChanges.svelte'
  import { activity, changes, topoLines, topoMetadata, topos } from './fixtures'

  const { Story } = defineMeta({
    component: EventChanges,
    parameters: { backgrounds: { value: 'card' }, layout: 'centered', width: 420 },
    tags: ['autodocs'],
    title: 'Components/EventFeed/EventChanges',
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
    // The stored enum members, which is what the column really holds: the short forms this
    // fixture used to pass are not roles, so the row silently rendered the raw-value fallback
    // and this story showed the degraded path for every reader who checked it.
    activity(11, {
      columnName: 'role',
      entityType: 'user',
      newValue: 'region_maintainer',
      oldValue: 'region_user',
      userFk: 1,
    }),
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

  // A real description edit: three paragraphs, one sentence changed in the middle one. This is
  // the shape the `prose` renderer exists for, and the shape it currently cannot show.
  const DESCRIPTION_BEFORE = `Stand start on the obvious flake, matching low.

Move left into the scoop, then a long pull to the sloper. The topout is easier from the left.

Bring a second pad for the landing under the arete.`

  const DESCRIPTION_AFTER = `Stand start on the obvious flake, matching low.

Move left into the scoop, then a long pull to the sloper. The topout is friendlier from the right since the block shifted.

Bring a second pad for the landing under the arete.`

  const proseChanges = changes([
    activity(1, {
      columnName: 'description',
      newValue: DESCRIPTION_AFTER,
      oldValue: DESCRIPTION_BEFORE,
      userFk: 1,
    }),
  ])

  /** Open every `<details>` under the node, so the comparison needs no clicking. */
  const expanded = (node: HTMLElement) => {
    node.querySelectorAll('details').forEach((entry) => (entry.open = true))
  }

  // What an ascent edit looks like: conditions and the ascent type, not crag data.
  const ascentEdit = [
    activity(1, { columnName: 'type', entityType: 'ascent', newValue: 'redpoint', oldValue: 'attempt', userFk: 1 }),
    activity(2, { columnName: 'temperature', entityType: 'ascent', newValue: '4', oldValue: '11', userFk: 1 }),
    activity(3, { columnName: 'humidity', entityType: 'ascent', newValue: '45', userFk: 1 }),
    activity(4, { columnName: 'notes', entityType: 'ascent', newValue: LOREM, userFk: 1 }),
  ]
</script>

<!-- Every renderer the field registry knows, in one list. -->
<Story name="Every renderer" args={{ changes: changes(everyRenderer) }} />

<Story name="Ascent edit" args={{ changes: changes(ascentEdit) }} />

<!-- Each topo edit saying what it did, and the photo it did it to. The removed photo has
     no image left to draw, and the reorder is about the strip rather than one photo. -->
<Story name="Topo edits" args={{ changes: changes(topoEdits, topos()) }} />

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
/>

<!-- Rows whose column has no registry entry render nothing at all. -->
<Story
  name="Nothing renderable"
  args={{ changes: changes([activity(1, { entityType: 'area', type: 'created', userFk: 1 })]) }}
/>

<!-- A description edit where only a clause in the middle paragraph moved. Rendered as two
     clamped previews, as it was before, both sides read the same opening sentence and the edit
     is invisible. The `<details>` is forced open here; in the app it takes a click. -->
{#snippet proseTemplate(args: ComponentProps<typeof EventChanges>)}
  <!-- Same canvas as the other stories (the meta's `width`), plus the forced-open details. -->
  <div {@attach expanded}>
    <EventChanges {...args} />
  </div>
{/snippet}

<Story name="Prose diff" args={{ changes: proseChanges }} template={proseTemplate} />

<!-- The two edits that have no diff to draw: a description filled from nothing, and one
     cleared. "Not set" against the text is the whole story. -->
<Story
  name="Prose set and cleared"
  args={{
    changes: changes([
      activity(1, { columnName: 'description', newValue: DESCRIPTION_BEFORE, userFk: 1 }),
      activity(2, { columnName: 'description', oldValue: DESCRIPTION_BEFORE, userFk: 1 }),
    ]),
  }}
  template={proseTemplate}
/>
