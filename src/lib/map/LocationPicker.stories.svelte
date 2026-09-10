<script module lang="ts">
  import type { BlockDetail } from '$lib/entities/block/dto'
  import { blockName } from '$lib/entities/block/mapper'
  import { toDisplayName } from '$lib/entities/displayName'
  import LocationPicker from '$lib/map/LocationPicker.svelte'
  import type { MapData } from '$lib/map/types'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'

  // The picker is handed plain map data by its parent (the parking editor, the add-block flow),
  // so nothing here needs Zero. A crag's worth of geolocated blocks plus a parking spot is enough
  // for the map to draw markers underneath the pin.
  const block = (id: number, name: string, lat: number, long: number): BlockDetail => ({
    areas: [
      { areas: [], id: 1, name: toDisplayName('Trois Pignons'), type: 'area' },
      { areas: [], id: 2, name: toDisplayName('Roche aux Sabots'), type: 'crag' },
    ],
    createdAt: undefined,
    createdBy: 1,
    description: '',
    geolocation: { estimated: false, id: id * 10, lat, long },
    id,
    name: blockName(name, id - 1),
    order: id - 1,
    rawName: name,
    regionFk: 1,
    topoImages: [],
  })

  const mapData: MapData = {
    blocks: [
      block(1, 'Le Toit', 48.4104, 2.6118),
      block(2, 'La Dalle', 48.4111, 2.6131),
      block(3, 'Bloc Rouge', 48.4096, 2.6104),
    ],
    parkingLocations: [{ estimated: false, id: 99, lat: 48.4118, long: 2.6142 }],
  }

  // [minLat, minLng, maxLat, maxLng]: what the parent computes from the area's blocks.
  const areaExtent: [number, number, number, number] = [48.4085, 2.609, 48.4125, 2.615]

  const { Story } = defineMeta({
    args: { areaExtent, mapData, placedCenter: null },
    component: LocationPicker,
    parameters: { backgrounds: { value: 'card' }, layout: 'centered', width: 400 },
    tags: ['autodocs'],
    title: 'Map/LocationPicker',
  })
</script>

<!-- The picker fills a flex column in the app (a full-screen editor step), so give it a definite
     box here: without one the map's absolutely positioned fill has nothing to resolve against. -->
{#snippet frame(args: ComponentProps<typeof LocationPicker>)}
  <div class="bg-surface-50-950 border-surface-200-800 flex h-140 flex-col overflow-hidden rounded-2xl border">
    <LocationPicker {...args} />
  </div>
{/snippet}

<!-- The default: pick by panning the map under a fixed pin. Segmented control on the first item,
     with the hint pill and the live coordinate readout over the map. -->
<Story name="Map mode" template={frame} />

<!-- The second item selected: two coordinate fields and an empty preview, the state you land in
     before typing anything. No map is mounted in this one. -->
<Story name="Coordinates, empty" args={{ mode: 'coordinates' }} template={frame} />

<!-- A valid pair: the preview resolves to a static map centred on the typed spot. -->
<Story
  name="Coordinates, filled"
  args={{ latText: '48.410244', lngText: '2.611811', mode: 'coordinates' }}
  template={frame}
/>

<!-- Out of range (latitude above 90): nothing is picked, so the preview stays on its placeholder
     rather than showing a wrong location. Same shape as the empty state, with the fields filled. -->
<Story
  name="Coordinates, out of range"
  args={{ latText: '148.41', lngText: '2.61', mode: 'coordinates' }}
  template={frame}
/>

<!-- An area with nothing geolocated yet, so the picker has no extent to frame on and hands the map
     no focus at all. The readout is withheld until the view settles, since there is no centre to
     report before that. -->
<Story name="No area extent" args={{ areaExtent: null }} template={frame} />
