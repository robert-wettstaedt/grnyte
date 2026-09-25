<script module lang="ts">
  import type { AreaDetail } from '$lib/entities/area/dto'
  import { toDisplayName } from '$lib/entities/displayName'
  import type { SaveState } from '$lib/entities/favorite/save.svelte'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { ADMIN, MAINTAINER, MEMBER, USER } from '../../../../../../../../.storybook/regions'
  import { sheetState } from '../../../Modal/sheetState.svelte'
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

  // The Show square is gated on layout state Storybook never mounts, so each story states what the
  // map could frame. The autodocs page shares one flag across every story and shows no Show square,
  // so measure in story view.
  const framable = () => {
    sheetState.canShowOnMap = true
  }
  const unframable = () => {
    sheetState.canShowOnMap = false
  }

  const { Story } = defineMeta({
    args: { area: area(), blockCount: 4, destination: parked, location, save },
    component: AreaActions,
    parameters: { backgrounds: { value: 'card' }, globalState: { user: USER, userRegions: MEMBER }, width: 343 },
    play: framable,
    tags: ['autodocs'],
    title: 'Map/Areas/AreaActions',
  })
</script>

<!-- No primary action, and no overflow menu: every item in it needs a permission they lack. -->
<Story name="Member" />

<!-- "Block" leads the row as a square. All six present is the tightest case in the app. -->
<Story name="Maintainer" parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }} />

<!-- The meta line carries the repair. Show drops out with Directions: an area with no located
     block has no extent to frame. -->
<Story
  name="Maintainer, no location"
  args={{ destination: undefined, location: { distance: undefined, isHere: false } }}
  play={unframable}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- A climber cannot fix a missing pin, so the line links nowhere. -->
<Story
  name="Member, no location"
  args={{ destination: undefined, location: { distance: undefined, isHere: false } }}
  play={unframable}
/>

<!-- Within 50m the line swaps distance for "You're here". -->
<Story name="Arrived" args={{ location: { distance: '12 m', isHere: true } }} />

<!-- The count widens the Favourite square rather than sitting inside it. -->
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
  play={unframable}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- An untyped area is always empty, so `AreaEmpty` offers both adds and the row withholds its own. -->
<Story
  name="Untyped area"
  args={{ area: area({ name: toDisplayName('New area'), type: null }), blockCount: 0, destination: undefined }}
  play={unframable}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- 328px, the content box of a 360px phone. -->
<Story name="Narrow" parameters={{ globalState: { user: USER, userRegions: MAINTAINER }, width: 328 }} />

<!-- The widest the row ever gets: every action present and a three-digit count widening Favourite.
     The row cannot wrap, so this is the story that fails first if anything grows. -->
<Story
  name="Narrow, widest"
  args={{ save: { ...save, count: 128, saved: true } }}
  parameters={{ globalState: { user: USER, userRegions: ADMIN }, width: 328 }}
/>
