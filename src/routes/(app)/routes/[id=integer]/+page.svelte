<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import Error from '$lib/components/Error'
  import ZeroQueryWrapper from '$lib/components/ZeroQueryWrapper'
  import { routeWithPathname } from '$lib/db/utils.svelte'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
</script>

<ZeroQueryWrapper
  loadingIndicator={{ type: 'spinner' }}
  query={page.data.z.current.query.routes
    .where('id', Number(page.params.id))
    .related('block', (q) =>
      q.related('area', (q) => q.related('parent', (q) => q.related('parent', (q) => q.related('parent')))),
    )
    .limit(1)}
>
  {#snippet children([route])}
    {@const { pathname } = routeWithPathname(route) ?? {}}
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
