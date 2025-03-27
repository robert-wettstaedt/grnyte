<script lang="ts">
  import type { BlocksMapProps, GetBlockKey, NestedBlock } from '$lib/components/BlocksMap'
  import BlockEntry, { type Block } from './components/BlockEntry'

  interface Props {
    blocks: Array<NestedBlock & Block>
    getBlockKey?: GetBlockKey
    itemClass?: string
    name: string
    onLoadTopo?: () => void
    onRenderComplete?: BlocksMapProps['onRenderComplete']
  }

  let { name, blocks, itemClass, getBlockKey = null, onLoadTopo, onRenderComplete }: Props = $props()
</script>

<section>
  <h2 class="p-2 text-center text-xl">{name}</h2>

  {#await import('$lib/components/BlocksMap') then BlocksMap}
    <BlocksMap.default
      {blocks}
      {getBlockKey}
      {onRenderComplete}
      collapsibleAttribution={false}
      declutter={false}
      height="210mm"
      showAreas={false}
      zoom={null}
    />
  {/await}
</section>

{#each blocks as block, index}
  <BlockEntry {block} {index} {getBlockKey} {onLoadTopo} {itemClass} topoViewerProps={{ limitImgHeight: false }} />
{/each}

<style>
  section {
    break-after: page;
    height: 210mm;
    width: 297mm;
  }
</style>
