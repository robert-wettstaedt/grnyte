<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import EventFeed from './EventFeed.svelte'
  import { sampleWeekViews, unresolvedWeek } from './fixtures'

  const { Story } = defineMeta({
    args: { views: sampleWeekViews() },
    component: EventFeed,
    parameters: { backgrounds: { value: 'root' }, layout: 'padded', width: 480 },
    tags: ['autodocs'],
    title: 'Components/EventFeed/EventFeed',
  })
</script>

<!-- The design's sample week: day dividers between today, yesterday and two days back. -->
<Story name="Sample week" />

<!-- Older rows still exist beyond the sync window. -->
<Story name="With load older" args={{ hasMore: true }} />

<!-- Rows arrived while reading. Merging is a tap, so the list never jumps. -->
<Story name="New activity pill" args={{ hasMore: true, newCount: 6 }} />

<!-- Nothing resolved: every card is tombstone rows under an unnamed headline, and the list still
     holds its shape. An entity arrives with its event now, so this is a feed of objects nothing
     can name rather than one waiting on a second sync. -->
<Story name="Nothing hydrated" args={{ views: sampleWeekViews(unresolvedWeek) }} />

<Story name="Empty" args={{ views: [] }} />
