<script lang="ts">
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import 'ol/ol.css'
  import { onMount } from 'svelte'
  import type { NestedBlock } from '.'
  import BlocksMap, { type BlocksMapProps } from './BlocksMap.svelte'

  let props: Omit<BlocksMapProps, 'blocks'> & Partial<Pick<BlocksMapProps, 'blocks'>> = $props()

  let blocks: NestedBlock[] = $state([])
  let loading = $state(false)

  onMount(async () => {
    if (props.blocks == null) {
      loading = true
      const response = await fetch('/api/blocks')
      const data = await response.json()
      blocks = data.blocks
      loading = false
    }
  })
</script>

{#if props.blocks != null || blocks.length > 0}
  <BlocksMap {...props} blocks={props.blocks ?? blocks} />
{/if}

{#if loading}
  <div class="flex h-full items-center justify-center">
    <ProgressRing size="size-20" value={null} />
  </div>
{/if}
