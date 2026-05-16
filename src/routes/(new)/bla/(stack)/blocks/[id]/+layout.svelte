<script>
  import BlockLayout from '../../../(modal)/blocks/[id]/BlockLayout.svelte'

  const { children } = $props()
</script>

<BlockLayout>
  {@render children()}
</BlockLayout>
