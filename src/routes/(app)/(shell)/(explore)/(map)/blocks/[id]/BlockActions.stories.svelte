<script module lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { blockName } from '$lib/entities/block/mapper'
  import { toDisplayName } from '$lib/entities/displayName'
  import type { SaveState } from '$lib/entities/favorite/save.svelte'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { ADMIN, MAINTAINER, MEMBER, USER } from '../../../../../../../../.storybook/regions'
  import { sheetState } from '../../../Modal/sheetState.svelte'
  import BlockActions from './BlockActions.svelte'

  // 343px is the mobile sheet's content box (375px viewport less its px-4).
  const block = (overrides: Partial<BlockDetail> = {}): BlockDetail => ({
    areas: [{ areas: [], id: 2, name: toDisplayName('Roche aux Sabots'), type: 'sector' }],
    createdAt: undefined,
    createdBy: 1,
    description: '',
    geolocation: { estimated: false, id: 10, lat: 48.4104, long: 2.6118 },
    id: 1,
    name: blockName('Le Toit', 0),
    order: 0,
    rawName: 'Le Toit',
    regionFk: 1,
    topoImages: [],
    ...overrides,
  })

  const save: SaveState = { count: 0, pending: false, saved: false, toggle: async () => {} }
  const location: LocationState = { distance: '340 m', isHere: false }
  const noFix: LocationState = { distance: undefined, isHere: false }

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
    args: { block: block(), location, routeCount: 8, save },
    component: BlockActions,
    parameters: { backgrounds: { value: 'card' }, globalState: { user: USER, userRegions: MEMBER }, width: 343 },
    play: framable,
    tags: ['autodocs'],
    title: 'Map/Blocks/BlockActions',
  })
</script>

<!-- No primary action for a climber: show, directions, favourite, share. The distance is the walk-in. -->
<Story name="Member" />

<!-- Adding routes leads the row, as a square rather than a labelled action: squares are what let
     six actions clear a 360px row. -->
<Story name="Maintainer" parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }} />

<!-- Without a pin both Directions and Show drop out: neither has anywhere to go. The line links to
     the move picker, and the primary square is untouched. -->
<Story
  name="Maintainer, no pin"
  args={{ block: block({ geolocation: undefined }), location: noFix }}
  play={unframable}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- Seen by someone who cannot place the pin: a plain statement, no link. -->
<Story name="Member, no pin" args={{ block: block({ geolocation: undefined }), location: noFix }} play={unframable} />

<!-- An estimated pin still gets directions, but says so, and links to the edit form. -->
<Story
  name="Maintainer, approximate pin"
  args={{ block: block({ geolocation: { estimated: true, id: 10, lat: 48.4104, long: 2.6118 } }) }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- `BlockEmpty` already offers the add, so the row withholds its copy: the primary square is its inverse. -->
<Story
  name="Maintainer, no routes"
  args={{ routeCount: 0 }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- Delete joins the menu; the row is unchanged. -->
<Story name="Admin" parameters={{ globalState: { user: USER, userRegions: ADMIN } }} />

<!-- 328px, the content box of a 360px phone. -->
<Story name="Narrow" parameters={{ globalState: { user: USER, userRegions: MAINTAINER }, width: 328 }} />

<!-- The widest the row ever gets: every action present and a three-digit count widening Favourite.
     The row cannot wrap, so this is the story that fails first if anything grows. -->
<Story
  name="Narrow, widest"
  args={{ save: { ...save, count: 128, saved: true } }}
  parameters={{ globalState: { user: USER, userRegions: ADMIN }, width: 328 }}
/>
