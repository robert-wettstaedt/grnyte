<script lang="ts">
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import AreaLayout from './AreaLayout.svelte'

  const { data, ...props } = $props()
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'skeleton' }} showEmpty query={data.areaQuery}>
  {#snippet children(area)}
    {#if area == null}
      <Error status={404} />
    {:else}
      {#key area.id}
        <AreaLayout children={props.children} {area} />
      {/key}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
