<script lang="ts">
  import { page } from '$app/state'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import type { Geolocation } from '$lib/db/schema'
  import { queries } from '$lib/db/zero'
  import type { NestedBlock } from '.'
  import BlocksMap, { type BlocksMapProps } from './BlocksMap.svelte'

  let props: Omit<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'> &
    Partial<Pick<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'>> = $props()

  const blocksResult = $derived(page.data.z.q(queries.listBlocks(page.data, {})))
  const areasResult = $derived(page.data.z.q(queries.listAreas(page.data, {})))

  const data = $derived.by(() => {
    const areas = $state.snapshot(areasResult.data)

    const nestedBlocks = blocksResult.data
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

    const parkingLocations = areasResult.data.flatMap((area) => area.parkingLocations ?? []) as Geolocation[]
    const geoPaths = areasResult.data.flatMap((area) => area.geoPaths ?? [])

    return {
      blocks: nestedBlocks,
      parkingLocations,
      lineStrings: geoPaths,
    } satisfies Pick<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'>
  })
</script>

{#if data.blocks.length === 0 && blocksResult.details.type !== 'complete'}
  <LoadingIndicator class="flex h-full items-center justify-center" size={20} />
{:else}
  <BlocksMap {...props} {...data} />
{/if}
