<script lang="ts">
  import ShowOnMapButton from '$lib/components/ShowOnMapButton/ShowOnMapButton.svelte'
  import { sheetState } from '../Modal/sheetState.svelte'

  // Hands the camera back to the open entity; the map layout says whether it can be framed.
</script>

<ShowOnMapButton onclick={() => (sheetState.showOnMapRequest += 1)} shown={sheetState.canShowOnMap} />
