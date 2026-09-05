<script module lang="ts">
  import type { MapData } from '$lib/map/types'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import BlockLocationField from './BlockLocationField.svelte'

  const noop = () => {}

  // The located card draws the block's own pin as an overlay on a static map, so the map needs
  // no layers of its own. Tiles come from OSM over the network: with none, the frame stays blank
  // and the card, the badge and the controls around it are still what is under test.
  const mapData: MapData = { blocks: [] }

  const { Story } = defineMeta({
    args: {
      estimated: false,
      locating: false,
      location: null,
      mapData,
      onEstimatedChange: noop,
      onPickLocation: noop,
      onRemove: noop,
      onUseCurrentLocation: noop,
    },
    component: BlockLocationField,
    // A form column on a phone, the width this field is filled in at.
    parameters: { layout: 'centered', width: 380 },
    tags: ['autodocs'],
    title: 'Entities/Block/BlockLocationField',
  })

  // Frankenjura, northern and eastern, so the formatter prints N and E.
  const location = { lat: 49.79215, long: 11.36148 }

  // Rocklands: southern and eastern, so the latitude half flips to S.
  const southern = { lat: -32.19604, long: 19.13877 }
</script>

<!-- Nothing pinned yet: the dashed empty state, with the two calls to action stacked. Both are
     icon-in-button, one filled and one outlined, which is where a change to button padding or to
     the size of an svg inside a button shows up first. -->
<Story name="Empty" />

<!-- Device location in flight: the primary button is disabled and its icon slot holds the
     spinner instead of the pin, at the same box size so the row must not shift. -->
<Story name="Locating" args={{ locating: true }} />

<!-- Pinned: static map preview, "Located" badge, the coordinates, and the tonal Adjust button
     next to them. The switch below is controlled by the parent, so it does not move on click
     here; the story below pins the other position. -->
<Story name="Located" args={{ location }} />

<!-- The same card with the estimate switch on, the state a block gets when the spot is a guess. -->
<Story name="Located, estimated" args={{ estimated: true, location }} />

<!-- Southern hemisphere: the coordinate line is the one piece of text this component formats
     itself, and only a negative latitude proves the S half of it. -->
<Story name="Located, southern hemisphere" args={{ location: southern }} />
