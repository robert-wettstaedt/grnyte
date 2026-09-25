<script lang="ts">
  import DirectionsButton from '$lib/components/DirectionsButton/DirectionsButton.svelte'
  import SaveButton from '$lib/components/SaveButton/SaveButton.svelte'
  import ShareButton from '$lib/components/ShareButton/ShareButton.svelte'
  import type { SaveState } from '$lib/entities/favorite/save.svelte'
  import type { Coords } from '$lib/map/map'
  import ShowOnMapButton from './ShowOnMapButton.svelte'

  /** The tools a block and a sector share, in the order `ActionBar` asks them to keep. Parking is
   *  not a client, because it has no favourite and its directions take the labelled slot. */
  interface Props {
    /** Where to drive; absent hides the square, as `DirectionsButton` decides for itself. */
    destination: Coords | undefined
    save: SaveState
    shareText: string
  }

  const { destination, save, shareText }: Props = $props()
</script>

<ShowOnMapButton />

<DirectionsButton {destination} />

<SaveButton count={save.count} ontoggle={save.toggle} pending={save.pending} saved={save.saved} />

<ShareButton text={shareText} />
