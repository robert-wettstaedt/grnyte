<script lang="ts">
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import BlockPage from './BlockPage.svelte'

  const { data } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.query}>
  {#snippet children(block)}
    {#if block != null}
      <BlockPage {block} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
