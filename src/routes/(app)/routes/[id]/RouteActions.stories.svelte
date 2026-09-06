<script module lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { SaveState } from '$lib/entities/favorite/save.svelte'
  import type { LocationState } from '$lib/entities/geolocation/location.svelte'
  import type { RouteDetail } from '$lib/entities/route/dto'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import { ADMIN, MAINTAINER, MEMBER, USER } from '../../../../../.storybook/regions'
  import RouteActions from './RouteActions.svelte'

  // A full page rather than a sheet, but the same 375px phone, so the row has the same budget.
  const block: BlockDetail = {
    areas: [{ areas: [], id: 2, name: 'Roche aux Sabots', type: 'crag' }],
    createdAt: undefined,
    createdBy: 1,
    description: '',
    geolocation: { estimated: false, id: 10, lat: 48.4104, long: 2.6118 },
    id: 3,
    name: 'Le Toit',
    order: 0,
    rawName: 'Le Toit',
    regionFk: 1,
    topoImages: [],
  }

  const route: RouteDetail = {
    blockFk: 3,
    createdAt: undefined,
    createdBy: 1,
    description: '',
    firstAscents: [],
    firstAscentYear: undefined,
    gradeFk: 12,
    id: 5,
    name: 'La Marie Rose',
    rating: 3,
    rawGradeFk: 12,
    rawName: 'La Marie Rose',
    rawRating: 3,
    regionFk: 1,
    tags: [],
  }

  const save: SaveState = { count: 0, pending: false, saved: false, toggle: async () => {} }
  const location: LocationState = { distance: '340 m', isHere: false }

  const { Story } = defineMeta({
    args: { block, location, route, save },
    component: RouteActions,
    parameters: { backgrounds: { value: 'card' }, globalState: { user: USER, userRegions: MEMBER }, width: 343 },
    tags: ['autodocs'],
    title: 'Routes/RouteActions',
  })
</script>

<!-- Tools only. The distance is to the route's block, which is the thing that has a pin. -->
<Story name="Member" />

<!-- Edit and draw-line join the menu; still no CTA, so the footer's "Log ascent" stands alone. -->
<Story name="Maintainer" parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }} />

<!-- Directions is absent and the line says why. The pin belongs to the block, so the repair links there. -->
<Story
  name="Maintainer, block has no pin"
  args={{ block: { ...block, geolocation: undefined }, location: { distance: undefined, isHere: false } }}
  parameters={{ globalState: { user: USER, userRegions: MAINTAINER } }}
/>

<!-- Still syncing: no line at all, rather than a missing-pin claim that corrects itself a beat later. -->
<Story name="Block loading" args={{ block: undefined, location: { distance: undefined, isHere: false } }} />

<!-- Saved, and standing at the block. -->
<Story
  name="Saved and arrived"
  args={{ location: { distance: '8 m', isHere: true }, save: { ...save, count: 3, saved: true } }}
/>

<!-- Delete joins the menu. -->
<Story name="Admin" parameters={{ globalState: { user: USER, userRegions: ADMIN } }} />

<!-- 328px, the content box of a 360px phone. -->
<Story name="Narrow" parameters={{ globalState: { user: USER, userRegions: ADMIN }, width: 328 }} />
