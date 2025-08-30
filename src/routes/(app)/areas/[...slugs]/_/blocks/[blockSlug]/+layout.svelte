<script lang="ts">
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import BlockLayout from './BlockLayout.svelte'

  const { data, ...props } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.blockQuery}>
  {#snippet children(block)}
    {#if block == null}
      <Error status={404} />
    {:else}
      {#key block.id}
        <BlockLayout children={props.children} {block} />
      {/key}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
