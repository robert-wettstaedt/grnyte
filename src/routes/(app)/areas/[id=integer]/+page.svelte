<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { areaWithPathname } from '$lib/db/utils.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'spinner' }}
  query={page.data.z.current.query.areas
    .where('id', Number(page.params.id))
    .related('parent', (q) => q.related('parent', (q) => q.related('parent')))
    .limit(1)}
>
  {#snippet children([area])}
    {@const { pathname } = areaWithPathname(area) ?? {}}
    {#if pathname == null}
      <Error error={{ message: 'Not found' }} status={404} />
    {:else}
      {#await goto(pathname, { replaceState: true })}
        <div class="flex justify-center">
          <ProgressRing size="size-12" value={null} />
        </div>
      {/await}
    {/if}
  {/snippet}
</ZeroQueryWrapper>
