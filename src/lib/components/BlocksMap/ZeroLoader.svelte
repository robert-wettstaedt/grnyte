<script lang="ts">
  import { page } from '$app/state'
  import type { InferResultType } from '$lib/db/types'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { Query } from 'zero-svelte'
  import BlocksMap, { type BlocksMapProps } from './BlocksMap.svelte'

  let props: Omit<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'> &
    Partial<Pick<BlocksMapProps, 'blocks' | 'parkingLocations' | 'lineStrings'>> = $props()

  const blocks = $derived(
    new Query(
      page.data.z.current.query.blocks
        .where('geolocationFk', 'IS NOT', null)
        .related('geolocation')
        .related('area', (q) => {
          return q
            .related('parent', (q) => {
              return q
                .related('parent', (q) => {
                  return q
                    .related('parent', (q) => {
                      return q.related('parent').related('parkingLocations')
                    })
                    .related('parkingLocations')
                })
                .related('parkingLocations')
            })
            .related('parkingLocations')
        }),
    ),
  )

  const { geoPaths, parkingLocations } = $derived.by(() => {
    const data = blocks.current.flatMap((block) => {
      let current = (block.area ?? null) as InferResultType<'areas', { parent: true; parkingLocations: true }> | null
      const parkingLocations = [...(current?.parkingLocations ?? [])]
      const geoPaths = [...(current?.geoPaths ?? [])]

      while (current?.parent != null) {
        current = (current.parent ?? null) as InferResultType<'areas', { parent: true; parkingLocations: true }> | null
        parkingLocations.push(...(current?.parkingLocations ?? []))
        geoPaths.push(...(current?.geoPaths ?? []))
      }

      return { geoPaths, parkingLocations }
    })

    const parkingLocations = data.flatMap((item) => item.parkingLocations)
    const geoPaths = data.flatMap((item) => item.geoPaths)

    return {
      geoPaths,
      parkingLocations,
    }
  })
</script>

{#if blocks.current.length === 0 && blocks.details.type !== 'complete'}
  <div class="flex h-full items-center justify-center">
    <ProgressRing size="size-20" value={null} />
  </div>
{:else}
  <BlocksMap
    {...props}
    blocks={props.blocks ?? blocks.current}
    parkingLocations={props.parkingLocations ?? parkingLocations}
    lineStrings={props.lineStrings ?? geoPaths}
  />
{/if}
