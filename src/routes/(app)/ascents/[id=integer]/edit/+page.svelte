<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { ascentWithPathname } from '$lib/db/utils.svelte'
  import { queries } from '$lib/db/zero'
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'spinner' }}
  query={queries.ascent(page.data, { id: Number(page.params.id) })}
>
  {#snippet children(ascent)}
    {@const { pathname } = (ascent == null ? undefined : ascentWithPathname(ascent)) ?? {}}
    {#if pathname == null}
      <Error status={404} />
    {:else}
      {#await goto(pathname + '/edit', { replaceState: true })}
        <LoadingIndicator class="flex justify-center" size={12} />
      {/await}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
