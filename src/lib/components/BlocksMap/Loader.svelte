<script lang="ts">
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import 'ol/ol.css'
  import { onMount } from 'svelte'
  import BlocksMap, { type BlocksMapProps } from './BlocksMap.svelte'
  import { page } from '$app/state'

  let props: Omit<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'> &
    Partial<Pick<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'>> = $props()

  let blocks: BlocksMapProps['blocks'] = $state([])
  let parkingLocations: BlocksMapProps['parkingLocations'] = $state([])
  let lineStrings: BlocksMapProps['lineStrings'] = $state([])

  let loading = $state(false)

  onMount(async () => {
    if (props.blocks == null) {
      loading = true
      const response = await fetch('/api/blocks')
      const data = await response.json()
      blocks = data.blocks ?? []
      parkingLocations = data.parkingLocations ?? []
      lineStrings = data.walkingPaths ?? []

      loading = false
    }
  })
</script>

{#if props.blocks != null || blocks.length > 0}
  <BlocksMap
    {...props}
    blocks={props.blocks ?? blocks}
    lineStrings={props.lineStrings ?? lineStrings}
    parkingLocations={props.parkingLocations ?? parkingLocations}
  />
{/if}

{#if loading}
  <div class="flex h-full items-center justify-center">
    <ProgressRing size="size-20" value={null} />
  </div>
{/if}
