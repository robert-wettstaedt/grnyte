<script module lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { blockName } from '$lib/entities/block/mapper'
  import { toDisplayName } from '$lib/entities/displayName'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import BlocksList from './BlocksList.svelte'

  // `routes` stays empty in every story, deliberately. A block with routes renders `RouteRow`s
  // whose ascent status comes from a Zero query, and Zero is not initialized in Storybook, so
  // reading it throws. What these stories cover is everything around that list: the segmented
  // control, the per-block header with its location badges, and the no-routes state. The rows
  // themselves are covered by Components/EntityRow/RouteRow.
  //
  // A geolocated block also makes the list subscribe to `userLocation`, so a browser may ask for
  // location permission. Denying it is the normal path here: the distance badge needs a real fix,
  // which no story can produce.
  const topo = { height: 1000, id: 1, path: 'topo-sample.svg', width: 800 }

  const block = (id: number, name: string, overrides: Partial<BlockDetail> = {}): BlockDetail => ({
    areas: [{ areas: [], id: 2, name: toDisplayName('Roche aux Sabots'), type: 'sector' }],
    createdAt: undefined,
    createdBy: 1,
    description: '',
    geolocation: { estimated: false, id: id * 10, lat: 48.4104 + id / 1000, long: 2.6118 },
    id,
    name: blockName(name, 0),
    order: id - 1,
    rawName: name,
    regionFk: 1,
    topoImages: [{ ...topo, id }],
    ...overrides,
  })

  const blocks = [block(1, 'Le Toit'), block(2, 'La Dalle'), block(3, 'Bloc Rouge')]

  const { Story } = defineMeta({
    args: { blocks, routes: [] },
    component: BlocksList,
    parameters: { backgrounds: { value: 'card' }, layout: 'padded', width: 420 },
    tags: ['autodocs'],
    title: 'Map/Areas/BlocksList',
  })
</script>

<!-- A sector's blocks: the routes/topos segmented control on top, then a linked header per block.
     Nothing is logged against these blocks, so each shows its topo thumbnails beside the
     no-routes line. -->
<Story name="Default" />

<!-- One block only: the control still renders, since the two views are worth switching between
     whatever the list length. -->
<Story name="Single block" args={{ blocks: blocks.slice(0, 1) }} />

<!-- The two location badges side by side: a block nobody has pinned yet (warning triangle) and
     one placed by estimate from its neighbours (map-pin-search). Neither carries a topo, so the
     no-routes line stands alone. -->
<Story
  name="Location badges"
  args={{
    blocks: [
      block(1, 'Le Toit', { geolocation: undefined, topoImages: [] }),
      block(2, 'La Dalle', { geolocation: { estimated: true, id: 20, lat: 48.4111, long: 2.6131 }, topoImages: [] }),
      block(3, 'Bloc Rouge', { topoImages: [] }),
    ],
  }}
/>

<!-- No blocks beneath the sector: the control is withheld rather than offering a choice between two
     empty views, and the component renders nothing at all. -->
<Story name="Empty" args={{ blocks: [] }} />
