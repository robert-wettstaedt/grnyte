<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { blockWithPathname } from '$lib/db/utils.svelte'
  import { queries } from '$lib/db/zero'
</script>

<ZeroQueryWrapper loadingIndicator={{ type: 'spinner' }} query={queries.block({ blockId: Number(page.params.id) })}>
  {#snippet children(block)}
    {@const { pathname } = (block == null ? undefined : blockWithPathname(block)) ?? {}}
    {#if pathname == null}
      <Error status={404} />
    {:else}
      {#await goto(pathname, { replaceState: true })}
        <LoadingIndicator class="flex justify-center" size={12} />
      {/await}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
