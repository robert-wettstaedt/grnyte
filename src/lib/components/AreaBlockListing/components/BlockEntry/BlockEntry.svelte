<script lang="ts" module>
  export type Block = InferResultType<
    'blocks',
    {
      routes: {
        with: {
          firstAscents: {
            with: {
              firstAscensionist: true
            }
          }
          tags: true
        }
      }
    }
  > &
    EnrichedBlock & { topos: TopoDTO[] }
</script>

<script lang="ts">
  import { page } from '$app/state'
  import type { GetBlockKey } from '$lib/components/BlocksMap'
  import TopoViewer, { type TopoViewerProps } from '$lib/components/TopoViewer'
  import type { InferResultType } from '$lib/db/types'
  import type { EnrichedBlock } from '$lib/db/utils'
  import { type TopoDTO } from '$lib/topo'
  import { Rating } from '@skeletonlabs/skeleton-svelte'

  interface Props {
    block: Block
    getBlockKey?: GetBlockKey
    index: number
    itemClass?: string
    onLoadTopo?: () => void
    topoViewerProps?: Partial<TopoViewerProps>
  }

  let { block, index, getBlockKey = null, onLoadTopo, itemClass, topoViewerProps }: Props = $props()
</script>

{#each block.topos as topo}
  <section class={itemClass}>
    <div class="flex h-full">
      <div class="w-2/4 px-4">
        <div class="p-2 mt-8">
          <h2 class="text-center text-xl">
            {#if getBlockKey != null}
              {getBlockKey?.(block, index)}.
            {/if}

            {block.name}
          </h2>

          {#each topo.routes.map( (topoRoute) => block.routes.find((route) => route.id === topoRoute.routeFk), ) as route, index}
            {#if route != null}
              <h3 class="text-lg mt-8 px-2 flex gap-x-2">
                <strong>{index + 1}</strong>

                {route.name.length === 0 ? 'Unbekannt' : route.name}

                {#if route.gradeFk != null}
                  {page.data.grades.find((grade) => grade.id === route.gradeFk)?.[page.data.gradingScale]}
                {/if}

                {#if route.rating != null}
                  <div>
                    <Rating value={route.rating} count={3} readOnly>
                      {#snippet iconFull()}
                        <i class="fa-solid fa-star text-warning-500"></i>
                      {/snippet}
                    </Rating>
                  </div>
                {/if}
              </h3>

              {#if route.firstAscents.length > 0 || route.firstAscentYear != null}
                <p class="ms-4">
                  FA:

                  {route.firstAscents.map((firstAscent) => firstAscent.firstAscensionist.name).join(', ')}

                  {#if route.firstAscentYear != null}
                    {route.firstAscentYear}
                  {/if}
                </p>
              {/if}

              {#if route.tags.length > 0}
                <div class="flex gap-2 ms-4">
                  {#each route.tags as tag}
                    <p>#{tag.tagFk}</p>
                  {/each}
                </div>
              {/if}

              {#if route.description}
                <p class="ms-4">{@html route.description}</p>
              {/if}
            {/if}
          {/each}
        </div>
      </div>

      <div class="w-2/4 h-full relative">
        {#if topo.file?.stat == null}
          <p class="text-center w-full">Error loading file: {topo.file?.error ?? ''}</p>
        {:else}
          <TopoViewer
            {...topoViewerProps}
            getRouteKey={(_, index) => index + 1}
            onLoad={onLoadTopo}
            showControls={false}
            topos={[topo]}
          />
        {/if}

        {#if block.geolocation?.lat != null && block.geolocation?.long != null}
          <p
            class="text-xs text-white bg-black/50 p-1 absolute top-4 right-4 z-50"
            style="print-color-adjust: exact !important"
          >
            <i class="fa-solid fa-location-dot"></i>
            {block.geolocation.lat.toFixed(5)}, {block.geolocation.long.toFixed(5)}
          </p>
        {/if}
      </div>
    </div>
  </section>
{/each}
