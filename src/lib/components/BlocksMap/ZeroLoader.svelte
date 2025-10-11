<script lang="ts">
  import type { Geolocation } from '$lib/db/schema'
  import { queries } from '$lib/db/zero'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { Query } from 'zero-svelte'
  import type { NestedBlock } from '.'
  import BlocksMap, { type BlocksMapProps } from './BlocksMap.svelte'

  let props: Omit<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'> &
    Partial<Pick<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'>> = $props()

  const blocksResult = new Query(queries.blocksWithLocations())
  const areasResult = new Query(queries.areasWithParkingLocations())

  const data = $derived.by(() => {
    const nestedBlocks = blocksResult.current
      .map((block): NestedBlock | null => {
        const area1 = areasResult.current.find((area) => area.id === block.areaFk) as NestedBlock['area'] | undefined
        const area2 = areasResult.current.find((area) => area.id === area1?.parentFk) as
          | NestedBlock['area']['parent']
          | undefined

        if (area1 == null || area2 == null || block.id == null) {
          return null
        }

        return {
          ...block,
          createdAt: new Date(block.createdAt ?? 0),
          area: { ...area1, parent: area2 },
        } as NestedBlock
      })
      .filter((block) => block != null)

    const parkingLocations = areasResult.current.flatMap((area) => area.parkingLocations ?? []) as Geolocation[]
    const geoPaths = areasResult.current.flatMap((area) => area.geoPaths ?? [])

    return {
      blocks: nestedBlocks,
      parkingLocations,
      lineStrings: geoPaths,
    } satisfies Pick<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'>
  })
</script>

{#if data.blocks.length === 0 && blocksResult.details.type !== 'complete'}
  <div class="flex h-full items-center justify-center">
    <ProgressRing size="size-20" value={null} />
  </div>
{:else}
  <BlocksMap {...props} {...data} />
{/if}
