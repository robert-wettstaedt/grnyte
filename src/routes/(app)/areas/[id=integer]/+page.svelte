<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { areaWithPathname } from '$lib/db/utils.svelte'
  import { queries } from '$lib/db/zero'
  import { Progress } from '@skeletonlabs/skeleton-svelte'
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'spinner' }}
  query={queries.area(page.data, { id: Number(page.params.id) })}
>
  {#snippet children(area)}
    {@const { pathname } = (area == null ? null : areaWithPathname(area)) ?? {}}
    {#if pathname == null}
      <Error status={404} />
    {:else}
      {#await goto(pathname, { replaceState: true })}
        <div class="flex justify-center">
          <Progress size="size-12" value={null} />
        </div>
      {/await}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
