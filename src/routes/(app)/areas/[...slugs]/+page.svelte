<script lang="ts">
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import AreaPage from './AreaPage.svelte'

  const { data } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.query}>
  {#snippet children(area)}
    {#if area != null}
      <AreaPage {area} />
    {/if}
  {/snippet}
</ZeroQueryWrapper>
