<script module lang="ts">
  import type { ActivityEntityMap } from '$lib/entities/activity/entity'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import ActivityFeed from './ActivityFeed.svelte'
  import { groups, ME, sampleWeek, view } from './fixtures'

  const { Story } = defineMeta({
    component: ActivityFeed,
    parameters: { backgrounds: { value: 'root' }, layout: 'padded' },
    tags: ['autodocs'],
    title: 'Components/ActivityFeed/ActivityFeed',
  })

  const week = groups(sampleWeek.activities)

  /** The cards, decided the way `activityFeed()` decides them for the page. */
  const cards = (entities: ActivityEntityMap) => week.map((group) => view(group, entities, ME, sampleWeek.topos))

  const base = { views: cards(sampleWeek.entities) } satisfies ComponentProps<typeof ActivityFeed>
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
<Story name="Nothing hydrated" args={{ views: cards(new Map()) }} {template} />

<Story name="Empty" args={{ views: [] }} {template} />
