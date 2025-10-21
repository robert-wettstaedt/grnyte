<script lang="ts">
  import { page } from '$app/state'
  import type { Geolocation } from '$lib/db/schema'
  import { Query } from 'zero-svelte'
  import type { NestedBlock } from '.'
  import BlocksMap, { type BlocksMapProps } from './BlocksMap.svelte'

  let props: Omit<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'> &
    Partial<Pick<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'>> = $props()

  const blocksResult = new Query(page.data.z.query.blocks.related('geolocation'))
  const areasResult = new Query(page.data.z.query.areas.related('parkingLocations'))

  const data = $derived.by(() => {
    const areas = $state.snapshot(areasResult.current)

    const nestedBlocks = blocksResult.current
      .map((block): NestedBlock | null => {
        if (block.id == null) {
          return null
        }

        const parents: NestedBlock['area'][] = []
        let current = areas.find((area) => area.id === block.areaFk) as NestedBlock['area'] | undefined

        while (current != null) {
          let parent = areas.find((area) => area.id === current?.parentFk) as NestedBlock['area'] | undefined
          current.parent = parent ?? null
          parents.push(current)
          current = parent
        }

        return {
          ...block,
          createdAt: new Date(block.createdAt ?? 0),
          area: parents[0],
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

<BlocksMap {...props} {...data} />
