<script module lang="ts">
  import type { UserListItem } from '$lib/entities/user/dto'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ActivityFilters from './ActivityFilters.svelte'
  import { ME, PEOPLE } from './fixtures'

  const regions = [
    { name: 'Frankenjura', regionFk: 1, role: 'region_admin' as const },
    { name: 'Ticino', regionFk: 2, role: 'region_user' as const },
  ]

  // What the page hands down: the members of the regions in scope, without the signed-in user,
  // who is the pinned "Just me" row instead.
  const people: UserListItem[] = Object.entries(PEOPLE)
    .map(([id, username]) => ({ id: Number(id), regionFks: Number(id) % 2 === 0 ? [1] : [1, 2], username }))
    .filter((person) => person.id !== ME)

  const { Story } = defineMeta({
    args: { currentUserFk: ME, people, regions },
    component: ActivityFilters,
    parameters: { backgrounds: { value: 'root' }, layout: 'padded', width: 420 },
    tags: ['autodocs'],
    title: 'Components/ActivityFeed/ActivityFilters',
  })
</script>

<!-- Two regions and nothing picked: the header says what the feed is scoped to. -->
<Story name="Default" />

<!-- One region is nothing to choose between, so the region controls stay hidden. -->
<Story name="Single region" args={{ regions: regions.slice(0, 1) }} />

<Story name="Ascents only" args={{ category: 'ascent', filtered: true }} />

<!-- Narrowed: a removable chip per filter, so a filtered feed never reads as an empty one. The
     header's scope label gives way to the region chip rather than repeating it. -->
<Story name="Filtered" args={{ filtered: true, regionFk: 2, userFk: ME }} />

<!-- A person rather than yourself: the chip names them, resolved by the host from the id alone. -->
<Story name="Person picked" args={{ filtered: true, personName: PEOPLE[2], userFk: 2 }} />
