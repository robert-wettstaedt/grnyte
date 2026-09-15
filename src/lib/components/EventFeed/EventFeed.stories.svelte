<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import EventFeed from './EventFeed.svelte'
  import { feedDensityViews, sampleWeekViews, unresolvedWeek } from './fixtures'

  const { Story } = defineMeta({
    args: { views: sampleWeekViews() },
    component: EventFeed,
    parameters: { backgrounds: { value: 'root' }, layout: 'padded', width: 480 },
    tags: ['autodocs'],
    title: 'Components/EventFeed/EventFeed',
  })
</script>

<!-- The design's sample week: day dividers between today, yesterday and two days back.

     UNIFORM density, which is what an entity's own log and the Updates tab use: every card gets
     its full height. Hold it beside "Mixed density" below, which is the same week as the feed
     actually draws it. -->
<Story name="Sample week" />

<!-- The same week at the density the feed asks for, and the one story where the whole change is
     visible at once: field edits collapse to one-line rows while ascents, creates, uploads and
     deletions keep their cards.

     This is the point of the feature. Nothing is reordered and no card says anything different
     from the story above; the send simply stops being twelve screens down, because burial is
     vertical space times row count rather than position. Scroll the two side by side and count
     the pixels above the first ascent. -->
<Story name="Mixed density (the feed)" args={{ views: feedDensityViews() }} />

<!-- Mixed density with the pill and the load-older button, so the two affordances can be checked
     against the shorter rows: a compact row is 44px, which is also the minimum tap target it owes
     as a disclosure trigger. -->
<Story name="Mixed density, in use" args={{ hasMore: true, newCount: 3, views: feedDensityViews() }} />

<!-- Older rows still exist beyond the sync window. -->
<Story name="With load older" args={{ hasMore: true }} />

<!-- Rows arrived while reading. Merging is a tap, so the list never jumps. -->
<Story name="New activity pill" args={{ hasMore: true, newCount: 6 }} />

<!-- Nothing resolved: every card is tombstone rows under an unnamed headline, and the list still
     holds its shape. -->
<Story name="Nothing hydrated" args={{ views: sampleWeekViews(unresolvedWeek) }} />

<Story name="Empty" args={{ views: [] }} />
