<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import StatTile from './StatTile.svelte'

  const { Story } = defineMeta({
    args: { label: 'Routes', value: '135' },
    component: StatTile,
    parameters: { layout: 'centered', width: 200 },
    tags: ['autodocs'],
    title: 'Components/StatTile',
  })
</script>

<!-- The common case: a short label and a small count. -->
<Story name="Default" />

<!-- Zero is a real answer and renders as one, never as an empty tile. -->
<Story name="Zero" args={{ label: 'Videos', value: '0' }} />

<!-- A grouped thousands count, the widest a number gets on this dashboard. -->
<Story name="Large count" args={{ label: 'Logged ascents', value: '5,951' }} />

<!-- The value is not always a number: a date fills the same slot. -->
<Story name="Date value" args={{ label: 'Last activity', value: '4 days ago' }} />

<!-- A label long enough to wrap, which must not push the value out of the tile. -->
<Story name="Long label" args={{ label: 'Pending invitations', value: '2' }} />
