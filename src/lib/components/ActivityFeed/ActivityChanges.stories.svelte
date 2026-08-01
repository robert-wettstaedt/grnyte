<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import ActivityChanges from './ActivityChanges.svelte'
  import { activity } from './fixtures'

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
<Story name="Every renderer" args={{ activities: everyRenderer }} {template} />

<Story name="Ascent edit" args={{ activities: ascentEdit }} {template} />

<!-- A column with no old value falls back to the "Not set" chip rather than a blank. -->
<Story
  name="Missing values"
  args={{ activities: [activity(1, { columnName: 'gradeFk', newValue: '9', userFk: 1 })] }}
  {template}
/>

<!-- Rows whose column has no registry entry render nothing at all. -->
<Story
  name="Nothing renderable"
  args={{ activities: [activity(1, { entityType: 'area', type: 'created', userFk: 1 })] }}
  {template}
/>
