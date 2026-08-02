<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import ActivityFeed from './ActivityFeed.svelte'
  import { groups, ME, sampleWeek } from './fixtures'

  const { Story } = defineMeta({
    component: ActivityFeed,
    parameters: { backgrounds: { value: 'root' }, layout: 'padded' },
    tags: ['autodocs'],
    title: 'Components/ActivityFeed/ActivityFeed',
  })

  const week = groups(sampleWeek.activities)

  const base = {
    currentUserFk: ME,
    entities: sampleWeek.entities,
    groups: week,
  } satisfies ComponentProps<typeof ActivityFeed>
</script>

{#snippet template(args: ComponentProps<typeof ActivityFeed>)}
  <div style="width: 480px; max-width: 100%; margin: 0 auto;">
    <ActivityFeed {...args} />
  </div>
{/snippet}

<!-- The design's sample week: day dividers between today, yesterday and two days back. -->
<Story name="Sample week" args={{ ...base }} {template} />

<!-- Older rows still exist beyond the sync window. -->
<Story name="With load older" args={{ ...base, hasMore: true }} {template} />

<!-- Rows arrived while reading. Merging is a tap, so the list never jumps. -->
<Story name="New activity pill" args={{ ...base, hasMore: true, newCount: 6 }} {template} />

<!-- Nothing hydrated yet: every card is skeleton rows, and the list still holds its shape. -->
<Story name="Nothing hydrated" args={{ ...base, entities: new Map() }} {template} />

<Story name="Empty" args={{ ...base, groups: [] }} {template} />
