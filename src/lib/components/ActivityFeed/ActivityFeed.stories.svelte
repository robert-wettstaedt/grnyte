<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ActivityFeed from './ActivityFeed.svelte'
  import { sampleWeekViews } from './fixtures'

  const { Story } = defineMeta({
    args: { views: sampleWeekViews() },
    component: ActivityFeed,
    parameters: { backgrounds: { value: 'root' }, layout: 'padded', width: 480 },
    tags: ['autodocs'],
    title: 'Components/ActivityFeed/ActivityFeed',
  })
</script>

<!-- The design's sample week: day dividers between today, yesterday and two days back. -->
<Story name="Sample week" />

<!-- Older rows still exist beyond the sync window. -->
<Story name="With load older" args={{ hasMore: true }} />

<!-- Rows arrived while reading. Merging is a tap, so the list never jumps. -->
<Story name="New activity pill" args={{ hasMore: true, newCount: 6 }} />

<!-- Nothing hydrated yet: every card is skeleton rows, and the list still holds its shape. -->
<Story name="Nothing hydrated" args={{ views: sampleWeekViews(new Map()) }} />

<Story name="Empty" args={{ views: [] }} />
