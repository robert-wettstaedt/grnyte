<script module lang="ts">
  import { toDisplayName } from '$lib/entities/displayName'
  import type { ParkingDetail } from '$lib/entities/geolocation/dto'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { ADMIN, MEMBER, USER } from '../../../../../../../../.storybook/regions'
  import { sheetState } from '../../../Modal/sheetState.svelte'
  import ParkingActions from './ParkingActions.svelte'

  // The one row where Directions keeps the labelled slot: it is all a parking pin is for.
  const parking: ParkingDetail = {
    area: { areas: [], id: 2, name: toDisplayName('Roche aux Sabots'), type: 'sector' },
    id: 1,
    lat: 48.4104,
    long: 2.6118,
    regionFk: 1,
  }

  // The Show square is gated on layout state Storybook never mounts. Set per story, not at module
  // scope: the other files flip the same singleton, so a module-scope write loses to the story that
  // rendered last. Always true, because a parking pin always has coordinates.
  const framable = () => {
    sheetState.canShowOnMap = true
  }

  const { Story } = defineMeta({
    args: { location: { distance: '18 km', isHere: false } satisfies LocationState, parking },
    component: ParkingActions,
    parameters: { backgrounds: { value: 'card' }, globalState: { user: USER, userRegions: MEMBER }, width: 343 },
    play: framable,
    tags: ['autodocs'],
    title: 'Map/Parking/ParkingActions',
  })
</script>

<!-- A climber: drive there, put it back on the map, or share it. No menu, because deleting is the
     only thing in it. Directions keeps the labelled slot here: two tools leave the room for it. -->
<Story name="Member" />

<!-- Parked. Directions keeps the slot even here: the pin is still what you navigate back to. -->
<Story name="Arrived" args={{ location: { distance: '20 m', isHere: true } }} />

<!-- Deleting a parking pin needs region delete, so only then does the menu appear. -->
<Story name="Admin" parameters={{ globalState: { user: USER, userRegions: ADMIN } }} />

<!-- No fix yet, or location denied: no line at all, and it slides in if one ever arrives. -->
<Story name="Locating" args={{ location: { distance: undefined, isHere: false } }} />

<!-- 328px, the content box of a 360px phone. -->
<Story name="Narrow" parameters={{ globalState: { user: USER, userRegions: ADMIN }, width: 328 }} />
