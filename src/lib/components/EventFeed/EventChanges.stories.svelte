<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import EventChanges from './EventChanges.svelte'
  import { changes, line, topoLines, topoMetadata, topos } from './fixtures'

  const { Story } = defineMeta({
    component: EventChanges,
    parameters: { backgrounds: { value: 'card' }, layout: 'centered', width: 420 },
    tags: ['autodocs'],
    title: 'Components/EventFeed/EventChanges',
  })

  const LOREM = 'Stand start on the obvious flake, then a long move to the sloper. Topping out is easier from the left.'

  // One row per renderer in the field registry, so a change to fields.ts shows up here.
  const everyRenderer = [
    line({ actorFk: 1, columnName: 'gradeFk', newValue: '15', oldValue: '11' }),
    line({ actorFk: 1, columnName: 'rating', newValue: '3', oldValue: '1' }),
    line({ actorFk: 1, columnName: 'tags', newValue: 'SD,highball', oldValue: 'SD,traverse' }),
    line({
      actorFk: 1,
      columnName: 'firstAscensionists',
      newValue: 'Ada Rossi,Jonas Weber',
      oldValue: 'Ada Rossi',
    }),
    line({ actorFk: 1, columnName: 'name', newValue: 'Kante direkt', oldValue: 'Kante' }),
    line({ actorFk: 1, columnName: 'description', newValue: LOREM, oldValue: 'Stand start.' }),
    line({ actorFk: 1, columnName: 'firstAscentYear', newValue: '1998' }),
    line({ actorFk: 1, columnName: 'location', objectType: 'block' }),
    line({ actorFk: 1, columnName: 'topo', objectType: 'block' }),
    line({ actorFk: 1, columnName: 'file', verb: 'remove' }),
    // The stored enum members, which is what the column really holds: the short forms this
    // fixture used to pass are not roles, so the row silently rendered the raw-value fallback
    // and this story showed the degraded path for every reader who checked it.
    line({
      actorFk: 1,
      columnName: 'role',
      newValue: 'region_maintainer',
      objectType: 'user',
      oldValue: 'region_user',
    }),
    line({
      actorFk: 1,
      columnName: 'source',
      newValue: 'https://vimeo.com/912345',
      objectType: 'file',
      oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }),
  ]

  const KANTE = { name: 'Kante direkt', routeFk: 501 }
  const RAMPE = { name: 'Rampe', routeFk: 502 }

  // The five topo edits, which wrote one indistinguishable "Topo redrawn" row between them
  // until they started naming themselves in `metadata`.
  const topoEdits = [
    line({
      actorFk: 1,
      columnName: 'topo',
      metadata: topoMetadata('lines', 700),
      newValue: topoLines([KANTE, RAMPE]),
      objectType: 'block',
      oldValue: topoLines([KANTE, { name: 'Altweg', routeFk: 503 }]),
    }),
    line({
      actorFk: 1,
      columnName: 'topo',
      metadata: topoMetadata('lines', 700),
      newValue: topoLines([KANTE], true),
      objectType: 'block',
      oldValue: topoLines([KANTE]),
    }),
    line({ actorFk: 1, columnName: 'topo', metadata: topoMetadata('photoAdded', 700), objectType: 'block' }),
    line({
      actorFk: 1,
      columnName: 'topo',
      metadata: topoMetadata('photoRemoved', 701),
      objectType: 'block',
      verb: 'remove',
    }),
    line({ actorFk: 1, columnName: 'topo', metadata: topoMetadata('reordered'), objectType: 'block' }),
    // A row from before any of that: no metadata, so it degrades to the vaguer sentence.
    line({ actorFk: 1, columnName: 'topo', objectType: 'block' }),
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
    line({
      actorFk: 1,
      columnName: 'description',
      newValue: DESCRIPTION_AFTER,
      oldValue: DESCRIPTION_BEFORE,
    }),
  ])

  /** Open every `<details>` under the node, so the comparison needs no clicking. */
  const expanded = (node: HTMLElement) => {
    node.querySelectorAll('details').forEach((entry) => (entry.open = true))
  }

  // What an ascent edit looks like: conditions and the ascent type, not crag data.
  const ascentEdit = [
    line({ actorFk: 1, columnName: 'type', newValue: 'redpoint', objectType: 'ascent', oldValue: 'attempt' }),
    line({ actorFk: 1, columnName: 'temperature', newValue: '4', objectType: 'ascent', oldValue: '11' }),
    line({ actorFk: 1, columnName: 'humidity', newValue: '45', objectType: 'ascent' }),
    line({ actorFk: 1, columnName: 'notes', newValue: LOREM, objectType: 'ascent' }),
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
      line({ actorFk: 1, columnName: 'gradeFk', newValue: '9' }),
      line({
        actorFk: 1,
        columnName: 'source',
        objectType: 'file',
        oldValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
    ]),
  }}
/>

<!-- Rows whose column has no registry entry render nothing at all. -->
<Story
  name="Nothing renderable"
  args={{ changes: changes([line({ actorFk: 1, objectType: 'area', verb: 'create' })]) }}
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
      line({ actorFk: 1, columnName: 'description', newValue: DESCRIPTION_BEFORE }),
      line({ actorFk: 1, columnName: 'description', oldValue: DESCRIPTION_BEFORE }),
    ]),
  }}
  template={proseTemplate}
/>
