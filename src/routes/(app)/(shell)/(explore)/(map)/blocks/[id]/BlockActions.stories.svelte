<script module lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { blockName } from '$lib/entities/block/mapper'
  import { toDisplayName } from '$lib/entities/displayName'
  import type { SaveState } from '$lib/entities/favorite/save.svelte'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { ADMIN, MAINTAINER, MEMBER, USER } from '../../../../../../../../.storybook/regions'
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

  const { Story } = defineMeta({
    args: { block: block(), location, routeCount: 8, save },
    component: BlockActions,
    parameters: { backgrounds: { value: 'card' }, globalState: { user: USER, userRegions: MEMBER }, width: 343 },
    tags: ['autodocs'],
    title: 'Map/Blocks/BlockActions',
  })
</script>

<!-- Four tools, no labelled action. The distance is the walk-in. -->
<Story name="Member" />

<!-- The maintainer's job on a block is adding routes, so that takes the slot. -->
<Story name="Maintainer" parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }} />

<!-- The Directions square drops out, and the line links to the move picker. The CTA is untouched. -->
<Story
  name="Maintainer, no pin"
  args={{ block: block({ geolocation: undefined }), location: noFix }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- Seen by someone who cannot place the pin: a plain statement, no link. -->
<Story name="Member, no pin" args={{ block: block({ geolocation: undefined }), location: noFix }} />

<!-- An estimated pin still gets directions, but says so, and links to the edit form. -->
<Story
  name="Maintainer, approximate pin"
  args={{ block: block({ geolocation: { estimated: true, id: 10, lat: 48.4104, long: 2.6118 } }) }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- `BlockEmpty` already offers the add, so the row withholds its copy: the CTA is its inverse. -->
<Story
  name="Maintainer, no routes"
  args={{ routeCount: 0 }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- Delete joins the menu; the row is unchanged. -->
<Story name="Admin" parameters={{ globalState: { user: USER, userRegions: ADMIN } }} />

<!-- 328px, the content box of a 360px phone. -->
<Story name="Narrow" parameters={{ globalState: { user: USER, userRegions: MAINTAINER }, width: 328 }} />
