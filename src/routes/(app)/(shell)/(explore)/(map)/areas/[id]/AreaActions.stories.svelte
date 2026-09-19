<script module lang="ts">
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { toDisplayName } from '$lib/entities/displayName'
  import type { SaveState } from '$lib/entities/favorite/save.svelte'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { ADMIN, MAINTAINER, MEMBER, USER } from '../../../../../../../../.storybook/regions'
  import AreaActions from './AreaActions.svelte'

  // 343px is the mobile sheet's content box (375px less its px-4), so it is the row's real budget.
  const area = (overrides: Partial<AreaDetail> = {}): AreaDetail => ({
    areas: [],
    createdAt: undefined,
    createdBy: 1,
    description: '',
    geoPaths: [],
    id: 1,
    name: toDisplayName('Roche aux Sabots'),
    parkingLocations: [],
    regionFk: 1,
    type: 'sector',
    ...overrides,
  })

  const save: SaveState = { count: 0, pending: false, saved: false, toggle: async () => {} }
  const location: LocationState = { distance: '1.2 km', isHere: false }
  const parked = { estimated: false, id: 1, lat: 48.4104, long: 2.6118 }

  const { Story } = defineMeta({
    args: { area: area(), blockCount: 4, destination: parked, location, save },
    component: AreaActions,
    parameters: { backgrounds: { value: 'card' }, globalState: { user: USER, userRegions: MEMBER }, width: 343 },
    tags: ['autodocs'],
    title: 'Map/Areas/AreaActions',
  })
</script>

<!-- No labelled action, and no overflow menu: every item in it needs a permission they lack. -->
<Story name="Member" />

<!-- "+ Block" takes the labelled slot. A CTA against four squares is the tightest case in the app. -->
<Story name="Maintainer" parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }} />

<!-- The meta line carries the repair, so the create CTA keeps its slot. -->
<Story
  name="Maintainer, no location"
  args={{ destination: undefined, location: { distance: undefined, isHere: false } }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- A climber cannot fix a missing pin, so the line links nowhere. -->
<Story name="Member, no location" args={{ destination: undefined, location: { distance: undefined, isHere: false } }} />

<!-- Within 50m the line swaps distance for "You're here". -->
<Story name="Arrived" args={{ location: { distance: '12 m', isHere: true } }} />

<!-- The count sits inside the 48px square rather than widening it. -->
<Story
  name="Saved"
  args={{ save: { ...save, count: 12, saved: true } }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- Export and sync join the menu; the row is unchanged. -->
<Story name="Admin" parameters={{ globalState: { user: USER, userRegions: ADMIN } }} />

<!-- A sub-area holds areas, not blocks, and has no location of its own to report. -->
<Story
  name="Sub-area"
  args={{ area: area({ name: toDisplayName('Trois Pignons'), type: 'area' }), blockCount: 0, destination: undefined }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- An untyped area is always empty, so `AreaEmpty` offers both adds and the row withholds its CTA. -->
<Story
  name="Untyped area"
  args={{ area: area({ name: toDisplayName('New area'), type: null }), blockCount: 0, destination: undefined }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- 328px, the content box of a 360px phone. -->
<Story name="Narrow" parameters={{ globalState: { user: USER, userRegions: MAINTAINER }, width: 328 }} />
