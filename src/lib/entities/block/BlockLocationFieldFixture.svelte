<script lang="ts">
  import type { MapData } from '$lib/map/types'
  import BlockLocationField from './BlockLocationField.svelte'

  const { changes }: { changes: boolean[] } = $props()
  let estimated = $state(true)
</script>

<!-- A form, because what this guards is the reset `seedForm` dispatches on one. -->
<form>
  <BlockLocationField
    {estimated}
    locating={false}
    location={{ lat: 49.1, long: 12.1 }}
    mapData={{ blocks: [] } as unknown as MapData}
    onEstimatedChange={(value) => {
      changes.push(value)
      estimated = value
    }}
    onPickLocation={() => {}}
    onRemove={() => {}}
    onUseCurrentLocation={() => {}}
  />
</form>
