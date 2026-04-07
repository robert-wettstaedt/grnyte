<script>
  import AreaLayout from '../../../(modal)/areas/[id]/AreaLayout.svelte'

  const { children } = $props()
</script>

<AreaLayout>
  {@render children()}
</AreaLayout>
